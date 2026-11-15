# FIRESYNC — Validación de datos y armonización (primer hito)

Este documento registra el contrato, los métodos y la evidencia disponible para
las funciones puras de datos del primer hito. **No afirma que exista ingesta
real ni validación científica.** Los datos de prueba son sintéticos y están
marcados como tales.

Método: `method_version = v1` (ver `src/lib/harmonize/config.ts`).

## 1. Alcance implementado

| Módulo | Responsabilidad |
|---|---|
| `src/lib/firms/csv.ts` | Parser CSV de MODIS y VIIRS con errores por fila y errores fatales de formato |
| `src/lib/firms/products.ts` | Producto FIRMS explícito, familia de sensor, NRT/SP y satélite permitido |
| `src/lib/firms/confidence.ts` | Normalización de confianza MODIS numérica y VIIRS categórica |
| `src/lib/firms/bbox.ts` | Lectura y validación de la caja de ingesta `oeste,sur,este,norte` |
| `src/lib/harmonize/grid.ts` | Cuadrícula de 0.01°, `cell_id`, centroide y límites de celda |
| `src/lib/harmonize/dedupe.ts` | Deduplicación por satélite, hora de adquisición y coordenadas |
| `src/lib/harmonize/filters.ts` | Filtros de confianza, NRT, familia y VIIRS histórico S-NPP |
| `src/lib/harmonize/occupancy.ts` | Celdas-día ocupadas (CDO) por familia |
| `src/lib/harmonize/monthly.ts` | Agregado por celda-mes y totales mensuales MODIS/VIIRS |
| `src/lib/harmonize/calibration.ts` | Razón de totales, R² e índice mensual armonizado |
| `src/lib/harmonize/stats.ts` | Cuantiles, referencia leave-one-out y estado del mes |

No se implementa aquí la descarga, la escritura en base de datos, la asignación
de regiones ni los endpoints. Esas piezas pertenecen a tareas posteriores.

## 2. Producto y satélite explícitos

El parser exige `source` (por ejemplo `MODIS_SP`, `VIIRS_SNPP_SP`,
`VIIRS_SNPP_NRT`). No deduce la familia a partir del nombre del satélite. Cada
producto declara:

- familia (`MODIS` o `VIIRS`);
- si es NRT;
- si pertenece a la serie histórica;
- satélites permitidos.

Se aceptan como alias de satélite `N`, `NPP` y `SNPP` para S-NPP, y `N20`/`N21`
para NOAA-20/NOAA-21. Una fila con un satélite desconocido o incompatible con el
producto se rechaza (`unknown_satellite` o `satellite_product_mismatch`).

Valores canónicos usados en el código y las pruebas: `Terra`, `Aqua`, `S-NPP`,
`NOAA-20`, `NOAA-21`. El equipo debe verificar los valores exactos del CSV real
de FIRMS antes de la ingesta. El comentario de `MODELO-DE-DATOS.md` que menciona
`N`, `N20`, `N21` queda cubierto por los alias, sin cambiar el contrato SQL.

## 3. Parser CSV

Comportamiento probado:

- **Comillas**: campos entre comillas, comas internas y comillas escapadas
  (`""`). Una comilla sin cerrar produce un error fatal `unterminated_quote`.
- **Formato**: BOM UTF-8, fin de línea CRLF/LF, líneas en blanco y comentarios
  que empiezan con `#` antes del encabezado o entre filas.
- **Cabeceras**: se ignoran mayúsculas y espacios. Son obligatorias `latitude`,
  `longitude`, `acq_date`, `acq_time`, `satellite` y `confidence`. `instrument`,
  `scan`, `track`, `frp`, `brightness`, `brightness2`, `daynight`, `version` y
  `type` son opcionales.
- **Fecha UTC**: `acq_date` debe ser `YYYY-MM-DD` y una fecha real; se rechazan
  fechas como `2024-02-30`.
- **Hora HHMM**: acepta de 1 a 4 dígitos y rellena a la izquierda (`5` → `0005`,
  `530` → `0530`, `0` → `0000`). Rechaza horas mayores que 23 y minutos mayores
  que 59.
- **Confianza**:
  - MODIS: valor numérico de 0 a 100; `< 30` = `low`, `< 80` = `nominal`,
    `>= 80` = `high`. Un valor vacío se rechaza; no se interpreta como `0`.
  - VIIRS: `l`/`low`, `n`/`nominal`, `h`/`high`.
  - La confianza `low` se conserva en la detección, pero el índice la excluye
    por defecto.
