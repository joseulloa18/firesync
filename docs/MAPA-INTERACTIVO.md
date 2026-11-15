# Mapa interactivo (prototipo visual)

Componente: `src/components/fire-map.tsx` (export nombrado `FireMap`, cliente).
Datos sintéticos: `src/content/map-demo.ts`. Estilos propios: `src/components/fire-map.css`.
Agregación espacial pura: `src/lib/geo/activity-grid.ts`.

## Contrato

```tsx
<FireMap
  labels={labels}
  mode="history" // "history" | "recent" | "preview"
  sensor="all" // "all" | "MODIS" | "VIIRS"
  onSensorChange={(sensor) => {}} // opcional, filtro controlado
  detections={records} // registros del mismo filtro usado por el panel
  activity // opcional; por defecto true solo en mode="history"
  day={14} // día UTC opcional de los registros suministrados
  onSelect={(detection) => {}}
/>
```

`FireMapLabels` exige exactamente: `loading`, `error`, `retry`, `unavailable`,
`zoomIn`, `zoomOut`, `reset`, `draw`, `clear`, `attribution`, `legend`, `modis`,
`viirs`, `demo`, `list`, `noData`, `north`, `attributionToggle`, `all`,
`activity`, `activityUnit`, `terrain` y `terrainUnavailable`. El agente de
interfaz traduce y pasa esos textos; el mapa no inventa palabras de interfaz.

`DemoDetection` (desde `@/content/map-demo`) exporta `id`, `sensor`, `satellite`,
`acquiredAt` (ISO UTC), `coordinates` `[lon, lat]`, `confidence`, `frpMw` e
`is_demo: true`.

## Comportamiento

- Base geográfica real de OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`)
  con su atribución conservada. Sin claves de NASA FIRMS ni consultas a NASA
  desde el navegador.
- `NavigationControl` real con arrastre, zoom, teclado y brújula. Botones propios
  para reiniciar la vista y dibujar/limpiar un polígono ficticio.
- Bajo el mapa, los botones **Ambos / MODIS / VIIRS** reflejan el sensor activo
  (`aria-pressed`) y llaman a `onSensorChange` cuando existe. Así el historial
  mantiene un único estado de sensor para calendario, cifras, CSV y mapa. Sin
  `onSensorChange`, el mapa conserva un estado local para que los botones sigan
  siendo utilizables en las vistas anteriores; si cambia la prop `sensor`, el
  valor local se restablece.
- Marcadores DOM accesibles: círculos naranjas para MODIS, rombos cian para
  VIIRS. Cada marcador es un botón con sensor y fecha en su etiqueta accesible.
  La representación de puntos se limita a 250 marcadores/elementos de lista; el
  resumen indica el total exacto y una nota numérica `… visibles / total` avisa
  del recorte. Los agregados, las cifras y el CSV no se recortan.
- El modo dibujo agrega puntos con clic, termina con doble clic o al volver a
  pulsar el control de dibujo, y se puede limpiar. La lista de detecciones
  ofrece una alternativa accesible que no depende del mapa ni de hover.
- `sensor` y `day` recalculan la lista pura y recrean los marcadores sin
  conservar clausuras viejas. `mode` define la ventana solo cuando no se
  suministran detecciones: histórico (todo), reciente (últimos 5) o vista previa
  (primeros 8).
- `ResizeObserver`, limpieza de mapa/escuchas al desmontar y reintento tras
  error. Si WebGL o el estilo fallan se muestra `unavailable` con `retry`; la
  lista de datos sigue disponible.

## Capa de actividad (intensidad espacial)

- Se activa con `activity` y, si no se indica, solo por defecto en
  `mode="history"`. Usa **exactamente** la lista ya filtrada por sensor y día
  (`filterDetectionRecords` para datos suministrados, sin otro generador ni
  truncado oculto).
- `src/lib/geo/activity-grid.ts` agrupa cada registro en celdas WGS84 estables de
  `0.01°` (unos 1.1 km en el ecuador). Una celda conserva su identificador aunque
  cambie el conjunto de datos porque la cuadrícula está anclada a -180/-90, no a
  la extensión de los puntos.
- Cada celda de la capa GeoJSON lleva `count` (registros agrupados) y un `level`
  relativo de 0 a 3. La suma de `count` es igual al número de registros válidos
  del filtro; `total` expone ese valor y no se pierde ningún registro por el
  límite de marcadores DOM.
- Paleta común con el calendario, de menor a mayor intensidad relativa:
  `#fbd6d2`, `#ffb48f`, `#f77555`, `#be293b`. No significan gravedad,
  predicción ni un índice científico. La leyenda muestra la escala y la unidad
  `activityUnit` ("detecciones sintéticas por celda").
