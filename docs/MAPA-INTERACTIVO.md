# Mapa interactivo (prototipo visual)

Componente: `src/components/fire-map.tsx` (export nombrado `FireMap`, cliente).
Datos sintéticos: `src/content/map-demo.ts`. Estilos propios: `src/components/fire-map.css`.

## Contrato

```tsx
<FireMap
  labels={labels}
  mode="history" // "history" | "recent" | "preview"
  sensor="all" // "all" | "MODIS" | "VIIRS"
  day={14} // día UTC opcional de marzo de 2025
  onSelect={(detection) => {}}
/>
```

`FireMapLabels` exige exactamente: `loading`, `error`, `retry`, `unavailable`,
`zoomIn`, `zoomOut`, `reset`, `draw`, `clear`, `attribution`, `legend`, `modis`,
`viirs`, `demo`. El agente de interfaz traduce y pasa esos textos; el mapa no
inventa palabras de interfaz.

`DemoDetection` (desde `@/content/map-demo`) exporta `id`, `sensor`, `satellite`,
`acquiredAt` (ISO UTC), `coordinates` `[lon, lat]`, `confidence`, `frpMw` e
`is_demo: true`.

## Comportamiento

- Base geográfica real de OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`)
  con su atribución conservada. Sin claves de NASA FIRMS ni consultas a NASA
  desde el navegador.
- `NavigationControl` real con arrastre, zoom, teclado y brújula. Botones propios
  para reiniciar la vista y dibujar/limpiar un polígono ficticio.
- Marcadores DOM accesibles: círculos naranjas para MODIS, rombos cian para
  VIIRS. Cada marcador es un botón con sensor y fecha en su etiqueta accesible.
- El modo dibujo agrega puntos con clic, termina con doble clic o al volver a
  pulsar el control de dibujo, y se puede limpiar. La lista de detecciones
  ofrece una alternativa accesible que no depende del mapa ni de hover.
- `sensor` y `day` recalculan la lista pura y recrean los marcadores sin
  conservar clausuras viejas. `mode` define la ventana: histórico (todo),
  reciente (últimos 5) o vista previa (primeros 8).
- `ResizeObserver`, limpieza de mapa/escuchas al desmontar y reintento tras
  error. Si WebGL o el estilo fallan se muestra `unavailable` con `retry`; la
  lista de datos sigue disponible.

## Datos de demostración

16 registros deterministas de marzo de 2025 cerca de `[-70.55, 18.75]`
(Cordillera Central, República Dominicana). Todos llevan `is_demo: true`. No se
inventa ni se dibuja un límite administrativo oficial; el polígono solo existe
si la persona usuaria lo dibuja.

## Pruebas

`tests/map/map-demo.test.ts` cubre filtros puros, ventanas y geometría GeoJSON.
Ejecutar:

```powershell
pnpm test
pnpm typecheck
pnpm lint
```
