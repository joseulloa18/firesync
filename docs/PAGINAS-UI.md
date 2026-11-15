# Páginas y comportamiento de la interfaz

Refleja la sección «Mapa de páginas y funciones» del tablero de Miro. Todos los textos van en `messages/es.json` y `messages/en.json`. Los textos de este documento son la versión en español.

## Principios

- Sobria y clara: la pregunta central y los datos son los protagonistas.
- Cada cifra muestra unidad, período, sensores y fecha de actualización.
- Una detección satelital nunca se presenta como incendio confirmado.
- Escalas de color secuenciales aptas para daltonismo; el estado nunca se comunica solo con color (usar también texto o símbolo).
- Estados obligatorios en cada vista: cargando, vacío, error y sin conexión.
- Móvil primero; en escritorio, mapa y panel lado a lado.
- Atribución a NASA FIRMS en el pie de página y en cada exportación.

## Navegación

Barra superior con: **Inicio**, **Mapa e historial**, **Actualidad**, **Prevención y respuesta**, **Laboratorio**, **Mis zonas** (con sesión) y **Respuesta** (rol coordinador). Selector de idioma (es / en). Botón flotante del **Asistente de IA** en todas las páginas.

| Ruta | Página |
|---|---|
| `/` | Inicio |
| `/mapa` | Mapa e historial |
| `/actualidad` | Actualidad |
| `/prevencion` | Prevención y respuesta |
| `/laboratorio` | Laboratorio |
| `/zonas` | Mis zonas y alertas (requiere sesión) |
| `/respuesta` y `/respuesta/[incidentId]` | Respuesta a incendios (rol coordinador) |
| `/entrar` | Inicio de sesión por enlace mágico |

## 1. Inicio (`/`)

- **Eje de la página:** la pregunta «¿La actividad de fuego en esta zona se salió de lo habitual?».
- Texto breve de apoyo (una o dos frases) que explique qué hace la aplicación.
- Botón principal **Explorar el calendario** → `/mapa`.
- Botón secundario **Probar un caso** → `/mapa?caso=demo`, que carga la zona y el mes de `src/content/demo-case.json`, abre el detalle del mes y deja visible la comparación con la mediana.
- Enlace discreto «¿Cómo se armoniza MODIS y VIIRS?» al panel de calidad.

Aceptación: ambos botones funcionan sin sesión; «Probar un caso» abre el detalle de mes sin pasos extra.

## 2. Mapa e historial (`/mapa`)

Componentes:

1. **Selector de zona y fechas:** lista de regiones (país y provincias), herramienta de dibujo de polígono, rango de años. Muestra el área de la zona y valida los límites.
2. **Mapa:** zona resaltada, capa opcional de detecciones del período seleccionado, botón **Monitorear esta zona** (lleva a `/zonas?nueva=1` con el polígono).
3. **Calendario armonizado:**
   - Años en filas (más reciente arriba), meses en columnas (ene a dic).
   - Color por intensidad relativa a la mediana del mismo mes. Marca adicional (anillo o símbolo) para `above_usual` y `exceptional`.
   - Marcas visibles: inicio de VIIRS (2012), meses `terra_only`, meses provisionales (NRT) y el mes parcial (trama).
   - Navegable con teclado; cada celda tiene etiqueta accesible con año, mes, valor y estado.
4. **Detalle del mes** (al tocar una celda): detecciones por sensor, índice armonizado, mediana, rango mínimo a máximo del mismo mes en otros años con la banda p25 a p75, estado en palabras («Dentro de lo habitual», «Por encima de lo habitual», «Excepcional», «Referencia insuficiente»), y mini gráfica del mismo mes en todos los años.
5. **Pestañas de análisis:** **Tendencias**, **Épocas de mayor actividad**, **Zonas con mayor actividad detectada** (con el período mostrado y la medida por área; oculta si hay menos de dos regiones comparables) y **Calidad de la armonización**.
6. **Descargar CSV** del período y la zona.
7. Aviso permanente sobre el significado del índice y sus límites.

Aceptación: calendario de una región completa en menos de 2 s; el detalle muestra mediana y rango; la descarga CSV reproduce lo que se ve.

## 3. Actualidad (`/actualidad`)

- Mapa con las detecciones recientes (por defecto últimas 72 horas) coloreadas por sensor y con tamaño según potencia radiativa.
- Cabecera con la **fecha de actualización** y el **sensor de origen** de cada punto.
- Cada punto abre una **ficha**: fecha y hora en UTC y hora local, sensor y satélite, confianza, potencia radiativa, aviso de que no es un incendio confirmado, y botón **Ver prevención y respuesta para esta zona** → `/prevencion?zona=...&desde=actualidad`.
- Tarjeta «Mes en curso frente a la mediana» de la zona visible.
- Si no hay datos recientes: «Últimos datos disponibles» con el período exacto (`GET /api/detections/latest-available`).
- Botón para monitorear el área visible.

## 4. Prevención y respuesta (`/prevencion`)