- Si el filtro no tiene registros, no se inventan celdas en cero; la leyenda
  muestra `noData`. Cambiar sensor, día o período vuelve a construir las celdas
  calientes con los registros de ese subconjunto.
- Se usa una capa `fill`/`line` de MapLibre, no un marcador DOM por celda.

## Relieve opcional

- Fuente global **Mapterhorn** (encoding Terrarium), sin clave ni pago:
  `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, `tileSize: 512`,
  `encoding: "terrarium"`, `maxzoom: 12`. La tesela `8/77/114` cubre República
  Dominicana y se comprobó con respuesta `200` y `Access-Control-Allow-Origin: *`.
  El TileJSON oficial es `https://tiles.mapterhorn.com/tilejson.json`.
- Se eligió Mapterhorn en lugar de AWS Terrarium
  (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`)
  porque AWS devuelve la imagen pero no anuncia CORS para el navegador de la
  aplicación; Mapterhorn conserva el mismo encoding Terrarium y sí lo anuncia.
- El botón **Relieve** está bajo el mapa. Al activarlo se añade un `raster-dem`,
  se llama a `setTerrain` y se dibuja una capa `hillshade` para que el relieve se
  note también en vista cenital. Si la carga o la API de terreno fallan, se
  retira el terreno, se mantiene el mapa plano y se muestra
  `terrainUnavailable`; el botón permite reintentar.
- Atribución mostrada en el control del mapa: `© Mapterhorn`. Fuente y licencia:
  https://mapterhorn.com/ , https://mapterhorn.com/attribution y
  https://github.com/mapterhorn/mapterhorn/blob/main/LICENSE (código BSD-3; los
  datos de terreno proceden de varias fuentes abiertas detalladas en la página
  de atribución). El proyecto no afirma que la vista plana tenga relieve: solo
  lo muestra después de activar el control y cargar la fuente.

## Datos de demostración

16 registros deterministas de marzo de 2025 cerca de `[-70.55, 18.75]`
(Cordillera Central, República Dominicana). Todos llevan `is_demo: true`. No se
inventa ni se dibuja un límite administrativo oficial; el polígono solo existe
si la persona usuaria lo dibuja. Los conteos de la capa de actividad son de
detecciones sintéticas; una detección satelital no es un incendio confirmado.

## Pruebas

- `tests/map/map-demo.test.ts`: filtros puros, ventanas, geometría GeoJSON y
  datos sintéticos.
- `tests/geo/activity-grid.test.ts`: agrupación por celda estable, conservación
  del total, celdas vacías, coordenadas inválidas, niveles, paleta y límite de
  representación.
- `tests/map/activity-layer.test.ts`: integración del filtro sensor/día con la
  capa de actividad, actualización de celdas calientes, cero/no datos y total
  conservado aunque se limiten los marcadores DOM.

Ejecutar:

```powershell
pnpm test
pnpm typecheck
pnpm lint
```

## Integración verificada

MapLibre 6 necesita `setWorkerUrl(new URL(..., import.meta.url).toString())`
para que Next emita el worker como recurso local con ambos bundlers. Se aplica
antes de crear el mapa; no se usa una URL de worker externa.
Guía oficial: https://maplibre.org/maplibre-gl-js/docs/#esm

Los registros suministrados no se truncan por modo. El calendario genera puntos
sintéticos con el mismo conteo diario del resumen; actualidad pasa exactamente
los registros del filtro a mapa, lista y ficha. Los cambios de mes, año, sensor
y zona no presentan una detección ajena al filtro. El dibujo es local al
prototipo: no crea zonas privadas ni activa alertas.

La tesela de relieve dominicana, su CORS y el TileJSON de Mapterhorn se
comprobaron contra el servicio público. La revisión manual del mapa con el
toggle activo debe hacerse en un navegador con WebGL; no se declara validación
científica del terreno ni de las detecciones.
