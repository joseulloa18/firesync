# Primera vista de observaciones reales

Con `FIRMS_MAP_KEY` en el servidor, `/es/actualidad` y `/en/actualidad` usan una
consulta real de solo lectura. Sin clave conservan la demostración explícita.
No se cambia `DEMO_MODE`: los correos siguen sin habilitarse y las demás vistas
siguen identificadas como sintéticas. El chat tiene su configuración independiente.

Se consultan MODIS_NRT y VIIRS_SNPP_NRT en una caja fija WGS84
`[-72.1,17.4,-68.2,20.1]` (República Dominicana y alrededores; no es un límite
administrativo). Cada producto aporta su disponibilidad y hasta siete días,
en ventanas de cinco días como máximo. Máximo seis solicitudes por snapshot,
separadas un segundo, sin reintentos; 45 segundos y 2 MiB por respuesta.
El caché compartido de Next conserva el snapshot durante 900 segundos. No hay
parámetro público para ampliar el área, cambiar el producto o forzar refresco.
Esto no sustituye una cuota distribuida ni una ingesta persistente/programada.

El esquema zod conserva producto, sensor, satélite, adquisición UTC, confianza
original, FRP nullable, coordenadas y `is_demo=false`. Se deduplican IDs dentro
de cada producto sin fusionar MODIS y VIIRS. Datos fuera de período, rechazados
por parser, respuestas excesivas o marcadas sintéticas invalidan ese producto.
Un fallo de descarga no deja filas parciales ni se sustituye con ejemplos.

La página muestra período por producto, descarga del servidor, fallo parcial y
limitación de cobertura. Descarga no equivale a adquisición ni a ingesta. Un
producto atrasado no se describe como actualizado hoy. Un resultado vacío no
prueba ausencia de incendios. Los filtros de horas parten de la descarga; la
opción inicial muestra los últimos datos disponibles de cada producto.

El mapa conserva 250 marcadores y la lista 200 filas; la intensidad agrega todo
el filtro, sin interpretar conteos como incendios, gravedad o índice armonizado.
El dibujo es una herramienta visual: esta primera consulta no cambia su área.
No hay estadísticas históricas reales ni ranking geográfico comparable todavía.

Para activar, guardar únicamente `FIRMS_MAP_KEY` en Production y desplegar este
código. La clave no viaja al navegador, no se imprime ni se expone en un endpoint.
La verificación en producción debe revisar fuente, períodos y estados visibles,
sin registrar URLs upstream (incluyen la clave). Reversión: retirar la variable
y redesplegar; no hay tablas que borrar. Las pruebas usan HTTP sintético.
