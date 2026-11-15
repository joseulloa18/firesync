# Planificador de ingesta histórica

Módulo entregado por la tarea T1.4 (issue #14). Convierte un rango de fechas y
una caja en la lista ordenada de consultas que necesita un backfill de NASA
FIRMS. **No descarga datos**: solo planifica. La descarga, el parser y la
persistencia son tareas posteriores.

Archivo: `src/lib/ingest/plan.ts`.
Pruebas: `tests/ingest/plan.test.ts`.

## Qué hace

- Genera ventanas UTC consecutivas de **1 a 5 días inclusive**.
- Planifica solo los productos históricos `MODIS_SP` y `VIIRS_SNPP_SP`.
- Corta la última ventana en la fecha final solicitada, que es **inclusiva**.
- Filtra las ventanas ya completadas usando un identificador estable, para
  reanudar un backfill sin repetir consultas.
- Valida fechas, caja, tamaño de ventana y orígenes con `zod`.

## Qué no hace

- No llama a FIRMS ni hace peticiones HTTP.
- No consulta la base de datos ni escribe en `job_runs`.
- No lee `FIRMS_MAP_KEY` ni ninguna otra variable de entorno.
- No envía correos.
- No modifica `package.json`.
- No ingiere ni valida datos reales. Que exista un plan no significa que haya
  datos descargados.

## Uso

```ts
import { planIngestWindows } from "@/lib/ingest/plan";

const windows = planIngestWindows({
  startDate: "2024-02-26",
  endDate: "2024-03-01",
  bbox: [-72.6, 17.0, -67.7, 20.6], // oeste, sur, este, norte
});

// windows[0].request se puede pasar tal cual al cliente existente:
// { source: "MODIS_SP", bbox: [...], dayRange: 4, date: "2024-02-26" }
```

## Entrada

| Campo        | Tipo                                    | Por defecto                     | Regla                                                    |
| ------------ | --------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| `startDate`  | `string`                                | obligatorio                     | Fecha UTC real `YYYY-MM-DD`, inclusiva                   |
| `endDate`    | `string`                                | obligatorio                     | Fecha UTC real `YYYY-MM-DD`, inclusiva y ≥ `startDate`   |
| `bbox`       | `readonly [number, number, number, number]` | obligatorio                 | `[oeste, sur, este, norte]`, finitos, rangos WGS84 y orden |
| `windowDays` | `number`                                | `5`                             | Entero de 1 a 5                                           |
| `sources`    | `readonly ("MODIS_SP" \| "VIIRS_SNPP_SP")[]` | ambos, MODIS primero       | Lista no vacía; cualquier otro origen se rechaza         |
| `completed`  | `readonly string[]`                     | `[]`                            | Identificadores exactos de ventanas ya terminadas        |

## Salida

Cada ventana incluye:

| Campo       | Contenido                                                          |
| ----------- | ------------------------------------------------------------------ |
| `id`        | Identificador estable: `origen/inicio/fin/oeste,sur,este,norte`    |
| `source`    | `MODIS_SP` o `VIIRS_SNPP_SP`                                        |
| `startDate` | Primer día UTC de la ventana (inclusivo)                           |
| `endDate`   | Último día UTC de la ventana (inclusivo)                           |
| `dayRange`  | Días cubiertos: `endDate - startDate + 1`, de 1 a 5                |
| `bbox`      | Copia de la caja en orden `[oeste, sur, este, norte]`             |
| `request`   | Objeto compatible con `FirmsAreaRequest` del cliente FIRMS         |

Ejemplo de identificador:

```
MODIS_SP/2024-01-01/2024-01-05/-72.6,17,-67.7,20.6
```

Las ventanas se devuelven agrupadas por origen, en el orden de `sources`, y
ordenadas por fecha dentro de cada origen. La misma entrada produce siempre las
mismas ventanas y los mismos identificadores.

## Compatibilidad con el cliente FIRMS

`request` respeta el contrato de `src/lib/firms-client/`:

- `source`: uno de los dos orígenes históricos, que también son valores válidos
  del cliente.
- `bbox`: tupla `[oeste, sur, este, norte]`, no un objeto.
- `date`: fecha de inicio de la ventana (`startDate`).
- `dayRange`: cantidad de días de la ventana.

El cliente sigue necesitando que el llamador le pase `mapKey`. Este módulo no
la recibe ni la lee.

## Identificador estable y reanudación

El identificador depende del origen, del primer día, del último día y de la
caja. No depende de la hora de ejecución ni del tamaño de ventana elegido (si
cambia `windowDays` cambian los rangos y, por tanto, los identificadores).

Para reanudar, el script de backfill debe guardar los identificadores de las
ventanas completadas (por ejemplo, en `job_runs.cursor`, columna prevista en
`docs/MODELO-DE-DATOS.md`) y pasarlos de nuevo en `completed`:

```ts
const pending = planIngestWindows({ ...rango, completed: idsCompletados });
for (const window of pending) {
  const csv = await client.download(window.request);
  // parsear, guardar y luego registrar window.id como completado
}
```

- Los identificadores se comparan de forma **exacta**; no se interpretan como
  prefijos ni como fechas.
- Un identificador desconocido se ignora.
- Si cambia la caja de ingesta, cambian los identificadores y el plan anterior
  no se reutiliza.
- Replanificar el mismo rango siempre devuelve las ventanas pendientes en el
  mismo orden; no hace falta guardar un índice numérico.

## Validación y errores

La entrada se valida con `zod` antes de generar ventanas. Los fallos lanzan
`IngestPlanError`:

| `code`          | Cuándo aparece                                                        |
| --------------- | --------------------------------------------------------------------- |
| `invalid_input` | Fecha, caja, `windowDays`, `sources` o `completed` inválidos            |
| `invalid_range` | `endDate` es anterior a `startDate`                                    |

`IngestPlanError.issues` contiene `{ path, message }` para señalar el campo. Los
mensajes de error no repiten secretos porque la entrada no los admite.

Reglas comprobadas:

- Fechas reales del calendario UTC: se rechazan `2023-02-29`, `2024-04-31`,
  `2024-13-01`, formatos como `2024-1-01` y cadenas vacías.
- Años bisiestos, incluida la regla de siglos: 2000 tiene 29 de febrero y 1900
  no.
- Caja de cuatro números finitos, longitudes entre -180 y 180, latitudes entre
  -90 y 90, y `oeste < este`, `sur < norte`.
- `windowDays` entero de 1 a 5; se rechazan 0, 6 y valores decimales.
- `sources` admite solo los valores exactos, con mayúsculas. `MODIS_NRT`,
  `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_SP`, `LANDSAT_NRT` y
  variantes en minúsculas se rechazan.

## Valores por defecto

`docs/DECISIONES.md` no fijaba estos detalles y el issue #14 limita los archivos
editables a `plan.ts`, su prueba y este documento. Se registran aquí:

- `windowDays = 5`: es el máximo que acepta el API de área de FIRMS y reduce el
  número de consultas (unas 1850 por origen para 25 años, según
  `docs/DATOS-Y-ARMONIZACION.md` sección 3).
- `sources` por defecto: `MODIS_SP` y luego `VIIRS_SNPP_SP`, los dos orígenes
  del índice histórico. VIIRS histórico es solo S-NPP.
- Fechas y fin inclusivos; la última ventana puede tener menos de cinco días.
- Filtro de reanudación por identificador exacto, sin interpretar prefijos.
- Sin límite artificial de años: la partición se calcula con aritmética UTC.

## Pruebas

Cubren:

- ventanas de 5 días por defecto, ventanas de 1 a 5 días y corte del fin;
- fin inclusivo y cobertura de cada día exactamente una vez;
- límites de mes y de año;
- años bisiestos (2024, 2000) y no bisiestos (2023, 1900);
- reanudación con identificadores completados, desconocidos y todos completos;
- rango invertido, día único y fechas inválidas;
- caja invertida, fuera de rango, con longitud incorrecta o valores no finitos;
- rechazo de orígenes NOAA, NRT, LANDSAT y minúsculas;
- compatibilidad del campo `request` con `FirmsAreaRequest`;
- identificadores distintos por origen y por caja.

Comandos:

```
pnpm exec vitest run tests/ingest/plan.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

## Límites

- Este módulo no demuestra ingesta real ni valida científicamente los datos.
- El límite de FIRMS es de 5000 transacciones por 10 minutos; el throttle y los
  reintentos corresponden al cliente, no al planificador.
- La reanudación real depende de que el script de backfill persista los
  identificadores después de guardar cada ventana.