- **Números**: `scan`, `track`, `frp` y brillos deben ser finitos si están
  presentes; un valor inválido rechaza la fila.
- **Coordenadas**: latitud en `[-90, 90]` y longitud en `[-180, 180]`.
- **Errores por fila**: no detienen el archivo. El resultado informa
  `rowsRead`, `rowsAccepted`, `rowsRejected` y una lista con línea y código de
  error. Las cabeceras inválidas o el producto desconocido sí son fatales.
- **Caja de ingesta**: si se pasa `bbox`, las filas fuera se cuentan como
  `outside_bbox` y no entran en `detections`.

El parser conserva el campo `type` de FIRMS pero **no filtra por él**. No se
aplica ningún filtro de uso del suelo, de quema agrícola, de FRP ni de cercanía
a una carretera. Las quemas agrícolas quedan en la serie, tal como exige el
reto.

## 4. Deduplicación y cuadrícula

Orden de limpieza previsto:

1. parsear CSV;
2. aplicar bbox;
3. normalizar la confianza (hecho por el parser);
4. deduplicar;
5. asignar `cell_id`.

La clave de deduplicación es `(satellite, acqAt, latitude, longitude)`, con el
nombre de satélite canónico. Si hay duplicados se conserva la primera fila y se
informa cuántas se descartaron. La reconciliación SP/NRT es una tarea posterior;
este módulo no decide qué origen gana.

La cuadrícula sigue la fórmula del documento de datos:

```text
ix = floor((lon + 180) / 0.01)
iy = floor((lat + 90) / 0.01)
cell_id = iy * 36000 + ix
```

`cell_id` se representa como `number`; el máximo es `647 999 999`, muy por
debajo de `Number.MAX_SAFE_INTEGER`. Para evitar colisiones en los bordes
exactos, las coordenadas `lon = 180` y `lat = 90` se asignan a la última celda
válida (`ix = 35999`, `iy = 17999`) en lugar de generar un índice fuera de
rango. El centroide y los límites de cada celda se pueden reconstruir con
`cellCentroid` y `cellBounds`.

## 5. Celdas-día ocupadas (CDO)

Una CDO es una celda con al menos una detección válida en un día UTC para una
familia de sensores. `computeCellDayOccupancy` cuenta:

- una fila por `(cellId, día UTC, familia)`;
- número de detecciones que pasan el filtro;
- FRP máximo no nulo.

Filtros por defecto:

- confianza mínima `nominal`;
- MODIS: Terra y Aqua;
- VIIRS: solo S-NPP para la serie histórica;
- NRT incluido por defecto, porque los meses recientes usan S-NPP NRT. Con
  `includeNrt: false` se obtiene una serie estrictamente SP;
- `historical: false` permite incluir NOAA-20/NOAA-21 para vistas de actualidad,
  pero nunca para la serie histórica.

La agregación mensual calcula:

- `cell_month`: días distintos ocupados por celda y familia, número de
  detecciones y suma de FRP;
- totales mensuales por familia: CDO, detecciones y FRP;
- totales mensuales alineados MODIS/VIIRS para la calibración. Cuando una
  familia no observó ese mes, sus campos quedan en `null`; un `0` explícito se
  conserva como valor observado y no se confunde con ausencia.

## 6. Calibración VIIRS → MODIS

Estimador por defecto: razón de totales.

```text
f = Σ CDO_MODIS / Σ CDO_VIIRS
```

Reglas:

- periodo de solapamiento por defecto: desde `2012-01`;
- solo se usan **meses emparejados** con valores finitos y no negativos en ambos
  sensores; `null` significa que la familia no observó el mes y no se convierte
  en cero;
- un cero explícito sí participa como observación;
- los meses marcados `isPartial` se excluyen salvo que se pida lo contrario;
- un mes que solo existe en un sensor no entra;
- dos filas con el mismo año y mes en el periodo de solapamiento producen
  `status = "duplicate_month"` y no se suman;
- si el total VIIRS es cero, el resultado es `status = "zero_denominator"` y
  `factor = null`; nunca se devuelve `Infinity` ni `NaN`;
- si no hay meses emparejados, `status = "no_overlap"`;
- el R² se calcula como `1 - SS_res / SS_tot` con la predicción `f × VIIRS`; si
  MODIS no tiene varianza, R² queda nulo;
- se guardan periodo, número de meses, totales, método y `method_version`.

