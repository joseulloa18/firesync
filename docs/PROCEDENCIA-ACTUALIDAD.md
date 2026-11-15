# Procedencia en Actualidad

## Qué muestra el prototipo

La tarjeta de procedencia de `Actualidad` describe el origen real de los datos de
esa vista:

- Origen actual: fixture sintético de demostración (`synthetic-fixture`).
- Proveedor previsto: NASA FIRMS, **no conectado** en este prototipo.
- Última ingesta real: **no disponible**; no se usa `Date.now` ni otra fecha del
  navegador como fecha de descarga o actualización.
- Adquisición más reciente: el mayor `acquiredAt` entre los registros **exactos**
  que dejan visibles la zona, el período y el sensor seleccionados. Se etiqueta
  explícitamente como adquisición sintética.
- Sin registros visibles, o sin fechas válidas, el estado es `noData` y la
  interfaz lo dice.
- La tarjeta aclara que no es un servicio en vivo, una noticia ni una
  observación de NASA.

## Modelo

`src/lib/provenance.ts` define un esquema `zod` puro con `source`,
`expectedProvider`, `expectedProviderConnected`, `visibleRecords`,
`newestAcquiredAt`, `lastIngestionAt` y `status`. Las fechas ISO inválidas se
ignoran al calcular la más reciente y se normalizan a `null` en la ingesta. No
se hacen llamadas de red ni se leen secretos.

## Fuera de alcance

No hay ingesta real, conexión a FIRMS, noticias, alertas, agente de IA ni datos
de las fases 7 u 8. El mapa y el historial existentes no cambian.
