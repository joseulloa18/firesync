# Vista previa de archivos históricos locales (T1.4, issue #35)

Módulo: `src/lib/ingest/local-preview.ts`.
Script: `scripts/ingest-preview.ts` (`pnpm ingest:preview`).
Pruebas: `tests/ingest/local-preview.test.ts`.

> **Solo vista previa.** Este módulo lee CSV locales, los valida con el parser
> existente y cuenta filas. **No descarga datos, no escribe en Supabase, no
> envía correos y no demuestra que exista ingesta real.** Tampoco afirma que una
> detección sea un incendio confirmado.

El comando `pnpm ingest:backfill` no cambia: sigue sin implementar la
persistencia. Que esta vista previa funcione no significa que el backfill esté
terminado.

## Qué hace

1. Lee un manifiesto JSON dentro de una carpeta explícita.
2. Valida el manifiesto con `zod`.
3. Comprueba rutas, cantidad y tamaño de archivos antes de leer los CSV.
4. Parsea cada CSV con `parseFirmsCsv` (mismas reglas de fecha, hora, satélite,
   confianza, coordenadas y bbox que el resto del proyecto).
5. Deduplica con la clave compartida `detectionDedupeKey`
   (`satellite`, `acq_at`, `latitude`, `longitude`), incluso entre archivos.
6. Devuelve un informe JSON determinista con conteos por archivo y totales.

No aplica el filtro de confianza mínima ni el filtro de serie histórica: esos
pasos deciden después qué entra al índice. La vista previa valida y cuenta; no
selecciona la serie.

## Carpeta y manifiesto

La carpeta se indica con `--dir` y no se adivina. Ejemplo de contenido:

```text
data/firms/                 # carpeta local; data/firms/ está en .gitignore
  manifest.json
  synthetic-modis.csv
  synthetic-viirs-snpp.csv
```

El manifiesto es la **única autoridad** sobre el producto de cada archivo. El
nombre del CSV nunca se usa para inferir el satélite ni el producto.

```json
{
  "version": 1,
  "synthetic": true,
  "bbox": [-72.6, 17.0, -67.7, 20.6],
  "description": "Fixtures sintéticos para probar la vista previa",
  "files": [
    { "file": "synthetic-modis.csv", "source": "MODIS_SP" },
    { "file": "synthetic-viirs-snpp.csv", "source": "VIIRS_SNPP_SP" }
  ]
}
```

| Campo         | Obligatorio | Regla                                                                 |
| ------------- | ----------- | --------------------------------------------------------------------- |
| `version`     | sí          | Exactamente `1`.                                                      |
| `synthetic`   | no          | Booleano; por defecto `false`. Si es `true`, el informe lo advierte.   |
| `bbox`        | no          | Cuatro números `[oeste, sur, este, norte]`; se valida con `parseBbox`. |
| `description` | no          | Texto de hasta 500 caracteres; no se interpreta.                      |
| `files`       | sí          | Lista no vacía de `{ file, source }`.                                 |
| `file`        | sí          | Nombre plano que termina en `.csv`, sin carpetas ni unidad de disco.   |
| `source`      | sí          | Solo `MODIS_SP` o `VIIRS_SNPP_SP` (mayúsculas exactas).               |

El esquema es estricto: una clave desconocida invalida el manifiesto. Los
orígenes NOAA-20/21, NRT, LANDSAT y variantes en minúsculas se rechazan porque
el histórico usa solo MODIS y VIIRS S-NPP.

### Reglas de ruta

- El nombre del CSV debe ser plano: se rechazan `/`, `\`, `..`, rutas absolutas,
  unidades como `C:` y nombres que no terminen en `.csv`.
- La ruta resuelta debe quedar exactamente dentro de la carpeta indicada.
- Se rechazan enlaces simbólicos, tanto del manifiesto como de los CSV.
- La carpeta se resuelve con `realpath` antes de comparar rutas.
- El manifiesto también debe tener un nombre plano que termine en `.json`.

## Uso

```bash
pnpm ingest:preview --dir ./data/firms
pnpm ingest:preview --dir ./data/firms --manifest manifest.json
```

El informe JSON se escribe en la salida estándar. El script no escribe archivos.
Si quieres guardarlo, redirige la salida tú mismo:

```powershell
pnpm ingest:preview --dir ./data/firms > preview.json
```

Códigos de salida: `0` si el informe se generó, `1` si la entrada es inválida o
hay un error de lectura. Los errores de parseo de un CSV **no** abortan el
informe: se registran en ese archivo y se sigue con los demás.

## Ejemplo reproducible con fixtures sintéticos

Los dos CSV de `tests/data/fixtures/` son sintéticos y llevan la marca
`# SYNTHETIC` en la primera línea. No son datos de NASA FIRMS.

