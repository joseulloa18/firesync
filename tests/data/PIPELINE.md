# Pipeline de datos: CSV → deduplicación → ocupación → mes

Documento de la prueba de integración `tests/data/pipeline-integration.test.ts`
(tarea T1.5, issue #15). La prueba usa únicamente las funciones existentes de
`src/lib/firms` y `src/lib/harmonize`; no modifica la implementación.

> **Datos sintéticos, no validación científica.** Todas las filas de la semana
> son inventadas para comprobar el recorrido del código. No son datos de NASA
> FIRMS y no demuestran exactitud del método de armonización.

## 1. Semana sintética

Semana: **2024-03-01 a 2024-03-07**, fechas y horas en UTC. Caja de ingesta de
República Dominicana (`-72.6,17.0,-67.7,20.6`). Tres celdas de 0.01° según
`docs/DATOS-Y-ARMONIZACION.md` 5.1:

| Celda | Coordenada representativa | `cellId`  |
| ----- | ------------------------- | --------- |
| A     | 18.4715, -69.9132         | 390503008 |
| B     | 18.4801, -69.9001         | 390539009 |
| C     | 18.4605, -69.9255         | 390467007 |

### 1.1 MODIS_SP (Terra y Aqua)

| #   | Fecha UTC  | Hora UTC | Satélite | Celda | Confianza    | FRP  | Papel en la prueba                                       |
| --- | ---------- | -------- | -------- | ----- | ------------ | ---- | -------------------------------------------------------- |
| 1   | 2024-03-01 | 05:30    | Terra    | A     | alta (85)    | 12.5 | Terra y Aqua en la misma celda-día                       |
| 2   | 2024-03-01 | 01:05    | Aqua     | A     | nominal (45) | 4.0  | misma celda-día que la fila 1                            |
| 3   | 2024-03-02 | 05:30    | Terra    | C     | baja (20)    | 2.1  | única detección de esa celda-día; se excluye de la serie |
| 4   | 2024-03-02 | 13:30    | Aqua     | B     | nominal (55) | 7.5  | quema agrícola sintética que debe conservarse            |
| 5   | 2024-03-03 | 05:25    | Terra    | C     | alta (90)    | 18.0 | detección original                                       |
| 6   | 2024-03-03 | 05:25    | Terra    | C     | alta (90)    | 18.0 | repetición exacta de la fila 5                           |
| 7   | 2024-03-07 | 01:10    | Aqua     | A     | nominal (60) | 3.2  | segundo día ocupado de la celda A                        |

### 1.2 VIIRS S-NPP SP

| #   | Fecha UTC  | Hora UTC | Satélite | Celda | Confianza     | FRP | Papel en la prueba                            |
| --- | ---------- | -------- | -------- | ----- | ------------- | --- | --------------------------------------------- |
| 1   | 2024-03-01 | 01:43    | S-NPP    | A     | alta (`h`)    | 6.2 | celda-día VIIRS                               |
| 2   | 2024-03-02 | 02:02    | S-NPP    | B     | nominal (`n`) | 1.4 | quema agrícola sintética que debe conservarse |
| 3   | 2024-03-04 | 14:30    | S-NPP    | C     | nominal (`n`) | 2.5 | celda-día VIIRS                               |
| 4   | 2024-03-05 | 01:50    | S-NPP    | A     | alta (`h`)    | 9.1 | se solapa con una fila NRT                    |

### 1.3 VIIRS S-NPP NRT

| #   | Fecha UTC  | Hora UTC | Satélite | Celda | Confianza  | FRP | Papel en la prueba                   |
| --- | ---------- | -------- | -------- | ----- | ---------- | --- | ------------------------------------ |
| 1   | 2024-03-05 | 01:50    | S-NPP    | A     | alta (`h`) | 9.1 | solapamiento exacto con la fila SP 4 |
| 2   | 2024-03-06 | 02:05    | S-NPP    | C     | alta (`h`) | 5.5 | celda-día solo NRT                   |
| 3   | 2024-03-06 | 02:10    | S-NPP    | B     | alta (`h`) | 4.4 | celda-día solo NRT                   |

### 1.4 VIIRS NOAA-20 NRT

| #   | Fecha UTC  | Hora UTC | Satélite | Celda | Confianza  | FRP | Papel en la prueba                                         |
| --- | ---------- | -------- | -------- | ----- | ---------- | --- | ---------------------------------------------------------- |
| 1   | 2024-03-05 | 01:50    | NOAA-20  | A     | alta (`h`) | 7.7 | mismo instante y lugar que una fila SP, pero otro satélite |

## 2. Conteo manual paso a paso

### Paso 1: filas leídas y aceptadas

- MODIS_SP: 7 filas.
- VIIRS_SNPP_SP: 4 filas.
- VIIRS_SNPP_NRT: 3 filas.
- VIIRS_NOAA20_NRT: 1 fila.
- **Total: 15 filas leídas y 15 aceptadas. 0 rechazadas** (todas dentro de la
  caja de ingesta y con satélite, confianza, fecha, hora y coordenadas válidas).

### Paso 2: deduplicación

Clave documentada: `(satellite, acq_at, latitude, longitude)`.

1. La fila MODIS 6 repite exactamente la fila MODIS 5 (Terra, mismo instante y
   coordenadas): **1 duplicado**.
2. La fila NRT 1 de S-NPP repite exactamente la fila SP 4 de S-NPP (mismo
   satélite, instante y coordenadas): **1 duplicado**. Como la fila SP se procesa
   primero, la fila SP queda como única y la NRT se registra como duplicada.
3. NOAA-20 no es duplicado aunque comparta instante y coordenadas con una fila
   S-NPP, porque la clave incluye el satélite.
4. Terra y Aqua comparten celda-día, pero no son duplicados: son satélites
   distintos.

Resultado: **15 − 2 = 13 detecciones únicas**.

- MODIS: 6 (7 − 1 duplicado).
- S-NPP SP: 4.
- S-NPP NRT: 2 (3 − 1 duplicado).
- NOAA-20 NRT: 1.

### Paso 3: selección de la serie por defecto

La serie histórica usa confianza mínima `nominal`, conserva NRT y solo admite
S-NPP para VIIRS (`historical` por defecto).

- Se excluye la fila MODIS 3 por confianza `low`: **−1**.
- Se excluye NOAA-20 porque no es S-NPP: **−1**.
- Se conservan las dos filas NRT de S-NPP: NRT no se excluye por defecto.

Resultado: **13 − 2 = 11 detecciones en la serie**.

- MODIS: 5 (las 6 únicas menos la fila de confianza baja).
- VIIRS S-NPP: 6 (4 SP + 2 NRT).

### Paso 4: celdas-día ocupadas (CDO)

Una CDO es una celda con al menos una detección válida en un día UTC para una
familia de sensores.

| Familia | Celda | Día UTC    | Detecciones                            | FRP máximo | CDO |
| ------- | ----- | ---------- | -------------------------------------- | ---------- | --- |
| MODIS   | A     | 2024-03-01 | 2 (Terra + Aqua)                       | 12.5       | 1   |
| MODIS   | B     | 2024-03-02 | 1 (quema agrícola)                     | 7.5        | 1   |
| MODIS   | C     | 2024-03-03 | 1 (repetición eliminada)               | 18.0       | 1   |
| MODIS   | A     | 2024-03-07 | 1                                      | 3.2        | 1   |
| VIIRS   | A     | 2024-03-01 | 1 (S-NPP SP)                           | 6.2        | 1   |
| VIIRS   | B     | 2024-03-02 | 1 (S-NPP SP, quema agrícola)           | 1.4        | 1   |
| VIIRS   | C     | 2024-03-04 | 1 (S-NPP SP)                           | 2.5        | 1   |
| VIIRS   | A     | 2024-03-05 | 1 (SP; su gemela NRT ya era duplicada) | 9.1        | 1   |
| VIIRS   | C     | 2024-03-06 | 1 (S-NPP NRT)                          | 5.5        | 1   |
| VIIRS   | B     | 2024-03-06 | 1 (S-NPP NRT)                          | 4.4        | 1   |

- MODIS: **4 CDO** y 5 detecciones.
- VIIRS: **6 CDO** y 6 detecciones.
- **Total: 10 CDO** y 11 detecciones.

Comprobaciones específicas:

- **Terra + Aqua cuentan una vez.** La celda A del 2024-03-01 tiene dos
  detecciones MODIS, pero produce una sola CDO (`nDetections = 2`,
  `maxFrp = 12.5`).
- **SP no borra NRT de otro satélite o celda.** Las CDO NRT de las celdas B y C
  del 2024-03-06 siguen presentes junto a las CDO SP. La fila NOAA-20 sobrevive
  a la deduplicación por ser otro satélite; la restricción histórica la excluye
  de la serie por defecto, y con `historical: false` aparece en la misma
  celda-día A del 2024-03-05 (2 detecciones, FRP máximo 9.1). Esa exclusión es
  una decisión de serie, no un borrado de la deduplicación.
- **Quemas agrícolas conservadas.** Las filas marcadas como quema agrícola
  sintética en MODIS y VIIRS permanecen en la serie y en la ocupación. El
  pipeline no filtra por uso del suelo ni por el campo `type`.

### Paso 5: agregación mensual

Todas las fechas caen en marzo de 2024.

| Familia | Celda | Días ocupados               | Detecciones | Suma FRP                |
| ------- | ----- | --------------------------- | ----------- | ----------------------- |
| MODIS   | A     | 2024-03-01 y 2024-03-07 → 2 | 3           | 12.5 + 4.0 + 3.2 = 19.7 |
| MODIS   | B     | 1                           | 1           | 7.5                     |
| MODIS   | C     | 1                           | 1           | 18.0                    |
| VIIRS   | A     | 2024-03-01 y 2024-03-05 → 2 | 2           | 6.2 + 9.1 = 15.3        |
| VIIRS   | B     | 2024-03-02 y 2024-03-06 → 2 | 2           | 1.4 + 4.4 = 5.8         |
| VIIRS   | C     | 2024-03-04 y 2024-03-06 → 2 | 2           | 2.5 + 5.5 = 8.0         |

Totales por familia para marzo de 2024:

| Familia | CDO del mes | Detecciones | Suma FRP |
| ------- | ----------- | ----------- | -------- |
| MODIS   | 4           | 5           | 45.2     |
| VIIRS   | 6           | 6           | 29.1     |

Totales combinados (`MonthlyFamilyTotals`): `modisCellDays = 4`,
`viirsCellDays = 6`, `detectionsModis = 5`, `detectionsViirs = 6`.

## 3. Comprobación UTC

La prueba incluye dos filas en la misma celda:

| Fila | `acq_at` UTC               | Fecha local en America/Santo_Domingo (UTC−4) | Día usado por el pipeline |
| ---- | -------------------------- | -------------------------------------------- | ------------------------- |
| 1    | `2024-03-01T23:59:00.000Z` | 2024-03-01 19:59                             | 2024-03-01                |
| 2    | `2024-03-02T00:05:00.000Z` | 2024-03-01 20:05                             | 2024-03-02                |

Aunque ambas horas son el mismo día local, la ocupación devuelve dos días UTC
distintos (`2024-03-01` y `2024-03-02`). Esto verifica que el pipeline agrupa por
fecha UTC y no convierte a hora local; la conversión a
`America/Santo_Domingo` queda solo para mostrar valores en la interfaz.

## 4. Verificación ejecutada

```text
pnpm exec vitest run tests/data/pipeline-integration.test.ts
# 1 archivo, 5 pruebas aprobadas

pnpm lint
# ESLint sin errores y Prettier conforme

pnpm typecheck
# Tipos generados y tsc --noEmit sin errores

pnpm test
# 10 archivos y 90 pruebas aprobadas
```

## 5. Límites y pendientes

- La prueba no demuestra que el producto SP reemplace al NRT en producción. La
  tarea `reconcile-sp` es la responsable de ese reemplazo; aquí solo se
  comprueba que un solapamiento exacto SP/NRT cuenta una vez y que la
  deduplicación no elimina NRT de otro satélite u otra celda.
- No se encontró un fallo en las funciones existentes al recorrer este caso.
- Los datos son sintéticos. La validación con datos reales de FIRMS y la
  aprobación del método por un mentor o científico siguen pendientes según
  `docs/DATOS-Y-ARMONIZACION.md`.
