# Activación de Muse en producción

## Objetivo y acceso pendiente

El usuario autorizó continuar después de integrar el PR #49: revisar/aplicar la
migración de auditoría, configurar Meta y almacenamiento persistente en Vercel,
y verificar el chat publicado. Esto no desactiva el modo demo de los datos ni
habilita envíos operativos.

Rama de preparación: `codex/ia-production`, desde `main` `48dafbd`. La revisión
no cambia la migración integrada ni aplica SQL al proyecto remoto.

Al iniciar esta etapa, Supabase y Vercel no estaban instalados/conectados como
integraciones. La configuración local solo contenía la clave de Meta; no había
credenciales de Supabase, Vercel ni una conexión de administración de base.
No se solicitaron ni copiaron claves por chat.

## Revisión de la migración

Archivo: `supabase/migrations/20261115180000_agent_chat.sql`.

- Crea tablas y funciones de auditoría; no cambia observaciones FIRMS, zonas,
  activos ni contactos. La aplicación pública usa funciones de servidor y no
  recibe `service_role`.
- Anónimos carecen de lectura y ejecución de funciones de auditoría. Los usuarios
  autenticados solo pueden leer sus propios turnos; coordinadores y
  administradores se reconocen por `app_metadata.role`, no por datos editables
  del usuario.
- Apertura de turno, cuotas por IP/sesión y exclusión de turnos concurrentes se
  realizan en una transacción con bloqueo. Solo se guarda el hash del token de
  sesión y un HMAC de IP que rota cada día.
- El borrado de retención está aislado en `agent_apply_retention()`. No se
  ejecuta durante la migración ni al arrancar la aplicación.

El workflow de PostGIS del PR #49 aplicó las migraciones, pero solo creaba roles
`anon` y `service_role`. Esta entrega añade el rol `authenticated` antes de migrar
y pruebas de comportamiento para la rama de políticas que usa ese rol.
`tests/db/agent-integration.test.mjs` comprueba acceso por rol, propiedad de la
sesión, cuotas y retención. Solo conecta si `CI=true` y la URL apunta a la base
local `firesync_test`; en otros entornos se omite sin abrir una conexión. Todos
los fixtures se insertan dentro de transacciones que terminan en rollback.
No equivale a verificar las credenciales o configuración del proyecto remoto.

## Orden de activación cuando estén conectadas las cuentas

1. Confirmar la cuenta y el proyecto Supabase FIRESYNC previsto en `AGENTS.md`
   (`dsefxgrsdqydrvgdjhoc`) y el proyecto Vercel asociado al repositorio
   `joseulloa18/firesync`. No crear proyectos nuevos ni cambiar planes.
2. Leer el esquema y el ledger `public.schema_migrations` antes de escribir.
   Comparar versiones y SHA-256 con los archivos del repositorio. Si la
   migración del agente ya está aplicada, verificar sus objetos y checksum;
   no volver a ejecutarla. Si el ledger discrepa, detener esa aplicación.
3. Aplicar solo las migraciones revisadas pendientes mediante el runner
   `scripts/db-migrate.mjs`, o una operación transaccional equivalente que
   preserve su ledger y checksum. La historia de migraciones de Supabase y el
   ledger propio del proyecto no deben quedar inconsistentes.
4. Verificar lectura/escritura de auditoría con el rol del servidor y denegación
   de acceso anónimo. No leer conversaciones reales para la prueba; usar un
   turno de demostración identificable.
5. Configurar en Vercel las variables de
   [`IA-PRODUCCION.env.example`](IA-PRODUCCION.env.example), con los valores reales
   en el entorno privado del servidor. Usar la clave de Meta ya verificada;
   generar `AGENT_RATE_LIMIT_SECRET` aleatorio de al menos 32 caracteres.
   `SUPABASE_SERVICE_ROLE_KEY` nunca lleva prefijo `NEXT_PUBLIC_`.
6. Conectar el mecanismo de retención revisado antes de habilitar el historial
   público persistente: mensajes anónimos 30 días, hashes de IP un día y auditoría
   un año. Su programación es una acción separada: esta preparación no crea cron
   ni ejecuta borrados sobre datos reales.
7. Redesplegar la versión integrada con las nuevas variables y comprobar un
   turno público con `provider=meta`, un evento terminal `done`, escritura de
   auditoría y rechazo de consultas a sesiones ajenas. Las pruebas automáticas
   de CI siguen usando mock y no requieren la clave de Meta.

`DEMO_MODE=true` conserva el carácter sintético de los datos aunque Muse y la
auditoría sean reales. La configuración del agente es independiente de la
ingesta y no acredita calibración científica ni una conexión FIRMS.

## Reversión

Mantener una copia privada de la configuración anterior del hosting. Si falla
la activación, restaurar `LLM_PROVIDER=mock` con `DEMO_MODE=true` y redesplegar.
No borrar tablas, conversaciones ni el ledger para revertir el código. Si
Supabase falla, el código detiene el turno antes de presentarlo como completado;
no degrada el almacenamiento de producción a memoria.

## Documentación primaria

- [Supabase: migraciones](https://supabase.com/docs/guides/deployment/database-migrations).
- [Vercel: variables de entorno](https://vercel.com/docs/environment-variables/managing-environment-variables).
- [Vercel: cron](https://vercel.com/docs/cron-jobs).

Estado de activación: pendiente de conexiones verificadas. No hay evidencia de
que las variables o tablas hayan sido configuradas en producción por esta etapa.
