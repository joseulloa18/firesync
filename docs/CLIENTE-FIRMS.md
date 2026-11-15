# Cliente de descarga de FIRMS

Módulo acotado para descargar el CSV del **API de área** de NASA FIRMS desde el
servidor. **No incluye** el parser de CSV, la limpieza, la ingesta ni el backfill
histórico. Devuelve el cuerpo de la respuesta como texto para que otra tarea lo
parsee y valide.

Ubicación: `src/lib/firms-client/` (esta tarea aislada). `docs/ARQUITECTURA.md`
menciona `src/lib/firms/`; al integrar, esa carpeta puede reexportar este módulo
sin cambiar el contrato. No hay otras diferencias de contrato.

## Uso

```ts
import { createFirmsClient } from "@/lib/firms-client";

const client = createFirmsClient({
  mapKey: process.env.FIRMS_MAP_KEY!, // lo aporta el llamador; el módulo no lee el entorno
  fetch: globalThis.fetch,
  minIntervalMs: 1000, // 60 consultas/minuto por defecto
  maxRetries: 2, // 3 intentos como máximo
  timeoutMs: 30_000,
});

const csv = await client.download(
  {
    source: "VIIRS_SNPP_NRT",
    bbox: [-72.6, 17.0, -67.7, 20.6], // oeste, sur, este, norte
    dayRange: 2,
    date: "2024-02-29", // opcional; YYYY-MM-DD en calendario UTC
  },
  { signal: abortController.signal },
);
```

El cliente es **solo para el servidor**. No debe importarse desde componentes de
navegador ni exponer `FIRMS_MAP_KEY` en el cliente.

## URL oficial

```
https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]
https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]/[DATE]
```

- `MAP_KEY` se codifica con `encodeURIComponent` al construir la ruta.
- `AREA_COORDINATES` es una caja `oeste,sur,este,norte` en WGS84. Este módulo
  exige una caja; no acepta `world` ni nombres de puntos cardinales.
- `DAY_RANGE` es un entero de 1 a 5.
- `DATE` es opcional. Con fecha, FIRMS devuelve desde `DATE` hasta
  `DATE + DAY_RANGE - 1`. Sin fecha, devuelve los datos más recientes.
- La fecha se valida como fecha real del calendario UTC (rechaza, por ejemplo,
  `2023-02-29`, `2024-13-01` o `2024-04-31`).

## Orígenes permitidos

Solo se aceptan estos valores exactos:

`MODIS_SP`, `VIIRS_SNPP_SP`, `MODIS_NRT`, `VIIRS_SNPP_NRT`,
`VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_SP`.

`LANDSAT_NRT` queda fuera porque el proyecto no lo usa. Cualquier otro valor
produce `invalid_source` sin realizar la petición.

## Validación de la caja

- Cuatro números finitos en orden `[oeste, sur, este, norte]`.
- Longitud entre -180 y 180; latitud entre -90 y 90.
- `oeste < este` y `sur < norte` (no se admiten cajas vacías ni invertidas).
- `dayRange` entero entre 1 y 5.
- El llamador pasa `mapKey`; una clave vacía o solo espacios impide crear el
  cliente y nunca se llama a `fetch`.

## Ritmo, reintentos y cancelación

| Comportamiento | Valor por defecto | Configuración |
|---|---|---|
| Peticiones simultáneas | Seriales por instancia | Cola interna |
| Separación entre inicios | 1000 ms | `minIntervalMs` |
| Reintentos | 2 (3 intentos) | `maxRetries`, entero 0 a 5 |
| Estados reintentables | 429 y 5xx | Fijo |
| Espera tras 429 | Cabecera `Retry-After` | Acepta segundos o fecha HTTP |
| Espera sin `Retry-After` | 500, 1000, 2000 ms… | `retryBaseDelayMs` |
| Tope de espera | 10 000 ms | `maxRetryDelayMs` |
| Timeout por intento | 30 000 ms | `timeoutMs` con `AbortController` |

- El throttle es serial: una instancia no inicia la siguiente petición hasta
  terminar la anterior. Crea **una instancia por proceso** para compartir el
  límite. El límite global de FIRMS es 5000 transacciones por 10 minutos.
- Solo se reintentan `429` y `5xx`. No se reintentan `4xx` no reintentables,
  errores de red, timeouts ni cancelaciones.
- `Retry-After` y el backoff se recortan a `maxRetryDelayMs`.
- La señal del llamador cancela la espera de turno, el throttle, la petición en
  curso o la espera entre reintentos.

## Errores seguros

`FirmsClientError` expone `code`, `status` (si aplica) y `attempts` (si aplica).
Códigos: `invalid_options`, `invalid_map_key`, `invalid_source`,
`invalid_bbox`, `invalid_day_range`, `invalid_date`, `http_status`,
`network_error`, `timeout`, `aborted`.

Los mensajes y las pilas **nunca** incluyen la `mapKey`, la URL completa ni el
cuerpo de una respuesta externa. Tampoco se adjunta el error original de
`fetch` como `cause`. Para diagnosticar un fallo, usa `code`, `status` y
`attempts`, no el texto del servidor.

Las peticiones que no son `200` no leen el cuerpo de la respuesta.

## Pruebas

Las pruebas usan `fetch`, reloj y `sleep` inyectables; no hacen llamadas reales:

```
node node_modules/vitest/vitest.mjs run tests/data/firms-client.test.ts
```

Cubren respuesta 200, 429 con `Retry-After` en segundos y fecha HTTP, 500 con
backoff, reintentos agotados, timeout, cancelación en curso y en cola, fechas
inválidas y ausencia del secreto, URL y cuerpo externo en los errores.

## Fuera de alcance

- Parsear o validar columnas del CSV.
- Ingesta, deduplicación, armonización o backfill.
- Consultar `/api/data_availability/`.
- Leer `FIRMS_MAP_KEY` u otras credenciales desde el entorno: lo hace el
  llamador de servidor.
- Descargar archivos históricos del portal de FIRMS.
