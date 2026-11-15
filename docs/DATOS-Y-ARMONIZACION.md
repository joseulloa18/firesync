# Datos y armonización

Este documento define las fuentes de datos y el método para unir MODIS y VIIRS en una serie comparable. El método es una **propuesta de trabajo** que debe validarse con un mentor o científico antes de la entrega. Cada decisión aquí es configurable y se versiona con `method_version`.

## 1. Fuente: NASA FIRMS

Sistema FIRMS (Fire Information for Resource Management System, LANCE/EOSDIS). Recursos del tablero:

- https://www.earthdata.nasa.gov/data/tools/firms#background
- https://firms.modaps.eosdis.nasa.gov/map/
- https://firms.modaps.eosdis.nasa.gov/active_fire/
- https://firms.modaps.eosdis.nasa.gov/alerts/
- https://firms.modaps.eosdis.nasa.gov/download/
- https://firms.modaps.eosdis.nasa.gov/web-services/
- https://www.earthdata.nasa.gov/data/tools/firms/faq

### 1.1 API de área

Verificado en la documentación de FIRMS (`/api/area`):

```
/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]
/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]/[DATE]
```

- `AREA_COORDINATES`: caja `oeste,sur,este,norte` (ejemplo Sudamérica: `-85,-57,-32,14`) o `world`. No acepta nombres de puntos cardinales.
- `DAY_RANGE`: de 1 a 5 días por consulta.
- `DATE`: `YYYY-MM-DD`. Sin fecha devuelve los datos más recientes. Con fecha devuelve de `DATE` a `DATE + DAY_RANGE - 1`.
- `/api/data_availability/` indica el rango de fechas disponible por producto.
- `MAP_KEY` gratuita. Límite: **5000 transacciones por 10 minutos**; consultas grandes pueden contar como varias (por ejemplo, pedir 7 días).

### 1.2 Orígenes (`SOURCE`)

| SOURCE | Uso en este proyecto |
|---|---|
| `MODIS_SP` | Archivo histórico estándar de MODIS (Terra y Aqua) |
| `VIIRS_SNPP_SP` | Archivo histórico estándar de VIIRS S-NPP. **Sensor base** de la serie VIIRS |
| `MODIS_NRT` | Datos recientes de MODIS (Actualidad) |
| `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT` | Datos recientes de VIIRS (Actualidad y alertas) |
| `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_SP` | Opcionales, para comprobaciones de sensibilidad |
| `LANDSAT_NRT` | No se usa (solo EE. UU. y Canadá) |

Los datos en tiempo real y ultra real (RT y URT) se eliminan cuando se procesan los NRT correspondientes o pasan de 6 horas. NRT y SP pueden diferir; por eso se reconcilian (sección 6).

### 1.3 Atributos relevantes del CSV

Confirma los nombres exactos en las tablas de atributos de FIRMS al implementar el parser y guarda un CSV real de ejemplo en `tests/fixtures/`.

| Concepto | MODIS | VIIRS |
|---|---|---|
| Posición | `latitude`, `longitude` | `latitude`, `longitude` |
| Brillo | `brightness`, `bright_t31` | `bright_ti4`, `bright_ti5` |
| Fecha y hora de adquisición (UTC) | `acq_date`, `acq_time` (HHMM) | `acq_date`, `acq_time` (HHMM) |
| Satélite e instrumento | `satellite` (Terra, Aqua), `instrument` | `satellite` (S-NPP, NOAA-20, NOAA-21), `instrument` |
| Confianza | `confidence` numérica 0 a 100 | `confidence` categórica (`l`, `n`, `h`) |
| Potencia radiativa del fuego | `frp` (MW) | `frp` (MW) |
| Día o noche | `daynight` | `daynight` |

Resolución espacial nominal: MODIS cerca de 1 km, VIIRS 375 m (banda de imagen). Cobertura histórica: MODIS desde noviembre de 2000 (Terra) y julio de 2002 (Aqua); VIIRS S-NPP desde enero de 2012. Verifica las fechas exactas con `/api/data_availability/`.

## 2. Región de ingesta

- Por defecto: República Dominicana con un margen de 0.5° (caja aproximada `-72.6,17.0,-67.7,20.6`; ajústala y guárdala en `INGEST_BBOX`).
- Regiones analizables: país, provincias y polígonos dibujados dentro de la caja de ingesta. El diseño admite agregar más regiones sin cambiar el código.
- Límites administrativos: fuente abierta por decidir (geoBoundaries, GADM u oficial de República Dominicana; ver `DECISIONES.md`). Se cargan a `regions`.

## 3. Descarga histórica (backfill)

