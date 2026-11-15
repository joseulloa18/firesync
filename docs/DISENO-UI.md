# Diseño de interfaz FIRESYNC

Estado: prototipo visual con datos sintéticos. Esta guía describe la capa visual del rediseño y no afirma que exista ingesta, backend operativo ni validación científica.

## Paleta y tipografía

| Uso | Valor |
|---|---|
| Fondo marfil cálido | `#fff9f4` |
| Superficie de tarjetas | `#fffdfb` |
| Tinta principal | `#241a14` |
| Texto secundario | `#726256` |
| Naranja de controles e iconos | `#d94b00` |
| Melocotón de navegación activa | `#ffe1cd` |
| Borde tostado fino | `#e8d7c6` |
| Sombra suave | `0 2px 5px rgba(98, 55, 28, 0.08)` |

- Titulares en Georgia serif, negrita, con interletraje negativo y tamaños grandes.
- Cuerpo de texto en sans del sistema (`Inter`, `Segoe UI`, `Helvetica Neue`, `Arial`).
- Las escalas del calendario usan rosa a rojo, pasando por melocotón y naranja y añaden símbolos (`·`, `−`, `+`, `◆`), de modo que el estado no depende solo del color.
- El foco visible usa azul `#1f6784` para contrastar con los controles naranjas.

## Estructura

### Cabecera

- Marca **FireSync** con el logo aportado por el usuario, sin subtítulo.
- Siete destinos primarios: Inicio, Mapa e historial, Actualidad, Prevención, Laboratorio, Mis zonas y Respuesta.
- Selector ES / EN conserva la ruta y los parámetros de búsqueda.
- La navegación activa se muestra como píldora melocotón.

### Inicio

- Héroe de dos columnas: pregunta principal a la izquierda y fotografía de bosque a la derecha mediante `background-image: url("/images/forest-hero.jpg")`.
- Degradado crema sobre la fotografía y separador ondulado melocotón.
- Dos llamadas a la acción: naranja rellena y naranja con contorno.
- Debajo, dos tarjetas lado a lado: mapa interactivo (45 %) y calendario mensual (55 %).
- En móvil las columnas se apilan y no se permite desbordamiento horizontal de la página.

### Mapa e historial

- Filtros de zona, año inicial y año final a ancho completo.
- Fila de mapa y calendario con el mismo reparto 45 / 55.
- Al elegir un mes aparece el resumen sintético y un control de reproducción diaria.
- Reproducir y pausar modifican de verdad el día enviado al mapa; el control de rango también cambia el día mostrado.
- La descarga CSV se genera en el navegador con los meses visibles, la zona, el rango de años, el día seleccionado y metadatos que indican `synthetic-demo`.

### Actualidad

- Filtros de zona, período y sensor.
- El sensor elegido se pasa al mapa y filtra la lista local de detecciones.
- La ficha muestra identificador, sensor, satélite, adquisición en UTC, hora local de República Dominicana, coordenadas, confianza y potencia radiativa.
- Toda ficha incluye la etiqueta **Sintético** y el aviso de que una detección satelital no es un incendio confirmado.
- Enlace interno a Prevención para la zona elegida.

### Prevención

- Selector de zona.
- Tarjeta de meses de preparación con prioridades ilustrativas.
- Tarjetas de recursos sin organizaciones, teléfonos ni protocolos inventados. El estado vacío explica que el equipo aún no ha cargado recursos verificados.
- Enlaces funcionales a Mapa e historial y a la línea 9-1-1.
- Descarga de un resumen CSV sintético de la zona con metadatos de demostración.

## Componentes técnicos

- `src/components/fire-map.tsx` es responsabilidad de la tarea de mapa interactivo. Este rediseño lo consume con `labels`, `mode`, `sensor`, `day` y `onSelect`.
- El contenedor `.map-frame` ocupa el 100 % del ancho y garantiza una altura mínima de 380 px.
- `src/components/calendar.tsx` concentra la cuadrícula, los niveles sintéticos y la función pura reproducible que alimenta los CSV.
- `src/components/dashboard.tsx` reúne las vistas de inicio, historial, actualidad y prevención.
- `src/components/icon.tsx` contiene SVG en línea, decorativos y ocultos para lectores de pantalla; las etiquetas accesibles vienen de los mensajes.

## Textos, accesibilidad y límites

- Todos los textos visibles viven en `messages/es.json` y `messages/en.json`.
- Cada botón iconográfico tiene nombre accesible; los controles nativos permiten teclado y el calendario conserva etiquetas por año, mes y nivel.
- No se usan logotipos ni respaldos de NASA. La atribución describe una integración prevista y aclara que la demostración no contiene datos de NASA.
- Los datos mostrados son sintéticos y llevan `is_demo = true` en el modelo de demostración. No hay afirmaciones de observaciones satelitales reales.
