# Alertas y respuesta

Describe las dos funciones nuevas del tablero:

- **Función 1:** zona de monitoreo con alerta por correo.
- **Función 2:** respuesta temprana con activos cercanos, para actuar antes de que el incendio pase a mayores.

## 1. Función 1: zonas de monitoreo

### 1.1 Flujo

1. La persona dibuja una zona en el mapa (o la recibe desde Mapa e historial) y escribe nombre y correo.
2. Se guarda en `monitored_zones` y se envía un correo de verificación (doble confirmación). Sin verificación no se envían alertas.
3. Cada vez que entra una detección nueva (`ingest-nrt`), `evaluate-zones` busca las detecciones que caen dentro de zonas activas y verificadas, con confianza igual o mayor a `min_confidence` de la zona.
4. Para cada coincidencia se crea o actualiza un incidente (ver sección 3) y se genera un aviso en `notifications` con `audience = 'zone_user'`.
5. El aviso se envía de forma automática o pasa por el agente según la sección 2.

### 1.2 Reglas

- **Un correo por zona por incidente cada 6 horas.** Clave `dedupe_key = zoneId:incidentId:ventana6h`. Si la gravedad del incidente **sube**, se envía un aviso de escalada aunque haya uno reciente en esa ventana.
- **Límites:** máximo `MAX_ZONES_PER_USER` zonas por usuario, área máxima `MAX_ZONE_KM2`, 20 correos por hora por usuario.
- **Baja:** cada correo incluye enlace para pausar o eliminar la zona. Un usuario puede eliminar su zona en cualquier momento (borrado real).
- **Contenido:** ver plantilla en `PAGINAS-UI.md` sección 9. Siempre indica que es una detección satelital no confirmada y recomienda llamar al 9-1-1 si hay riesgo.
- **Fallos de envío:** reintento con espera creciente hasta 3 veces; luego `status = 'failed'` con el error y visible para el administrador.

## 2. Alertas automáticas y alertas que requieren agente

| Tipo | Cuándo | Quién la envía |
|---|---|---|
| **Automática** | Incidente de gravedad baja, una sola zona afectada, sin expansión y sin señales de riesgo adicionales | El sistema, con plantilla fija |
| **Requiere agente** | Gravedad media o alta, o incidente en expansión, o afecta a 2 o más zonas, o detección excepcional respecto a la mediana histórica, o detección cerca de población sin zona monitoreada | El agente de IA, que decide destinatarios, canal y redacta el mensaje |

Cuando un incidente cumple una condición de «requiere agente», `incidents.needs_agent = true` y `needs_agent_reason` explica por qué. Una tarea dispara la ejecución del agente (`trigger = 'incident'`). Si el agente falla o no responde en 2 minutos, se envía la alerta automática de respaldo a los usuarios de zonas afectadas, para que ninguna alerta crítica dependa del modelo.

## 3. Incidentes

### 3.1 Agrupación

Una detección nueva se une a un incidente abierto si está a menos de `INCIDENT_RADIUS_KM` (por defecto 2 km) de alguna detección del incidente y dentro de `INCIDENT_WINDOW_HOURS` (por defecto 24 h) de su última detección. Si no, se crea un incidente nuevo. Si une dos incidentes, se fusionan. Un incidente sin detecciones nuevas durante 48 h pasa a `monitoring`.

### 3.2 Expansión

`is_expanding = true` si el número de detecciones distintas en las últimas 6 horas supera al de las 6 horas anteriores en al menos 50 %, o si la huella (envolvente convexa de las detecciones) crece más de 50 % entre dos pasadas de satélite distintas.

### 3.3 Gravedad (puntaje v1, configurable en `src/lib/alerts/severity.ts`)

| Condición | Puntos |
|---|---|
| 3 o más detecciones | +1 |
| 10 o más detecciones | +2 (en lugar del punto anterior) |
| `max_frp` mayor o igual a 20 MW | +1 |
| `max_frp` mayor o igual a 50 MW | +2 (en lugar del anterior) |
| En expansión | +1 |
| Mes con estado `above_usual` o `exceptional` en la región | +1 |
| A menos de 2 km de población o infraestructura (si hay datos) | +2 |

Niveles: **bajo** 0 a 2, **medio** 3 a 4, **alto** 5 o más. Los umbrales de FRP y las distancias son valores de partida: calibrarlos con datos reales de la región.

### 3.4 Estados

`open` → `monitoring` → `contained` → `closed`. Además `false_alarm` (marcado por un coordinador). Solo un coordinador cambia el estado a `contained`, `closed` o `false_alarm`.

## 4. Función 2: respuesta temprana con activos

### 4.1 Activos