Preferente:
1. Pedir en https://firms.modaps.eosdis.nasa.gov/download/ el archivo de la región o el país para `MODIS_SP` y `VIIRS_SNPP_SP` y colocar los CSV en una carpeta local (no versionada).
2. `pnpm ingest:backfill --dir ./data/firms` los lee, limpia e inserta.

Alternativa por API:
- Ventanas de 5 días por origen. Para 25 años son unas 1850 consultas por origen para una sola caja. Aplicar throttle (por ejemplo 60 consultas por minuto), reintentos con espera creciente y reanudación (guardar la última fecha procesada en `job_runs`).

## 4. Limpieza

Aplicar en este orden, registrando cuántas filas descarta cada paso:

1. Parsear fecha y hora UTC a `acq_at`.
2. Descartar filas fuera de la caja de ingesta o con coordenadas inválidas.
3. Normalizar la confianza a `low`, `nominal`, `high`:
   - MODIS: 0 a 29 = `low`, 30 a 79 = `nominal`, 80 a 100 = `high` (según la guía de FIRMS; verifica).
   - VIIRS: `l` = `low`, `n` = `nominal`, `h` = `high`.
4. **Filtro por defecto:** excluir `low` del índice armonizado (`MIN_CONFIDENCE=nominal`, configurable). Las detecciones `low` se guardan pero no cuentan.
5. Deduplicar por `(satellite, acq_at, latitude, longitude)`.
6. Asignar `cell_id` (sección 5.1).
7. Marcar `is_nrt` según el origen.

Limitación conocida: FIRMS no distingue incendios forestales de quemas agrícolas, llamaradas industriales o volcanes. La interfaz lo explica. Un filtro de fuentes estáticas es trabajo futuro (backlog).

## 5. Método de armonización

### 5.1 Unidad común: celdas-día ocupadas

Contar detecciones brutas no es comparable: VIIRS detecta más puntos por su resolución de 375 m. En su lugar se cuenta la **ocupación de celdas de 0.01°** (aprox. 1 km, cercana a un píxel de MODIS):

```
ix = floor((lon + 180) / 0.01)
iy = floor((lat + 90) / 0.01)
cell_id = iy * 36000 + ix
```

Una **celda-día ocupada** (CDO) es una celda con al menos una detección válida en un día UTC para una familia de sensores. Es la unidad base del índice. Se guardan también las detecciones brutas y la FRP para mostrarlas como información complementaria.

### 5.2 Homogeneidad de cada familia

- **MODIS:** usar Terra y Aqua juntos desde julio de 2002. Entre noviembre de 2000 y junio de 2002 solo hay Terra: marcar esos meses como `terra_only` y mostrar un aviso. Terra y Aqua han tenido deriva orbital reciente que cambia sus horas de paso; verifica el impacto y documenta cualquier ajuste.
- **VIIRS:** usar **solo S-NPP** (`VIIRS_SNPP_SP`) para la serie de largo plazo, porque agregar NOAA-20 (desde 2018) y NOAA-21 aumentaría las pasadas por día y crearía saltos artificiales. NOAA-20 y NOAA-21 se usan en Actualidad y alertas, donde más pasadas significan detección más rápida, pero no entran en el índice histórico.

### 5.3 Calibración VIIRS a equivalente MODIS

1. Período de solapamiento: desde enero de 2012 hasta el último mes completo en que MODIS y VIIRS S-NPP tienen datos.
2. Para cada región `r` calcular el factor `f(r)` que lleva VIIRS a escala MODIS:
   - Estimador por defecto: razón de totales `f = Σ CDO_MODIS / Σ CDO_VIIRS` sobre los meses del solapamiento.
   - Alternativas a evaluar: regresión por el origen sobre valores mensuales, y factor por mes del año `f(r, m)` si la estacionalidad lo exige.
3. Guardar en `calibration_factors`: factor, método, número de meses de solapamiento, R², período y fecha de ajuste.
4. Para un polígono dibujado, usar el factor de la región más pequeña que contenga su centroide; si no hay, el factor del país.

### 5.4 Índice armonizado

Para una región, año y mes:

```
si año-mes < 2012-01:  harmonized_index = CDO_MODIS
si año-mes >= 2012-01: harmonized_index = f(r) × CDO_VIIRS_SNPP
```

Se elige VIIRS desde 2012 para que la serie continúe cuando MODIS deje de operar. En 2012 en adelante se conserva también el valor MODIS bruto, como contraste visible en el detalle del mes y en el panel de calidad. Estrategia alterna disponible por configuración: `HARMONIZATION_STRATEGY=modis_anchor` (usar MODIS mientras exista y VIIRS escalado después).

Unidad mostrada al usuario: «celdas-día con detección (≈1 km), equivalente MODIS».

### 5.5 Validación obligatoria

