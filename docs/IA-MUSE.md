# Integración del asistente con Muse

## Alcance autorizado y rama

El 15 de noviembre de 2026 el usuario pidió proceder con la integración de IA,
adelantando esta entrega respecto a la condición previa de fases 0–6. Después
aclaró que dispone de una API de Meta: se elige **Meta Model API directa**, no
NVIDIA ni Baseten. Esto no acredita la aceptación de las fases pendientes.

Carpeta propia: `FIRESYNC-ia`; rama `codex/ia-muse`, actualizada sobre `main`
`effb3ce` antes de publicar. Se conserva
intacta la rama documental `codex/api-plan` y el worktree de NASA.

Esta entrega implementa el perfil `support-chat`: adaptador real y mock,
streaming, herramientas públicas, política de solo lectura, sesiones, cuotas,
auditoría y acceso desde cualquier página mediante el enlace del asistente.
No declara completada toda la Fase 8. Coordinación de incidentes, notificaciones,
planificación con efectos, rutas y evaluaciones clínicas requieren sus datos,
servicios y entregas correspondientes.

Archivos nuevos: `src/lib/agent/`, `src/lib/schemas/agent.ts`,
`src/app/api/agent/chat/route.ts`, `src/app/[locale]/asistente/page.tsx`,
`src/components/agent/`, `messages/agent.{es,en}.json`, `tests/agent/`,
`tests/e2e/agent.spec.ts`, `scripts/agent-smoke.mjs`,
`supabase/migrations/20261115180000_agent_chat.sql` y
`kb/primeros-auxilios/README.md`. Los cambios compartidos se limitan a insertar
el enlace en `src/app/[locale]/layout.tsx`, enumerar dos variables en
`.env.example` y documentar los contratos. Sin cambios de dependencias, lockfile,
estilos del diseño, FIRMS o archivos de los otros miembros.

## Configuración local

Sin variables se usa `MockLLMProvider`, sin red y explícitamente identificado
como respuesta guionizada. No se presenta como una respuesta de Muse.

Para usar la clave de Meta, configurar únicamente en el `.env.local` ignorado por
Git de esta carpeta, o en el entorno del servidor:

```dotenv
DEMO_MODE=true
LLM_PROVIDER=meta
LLM_MODEL=muse-spark-1.3
LLM_API_KEY=
AGENT_STORAGE=memory
```

Completar `LLM_API_KEY` localmente, nunca en un commit, un log ni en el chat.
También se aceptan `MODEL_API_KEY` y `META_API_KEY` como alternativas, en ese orden
de precedencia después de `LLM_API_KEY`. No se copian credenciales de agentes de
desarrollo ni se crean cuentas, suscripciones o recursos de pago.

`pnpm dev` permite abrir `/es/asistente` o `/en/asistente`. El enlace flotante
añadido al layout conserva los siete destinos anteriores. La aplicación puede
usar Muse real mientras sus datos siguen en `DEMO_MODE=true`: la interfaz y el
prompt distinguen ambas cosas. Cambiar `DEMO_MODE` no conecta ingesta ni valida
las estadísticas.

El proveedor llama exclusivamente a `https://api.meta.ai/v1/chat/completions`
con Bearer, instrucciones `developer`, `store=false`, SSE y
`max_completion_tokens`. El modelo inicial es `muse-spark-1.3`; también se admiten
los modelos estándar documentados `muse-spark-1.2`, `muse-spark-1.1`,
`muse-ember-1.0` y `muse-wonder-1.0`. No se habilitan variantes Contributor.
La temperatura se deja al valor por defecto de Meta y `reasoning_effort=low`
acota el razonamiento. Los campos de razonamiento no se muestran ni se guardan.

Documentación primaria consultada:

- [Meta: primera llamada de Chat Completions](https://dev.meta.ai/docs/cookbook/quickstart-chat-completions).
- [Contrato de solicitudes y streaming](https://dev.meta.ai/docs/api-reference/chat-completions/schemas).
- [Autenticación](https://dev.meta.ai/docs/authentication).
- [Modelos](https://dev.meta.ai/docs/choose-a-model).

## Contrato del chat y límites

`POST /api/agent/chat`, JSON:

```json
{
  "message": "Explica esta detección",
  "locale": "es",
  "sessionId": "opcional, devuelto por el servidor",
  "context": {
    "regionId": "uuid opcional",
    "incidentId": "uuid opcional",
    "location": { "lat": 18.5, "lon": -70.1 }
  }
}
```

Los UUID deben ser válidos; el ejemplo muestra descripciones, no una solicitud
lista para enviar. Las propiedades desconocidas, roles del cliente y mensajes
vacíos se rechazan. Máximo 4000 caracteres por mensaje y 24000 bytes por cuerpo,
incluso sin `Content-Length`.

La respuesta es SSE con eventos `session`, `text_delta`, `tool`, `fallback`,
`done` o `error`. Cada `data` es JSON e incluye `type` con el nombre del evento.
`session` contiene `sessionId`, `runId`, `provider`, `model`, `demo` y `storage`;
`text_delta` contiene `text`; `tool` contiene el nombre y decisión, sin entradas,
resultados privados ni datos de autenticación; `done` contiene uso de tokens y
`reason` (`stop` o `length`). Un `error` es terminal y contiene un código saneado.
El cliente marca un fin de conexión sin evento terminal como respuesta fallida.

La sesión pertenece a una cookie aleatoria de 256 bits `firesync_agent`,
`HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS, restringida a `/api/agent`.
Solo se guarda su SHA-256. Conocer un `sessionId` no permite leer su historial:
debe corresponder a la cookie. La conversación recupera los últimos 12 mensajes
de turnos completados, recortando pares antiguos si superan 4000 bytes;
nunca recupera turnos fallidos o de otra sesión.
No hay endpoint anónimo de auditoría. El rol del chat siempre es `anonymous`.

Límites: 60 segundos por turno del agente, ocho iteraciones, ocho herramientas,
2048 tokens de salida por solicitud, 24000 tokens totales de presupuesto por
turno y 16000 bytes de contexto por solicitud. Antes de cada llamada se estima
de forma conservadora el consumo de entrada con su longitud UTF-8; si Meta no
reporta uso, se carga la reserva completa. Un intento fallido también consume
su reserva antes de cualquier fallback. Los tokens internos de razonamiento
cuentan dentro del límite de salida de Meta. Un límite nunca se presenta como
una respuesta completa normal.

Se permiten diez turnos/minuto y sesenta/hora por IP y un turno simultáneo por
sesión. La IP se conserva solo como HMAC con sal diaria. En Vercel se usa su
cabecera de IP administrada; fuera de Vercel, las IP no verificadas comparten
un único bucket conservador, sin confiar en `X-Forwarded-For` del cliente.
Un despliegue con otro proxy debe conectar una fuente de IP de confianza.

El fallback es opcional y explícito mediante los tres `LLM_FALLBACK_*`, solo
hacia otro modelo estándar de Meta. No se configura ninguno por defecto y no
se cambia a mock silenciosamente si Muse falla. Solo se usa antes de emitir
texto o ejecutar herramientas; después se informa el fallo sin duplicar un
turno ni sus efectos.

## Herramientas y procedencia

Cada herramienta valida entrada y salida con Zod. La política en código solo
permite herramientas públicas de lectura; el modelo no puede elevar su rol.
Los intentos de borrar zonas, enviar avisos, consultar contactos privados o usar
una herramienta inexistente se rechazan y auditan.

- `get_recent_detections`: acepta `bbox` WGS84 o `incidentId` y `hours` (1–168).
  En demo usa fixtures existentes, fecha de referencia **2025-03-25 UTC**,
  período explícito e `is_demo=true`; no los llama detecciones de hoy. En modo
  real consulta columnas públicas de `raw_detections`, hasta 100 registros, y
  devuelve una muestra de hasta 20 con aviso de truncamiento para acotar el
  contexto del modelo. Sensor, hora, producto, satélite y confianza acompañan
  cada registro. No conecta FIRMS ni interpreta falta de cobertura como cero.
  La búsqueda por incidente permanece no disponible.
- `get_region_context`: acepta `regionId` y `month` (1–12). En modo real consulta
  hasta 60 filas de ese mes con año, índice, método, fecha de cálculo y banderas
  NRT/parcial. No inventa medianas, umbrales ni certifica la calibración. Sin
  historial conectado o en demo devuelve `unavailable`.
- `get_first_aid_guidance`: solo sirve fragmentos revisados del archivo fijo
  `kb/primeros-auxilios/index.json`, con fuente, revisor y fecha. No se incluye
  contenido médico generado. Sin fuente, devuelve `unavailable` y remisión a
  profesionales/emergencias.
- `get_prevention_resources`: solo filas de la región/categoría en
  `prevention_resources` con `verified_at`; si falta la tabla/catálogo revisado,
  devuelve `unavailable`. No inventa instituciones ni enlaces.

Las lecturas reales requieren `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, usan RLS y una lista fija de tablas/columnas.
Los servicios faltantes o respuestas no válidas no disparan fallback a datos
demo. Rutas, clima, incidentes completos, activos y efectos no se ofrecen como
herramientas disponibles en esta primera entrega.

`context.location` se utiliza únicamente en el contexto efímero de la llamada
al modelo. No se guarda ese contexto en el prompt auditado. También se eliminan
coordenadas estructuradas y bbox de argumentos auditados. El usuario debe evitar
escribir datos personales innecesarios dentro del texto libre de su mensaje,
que sí forma parte del historial.

## Auditoría y producción

En local, `AGENT_STORAGE=memory` guarda registros acotados en memoria para
probar el flujo: máximo 100 sesiones y 1000 turnos, purga a las 24 horas y pérdida
al reiniciar. Esto no acredita persistencia de producción.

Con `NODE_ENV=production`, un proveedor real exige `AGENT_STORAGE=supabase`,
`AGENT_RATE_LIMIT_SECRET` aleatorio de al menos 32 caracteres,
`NEXT_PUBLIC_SUPABASE_URL` HTTPS y `SUPABASE_SERVICE_ROLE_KEY` solo servidor.
Sin eso falla antes de llamar al modelo. No hay fallback de almacenamiento a
memoria si Supabase falla. Revisar y aplicar por el procedimiento del equipo la
migración `20261115180000_agent_chat.sql` antes de activar ese modo.

La migración crea `agent_sessions`, `agent_runs`, `agent_messages` y
`agent_tool_calls`, RLS, funciones de apertura/historial solo para `service_role`
y cuotas/bloqueo de sesión dentro de una transacción. No depende de las tablas
de perfiles o incidentes aún no entregadas; sus UUID quedan reservados y
nullable. Las políticas de revisión usan `app_metadata.role` administrado por
Auth, nunca el rol enviado en el mensaje del chat. Los usuarios normales no ven
chats anónimos. No se implementa todavía `/api/agent/runs/{id}` ni
`/api/agent/trigger`; siguen pendientes de la entrega de coordinación/Auth.

La función `agent_apply_retention()` borra mensajes anónimos a los 30 días,
desvincula sesiones inactivas, elimina hashes de IP pasado un día y registros de
auditoría al año. Su ejecución periódica debe conectarse al job de retención
revisado antes de producción; esta entrega **no crea cron ni aplica SQL**.

## Verificación y reversión

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Las pruebas de IA son independientes de claves/red: `pnpm test tests/agent`.
Las E2E del asistente esperan `LLM_PROVIDER=mock` y `DEMO_MODE=true`.

Con la clave guardada localmente, la verificación real mínima y manual es:

```sh
node --env-file-if-exists=.env.local scripts/agent-smoke.mjs --live
```

Hace una sola solicitud de hasta 128 tokens de salida al modelo configurado y
solo muestra estado, HTTP o cantidad de tokens. No registra clave, cabeceras ni
respuesta cruda. Esa prueba comprueba autenticación y una respuesta mínima; las
pruebas con un transporte simulado comprueban por separado streaming y el bucle.
No afirmar conexión verificada antes de obtener una respuesta real.

Reversión local: volver a `LLM_PROVIDER=mock` con `DEMO_MODE=true` corta llamadas
a Meta; retirar los dos añadidos del layout elimina el acceso visual. La
reversión de código no borra registros ni requiere deshacer automáticamente la
migración. La publicación de rama/PR y la integración a `main` quedan al operador
y coordinación, según `AGENTS.md`. El usuario autorizó explícitamente publicar
esta rama y su PR; la integración a `main` conserva la revisión de coordinación.

### Evidencia local de esta entrega — 2026-11-15

- `pnpm install --frozen-lockfile`: completó la instalación con Corepack y
  pnpm 10.32.1, sin cambios de dependencias ni lockfile. Se resolvieron los
  bloqueos previos de red y paquetes del mapa.
- `pnpm lint`: pasó (ESLint y Prettier).
- `pnpm test`: **340 pruebas, 26 archivos**, todas pasando; 40 pruebas nuevas
  de IA. Cubren contrato Meta, fragmentación UTF-8/SSE, errores saneados,
  herramientas/política, sesiones ajenas, cuotas, cancelación, límites,
  fallback y transporte de auditoría/lecturas Supabase simulado.
- `pnpm typecheck`: pasó completo, incluida generación de tipos de rutas.
- `pnpm build`: pasó con Turbopack, sin omitir TypeScript, en modo mock/demo.
  Generó las páginas ES/EN y `/api/agent/chat`. No requiere invocar a Meta
  durante la compilación.
- `pnpm test:e2e --workers=2`: **47 de 48 casos pasando** sobre la base actual,
  incluidos los cuatro casos del asistente en escritorio y móvil. El caso de
  Prevención que usa `ArrowDown` en un selector nativo no confirmó el cambio de
  zona en Chromium/macOS; se conserva la prueba del equipo y se registra este
  límite local para contrastarlo con CI. El selector de error del asistente se
  acotó a su región para no confundirlo con el anunciador de rutas de Next.js.
  Estos casos usan mock; no consumen tokens de Meta.
- `pnpm test:db`: pasaron los nueve controles estáticos existentes del esquema
  y runner. No aplican SQL ni prueban la nueva RLS del agente contra una base.
- La migración SQL se entrega para revisión; **no aplicada ni validada contra
  PostgreSQL real** en esta sesión. Los tests de transporte simulado no se
  presentan como una prueba de RLS en una base de datos.
- Smoke real de Meta: **verificado** con `muse-spark-1.3`, autenticación aceptada,
  respuesta mínima esperada y **63 tokens**. La clave se configuró localmente,
  conserva permisos `0600` y está excluida de Git; no se publica su valor.
- Turno real a través de `POST /api/agent/chat` en desarrollo: **HTTP 200**,
  eventos `session`, `text_delta`, `tool` y `done`, llamada permitida a
  `get_first_aid_guidance` y ningún evento de error. Consumo reportado por Meta:
  **3711 tokens de entrada y 456 de salida**. La base de conocimiento estaba
  vacía: esta prueba verifica transporte, bucle y política, no contenido clínico.

Esta evidencia no acredita CI remota, conexión de auditoría real a Supabase,
despliegue ni aceptación científica. La migración y el job de retención siguen
requiriendo revisión antes de habilitar Muse en producción. No se ejecutaron
envíos ni se modificó la base de datos.
