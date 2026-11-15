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

## Arranque de desarrollo — 2026-11-14

- Se adopta el conjunto A como base documental; Next.js, TypeScript, Supabase/PostGIS y pnpm.
- Primer hito acotado a base local y componentes de datos/esquema independientes. Las integraciones externas y el backfill histórico no se consideran completados por mostrar una demo.
- El diagrama Miro dice quitar quemas no forestales; prevalece DATOS-Y-ARMONIZACION.md: se conservan quemas agrícolas y se explica que una anomalía térmica no identifica el tipo de incendio.
- Histórico VIIRS: solo S-NPP. La agregación debe filtrar producto/satélite antes de reducir a familia.
- La agrupación mínima en incidentes se adelanta para soportar alertas, aunque el panel operativo y agente sigan en P2.
- Las sesiones trabajan en paralelo con ramas/carpetas independientes. La sesión central coordina y revisa.
- GitHub: cuenta propietaria asociada a joseulloa@liceocientifico.org; usuario y colaboradores pendientes. No publicar en Josezx18, actualmente autenticada.
- No hay cuentas Supabase/FIRMS configuradas para este producto. El modo demo debe funcionar sin credenciales y señalar su procedencia sintética.

## Acuerdos visuales — 2026-11-15

- El usuario aportó cuatro referencias y pidió adaptar ahora la interfaz de inicio,
  historial, actualidad y prevención. Se implementa el prototipo visual de esas
  pantallas mientras continúa la fase de datos; esto no declara cumplidas las
  fases de ingesta, calibración científica, alertas ni recursos oficiales.
- Se conservan FIRESYNC, los siete destinos existentes y los idiomas ES/EN.
  Paleta crema/naranja, encabezados serif y tarjetas siguen las referencias.
- Mapa base: MapLibre con estilo Liberty de OpenFreeMap, sin clave. Documentación:
  https://openfreemap.org/quick_start/. Se mantiene su atribución cartográfica.
  Las detecciones del prototipo son sintéticas y están identificadas como tales.
- No se copia el logotipo NASA ni se afirma respaldo institucional. La fotografía
  decorativa tiene crédito y licencia en `CREDITOS-VISUALES.md`.

## Integración inicial de IA — 2026-11-15

- El usuario autorizó explícitamente proceder con la IA ahora, como excepción al
  orden previo de fases 0–6; su aceptación sigue pendiente y no se presume.
- El usuario dispone de una API de Meta: se usa Meta Model API directa con
  `muse-spark-1.3` configurable detrás de `LLMProvider`. Esto sustituye la primera
  interpretación de usar Muse Glimmer mediante NVIDIA; no se reutilizan claves de
  agentes de desarrollo ni se configura un fallback pagado implícito.
- Adaptador propio con `fetch` y SSE, permitido por `AGENTE-IA.md` sección 2,
  conserva el contrato independiente del proveedor sin añadir dependencias.
- Entrega inicial de apoyo de solo lectura, con mock explícito y almacenamiento
  temporal local; Muse en producción exige auditoría persistente y cuotas
  atómicas. La migración se entrega para revisión y no se aplica automáticamente.
- Variables, contratos, límites y reversión en `IA-MUSE.md`. No hay envíos,
  efectos operativos ni contenido médico inventado.