Generar un informe (`pnpm stats:report`) que incluya:
- Serie MODIS bruto y VIIRS × f superpuestas en 2012 en adelante, por región.
- R², sesgo medio y error relativo mensual.
- Meses atípicos (diferencias mayores a 2 desviaciones estándar).
- Comprobación de que no hay salto visible de la serie en 2012.

La interfaz expone un resumen en «Calidad de la armonización» (RF-MAP-9).

## 6. NRT, SP y meses provisionales

- Meses completos más antiguos que `SP_LAG_DAYS` (por defecto 90): usan datos SP.
- Meses recientes: usan NRT y se marcan `uses_nrt = true` (provisionales).
- El mes en curso: se marca `is_partial = true`.
- Tarea `reconcile-sp` (mensual): vuelve a pedir SP de los meses que ya lo tienen disponible, reemplaza las filas NRT (`is_nrt = false`) y recalcula los agregados.
- Para NRT, el índice reciente usa solo el origen VIIRS S-NPP NRT, igual que la serie histórica, para no introducir saltos.

## 7. Estadísticas

### 7.1 Referencia histórica (mediana y rango)

Para una región y un mes del año `m`, con los años completos disponibles **excluyendo el año evaluado** (dejar uno fuera):
- Mediana, p25, p75, p90, mínimo y máximo del `harmonized_index` del mes `m`.
- El «rango del mismo mes en otros años» que se muestra al tocar un mes es mínimo a máximo, con p25 a p75 como banda destacada.
- Requiere al menos 8 años de referencia; si hay menos, avisar que la referencia es limitada.

### 7.2 Estado del mes

Con el rango percentil del valor frente a los otros años:

| Estado | Regla por defecto |
|---|---|
| `below_usual` | por debajo de p25 |
| `usual` | entre p25 y p75 |
| `above_usual` | por encima de p75 y hasta p90 |
| `exceptional` | por encima de p90 |
| `insufficient` | mediana menor que `MIN_ACTIVITY` (por defecto 5 CDO) o menos de 8 años de referencia |

Los umbrales viven en `src/lib/harmonize/config.ts`.

### 7.3 Mes parcial

El mes en curso se compara con la mediana prorrateada por días transcurridos (`mediana × días transcurridos / días del mes`) y se etiqueta «estimación». Mejora P1: comparar con la mediana acumulada hasta el mismo día en los otros años, calculada desde `cell_day_occupancy`.

### 7.4 Tendencia

- Serie anual: suma de `harmonized_index` por año completo.
- Pendiente de Theil-Sen y prueba de Mann-Kendall; mostrar la pendiente en lenguaje claro («en promedio, +X celdas-día por año») y el valor p.
- Requiere al menos 10 años completos. Mostrar siempre la advertencia: la serie combina sensores calibrados y puede tener sesgos.

### 7.5 Épocas de mayor actividad

Participación media de cada mes en el total anual (promedio de `index_mes / index_año` sobre años completos). Mostrar los 3 meses con mayor participación y la curva estacional.

### 7.6 Ranking «Zonas con mayor actividad detectada»

- Regiones comparables: provincias de la región de ingesta (mismo nivel administrativo).
- Medida por área: `harmonized_index` acumulado en el período, dividido por el área de la región en miles de km², y por el número de años del período (CDO por 1000 km² por año).
- Mostrar siempre el período (por defecto, los últimos 5 años completos) y permitir cambiarlo.
- Si hay menos de dos regiones comparables, ocultar el ranking.

### 7.7 Meses prioritarios de preparación (Prevención y respuesta)

Los 3 meses con mayor participación estacional más cualquier mes con estado `exceptional` en al menos 2 de los últimos 5 años. Se muestra con el historial que lo respalda.

## 8. CSV de exportación

Primera sección: comentarios `#` con región o polígono, período, método, `method_version`, factor de calibración, fecha de los datos, sensores usados y atribución a NASA FIRMS. Luego las columnas:

```
region,year,month,harmonized_index,modis_cell_days,viirs_cell_days,detections_modis,detections_viirs,reference_median,reference_p25,reference_p75,status,is_partial,uses_nrt
```

## 9. Pruebas de datos

- Fixtures: CSV reales y pequeños de MODIS y VIIRS en `tests/fixtures/`.
- Pruebas unitarias de: normalización de confianza, `cell_id`, deduplicación, conteo de CDO, calibración con datos sintéticos de factor conocido, clasificación de estados, tendencia, ranking.
- Prueba de integración: backfill de una semana, agregación y consulta de calendario con resultado esperado.

## 10. Límites que la interfaz debe explicar

- Una detección es una anomalía térmica, no un incendio confirmado.
- El índice mide actividad de fuego detectada por satélite, no superficie quemada.
- MODIS y VIIRS tienen horarios y sensibilidades distintos; la calibración reduce pero no elimina las diferencias.
- Los datos NRT pueden cambiar cuando se procesan como SP.
