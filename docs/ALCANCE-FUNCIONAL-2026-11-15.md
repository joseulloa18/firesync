# Alcance funcional acordado — 2026-11-15

## Auditoría de la versión actual

- Actualidad: filtros de zona, período y sensor, mapa/leyenda, lista y ficha con
  coordenadas, adquisición UTC/local, satélite, sensor, confianza y FRP. Son
  fixtures sintéticos, sin consulta operativa a FIRMS. Falta el bloque explícito
  de procedencia y última actualización real; el máximo de fechas de un fixture
  no es la hora de actualización de una ingesta.
- Prevención: perfil estacional ilustrativo, selector de zona y descarga CSV de
  ejemplo. No hay catálogo oficial cargado ni ficha documental verificada.
- Mis zonas, Respuesta y Laboratorio: rutas presentes con estados pendientes.
  Sin autenticación conectada, zonas guardadas por usuario ni historial real de avisos.
- Asistente global, LLM, alertas y contacto con terceros: no implementados.

## Actualidad

1. Mantener filtros y mapa desarrollado en #22. Cada ficha muestra ubicación,
   fecha/hora UTC/local, satélite, sensor, confianza y FRP cuando exista; un valor
   ausente se muestra como no disponible, nunca como cero inventado.
2. Procedencia: producto/sensor/satélite, enlace al proveedor, fecha de adquisición,
   última ingesta exitosa y antigüedad. Distinguir última consulta, actualización
   de ingesta y último dato disponible. Si no hay ingesta, decirlo expresamente.
3. Debajo, boletín de reportes de incendios con fuente, URL, fecha de publicación,
   fecha del hecho si está disponible, territorio y estado reportado. Un incendio
   solo se presenta como confirmado si una fuente verificable lo confirma. Las
   detecciones satelitales, los reportes periodísticos y la confirmación oficial
   conservan su propia procedencia; no inferir confirmación a partir del mapa ni de IA.
4. Noticias reales se obtienen de fuentes aprobadas y se almacenan con trazabilidad;
   no inventar sucesos, lugares, titulares ni emergencias activas. Mostrar extractos
   breves y enlace original; conservar fechas y correcciones. Sin fuentes, estado vacío.
5. Ranking del área buscada y regiones comparables: especificar medida, unidad,
   período, sensores, área/normalización y cobertura. Detecciones no equivalen a
   incendios ni a gravedad. Ocultar ranking con menos de dos regiones comparables.
   Ranking de países/regiones amplias solo si existe un conjunto comparable de
   esa escala, nunca extrapolando los puntos de República Dominicana.
6. Cada ficha puede abrir Prevención o Respuesta conservando contexto validado.

## Contexto común de navegación (contrato propuesto, aún sin endpoint)

- Zona y detección públicas: zone/region ID y detectionId. Reporte confirmado:
  reportId. Fecha, coordenadas, sensor y fuente se resuelven desde el registro,
  no se toman como prueba de veracidad de un texto libre en la URL.
- Preservar zona, ubicación, hora UTC/local, fuente y estado de confirmación al
  navegar Actualidad → Prevención/Respuesta. Validación zod en límites de entrada.
- Privadas: zona y correo requieren sesión y RLS. No incluir correos ni contactos
  privados en parámetros, telemetría, exports públicos ni respuestas de otro usuario.

## Prevención

Perfil histórico de la zona, meses que concentran actividad detectada y evidencia
(período, sensores, mediana y límites). Acciones útiles: cuándo prepararse,
consultar recursos oficiales y cómo reportar, compartir/descargar ficha de zona
con fecha/fuentes. Web Share con descarga/enlace alternativo, sin publicar zonas
privadas por defecto. Recursos guardados con institución, URL, región, categoría,
fecha de revisión y vigencia. Catálogo sin contenido verificado permanece vacío.

## Respuesta

Canales oficiales de reporte y orientación de la zona, con fuente y vigencia.
Si se llega desde una detección, mostrar ubicación y hora con el aviso exacto:
«Una detección satelital no es un incendio confirmado».
Distinguir registro satelital de reporte confirmado y no prometer extinción,
rescates, rutas seguras ni disponibilidad institucional sin datos verificados.
Aviso de emergencia: 9-1-1 en República Dominicana, conforme a AGENTS.md.

La vista pública de orientación y canales es P1. La coordinación operativa con
activos, roles y envío a terceros sigue las fases 7/8 y sus políticas; no se
adelanta por añadir un enlace público a Respuesta.

## Mis zonas y alertas

Autenticación, lista privada de zonas guardadas, acceso al historial de cada una,
estado de verificación/pausa y estado de avisos. Registro explícito y verificación
de destinatario antes de suscribir. Ingesta, evaluación, deduplicación y correo
son backend, no un temporizador que depende de mantener abierta la página.
La persona recibe contexto y orientación respaldada por fuentes cuando una regla
se cumple en su zona; no se afirma que sea incendio confirmado por un foco.
Estados de entrega reales (pendiente, enviado, error) y cancelación de suscripción.

## Laboratorio

Caso del mismo lugar/mes para MODIS y VIIRS, con sensores como personajes.
Flujo: iniciar caso → inspeccionar dos reportes → elegir qué comprobar → revelar
explicación → abrir el mismo caso en el mapa. Varias rondas (resolución, hora de
paso, confianza, celda-día) con retroalimentación explicativa, progreso y reinicio.
Conservar zona/mes al abrir el caso. No penalizar aprender ni premiar minimizar
una emergencia. Caso real requiere archivos revisados del equipo; un caso
sintético se identifica de forma persistente y no se atribuye a NASA.

## Asistente global y efectos sobre el entorno

Botón flotante circular en todas las páginas; abre chat accesible con foco,
Escape/cierre, idioma y contexto actual. Es un LLM real solo cuando hay proveedor
configurado y backend verificado; una maqueta de chat se etiqueta como tal.
Ayuda a entender datos, recursos y avisos, sin sustituir servicios de emergencia.

- Lecturas autorizadas y privados por usuario/rol, contenido externo como dato.
- Orientación y primeros auxilios exclusivamente desde kb/ y recursos revisados.
- Avisos a usuarios de zonas: inscripción y destinatario verificado.
- Contactos con instituciones/personas: activos reales validados, autorización
  de rol, borrador, aprobación cuando corresponda y registro de auditoría.
- AGENT_AUTONOMY=suggest por defecto. En desarrollo, DEMO_MODE y EmailProvider
  dirigen los envíos a pruebas. No habilitar contacto real por un texto del chat.
- No hacer llamadas automáticas al 9-1-1 ni prometer que alguien fue contactado
  si el proveedor no confirmó la acción. Enlaces para llamar requieren acción del usuario.

## Orden de ejecución y terminado

Se conserva la regla de AGENTS.md: fases 0–6 verificadas antes de implementar
agente/coordinación operativa de fases 7/8. No marcar requisitos como cumplidos
por escribir este documento, crear un issue o mostrar un botón.

Primero #21/#22 y datos verificables; luego actualidad/procedencia/ranking,
autenticación/zonas/alertas, catálogo y orientación pública, laboratorio; después
IA global y efectos con política. Cada PR requiere lint/typecheck/test, contratos
actualizados, estados de carga/vacío/error y revisión E2E escritorio/móvil.