Tabla `assets`: bomberos, Defensa Civil, brigadas forestales, Cruz Roja, centros de operaciones de emergencia, voluntarios y otros. Cada activo tiene ubicación, contacto, radio de cobertura y disponibilidad (`available`, `limited`, `unavailable`, `unknown`) con fecha de actualización.

- Los datos reales los carga y valida el equipo con las instituciones. **El sistema y el agente nunca inventan contactos.**
- Para la demostración se cargan activos ficticios con `is_demo = true`, nombres que lo dejen claro («Bomberos DEMO Santiago») y correo hacia la bandeja de pruebas.
- Disponibilidad: se actualiza por un coordinador, por respuesta de la institución a un aviso o por carga masiva. Un dato de disponibilidad con más de 24 h se trata como `unknown` en las decisiones del agente.

### 4.2 Selección de activos cercanos

Consulta `GET /api/assets?near=lat,lon&radiusKm=...`: ordenar por distancia al centroide del incidente, filtrar por tipo según la gravedad y por disponibilidad. Reglas por defecto:

| Gravedad | Activos a contactar |
|---|---|
| Baja | Ninguno automáticamente; solo se sugiere en el panel |
| Media | El bombero y la brigada más cercanos con disponibilidad `available` o `limited` |
| Alta | Los 2 bomberos más cercanos, brigada forestal, Defensa Civil y centro de operaciones de emergencia; ampliar el radio si no hay candidatos |

Radio inicial 25 km, ampliable hasta 60 km. Si no hay activos con datos confiables, el sistema lo dice y escala a un coordinador humano.

### 4.3 Avisos a activos

- Canal por defecto: correo. SMS, WhatsApp o tarea telefónica son extensiones (`channel` ya lo contempla) a definir con las instituciones.
- Contenido del aviso: ubicación (coordenadas y referencia), hora de la primera y última detección, número de detecciones, gravedad y expansión, enlace al panel, **recordatorio de que es una detección satelital que debe verificarse**, y datos de contacto del coordinador.
- **Aprobación:** con `AGENT_AUTONOMY=suggest` (valor por defecto), todo aviso a instituciones se crea en estado `pending_approval` y un coordinador lo aprueba, edita o rechaza. Con `auto`, el agente puede enviar a activos, pero siempre bajo las reglas de la sección 4.4.
- **`DEMO_MODE=true`:** los avisos a activos se envían a `DEMO_INBOX` y el campo `recipient` lo refleja. Es obligatorio en desarrollo, `staging` y demostración.

### 4.4 Salvaguardas

1. Un aviso a un activo exige un incidente de gravedad media o alta, o un coordinador que lo pida explícitamente.
2. Un mismo activo no recibe más de 1 aviso por incidente cada 2 horas, salvo escalada de gravedad.
3. Máximo `MAX_ASSET_NOTIFICATIONS_PER_HOUR` avisos a instituciones por hora en total (por defecto 10) para frenar un fallo en cascada.
4. Todo aviso queda en `notifications` con autor (`system`, `agent` o `human`), aprobador y respuesta.
5. Un coordinador puede detener al agente y cancelar avisos pendientes desde el panel.
6. Si una institución responde (en `response`), el coordinador lo registra y se actualiza la disponibilidad del activo.

### 4.5 Seguimiento hasta controlar el incendio

El panel `/respuesta/[incidentId]` muestra detecciones, avisos y respuestas. El agente, a petición o cada vez que llegan detecciones nuevas, resume la situación y propone siguientes pasos (por ejemplo, contactar a un segundo activo si hay expansión). El incidente se cierra cuando un coordinador lo marca `contained` o `closed`.

## 5. Apoyo a personas dentro de una alerta

Cuando una persona abre el asistente desde una alerta o desde Actualidad, el agente puede orientarla (primeros auxilios, rutas hacia sitios seguros). Detalles, límites y salvaguardas en `AGENTE-IA.md`.

## 6. Privacidad y retención

- Se guarda solo lo necesario: correo de contacto, polígono de la zona y registros de avisos.
- Consentimiento explícito al crear la zona (casilla visible) y enlace de baja en cada correo.
- Ubicación compartida en el chat: solo durante la sesión, no se almacena.
- Datos de contacto de activos: visibles solo para coordinadores y administradores.
- Plazos de retención de `notifications`, chat y auditoría: ver `DECISIONES.md`.

## 7. Pruebas obligatorias

- Detección dentro y fuera del polígono (incluido el borde).
- Dedupe: no se duplica el correo en la misma ventana; sí hay escalada si sube la gravedad.
- Zona sin verificar no recibe alertas.
- Agrupación de incidentes y fusión; cálculo de expansión y gravedad con casos conocidos.
- Selección de activos: orden por distancia, filtro de disponibilidad y ampliación de radio.
- `DEMO_MODE` nunca envía a destinatarios reales (prueba que falle si el recipient no es `DEMO_INBOX`).
- Respaldo automático cuando el agente falla.
