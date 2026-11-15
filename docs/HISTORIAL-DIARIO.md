# Historial v2 — calendario anual y detalle diario

Este documento describe el prototipo de Historial v2 implementado para el
issue #21. Todo el contenido de esta pantalla es **sintético y de demostración**
(`is_demo: true`). No es histórico real de NASA FIRMS, no valida la armonización
MODIS + VIIRS y no debe usarse para decidir emergencias ni para afirmar que hubo
un incendio.

Contrato de referencia: `docs/HISTORIAL-V2-CONTRATO.md`.

## Qué ve la persona usuaria

- La pantalla `/es/mapa` (o `/en/mapa`) abre en una **matriz anual/mensual
  completa**, sin ningún mes preseleccionado.
- `/mapa?caso=demo` conserva una selección explícita para el botón
  *Probar un caso*: **febrero de 2025**, con su primer día con actividad
  simulada abierto.
- Los selectores *Desde el año* y *Hasta el año* ofrecen **2000 primero** y
  luego todos los años hasta el año actual, obtenido del reloj del servidor
  (UTC). El rango predeterminado es `2000–año actual`.
- El calendario solo dibuja los años del rango activo; los selectores siguen
  permitiendo ampliarlo. No existen años futuros.
- Los meses posteriores al mes actual se muestran con `×`, borde discontinuo y
  deshabilitados. Los meses con cero detecciones se muestran como celdas vacías
  (`·`), distintas de los futuros.
- Al pulsar un mes se despliega su **desglose diario completo**: todos los días
  del mes, incluidos los de valor cero y el 29 de febrero en años bisiestos.
  Cada día abre su ficha con hora UTC y local, sensor, satélite, confianza, FRP y
  coordenadas.
- *Cerrar detalle* devuelve a la matriz completa y restaura la vista espacial del
  período.

Un mes en curso queda marcado como `is-partial`: los días posteriores a hoy se
muestran como futuros y no generan registros.

## Fuente única de datos

La generación y los resúmenes viven en
`src/lib/history/demo-history.ts` como funciones puras (sin React). El
calendario, el detalle diario, las cifras, el mapa y el CSV consumen esa misma
fuente y el mismo filtro de sensor.

### Determinismo

Cada registro se deriva de un hash entero estable (FNV-1a) de año, mes, día,
zona e índice. No se usa `Math.random`, así que la misma combinación de zona,
año y mes produce exactamente los mismos datos en cada visita y en cada prueba.
El patrón estacional es **solo ilustrativo** y no representa una temporada real.

### Disponibilidad nominal de sensores

Aun siendo datos sintéticos, se respeta la disponibilidad nominal:

| Sensor / satélite | Primer mes simulado |
|---|---|
| MODIS Terra | noviembre de 2000 |
| MODIS Aqua | julio de 2002 |
| VIIRS S-NPP | enero de 2012 |

Por eso 2000 y parte de 2001 no muestran VIIRS, y los primeros meses de 2000 no
muestran MODIS. Las fechas futuras nunca generan registros. Los datos
combinados MODIS + VIIRS **no** se presentan como un índice armonizado
validado; la interfaz lo indica explícitamente.

### Escala visual

El nivel `0–3` se calcula con umbrales relativos del prototipo
(`0–5`, `6–15`, `16–30`, `>30`). No significa gravedad, peligro ni predicción.
La paleta es la acordada en el contrato y no depende solo del color: cada celda
tiene etiqueta accesible.

## Filtro de sensor compartido

Un único estado `sensor` (`all`, `MODIS`, `VIIRS`) se aplica a:

- las celdas del calendario;
- el desglose diario;
- las cifras del mes;
- la lista de registros del día;
- el subconjunto que recibe el mapa;
- las filas del CSV.

El contrato con el mapa es el de `docs/HISTORIAL-V2-CONTRATO.md`: se pasan
`sensor`, `onSensorChange` y `activity`. El mapa debe dibujar exactamente los
registros filtrados que recibe, sin otro generador ni truncado oculto.

## Límite de puntos en el mapa

La vista de período puede abarcar 27 años y decenas de miles de registros. Para
no crear decenas de miles de marcadores DOM, la lista que recibe el mapa se
reduce a `MAP_SAMPLE_LIMIT = 500` registros mediante `sampleForMap`, una muestra
determinista y ordenada que nunca inventa puntos. Cuando se aplica, la interfaz
muestra un aviso con la proporción (`mostrados/total`).

Las **cifras, el detalle diario y el CSV conservan todos los registros** del
filtro; el muestreo afecta únicamente a la representación de puntos. Cuando hay
un mes abierto, el mapa usa el mes filtrado completo (sin muestreo de período)
y se limita al día seleccionado.

> Nota de integración: la capa GeoJSON agregada del mapa es trabajo del issue
> #22. Hasta que se integre, este límite es la protección explícita acordada en
> el contrato.

## CSV sintético

El botón *Descargar CSV* genera un archivo con:

- cabecera que identifica los datos como sintéticos, la zona, el rango y el
  sensor activo;
- una fila por mes del rango, con nivel, total, sensor, estado
  (`observado`, `parcial` o `futuro`) y origen `synthetic-demo`;
- si hay un mes abierto, un bloque adicional con una fila por día del mes,
  incluidos los ceros y los días futuros marcados como tales.

## Pruebas

- Unitarias: `tests/history/demo-history.test.ts` cubre determinismo, días por
  mes (incluido febrero bisiesto), disponibilidad de sensores, meses futuros y
  parciales, filtros, muestreo y CSV.
- Extremo a extremo: `tests/e2e/history-expanded.spec.ts` cubre la apertura sin
  selección, 2000 como primer año, meses futuros, febrero bisiesto y no
  bisiesto, cierre del detalle, cambio de rango, caso demo y CSV.

Comandos de verificación:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Límites explícitos

- No hay ingesta real de FIRMS en esta tarea; no se afirma que estos datos
  provengan de NASA.
- No se predice propagación ni gravedad.
- Los teléfonos, correos y protocolos de emergencia no se inventan aquí; el
  recordatorio de llamar al 9-1-1 es el texto institucional ya existente.
- Las zonas, coordenadas y registros son ficticios y están marcados como tales.
