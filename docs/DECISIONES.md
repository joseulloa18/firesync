# Decisiones pendientes y valores por defecto

Si una decisión bloquea el trabajo, el agente de codificación usa el **valor por defecto**, lo deja anotado en la columna «Registro» y continúa. El equipo puede cambiarlo después.

| # | Decisión | Valor por defecto | Quién decide | Registro |
|---|---|---|---|---|
| 1 | Nombre del proyecto | «Calendario de actividad de incendios» (provisional) | Equipo | |
| 2 | Región de ingesta del MVP | República Dominicana con margen de 0.5° (`INGEST_BBOX`) | Equipo | |
| 3 | Zona y mes del caso de demostración («Probar un caso») | Por definir con los datos históricos: elegir una provincia y un mes con estado `exceptional` | Equipo | |
| 4 | Requisitos oficiales de entrega del reto (idioma, video, repositorio, fecha) | Verificar en la página del reto | Equipo y docente | |
| 5 | Hosting de la aplicación | Proveedor compatible con Next.js; base de datos en Supabase | Docente | |
| 6 | Proveedor(es) de modelos de IA, modelos concretos y presupuesto | Un proveedor principal y uno alterno detrás de `LLMProvider` | Equipo y docente | |
| 7 | Proveedor de correo y dominio remitente | Resend con dominio verificado; sin dominio, solo bandeja de pruebas | Docente | |
| 8 | Fuente de límites administrativos | geoBoundaries u oficial de República Dominicana (verificar licencia) | Equipo | |
| 9 | Mapa base y teselas | Teselas abiertas con MapLibre (sin clave) | Equipo | |
| 10 | Servicio de rutas | OpenRouteService (permite evitar polígonos) u OSRM autoalojado | Equipo | |
| 11 | Fuente de lugares seguros | Tabla `safe_places` cargada a mano y complementada con OpenStreetMap | Equipo | |
| 12 | Datos de viento y clima | Open-Meteo (opcional; sin esto el agente no habla de viento) | Equipo | |
| 13 | Activos reales o solo de demostración | Solo demostración (`is_demo = true`) hasta acordar con las instituciones | Docente | |
| 14 | Autonomía del agente con instituciones | `AGENT_AUTONOMY=suggest` (aprobación humana) | Docente | |
| 15 | Canales de aviso a activos | Solo correo; SMS y WhatsApp quedan para el futuro | Equipo | |
| 16 | Contenido de primeros auxilios | Cargado en `kb/` por una persona calificada, con fuente y fecha | Docente | |
| 17 | Método de armonización final | Propuesta de `DATOS-Y-ARMONIZACION.md`: VIIRS S-NPP × factor desde 2012, MODIS antes | Equipo con mentor o científico | |
| 18 | Umbrales de estado del mes y de gravedad | Los de `DATOS-Y-ARMONIZACION.md` 7.2 y `ALERTAS-Y-RESPUESTA.md` 3.3 | Equipo | |
| 19 | Periodo del ranking | Últimos 5 años completos | Equipo | |
| 20 | Retención de `notifications`, auditoría del agente y chat | Chat anónimo 30 días; auditoría y avisos 12 meses | Docente | |
| 21 | Idiomas de la interfaz | Español por defecto e inglés | Equipo | |
| 22 | Texto de atribución a NASA FIRMS | Verificar el reconocimiento vigente en el sitio de FIRMS antes de publicar | Equipo | |
| 23 | Comparación de temperatura y proyecciones (idea de Ian) | Fuera del MVP; requiere otra fuente de datos | Equipo | |
| 24 | Aviso por cercanía según la ubicación de la persona (idea de Ian) | Fuera del MVP (RF-ZON-5, P3) | Equipo | |
| 25 | Filtro de fuentes estáticas (volcanes, llamaradas industriales) | No incluido en el MVP; se explica la limitación | Equipo | |

## Registro de contradicciones entre documentos

(El agente de codificación anota aquí cualquier contradicción que encuentre y la resolución elegida.)

| Fecha | Documentos | Contradicción | Resolución |
|---|---|---|---|
| | | | |
