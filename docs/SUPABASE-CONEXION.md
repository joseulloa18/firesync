# Comprobación de Supabase de solo lectura

Etapa del frente [#40](https://github.com/joseulloa18/firesync/issues/40), después
de las pruebas NASA. Rama `codex/supabase-readonly-check`, carpeta
`FIRESYNC-supabase`, base `main` `effb3ce`. Los archivos nuevos de esta etapa se
[registraron en coordinación](https://github.com/joseulloa18/firesync/issues/40#issuecomment-6899300136).

## Preparar la conexión

El operador con acceso al proyecto FIRESYNC obtiene su URI en **Connect** del
panel Supabase. La [guía oficial de conexión](https://supabase.com/docs/guides/database/connecting-to-postgres)
explica las opciones directas y de pooler. Para un cliente de consola, una
conexión directa o el pooler de sesión son opciones compatibles; si la red no
tiene IPv6, usar el pooler IPv4 correspondiente al proyecto.

Configurar solo `DATABASE_URL` en `.env.local` de esta carpeta, ya ignorado por
Git. No publicar la cadena: contiene credenciales. No hace falta una clave de
FIRMS, una API key Supabase ni activar la autenticación de la aplicación.
Usar la contraseña real de la base gestionada fuera de chats; los caracteres
reservados de usuario/contraseña deben estar codificados en la URI.

Con Node 24 y dependencias instaladas según el lockfile:

```sh
node --env-file-if-exists=.env.local scripts/db-readonly-smoke.mjs
```

En macOS también se puede ejecutar `PROBAR-SUPABASE.command`. El lanzador
comprueba la presencia de la cadena sin mostrarla, instala dependencias con
lockfile congelado y ejecuta una sola comprobación. No aplica migraciones.

## Alcance de la lectura

1. Conecta con `pg` y TLS que verifica el certificado. No utiliza
   `connectionString` junto al objeto SSL: los [parámetros SSL de una URI
   pueden sustituir ese objeto](https://node-postgres.com/features/ssl).
   Solo se admiten `sslmode=require` o `verify-full`, normalizados a
   `rejectUnauthorized: true`; otros parámetros de consulta se rechazan.
   No hay fallback que desactive verificación. Si hace falta una CA oficial
   adicional, configurar `NODE_EXTRA_CA_CERTS` al iniciar Node.
2. Abre `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`,
   configura límites de espera con `SET LOCAL` y verifica que
   `transaction_read_only` está activo. El [modo de solo lectura de PostgreSQL](https://www.postgresql.org/docs/current/sql-set-transaction.html)
   es una barrera adicional; las consultas del programa siguen siendo fijas.
3. Lee exclusivamente catálogos de PostgreSQL y `public.schema_migrations`:
   versiones de PostGIS/pgcrypto; presencia de las siete tablas públicas;
   RLS y política de lectura pública; políticas adicionales que necesitan revisión;
   dos vistas históricas con `security_invoker`; y checksums del ledger
   comparados con los archivos locales, igual que el migrador existente, sin
   aceptar versiones duplicadas en el registro remoto.
4. Ejecuta `ROLLBACK` y cierra la conexión también al fallar. No llama a
   `db:migrate` ni a `db-check`: ese último script inserta fixtures aunque
   después haga rollback, por lo que no es una comprobación de solo lectura.

No se cuentan observaciones ni se leen zonas, contactos, perfiles, tokens o
filas privadas. RLS y políticas aquí se inspeccionan como configuración;
esto no demuestra aislamiento entre usuarios ni valida el método científico.

Límites: conexión 5 segundos, cada consulta 6 segundos desde el cliente y
5 segundos de ejecución SQL; bloqueo 1 segundo, transacción inactiva
15 segundos y operación total 30 segundos. El ledger y las políticas están
acotados a 100 filas. No se envían nombres de sentencias preparadas y toda
configuración de sesión usa `SET LOCAL` dentro de la transacción.

## Resultado y diagnóstico

La salida JSON contiene versiones y comprobaciones sobre los objetos públicos
esperados. No incluye host, usuario, base, URI, contraseña, mensajes del driver
ni filas de negocio.

- `status: "ok"`, exit 0: conexión verificada y núcleo esperado compatible.
- `status: "incomplete"`, exit 2: conexión verificada, pero falta una extensión,
  relación, política, ledger o checksum esperado; `schemaReady` es `false`.
  La herramienta no crea ni repara objetos.
- `status: "failed"`, exit 1: configuración, conexión, TLS, permisos o lectura
  fallaron. Los errores usan códigos propios y una etapa saneada. No se
  imprime el error original ni se atribuye una conexión verificada al fallo.

`missing_database_url` indica configuración pendiente; `dns_error` un fallo de
resolución; `authentication_failed` y `permission_denied` distinguen credenciales
y permisos; `tls_error` requiere revisar el certificado/CA sin desactivar TLS.
Las siete tablas tienen lectura pública, pero el ledger está restringido: la
cuenta usada necesita permiso para leerlo. No se concede ese permiso desde el
smoke. Las versiones remotas desconocidas se cuentan sin copiar sus valores.

## Archivos, pruebas y estado real

Solo se añaden `scripts/lib/db-readonly-probe.mjs`, `scripts/db-readonly-smoke.mjs`,
`tests/db/readonly-probe.test.mjs`, `PROBAR-SUPABASE.command` y este documento.
No se cambian dependencias, migraciones, health, contratos de API ni UI.

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:db
```

Las pruebas usan cliente inyectado y credenciales sintéticas. Comprueban la
secuencia de solo lectura, TLS, comparación de ledger, esquema incompleto,
timeout, rollback/cierre, redacción y CLI. Una prueba adicional ejecuta el SQL
contra el PostGIS efímero del workflow existente: solo se habilita con
`CI=true`, host local y base `firesync_test`. Su adaptador de prueba sin TLS no
se utiliza en la CLI de producción y no verifica TLS de Supabase.

Verificación local de esta entrega: `pnpm lint` y `pnpm typecheck` pasan;
`pnpm test` pasa con 22 archivos y 300 pruebas; `pnpm test:db` pasa con
21 pruebas y omite una porque el PostGIS efímero solo está disponible en CI.
La sintaxis del lanzador y `git diff --check` también pasan.

### Comprobación real de la API pública — 2026-11-15

El operador proporcionó la URL de su proyecto y una clave publicable. Se
guardaron únicamente en el `.env.local` ignorado por Git, con los nombres
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
La clave publicable identifica el componente de aplicación y aplica los
permisos/RLS de `anon` sin sesión de usuario, según la
[documentación oficial](https://supabase.com/docs/guides/api/api-keys).
No es una contraseña PostgreSQL ni sustituye a `DATABASE_URL`.

Desde esta sesión se comprobaron por HTTPS las siete tablas y las dos vistas
de las listas fijas de esta herramienta. Cada consulta usó exclusivamente
`HEAD /rest/v1/{nombre}?select=*&limit=0`, con la clave en `apikey`, sin cookies,
sin redirecciones y con timeout. Los nueve objetos respondieron HTTP 200.
La clave no se utilizó como JWT en el encabezado `Authorization`.

Esto acredita conectividad y acceso de lectura a esos endpoints públicos.
La consulta estaba limitada a cero filas: no mide cuántas observaciones hay,
no demuestra ausencia de actividad ni verifica el aislamiento entre usuarios.
No se consultaron endpoints privados ni se intentó escribir con esa clave.
La aplicación no cambia automáticamente de demo por esta comprobación.

**Estado de la comprobación SQL real: pendiente.** No hay `DATABASE_URL`
configurada en la Mac para esta etapa. El acceso público REST no acredita
las versiones PostGIS/pgcrypto, configuración SQL de RLS ni checksums del ledger
restringido. Tampoco lo acreditan el cliente simulado o el PostGIS efímero de CI.
Al disponer del acceso SQL, guardar evidencia saneada de fecha UTC, commit,
comprobaciones y resultado; nunca incluir la cadena ni su contraseña.

Antes de avanzar a persistencia, revisar el resultado real con coordinación.
La ingesta idempotente y su manifiesto, la reconciliación SP/NRT y cualquier
migración nueva serán entregas separadas, revisadas antes de aplicarse. Para
revertir esta etapa basta revertir sus archivos: no hay datos que deshacer.