El índice mensual usa MODIS antes de 2012-01 y `f × CDO_VIIRS_SNPP` desde
2012-01. La estrategia `modis_anchor` permite usar MODIS mientras esté
disponible y VIIRS escalado después, con disponibilidad explícita.

## 7. Cuantiles y clasificación leave-one-out

Los cuantiles usan interpolación lineal equivalente a `percentile_cont` de
PostgreSQL:

```text
pos = (n - 1) * p
valor = lower + (upper - lower) * fracción
```

La referencia de un mes:

- usa el mismo mes del año;
- excluye el año evaluado;
- excluye meses parciales por defecto;
- cuenta años distintos: una fila duplicada para el mismo año no aumenta
  `nYears`;
- si hay años duplicados en la referencia, el estado es `insufficient` con
  `reason = "duplicate_reference_year"`;
- exige al menos 8 años de referencia distintos;
- si la mediana de referencia es menor que 5 CDO, el estado es `insufficient`.

Estados (límites inclusivos hacia el estado superior):

| Condición | Estado |
|---|---|
| `valor < p25` | `below_usual` |
| `p25 <= valor <= p75` | `usual` |
| `p75 < valor <= p90` | `above_usual` |
| `valor > p90` | `exceptional` |
| menos de 8 años distintos, año duplicado, mediana < 5 CDO o valor ausente | `insufficient` |

El rango percentil se calcula como `(menores + empates/2) / n`. El documento
`API.md` muestra `percentileRank`; este valor es el que debe exponerse, sin
redondear en el módulo de cálculo.

## 8. Pruebas y fixtures

Todas las pruebas están en `tests/data/`. Los fixtures de
`tests/data/fixtures/` son **sintéticos** y contienen el aviso
`# SYNTHETIC TEST FIXTURE - NOT REAL NASA FIRMS DATA`; no se presenta ningún
valor inventado como dato real de FIRMS.

Cobertura principal:

- parser MODIS/VIIRS, comillas, BOM, CRLF, comentarios, HHMM sin ceros, fechas
  inválidas, confianza, scan/track, producto/satélite explícito y errores por
  fila;
- bbox inclusivo;
- fórmula de `cell_id`, bordes y reconstrucción de celdas;
- deduplicación;
- CDO con filtros de confianza, S-NPP histórico, NRT y exclusión de NOAA;
- conservación de quemas agrícolas (no se filtra por `type`);
- agregación celda-mes y totales mensuales;
- calibración con factor conocido, meses no emparejados, familia ausente como
  `null`, cero explícito, mes parcial, duplicados año/mes, denominador cero, R²
  y periodos inválidos;
- índice armonizado antes/después de 2012;
- cuantiles, referencia leave-one-out, años duplicados, estados y mínimos.

Resultado de esta tanda: **53 pruebas, 6 archivos, todas pasan**.

```text
node node_modules/vitest/vitest.mjs run tests/data
```

También se verificó el código y las pruebas con TypeScript estricto usando el
`typescript` disponible en `node_modules`. En este worktree no se modificó
`package.json`, no se añadieron dependencias versionadas y no se tocaron la app
ni el SQL.

## 9. Pendientes antes de afirmar datos reales

- Descargar y versionar fixtures pequeños **reales** de MODIS y VIIRS, con
  atribución y sin datos personales.
- Verificar nombres exactos de columnas, valores de `satellite`, `instrument`,
  versión y disponibilidad temporal con la documentación vigente de FIRMS.
- Validar el parser contra archivos de descarga masiva y de `/api/area`, no solo
  contra CSV sintéticos.
- Definir la estrategia de reconciliación NRT/SP y el mes de corte completo.
- Implementar la asignación de celdas a regiones y el cálculo de área.
- Repetir la calibración por región con datos reales y revisar R², sesgo y
  saltos en 2012 con un mentor o científico.
- Revisar el comportamiento de los bordes de la cuadrícula y de la caja de
  ingesta con coordenadas reales.
- Medir rendimiento y memoria en backfills de 20+ años.
- Documentar cualquier ajuste de método y subir `method_version` si cambia la
  fórmula.

## 10. Límites que la interfaz debe seguir explicando

- Una detección satelital es una anomalía térmica, no un incendio confirmado.
- El índice mide actividad detectada, no superficie quemada.
- MODIS y VIIRS tienen resoluciones, horarios y sensibilidades distintos.
- La calibración reduce diferencias, no las elimina.
- Los datos NRT pueden cambiar al procesarse como SP.
- Las quemas agrícolas se conservan; no se intenta separar incendios forestales
  de otras fuentes en este hito.
