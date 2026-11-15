# Primera conexión con NASA FIRMS

Entrega de Codex Mac @Josezx18 para el frente continuo [#40](https://github.com/joseulloa18/firesync/issues/40).
Carpeta propia: `FIRESYNC-nasa`; rama: `codex/nasa-firms-smoke`.

## Qué está implementado

Una herramienta manual de servidor consulta la disponibilidad de un producto,
elige un día disponible y descarga un CSV pequeño por área. Reutiliza el cliente
FIRMS y el parser del proyecto. No carga datos en Supabase, no modifica el demo
de la aplicación y no expone un endpoint público con acceso a la clave NASA.

Los contratos oficiales consultados el 2026-11-15 son:

- [Disponibilidad de productos](https://firms.modaps.eosdis.nasa.gov/api/data_availability/):
  `data_availability/csv/[MAP_KEY]/[SENSOR]`.
- [Ejemplo oficial de disponibilidad](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html):
  columnas `data_id,min_date,max_date`. Los rangos se consultan, no se copian
  de las fechas de ejemplo publicadas en la documentación.
- [Consulta por área](https://firms.modaps.eosdis.nasa.gov/api/area/):
  `area/csv/[MAP_KEY]/[SOURCE]/[west,south,east,north]/[DAY_RANGE]/[DATE]`.
  FIRMS admite 1–5 días; esta herramienta solicita exactamente **un día**.

## Ejecutar

En macOS puedes abrir `PROBAR-NASA.command` con doble clic desde Finder.
El lanzador comprueba la presencia de la clave sin mostrarla, instala las
dependencias con el lockfile y ejecuta un único smoke desde la Terminal local.
Conserva la ventana abierta para revisar el resultado. No hace push, SQL ni
envíos de correo. Si macOS requiere confirmación para ejecutar el archivo,
puedes usar los comandos de Terminal de esta sección.

Requiere Node 24 LTS y las dependencias del proyecto instaladas con el lockfile:

```sh
corepack pnpm install --frozen-lockfile
node scripts/firms-smoke.mjs --help
```

Configura `FIRMS_MAP_KEY` únicamente en el entorno del proceso o en `.env.local`,
que ya está ignorado por Git. No pases la clave como argumento de línea de
comandos, no la pegues en chats y no la agregues al código. La clave gratuita
se solicita desde la [página oficial de FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/).
No hacen falta claves de Supabase, cron ni LLM para esta comprobación.

```sh
node --env-file-if-exists=.env.local scripts/firms-smoke.mjs
node --env-file-if-exists=.env.local scripts/firms-smoke.mjs --source VIIRS_SNPP_SP
node --env-file-if-exists=.env.local scripts/firms-smoke.mjs --source MODIS_NRT --bbox -70.9,18.6,-70.5,19
```

`--date YYYY-MM-DD` permite un día explícito, siempre dentro de la disponibilidad
devuelta para el producto. Sin fecha se usa `max_date`. El origen predeterminado
es `MODIS_SP`; se aceptan los ocho productos ya permitidos por el cliente
existente, sin ampliar su lista. Una muestra NOAA no autoriza incluir ese
satélite en el índice histórico.

La bbox predeterminada es una muestra de 0.4° × 0.4° dentro de República Dominicana.
Una bbox alternativa debe estar dentro de la caja de ingesta del MVP
`[-72.6,17,-67.7,20.6]`, respetar WGS84 y tener como máximo 1° por eje.
Esta restricción deliberada limita el smoke; no sirve para un backfill mundial.
Cambiar esa región requiere acordar el alcance de la siguiente entrega.

## Límites y resultados

- Dos requests como máximo: disponibilidad de un producto y un CSV de área.
  Si disponibilidad falla, no se realiza el segundo. No hay reintentos.
- Al menos un segundo entre ambas llamadas y 30 segundos para toda la
  operación, incluida la lectura del cuerpo. La muestra no puede ejecutarse
  como un cron ni lanzarse repetidamente para eludir cuotas.
- Máximo 1 MiB por respuesta, controlado durante la lectura aunque el servidor
  omita o falsee `Content-Length`. La disponibilidad además se limita a 16 KiB
  de texto; el CSV de área a 10 000 registros.
- No sigue redirecciones, no utiliza cookies y no guarda respuestas en caché.
- La cuota oficial FIRMS es 5000 transacciones por 10 minutos; **dos requests
  no equivalen necesariamente a dos transacciones**. El límite se comparte
  entre procesos que usan la misma clave; esta herramienta no administra una
  cuota distribuida.

El resultado es JSON con producto, bbox, día consultado, rango disponible,
hora de descarga UTC, adquisición máxima, checksum SHA-256 y conteos. No incluye
registros individuales, clave ni URL de la petición. Los campos
`sampleOnly: true`, `persisted: false`, `coverage: "not_assessed"`,
`lastIngestionAt: null` y `dataThrough: null` evitan presentar la muestra como
una ingesta completa de la aplicación. Una detección satelital no confirma un
incendio y `scientificValidation` permanece `not_performed`.

Un CSV válido con solo cabeceras puede devolver cero registros; no acredita
cobertura observacional completa. HTML/error con HTTP 200, cabeceras inválidas,
cabeceras duplicadas, filas con columnas ausentes o extra, filas rechazadas,
producto/satélite incoherente, fecha distinta de la solicitada,
coordenadas fuera de la bbox o magnitudes negativas hacen fallar el smoke.
No se sustituyen errores por datos demo ni por un cero inventado.

Los errores de la CLI son JSON saneado con `status: "failed"`, un `code` y
`persisted: false`; terminan con exit code 1. `missing_key` significa que no hay
clave en ese proceso; `missing_dependencies` indica que hay que instalar las
dependencias; `date_unavailable` evita la descarga de una fecha fuera
del rango del producto. Nunca se imprime el texto del error remoto.

## Archivos y coordinación

Esta etapa añade únicamente:

- `src/lib/firms-client/availability.ts`: contrato de disponibilidad con zod.
- `src/lib/firms-client/bounded-fetch.ts`: transporte con límite de bytes.
- `src/lib/firms-client/probe.ts`: composición del smoke y salida validada.
- `scripts/firms-smoke.mjs`: CLI Node 24 sin añadir dependencias ni runners.
- `PROBAR-NASA.command`: lanzador local macOS para instalar y ejecutar la muestra.
- `tests/data/firms-availability.test.ts`, `firms-bounded-fetch.test.ts` y
  `firms-probe.test.ts`: pruebas con respuestas y credenciales sintéticas.
- Este documento.

El CLI utiliza resolución de imports relativos TypeScript solo dentro de
`src/`, mediante `node:module.registerHooks`; no cambia el build de Next ni el
tsconfig. El resto del proyecto sigue usando su resolución habitual.

La nueva orden del usuario autoriza implementar esta primera etapa después del
plan. Las carpetas, rama y archivos de esta entrega quedan registrados aquí para
su relevo a #40; no se ha publicado un comentario remoto. El cliente compartido,
sus exports/tipos, configuración, UI, mensajes, package.json, lockfile y SQL
permanecen sin cambios. Las revisiones auxiliares tienen archivos separados.

## Verificación y estado de conexión

Comandos de verificación con las dependencias del lockfile:

```sh
corepack pnpm test tests/data/firms-availability.test.ts tests/data/firms-bounded-fetch.test.ts tests/data/firms-probe.test.ts
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Después de instalar las dependencias con el lockfile, `corepack pnpm test`
pasó con **20 archivos y 265 pruebas**, incluyendo las tres suites nuevas.
`corepack pnpm typecheck` y `corepack pnpm lint` (ESLint y Prettier) pasaron.
Estas pruebas usan HTTP sintético y no consumen transacciones NASA.

### Evidencia de conexión real proporcionada por el operador

El operador ejecutó `PROBAR-NASA.command` desde su Terminal local y compartió
el JSON saneado del resultado. La comprobación autenticada terminó con
`status: "ok"` tras consultar disponibilidad y área. La sesión del agente no
ejecutó esa consulta remota; verificó el código y los checks locales.

- Versión ejecutada: `5a75566` (base de código `6dcee6b` y ajustes del lanzador).
- Descarga: `2026-11-15T17:30:14.346Z`.
- Producto: `MODIS_SP`, procesamiento estándar, `isNrt: false`.
- Disponibilidad devuelta: `2000-11-01` a `2026-08-31`.
- Consulta: `2026-08-31`, un día, bbox `[-70.9,18.6,-70.5,19]`.
- Registros leídos/aceptados/rechazados: `0 / 0 / 0`.
- SHA-256: `b335277b53c6ffb4476f76ef457d775527f70fe5287310a46db6301d06266520`.
- `persisted: false`, adquisición máxima `null`, última ingesta `null`,
  `dataThrough: null`, cobertura `not_assessed` y validación científica
  `not_performed`.

Esto acredita la conexión para esa consulta, sin acreditar cobertura completa,
ausencia de actividad ni una ingesta en la aplicación. Es una muestra de archivo
estándar de agosto, no una consulta de actualidad de noviembre. No se guarda la
clave, la URL autenticada ni el CSV observado en el repositorio.

Para revertir, revertir el commit de esta etapa. Como no hay cambios en DB,
configuración, jobs ni UI, no es necesario borrar datos ni desactivar servicios.
La persistencia idempotente, cobertura, reconciliación SP/NRT y endpoints de
lectura quedan para la siguiente etapa acordada de #40.