```powershell
New-Item -ItemType Directory -Force data/firms | Out-Null
Copy-Item tests/data/fixtures/synthetic-modis.csv data/firms/
Copy-Item tests/data/fixtures/synthetic-viirs-snpp.csv data/firms/
```

En macOS/Linux:

```bash
mkdir -p data/firms
cp tests/data/fixtures/synthetic-modis.csv \
   tests/data/fixtures/synthetic-viirs-snpp.csv data/firms/
```

Crea `data/firms/manifest.json` con el ejemplo de la sección anterior y ejecuta:

```bash
pnpm ingest:preview --dir ./data/firms
```

Conteo manual esperado para esos dos fixtures (comprobado en las pruebas):

| Archivo                   | Producto         | Filas | Aceptadas | Rechazadas | Duplicadas | Únicas | Satélites    | Fechas UTC              |
| ------------------------- | ---------------- | ----: | --------: | ---------: | ---------: | -----: | ------------ | ----------------------- |
| `synthetic-modis.csv`     | `MODIS_SP`       |     3 |         3 |          0 |          0 |      3 | Aqua, Terra  | 2024-03-01 a 2024-03-02 |
| `synthetic-viirs-snpp.csv`| `VIIRS_SNPP_SP`  |     3 |         3 |          0 |          0 |      3 | S-NPP        | 2024-03-01 a 2024-03-02 |
| **Totales**               |                  | **6** |     **6** |      **0** |      **0** |  **6** | Aqua, S-NPP, Terra | 2024-03-01 a 2024-03-02 |

`data/firms/` está ignorado por Git, así que estos archivos locales no se
publican. No borres datos que no hayas creado tú para esta prueba.

## Informe JSON

Estructura principal:

| Campo             | Contenido                                                        |
| ----------------- | ---------------------------------------------------------------- |
| `mode`            | Siempre `local_csv_preview`.                                     |
| `source`          | Siempre `local_files`.                                           |
| `directoryName`   | Solo el nombre de la carpeta, nunca la ruta absoluta.            |
| `manifestFile`    | Nombre del manifiesto usado.                                     |
| `manifestVersion` | `1`.                                                             |
| `synthetic`       | Valor declarado en el manifiesto.                                |
| `bbox`            | Bbox aplicada o `null` si no se configuró.                        |
| `limits`          | Límites efectivos usados en esta ejecución.                      |
| `files`           | Un resultado por archivo, en el orden del manifiesto.            |
| `totals`          | Suma de conteos, satélites, sensores y rango de fechas.          |
| `notice`          | Aviso de procedencia (sintético o local).                        |
| `warnings`        | Advertencias legibles para el operador.                          |
| `writes`          | `{ database: false, network: false, email: false }`.             |

Cada elemento de `files` incluye:

- `status`: `ok` si el CSV se pudo parsear; `rejected` si no.
- `parseError`: `{ code, message }` cuando el archivo entero falla.
- `rowsRead`, `rowsAccepted`, `rowsRejected`: resultado del parser.
- `duplicates`, `uniqueRows`: efecto de la deduplicación global.
- `product`: `source`, `sensor`, `isNrt`, `historicalSeries` y satélites
  permitidos.
- `satellites`: satélites realmente vistos en las filas únicas.
- `firstAcqDate`, `lastAcqDate`, `firstAcqAt`, `lastAcqAt`: fechas y horas UTC.
- `errors`: hasta 20 errores de fila de muestra.
- `errorsTruncated`: `true` si se omitieron muestras.
- `errorsByCode`: conteo **exacto** por código de error.
- `byteSize` y `syntheticMarker`.

Conteos:

```text
rowsRead    = rowsAccepted + rowsRejected          (parser)
uniqueRows  = filas que sobreviven a la deduplicación global
duplicates  = filas eliminadas por la clave compartida
rowsAccepted = uniqueRows + duplicates
```

La deduplicación es global y en orden de manifiesto: si una fila se repite en un
archivo posterior, ese archivo recibe el duplicado y no aporta una fila única.
Así, la suma de `uniqueRows` por archivo coincide con `totals.uniqueRows`.

El informe es determinista: no incluye fecha de generación ni ruta absoluta. Dos
ejecuciones sobre los mismos archivos producen el mismo JSON.

No se incluyen filas de detecciones ni coordenadas por fila. Los mensajes de
error pueden citar un valor escalar inválido (por ejemplo, una fecha mal escrita)
para poder corregirlo, pero no vuelcan la fila completa.

## Límites

Valores por defecto en `LOCAL_PREVIEW_LIMITS`:

| Límite             | Valor   | Qué protege                                      |
| ------------------ | ------- | ------------------------------------------------ |
| `maxFiles`         | 16      | Cantidad de CSV en un manifiesto.                |
| `maxManifestBytes` | 64 KiB  | Tamaño del manifiesto.                           |
| `maxFileBytes`     | 8 MiB   | Tamaño de cada CSV.                              |
| `maxTotalBytes`    | 32 MiB  | Suma de todos los CSV.                           |
| `maxErrorSamples`  | 20      | Errores de fila copiados por archivo al informe. |

Los archivos se miden **antes** de leerlos. Un archivo o manifiesto excesivo se
rechaza con error y no se parsea. Las pruebas pueden reducir estos límites con
la opción `limits`; el comando usa siempre los valores por defecto.

## Errores

`LocalPreviewError` contiene `code`, `message` e `issues: { path, message }[]`.

| Código                | Cuándo aparece                                                  |
| --------------------- | --------------------------------------------------------------- |
| `invalid_input`       | Falta la carpeta o un límite no es un entero positivo.          |
| `invalid_manifest`    | JSON inválido, esquema `zod`, bbox inválida o archivo repetido.  |
| `unsafe_path`         | Nombre con carpetas, `..`, ruta absoluta, unidad o symlink.      |
| `too_many_files`      | El manifiesto supera `maxFiles`.                                |
| `file_not_found`      | No existe la carpeta, el manifiesto o un CSV listado.            |
| `not_a_file`          | Una entrada no es un archivo regular.                            |
| `file_too_large`      | Un CSV o el manifiesto supera su límite de bytes.                |
| `total_size_exceeded` | La suma de CSV supera `maxTotalBytes`.                           |
| `read_failed`         | El sistema no pudo leer un archivo ya validado.                  |

Los errores de parseo de un CSV (`missing_header`, `empty_csv`,
`unterminated_quote`, etc.) no usan estos códigos: se informan en
`files[].parseError`.

El módulo no lee variables de entorno ni imprime claves. No hay `FIRMS_MAP_KEY`
ni credenciales en la entrada.

## Pruebas

`tests/ingest/local-preview.test.ts` cubre:

- conteo manual de filas leídas, aceptadas, rechazadas, duplicadas y únicas;
- duplicados dentro de un archivo y entre archivos;
- fechas UTC, producto, sensor, satélites y totales por archivo;
- CSV corrupto (sin cabecera, comilla sin cerrar), vacío y solo cabecera;
- bbox válida, filas fuera de la bbox y bbox inválida;
- fuentes rechazadas (`VIIRS_NOAA20_SP`, `VIIRS_NOAA21_SP`, NRT y minúsculas);
- rutas inseguras (`../`, subcarpetas, rutas absolutas, unidad de disco);
- archivos excesivos por cantidad, tamaño individual, tamaño total y manifiesto;
- manifiesto mal formado, versión incorrecta, lista vacía y nombres repetidos;
- determinismo del informe y ausencia de la ruta absoluta;
- procedencia sintética declarada o detectada por la marca `# SYNTHETIC`.

```bash
pnpm exec vitest run tests/ingest/local-preview.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

## Dependencias posteriores (no resueltas aquí)

Esta tarea **no** completa la ingesta histórica. Siguen pendientes:

1. **Fuente real.** Los fixtures son sintéticos. Falta un CSV real pequeño de
   NASA FIRMS con atribución y licencia revisadas, separado de los sintéticos.
2. **Credencial externa por entorno.** La descarga real necesita
   `FIRMS_MAP_KEY` en el entorno del servidor. No se pide por chat ni se guarda
   en el repositorio.
3. **Persistencia revisada.** Falta el diseño y la revisión de la escritura en
   `raw_detections`, incluidos permisos, RLS y migraciones. Esta vista previa no
   aplica SQL.
4. **Idempotencia.** Falta definir la clave de conflicto y la reanudación del
   backfill (por ejemplo, con `job_runs.cursor`) antes de repetir cargas.
5. **Filtros de serie.** La vista previa no excluye confianza baja, no separa
   quemas agrícolas y no armoniza MODIS con VIIRS; eso corresponde a las tareas
   de agregación y calibración.

## Valores por defecto registrados aquí

El issue #35 limita los archivos editables y no incluye `docs/DECISIONES.md`, así
que los valores elegidos se registran en este documento:

- Manifiesto llamado `manifest.json`, versión `1`, esquema estricto.
- Solo `MODIS_SP` y `VIIRS_SNPP_SP`; el producto nunca se infiere del nombre.
- `synthetic` por defecto `false`; los fixtures deben declararlo o llevar la
  marca `# SYNTHETIC`.
- Nombres de archivo planos, sin subcarpetas ni enlaces simbólicos.
- Deduplicación global en orden de manifiesto.
- Límites de 16 archivos, 8 MiB por CSV, 32 MiB en total y 64 KiB de manifiesto.
- Informe sin fecha de generación ni ruta absoluta para que sea reproducible.
