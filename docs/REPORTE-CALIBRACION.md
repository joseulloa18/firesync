# Reporte de calibración

Generador **puro** de un informe de calibración VIIRS → MODIS por meses
pareados. Vive en `src/lib/reports/` y usa `calibrateViirsToModis` como única
fuente de verdad para el factor, el período de solapamiento, el número de meses,
el R² y el estado de calibración.

Esta tanda implementa la lógica pura del informe. **No crea un CLI, no ejecuta
`pnpm stats:report`, no escribe en base de datos y no modifica la app.**

## 1. API

```ts
import {
  buildCalibrationReport,
  calibrationReportToCsv,
  type CalibrationReportOptions,
} from '@/lib/reports';
```

`buildCalibrationReport(months, options)` recibe los totales mensuales
emparejados (`CalibrationMonth[]`) y devuelve un `CalibrationReport`.
`calibrationReportToCsv(report)` serializa ese objeto a CSV.

Opciones obligatorias y opcionales:

| Opción | Tipo | Uso |
|---|---|---|
| `origin` | `'observed' \| 'synthetic'` | **Obligatoria.** Origen explícito de los valores |
| `overlapStart` | `{ year, month }` | Inicio del solapamiento; por defecto `2012-01` |
| `overlapEnd` | `{ year, month }` | Fin opcional del solapamiento |
| `includePartial` | `boolean` | Incluye meses `isPartial`; por defecto `false` |
| `methodVersion` | `string` | Versión del método; por defecto la de `harmonize/config.ts` |
| `label` | `string` | Región o etiqueta del informe |

`origin` es obligatorio para que un informe sintético nunca pueda presentarse
como observado. `isDemo` se deriva de forma directa:
`origin === 'synthetic'`.

## 2. Resultado

El informe contiene:

- `factor`: factor VIIRS → MODIS, o `null` si no se pudo calibrar;
- `periodStart` y `periodEnd`: primer y último mes pareado usado (`YYYY-MM-01`);
- `nOverlapMonths`: número de meses pareados que entraron en la calibración;
- `r2`: coeficiente de determinación del ajuste, o `null` si no es calculable;
- `meanBias`: media de `VIIRS_escalado − MODIS` sobre los meses pareados;
- `rmse`: raíz del error cuadrático medio con la misma predicción;
- `meanRelativeError`: media de `residual / MODIS` solo en meses con `MODIS > 0`;
- `months`: la serie mensual con MODIS bruto, VIIRS bruto, VIIRS escalado,
  residual y error relativo;
- `jump2012`: siempre `'not_evaluated'`;
- `scientificValidation`: siempre `'not_performed'`.

`residual = factor × VIIRS − MODIS`. Un sesgo positivo significa que el VIIRS
escalado sobreestima el valor MODIS del mismo mes. El error relativo nunca se
calcula con denominador cero: si `MODIS = 0`, queda `null`, no `Infinity` ni
`NaN`.

## 3. Ausente, cero y parcial

La serie mensual conserva la distinción del modelo de datos:

| Entrada | Salida | Significado |
|---|---|---|
| `null` | `modisState: 'absent'` o `viirsState: 'absent'` | La familia no observó ese mes; **no se rellena con cero** |
| `0` | `modisState: 'zero'` o `viirsState: 'zero'` | Observación real de cero CDO |
| `isPartial: true` | `isPartial: true` | Mes en curso o incompleto |

Los meses parciales se excluyen de la calibración salvo que se pida
`includePartial: true`, igual que en `calibrateViirsToModis`. Aun excluidos,
aparecen en `months` con su etiqueta `isPartial`, para que el lector vea por qué
no cuentan.

Un mes con una sola familia observada no entra en la calibración, pero sí se
muestra en la serie mensual. Su VIIRS escalado se calcula si hay factor, y su
residual/error relativo quedan `null` porque falta el otro lado del par.

## 4. Estados

`status` del informe es `'ok'` solo cuando
`calibrateViirsToModis` devuelve `'ok'`. En cualquier otro caso es
`'insufficient'` y se conserva el detalle en `calibrationStatus`:

- `no_overlap`: no hay meses con MODIS y VIIRS válidos;
- `zero_denominator`: el total VIIRS es cero, así que el factor es `null`;
- `duplicate_month`: hay filas repetidas de año/mes en el solapamiento;
- `invalid_input`: el período de solapamiento es inválido.

En un informe insuficiente, `factor`, `periodStart`, `periodEnd`, `r2`,
`meanBias`, `rmse` y `meanRelativeError` quedan en `null` cuando corresponde. No
se inventa un factor ni se rellenan métricas.

## 5. Límites explícitos

Este informe **no afirma** que no exista un salto visible en 2012: el campo
`jump2012` vale `'not_evaluated'`. Tampoco afirma que la armonización esté
validada científicamente: `scientificValidation` vale `'not_performed'`.

Para evaluar un salto o validar el método hacen falta datos observados, revisión
de series por región y criterio de un mentor o científico. Un informe generado
con `origin: 'synthetic'` es una prueba de software, no evidencia de datos
reales. La calibración reduce diferencias entre sensores, no las elimina.

## 6. CSV

El CSV empieza con líneas de comentario `#` con región, origen, `is_demo`,
estado, factor, método, `method_version`, período, R², sesgo, RMSE, error
relativo medio y los dos campos de límites. Después incluye la cabecera:

```text
region,origin,is_demo,status,period,year,month,is_partial,modis_cell_days,viirs_cell_days,viirs_scaled_cell_days,residual,relative_error,modis_state,viirs_state
```

Reglas de escape:

- campos con coma, comilla, CR/LF o espacios al inicio/fin se entrecomillan;
- las comillas internas se duplican (`"` → `""`);
- `null` se escribe como campo vacío y `0` se escribe como `0`, por lo que
  ausencia y cero no se confunden al reabrir el archivo;
- los valores de las líneas de comentario se convierten a una sola línea.

## 7. Pruebas

`tests/data/reports.test.ts` cubre:

- factor conocido con R² = 1, sesgo, RMSE y error relativo;
- ajuste malo con **R² negativo** conservado;
- valores ausentes (`null`) que no se rellenan con cero;
- ceros explícitos y denominador cero;
- meses parciales incluidos o excluidos;
- ausencia de solapamiento con estado `insufficient`;
- origen `synthetic`/`observed` y `isDemo` explícito;
- escape correcto del CSV, incluidos comas, comillas y saltos de línea.

Comando usado en este worktree:

```text
node node_modules/vitest/vitest.mjs run tests/data/reports.test.ts
```

Los datos de las pruebas son sintéticos y están etiquetados como tales. No se
presenta ningún valor inventado como observación real de NASA FIRMS.
