# Calendario de actividad de incendios (nombre provisional)

Aplicación web para el reto **NASA Space Apps Challenge 2026: calendario armonizado de actividad de incendios**. Armoniza los registros de focos de incendio activos de los sensores MODIS y VIIRS (NASA FIRMS) en un calendario que permite ver patrones históricos, condiciones inusuales y períodos críticos dentro de un área de interés. Además añade monitoreo de zonas con alerta por correo, respuesta temprana con activos cercanos y un agente de IA de apoyo.

Tablero de planificación (Miro): https://miro.com/app/board/uXjVEXYhI8E=/

## El problema

Los satélites rastrean focos de incendio activos desde hace más de dos décadas, pero los registros están repartidos entre sensores cuyos datos no se pueden comparar directamente. MODIS (Terra y Aqua) acumula más de 20 años pero se acerca al fin de su vida útil y lo reemplaza VIIRS, con otra resolución espacial, sensibilidad y horario de observación. Quien gestiona emergencias no tiene una visión coherente de cuándo y dónde hubo actividad de fuego, ni puede comparar el mes actual con la mediana histórica de una zona.

## La solución en una frase

Un calendario (años en filas, meses en columnas) construido con un índice armonizado MODIS + VIIRS, más herramientas para detectar actividad inusual, avisar a tiempo y coordinar la respuesta antes de que un incendio pase a mayores.

## Qué incluye

| Sección | Resumen |
|---|---|
| Inicio | Pregunta «¿La actividad de fuego en esta zona se salió de lo habitual?», botones Explorar el calendario y Probar un caso |
| Mapa e historial | Zona y fechas, mapa, calendario armonizado, detalle por mes, tendencias, épocas de mayor actividad, ranking de zonas, descarga CSV, botón para marcar una zona de monitoreo |
| Actualidad | Detecciones recientes de FIRMS con fecha de actualización y sensor, ficha por punto |
| Prevención y respuesta | Meses prioritarios para preparación según el historial, recursos oficiales, calendario de actividades de prevención |
| Laboratorio | MODIS y VIIRS como personajes, juego de decisiones y comparación de sensores |
| Mis zonas y alertas | Zonas de monitoreo por usuario con alerta por correo |
| Respuesta a incendios | Incidentes, activos cercanos (bomberos, Defensa Civil, brigadas) y seguimiento |
| Asistente de IA | Agente con herramientas: alertas con criterio, coordinación con activos, apoyo a personas (primeros auxilios, rutas a sitios seguros) y planificación del calendario de prevención |

## Mapa de documentos

Léelos en este orden:

1. `README.md` (este archivo)
2. `AGENTS.md`: reglas de trabajo para el agente de codificación
3. `docs/PRD.md`: qué se construye y para quién
4. `docs/ARQUITECTURA.md`: componentes, flujos, stack y variables de entorno
5. `docs/DATOS-Y-ARMONIZACION.md`: fuentes FIRMS y método de armonización
6. `docs/MODELO-DE-DATOS.md`: esquema SQL (PostgreSQL + PostGIS)
7. `docs/API.md`: endpoints
8. `docs/PAGINAS-UI.md`: pantallas y comportamiento
9. `docs/ALERTAS-Y-RESPUESTA.md`: zonas de monitoreo, incidentes, activos y avisos
10. `docs/AGENTE-IA.md`: diseño del agente, herramientas y salvaguardas
11. `docs/ROADMAP.md`: fases, tareas y criterios de aceptación
12. `docs/DECISIONES.md`: decisiones pendientes y valores por defecto

Ubicación sugerida en el repositorio: `README.md` y `AGENTS.md` en la raíz, el resto en `docs/`. Para Claude Code, crea también un `CLAUDE.md` con una sola línea: `@AGENTS.md`.

## Stack propuesto (cambiable, ver `docs/DECISIONES.md`)

- Next.js (App Router) + TypeScript + Tailwind
- Supabase: PostgreSQL con PostGIS, autenticación y programador de tareas
- MapLibre GL JS para mapas
- Resend (o SMTP) para correo, detrás de una interfaz `EmailProvider`
- Vercel AI SDK u otro adaptador para usar cualquier modelo de IA por API, detrás de una interfaz `LLMProvider`

## Datos y atribución

Datos de focos de incendio activos: NASA FIRMS (LANCE / EOSDIS). La aplicación debe mostrar la atribución a NASA FIRMS y avisar que una detección satelital no equivale a un incendio confirmado. Verifica el texto de reconocimiento vigente en la página de FIRMS antes de publicar.

## Equipo

Ideas iniciales aportadas en el tablero de Miro por Dariana, Esthefany e Ian.

## Seguridad en la demostración

El modo `DEMO_MODE=true` redirige todos los avisos a instituciones a una bandeja de pruebas. Nunca se contacta a bomberos, Defensa Civil ni otras instituciones reales durante la demostración.