- Selector de zona. Si llega desde Actualidad, conserva la zona y muestra primero los recursos pertinentes.
- **Meses prioritarios de preparación** según el historial, con la evidencia que los respalda (gráfica estacional y años excepcionales).
- **Recursos oficiales** de prevención, extinción y reporte (`prevention_resources`), agrupados por categoría, con organización y fecha de verificación.
- **Calendario de actividades de prevención:** vista mensual, crear, editar y eliminar eventos, exportar `.ics`. Botón **Planificar con el asistente** que abre el chat con el contexto de la zona (ver `AGENTE-IA.md`). Los eventos propuestos por el agente aparecen como borrador con su justificación hasta que una persona los confirme.
- Bloque fijo: «En una emergencia llama al 9-1-1».

## 5. Laboratorio (`/laboratorio`)

- Dos personajes: **MODIS** (Terra y Aqua, mira cerca de 1 km, historia desde 2000) y **VIIRS** (mira 375 m, desde 2012). Cada uno entrega un reporte distinto del mismo lugar y mes, con datos reales del caso.
- El jugador elige qué comprobaría antes de sacar una conclusión (opciones definidas en `src/content/lab-case.json`: resolución, hora de paso, confianza, misma celda, etc.).
- Tras elegir, se abre **Comparar sensores**, que explica con ese mismo caso por qué las cifras difieren y cómo la armonización las hace comparables.
- Sin puntuación punitiva: la retroalimentación explica, no castiga.

## 6. Mis zonas y alertas (`/zonas`)

- Requiere sesión. Lista de zonas con nombre, área, estado (verificada, pendiente de verificación, pausada) y última alerta.
- **Nueva zona:** mapa para dibujar el polígono (o recibirlo desde `/mapa`), nombre, correo de contacto, confianza mínima.
- Tras crear: «Te enviamos un correo para confirmar la dirección» y la zona queda pendiente hasta confirmar.
- Acciones por zona: editar, pausar, reanudar, eliminar.
- **Historial de alertas** por zona con fecha, sensor, gravedad y estado de envío.
- Mensajes de límite claros (máximo de zonas y área).

## 7. Respuesta a incendios (`/respuesta`, rol coordinador)

- **Lista de incidentes** con gravedad, expansión, hora de la primera y última detección y estado.
- **Detalle (`/respuesta/[incidentId]`):**
  - Mapa con detecciones, huella del incidente y activos cercanos (distancia, tipo, disponibilidad).
  - Línea de tiempo: detecciones, avisos enviados y respuestas, ejecuciones del agente.
  - Avisos **pendientes de aprobación** con el texto redactado y los botones Aprobar, Editar, Rechazar.
  - Botón **Pedir al agente que coordine** y botón de aviso manual a activos seleccionados.
  - Cambio de estado: en seguimiento, contenido, cerrado, falsa alarma.
- Banner visible cuando `DEMO_MODE` está activo: «Modo demostración: los avisos a instituciones van a una bandeja de pruebas».

## 8. Asistente de IA (panel global)

- Panel lateral o pantalla completa en móvil, abierto con un botón flotante.
- Mensaje inicial: qué puede hacer (primeros auxilios, rutas a sitios seguros, explicar alertas, planificar prevención) y la línea fija «En una emergencia llama al 9-1-1».
- Atajos: «Necesito primeros auxilios», «¿Cómo llego a un lugar seguro?», «Explícame esta alerta», «Planificar prevención».
- Permite compartir la ubicación de forma explícita y opcional; sin ubicación pide la zona o un punto de referencia.
- Muestra la fuente de cada indicación de primeros auxilios y las advertencias de las rutas.
- Indica cuando una acción requiere aprobación humana.

## 9. Correo de alerta (plantilla)

Asunto: `Alerta: posible foco de calor en tu zona «{nombre_zona}»`

Contenido mínimo: nombre de la zona, fecha y hora local y UTC de la detección, sensor y satélite, coordenadas y enlace al punto en Actualidad, gravedad si existe, aviso de que es una detección satelital no confirmada, recomendación de llamar al 9-1-1 si hay riesgo, enlace para pausar o eliminar la zona y atribución a NASA FIRMS. Versión texto y HTML. Idioma según `profiles.locale`.

## 10. Contenido estático requerido

- `src/content/demo-case.json`: zona y mes del caso de demostración.
- `src/content/lab-case.json`: guion del laboratorio.
- `messages/es.json` y `messages/en.json`: todos los textos.
- `kb/`: base de conocimiento curada para el agente (ver `AGENTE-IA.md`).

## Orientación pública en Respuesta — aclaración 2026-11-15

La página puede ofrecer canales oficiales verificados y contexto público de una
detección antes del panel operativo de coordinadores. Esto no concede acceso a
activos/contactos privados ni adelanta el agente de fase 8. Ver
[ALCANCE-FUNCIONAL-2026-11-15.md](ALCANCE-FUNCIONAL-2026-11-15.md) para recorrido,
procedencia, noticias confirmadas, ranking, laboratorio y asistente global.
