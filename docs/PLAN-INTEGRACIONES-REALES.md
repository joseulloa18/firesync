# Plan de integraciones reales de FIRESYNC

Fecha de auditoría: 2026-11-15. Responsable: **Codex Mac · @Josezx18**.
Mandato continuo: [issue #40](https://github.com/joseulloa18/firesync/issues/40).
Base revisada: `main`, commit `5a092a1e6c7aa59586de360566e60058d930d187`.
Carpeta de esta entrega: `FIRESYNC-api`; rama: `codex/api-plan`.

Este primer cambio contiene únicamente este documento. Las etapas siguientes
son propuestas para coordinación, no reservas globales de archivos ni evidencia
de servicios conectados. La implementación conserva el orden de aceptación de
las fases 0–6 antes de empezar 7/8.

## 1. Resultado de la auditoría

Hay un cliente servidor FIRMS, un parser, un planificador de ventanas, funciones
de armonización y un núcleo SQL. La aplicación todavía presenta observaciones
sintéticas: no existe un flujo implementado FIRMS → persistencia → API → UI.
El mapa base y el relieve sí tienen consumidores HTTP externos configurados;
eso no convierte sus detecciones de fuego en datos observados.

Se usan cuatro estados, con una distinción adicional para la evidencia:

- **Conectado/verificado:** hay una comprobación identificable del servicio y
  del consumidor. Indicar si la evidencia es de esta auditoría o reportada por
  coordinación; una CI con PostGIS efímero no verifica el Supabase remoto.
- **Implementado sin conexión verificada:** existe código consumidor, pero
  faltan credenciales, ejecución real o evidencia reproducible del entorno.
- **Demo:** datos sintéticos o simulados explícitos, sin atribuirlos a NASA.
- **Pendiente:** solo contrato/documentación, sin implementación del consumidor.

La auditoría no inspeccionó secretos ni solicitó credenciales por chat. Que no se
hayan utilizado credenciales aquí no implica que falten en todos los entornos.

## 2. Inventario de servicios, contratos y responsables

Las variables son nombres existentes en `.env.example`, sin valores.
«Mac» significa propuesta de implementación backend por @Josezx18; central
(@joseulloa18) revisa contratos, infraestructura e integración. Los responsables
UI conservan sus archivos y deben participar antes de consumir contratos nuevos.

| Servicio / consumidor                                                                       | Estado y evidencia                                                                                                                                                                                                                   | Contrato y variables                                                                                                                                                                                                                                  | Límite / cuota                                                                                                                                                                                                                                                                                                                                                 | Responsable y siguiente paso                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NASA FIRMS / `src/lib/firms-client/`                                                        | Implementado sin conexión verificada. Cola por instancia, timeout, reintentos y errores saneados; pruebas con HTTP simulado en `tests/data/firms-client.test.ts`. Parser separado en `src/lib/firms/`; fixtures actuales sintéticos. | API de área CSV, producto explícito, bbox WGS84, fecha UTC y ventana. `FIRMS_MAP_KEY`, `INGEST_BBOX`. Disponibilidad de productos aún sin adaptador.                                                                                                  | Oficial: 1–5 días por consulta y 5000 transacciones por 10 minutos; el costo en transacciones puede superar el número de requests. El throttle local no coordina instancias. [FIRMS área](https://firms.modaps.eosdis.nasa.gov/api/area/).                                                                                                                     | Mac + central: primer smoke servidor de un día, sin persistencia; comprobar disponibilidad antes de elegir fecha.                                                                        |
| Histórico / `src/lib/ingest/plan.ts`, `src/lib/harmonize/`, `src/lib/reports/`              | Implementado sin ingesta: planifica y calcula en memoria. `ingest:backfill` y `stats:recompute` todavía terminan con error de función pendiente en `package.json`.                                                                   | Histórico `MODIS_SP` desde 2000 y `VIIRS_SNPP_SP` desde 2012, limitado por disponibilidad real. `MIN_CONFIDENCE`, `SP_LAG_DAYS`, `MIN_ACTIVITY`, `HARMONIZATION_STRATEGY` son configuración prevista; no presumir que todo el pipeline ya la consume. | Ventanas acotadas, sin backfill completo desde un request web. Falta manifiesto persistente de cobertura y reanudación.                                                                                                                                                                                                                                        | Mac acuerda persistencia con central; Ian mantiene la vista previa local [#35](https://github.com/joseulloa18/firesync/issues/35). No duplicar su importación ni la CLI de informes #38. |
| Supabase/PostGIS / scripts administrativos `scripts/db-migrate.mjs`, `scripts/db-check.mjs` | Conectado/verificado **según reporte central** en `docs/ESTADO-DESARROLLO.md`: proyecto creado y migración inicial aplicada. Esta sesión no conectó al proyecto remoto. CI independiente valida PostGIS efímero.                     | `pg`, `DATABASE_URL`; checksum de migraciones, transacción y bloqueo consultivo transaccional. Siete tablas públicas de datos, no todo el modelo futuro.                                                                                              | Conexiones y almacenamiento dependen del proyecto; cupos efectivos no inspeccionados. Elegir conexión directa/session para administración o transaction pooler para requests según entorno; verificar TLS y evitar prepared statements nombradas incompatibles. [Conexión oficial](https://supabase.com/docs/guides/database/connecting-to-postgres).          | Central verifica entorno; Mac propone lectura SQL mínima y repositorio servidor. No aplicar SQL en esta entrega.                                                                         |
| Supabase / acceso de aplicación `src/lib/db/`                                               | Pendiente: no existe este directorio ni consumidor de datos en la aplicación. Las variables de config no abren conexiones.                                                                                                           | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`. Elegir por consumidor REST o SQL; no exigir todos para un smoke FIRMS aislado.                                                              | Pool pequeño, timeouts y queries parametrizadas. Las claves privilegiadas y el rol SQL administrativo quedan solo en servidor; nunca pasan a props o bundles.                                                                                                                                                                                                  | Mac + central: lectura de extensiones, versión/checksum y conteos públicos sin exponer URL ni valores de conexión.                                                                       |
| Supabase Auth/RLS / futuras zonas privadas                                                  | Pendiente. No hay SDK Supabase, callback ni gestión de sesión; `profiles`, `monitored_zones`, tokens y notificaciones no existen en la migración actual. RLS actual permite SELECT de datos públicos.                                | Sesión en cookies para `/api/zones`; SDK SSR y callback por acordar. Variables públicas Supabase y `APP_BASE_URL`; privilegios de usuario separados de ingesta.                                                                                       | Correo Auth incorporado: 2 mensajes/hora por proyecto según [límites oficiales](https://supabase.com/docs/guides/auth/rate-limits). No confundirlo con correo de alertas.                                                                                                                                                                                      | Mac + central + Ian (#30): primero migración revisada y pruebas de dos usuarios; después Auth y zonas.                                                                                   |
| Backend Next / `src/app/api/`                                                               | Solo `/api/health` implementado. Declara `database: not_connected`, `lastIngestAt: null`, `email: disabled`; no prueba conectividad. Resto de `docs/API.md` son contratos futuros.                                                   | `parseConfig` valida un subconjunto de `.env.example`. `DEMO_MODE`, `APP_BASE_URL` y seis claves exigidas juntas al desactivar demo. Entradas/salidas futuras con zod y errores de `docs/API.md`.                                                     | Definir límites por endpoint: bbox/área, fechas, tamaño de cuerpo, paginación, tiempo y tasa antes de exponer datos.                                                                                                                                                                                                                                           | Mac acuerda schemas con UI; central coordina `src/lib/config.ts`, health y documentos compartidos.                                                                                       |
| Mapa / MapLibre + OpenFreeMap                                                               | Implementado sin smoke de red en esta auditoría. `src/components/fire-map.tsx` consume estilo Liberty; fuego y polígonos demo vienen de fixtures.                                                                                    | Sin variable ni clave actualmente; URL configurada en código. Conservar atribución. [Quick start oficial](https://openfreemap.org/quick_start/).                                                                                                      | Instancia pública sin clave según proveedor; no inferir SLA ni disponibilidad por existir URL. [OpenFreeMap](https://openfreemap.org/).                                                                                                                                                                                                                        | Yariel: smoke navegador escritorio/móvil, carga y error. Mac coordina GeoJSON observado sin editar sus componentes.                                                                      |
| Relieve / Mapterhorn                                                                        | Implementado sin smoke RD en esta auditoría: `raster-dem`, Terrarium, WebP 512 y fallback plano en `fire-map.tsx`.                                                                                                                   | Sin variable ni clave; endpoint z/x/y coincide con [acceso oficial](https://mapterhorn.com/data-access/). Mantener [atribución](https://mapterhorn.com/attribution/).                                                                                 | Cuota/SLA efectivos no verificados; verificar CORS, tesela RD, zoom y fallback, sin atribuir precisión de evacuación al relieve.                                                                                                                                                                                                                               | Yariel mantiene el consumidor; no reservarlo para backend.                                                                                                                               |
| Límites administrativos / `src/lib/geo/regions.ts`                                          | Validador implementado; importación, fuente licenciada, área PostGIS y `/api/regions` pendientes. `docs/REGIONES-IMPORTACION.md` exige procedencia e `is_demo`.                                                                      | GeoJSON Polygon/MultiPolygon → MultiPolygon 4326; código, padre, bbox y licencia. Sin nueva variable propuesta; `INGEST_BBOX` delimita la región.                                                                                                     | No importar geometrías sin licencia y fuente revisadas; validar topología y área en BD.                                                                                                                                                                                                                                                                        | Equipo aporta fuente; Mac/central coordinan importador. No usar los identificadores demo de UI como UUID reales.                                                                         |
| Correo / futuro `src/lib/email/`                                                            | Pendiente, incluido el mock: `EMAIL_PROVIDER=mock` es un valor reservado, no una implementación.                                                                                                                                     | `EmailProvider`; `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `DEMO_INBOX`, `DEMO_MODE`, `APP_BASE_URL`. Adaptador Resend/SMTP después de pruebas con mock.                                                                                       | [Resend API](https://resend.com/docs/api-reference/introduction): 429 y límites del equipo; [cuotas por cuenta](https://resend.com/docs/knowledge-base/account-quotas-and-limits) deben comprobarse antes de habilitar. Topes internos: 20/h por usuario y `MAX_ASSET_NOTIFICATIONS_PER_HOUR`.                                                                 | Mac + central: dedupe, verificación/baja y mock primero. Dominio/proveedor sin configurar aquí; cero envíos reales.                                                                      |
| Hosting / Vercel y GitHub Actions                                                           | Despliegue demo reportado por central. CI de la base verificada vía GitHub; sin smoke público exitoso del despliegue en esta auditoría.                                                                                              | Variables por entorno del consumidor; desarrollo/demo con `DEMO_MODE`. Workflows application/database/station no son jobs de ingesta.                                                                                                                 | Revisar plan real y duración de Functions antes de diseñar backfill. No registrar secretos ni interpretar CI como observaciones NASA.                                                                                                                                                                                                                          | Central administra hosting; Mac entrega endpoints acotados y reversión por PR.                                                                                                           |
| Jobs / `/api/jobs/*`, Supabase Cron                                                         | Pendiente: no hay rutas de jobs, scheduler configurado ni `job_runs`.                                                                                                                                                                | Contrato actual exige POST y Bearer `CRON_SECRET`. Alternativa: `pg_cron`/`pg_net` con secretos en Vault, por revisar.                                                                                                                                | Vercel Hobby limita cron a una vez al día; no satisface cada 15 minutos. Cron Vercel invoca GET y requiere adaptar el contrato POST. [Frecuencia](https://vercel.com/docs/cron-jobs/usage-and-pricing), [ejecución](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions). | Central elige scheduler sin activar ni contratar recursos; Mac propone job idempotente y exclusión de ejecuciones antes de programarlo.                                                  |
| IA / futuro `src/lib/agent/` y `/api/agent/*`                                               | Pendiente: no hay adaptador, SDK ni rutas. `LLM_PROVIDER=mock` tampoco acredita un mock implementado. `docs/AGENTE-IA.md` define el futuro.                                                                                          | `LLMProvider`, eventos de texto/herramientas/uso; `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_FALLBACK_PROVIDER`, `LLM_FALLBACK_MODEL`, `LLM_FALLBACK_API_KEY`, `AGENT_AUTONOMY`.                                                                | Modelo, cuota y compatibilidad de herramientas/streaming no verificados para la app; límites de turnos/tokens y costos deben ser explícitos. No convertir una sesión Codex/OpenCode en API de producción.                                                                                                                                                      | Mac planifica; decisiones de proveedor con usuario/central. Implementación fase 8 tras aceptación 0–6 y política de efectos probada.                                                     |
| Rutas, clima y sitios seguros                                                               | Pendiente. `src/lib/geo/` contiene utilidades, no un cliente de rutas/clima; no hay tabla `safe_places` operativa ni contenido `kb/` cargado.                                                                                        | `ROUTING_API_URL`, `ROUTING_API_KEY`, `WEATHER_API_URL`. Propuestas en `docs/DECISIONES.md`: OpenRouteService/OSRM y Open-Meteo; no elegidas ni conectadas aquí.                                                                                      | Verificar [restricciones ORS](https://openrouteservice.org/restrictions/) y [contrato Open-Meteo](https://open-meteo.com/en/docs) al seleccionar proveedor. No inferir calles abiertas, viento ni lugares seguros.                                                                                                                                             | Equipo valida fuentes; Mac solo inventaría ahora. Corresponde a ampliaciones posteriores, sin crear cuentas.                                                                             |

### Evidencia remota que sí se comprobó

Para la base auditada, GitHub devuelve `completed / success` en
[Application checks](https://github.com/joseulloa18/firesync/actions/runs/43734192777),
[Database checks](https://github.com/joseulloa18/firesync/actions/runs/43734192847) y
[Station kit checks](https://github.com/joseulloa18/firesync/actions/runs/43734192893).
Son resultados de la base, no del nuevo documento ni de credenciales remotas.
El intento de consultar el health público desde la herramienta web no obtuvo
una respuesta accesible; no se afirma que el despliegue esté caído o verificado.

### Proveedores LLM: inventario separado de los agentes de desarrollo

| Proveedor     | Evidencia disponible                                                                 | Estado para FIRESYNC y siguiente verificación                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mock          | Previsto en `.env.example` y `docs/AGENTE-IA.md`; sin implementación.                | Primer adaptador futuro, determinista y sin red; probar eventos y política antes de credenciales.                                                                                                                         |
| OpenRouter    | Central reportó 401 en OpenCode. Eso no prueba el estado de una clave de aplicación. | Solo se permite `openrouter/free`, según [router oficial](https://openrouter.ai/openrouter/free); cuotas/catálogo/capacidades deben verificarse al usarlo. No usar auto de pago ni fallback pagado implícito.             |
| NVIDIA        | Central reportó una respuesta de Muse Glimmer en una sesión de desarrollo.           | API de app, modelo vigente, autenticación, cuotas y herramientas no comprobados. Contrastar catálogo [NVIDIA](https://build.nvidia.com/explore/discover) sin prometer que el identificador de OpenCode existe en esa API. |
| Baseten       | Central reportó 403 en desarrollo.                                                   | No conectado a la app. Verificar endpoint/modelo, autorización y presupuesto con su [documentación de inferencia](https://docs.baseten.co/inference/calling-your-model); no asumir interoperabilidad por nombre.          |
| Vercel AI SDK | Sugerido como adaptador; no instalado.                                               | Es biblioteca, no proveedor ni credenciales. La [API de herramientas](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) necesita validación y autorización de la aplicación; no autoriza efectos por sí sola.   |

## 3. Primera conexión propuesta: lectura real acotada, sin persistencia

Primera implementación a acordar en #40: **smoke FIRMS de servidor manual**.
No requiere desactivar el demo de la app ni disponer de todas las claves de
Supabase/Auth/cron. La configuración de servicios aislados debe validarse por
consumidor; cualquier cambio de `config.ts` se coordina por separado.

1. Leer únicamente `FIRMS_MAP_KEY` del entorno servidor. Ausencia de clave:
   resultado pendiente explícito y exit code no cero; nunca solicitar el valor
   por chat. Permitir ejecución completamente mock en CI.
2. Añadir un adaptador acotado a
   [disponibilidad oficial](https://firms.modaps.eosdis.nasa.gov/api/data_availability/)
   para elegir un día realmente disponible del producto. `MODIS_SP` y
   `VIIRS_SNPP_SP` conservan su identidad; los años nominales no acreditan
   cobertura continua ni disponibilidad de todas las fechas.
3. Ejecutar una sola consulta de área: un producto histórico, bbox pequeña
   validada dentro de la región de ingesta, un día UTC y `maxRetries=0`.
   Registrar inicio/fin UTC. La consulta de disponibilidad es adicional:
   presupuestar ambas llamadas sin asumir una transacción por request.
4. Reutilizar `createFirmsClient` → `download` → `parseFirmsCsv`. El planificador
   usa una tupla bbox y el parser un objeto: el adaptador debe convertirlos
   explícitamente. Validar producto/satélite y cabeceras, no solo HTTP 200.
5. Limitar bytes, tiempo total y filas antes de exponer esta operación como
   servicio. Hoy `download` carga el texto completo: si hace falta ampliar el
   cliente para el límite de bytes, acordar su archivo y sus tests en ese PR.
   Probar HTTP 200 con HTML/error, CSV inválido, vacío válido, 401/429/5xx,
   cancelación, timeout y redacción de secretos.
6. Emitir únicamente un resumen saneado: producto, bbox, fecha/ventana,
   hora de descarga, checksum del CSV, filas leídas/aceptadas/rechazadas y
   adquisición máxima o `null`. No imprimir CSV, clave, URL completa, cabeceras
   de autenticación, correos ni cuerpo de errores externos.

Aceptación: tests mock pasan sin credenciales y el smoke real, cuando el entorno
disponga de acceso, deja evidencia saneada del consumidor, producto, ventana,
resultado y commit. **Cero detecciones devueltas** puede ser un resultado válido
de consulta, pero no demuestra observación completa de cada celda/día. Un fallo,
producto no disponible o fecha sin cobertura nunca se convierte en cero.
Se conserva `scientificValidation=not_performed` y `jump2012=not_evaluated`.
Esta entrega documental no ejecuta ese smoke ni escribe en la base.

En paralelo lógico, otra entrega pequeña puede comprobar Supabase con SELECT
de versión, PostGIS, `schema_migrations` y conteos agregados; sin DDL, sin filas
privadas y sin imprimir la conexión. No usar `db-check.mjs` contra producción
como lectura inocua: ese script inserta fixtures dentro de una transacción y
hace rollback. No migrar automáticamente al comprobar conectividad.

## 4. Contrato propuesto de ingesta y persistencia idempotente

Antes del primer PR con escrituras, central debe revisar la migración y este
contrato. No modificar la migración inicial ya aplicada.

| Aspecto          | Contrato propuesto y dependencia                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entrada          | Producto explícito, bbox normalizada, inicio/fin UTC inclusivos y checksum de entrada. Reutilizar IDs estables de `planIngestWindows`; archivos locales usan manifiesto propio acordado con Ian #35.                                                                                                                                                         |
| DTO de escritura | Validación zod además del parser: números finitos, FRP/brillos no negativos conforme a SQL, sensor/satélite/producto compatibles, `acq_date` derivada de `acq_at`, WGS84 y `cell_id` calculado. El parser actual acepta algunos negativos finitos que SQL rechaza.                                                                                           |
| Cuadrícula       | Insertar/validar previamente `grid_cells` requeridas por la FK de `raw_detections.cell_id`, con fórmula 0.01° existente. No reemplazar límites administrativos por cuadrados demo.                                                                                                                                                                           |
| Dedupe           | SQL usa `(satellite, acq_at, latitude, longitude)` sin `source`. Un `ON CONFLICT DO NOTHING` simple perdería la promoción NRT→SP. Propuesta inicial: promover a SP transaccionalmente, sin degradar SP a NRT; conflicto SP/SP idéntico es no-op y una revisión distinta se registra antes de recalcular.                                                     |
| Reconciliación   | Si SP corrige coordenadas/tiempo y cambia la clave, no basta el upsert anterior. Acordar reemplazo de la porción cubierta del producto/satélite, con manifiesto completo y transacción, o versionado de observaciones mediante migración revisada. No borrar NRT de otras celdas o ventanas. Probar NRT→SP, SP→NRT, repetición, correcciones y concurrencia. |
| Cobertura        | Manifiesto persistente por producto/bbox/ventana con estado de descarga y controles de calidad, incluso cuando el CSV no contiene detecciones. Separar consulta descargada, cobertura observacional conocida y completitud del período. Las vistas existentes solo prefieren SP donde hay filas: no acreditan cobertura completa.                            |
| Atomicidad       | Guardar filas y marca de ventana completada en una misma transacción; solo luego avanzar cursor. Fallos/rechazos conservan estado explícito y no marcan el período completo. `job_runs`/cursor y manifiesto faltan: requieren migración nueva revisada.                                                                                                      |
| Agregación       | Almacenar dimensiones `source`/`satellite` que exige SQL. Las funciones TS colapsan por familia y no se insertan directamente en esas tablas. Para CDO histórica, unión de celdas/día/sensor; Terra+Aqua coincidentes cuentan una vez. NOAA20/21 no entran en histórico.                                                                                     |
| Productos        | Lista histórica explícita acordada: MODIS SP y VIIRS S-NPP SP; S-NPP NRT solo período provisional identificado y reconciliado. El filtro TS genérico puede admitir MODIS NRT, mientras las vistas SQL lo excluyen: resolver esa diferencia antes del adaptador. NOAA20/21 se reservan para actualidad.                                                       |
| Resultado        | `runId`, ventana/producto, conteos leídos/aceptados/rechazados/insertados/actualizados/duplicados, checksum, inicio/fin UTC, estado y error tipificado saneado. No almacenar secretos ni confundir fin de consulta con última adquisición.                                                                                                                   |
| Concurrencia     | Un escritor por ventana/producto con bloqueo y política de reintento acotada; cuota FIRMS compartida entre procesos antes de escalar. Probar crash antes/después del commit y reanudación sin pérdidas.                                                                                                                                                      |

No se deben sumar agregados por satélite para obtener CDO histórica. Tampoco
rellenar meses ausentes con cero ni calibrar un período como completo solo
porque tenga alguna fila. La serie observada, las revisiones SP/NRT y el
conjunto sintético de pruebas deben permanecer distinguibles; las tablas de
detecciones actuales no tienen `is_demo`, por lo que no se les cargarán fixtures
demo mezclados con observaciones reales.

## 5. Contratos de lectura para el equipo de UI

Conservar métodos/rutas de `docs/API.md`; estas precisiones son propuestas para
un próximo PR de contrato, no cambios de ese documento compartido ahora.
Los schemas zod compartidos se acuerdan antes de consumirlos en componentes.

| Grupo             | Primera entrega y estados que debe recibir UI                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regiones          | `GET /api/regions` y `/{id}`: UUID/código/nombre/nivel/bbox/área; geometría simplificada en detalle. Fuente/licencia y procedencia verificables. `200` con lista vacía cuando no hay regiones cargadas; no sustituir por provincias ficticias.                                                                                   |
| Historial         | `POST /api/calendar`, detalle de mes, tendencias, estacionalidad, ranking, calidad y CSV. Valores ausentes `null`; cero solo con cobertura suficiente. Preservar `isPartial`, `usesNrt`, `terraOnly`, método y calibración no evaluada cuando corresponda. El mismo filtro alimenta mapa, cifras y CSV.                          |
| Actualidad        | GeoJSON en `GET /api/detections/recent`, ficha y `latest-available`: `acqAt`, sensor, satélite, producto, confianza, FRP e `isNrt`. `updatedAt` es última ingesta exitosa de esos datos; boletines confirmados requieren fuente independiente, no deducción por satélite.                                                        |
| Vacío/error/carga | Carga es estado local durante el request. Vacío válido lleva cobertura/procedencia; falta de cobertura es estado diferente. Errores siguen `{ error: { code, message, details } }`, saneados; 400/401/403/404/429/502 según `API.md`. Caída de servicio nunca devuelve fixtures como si fueran observados.                       |
| Metadata          | Conservar `meta.unit`, `methodVersion`, `dataThrough`, `sources`. Proponer procedencia discriminada `synthetic`/`observed`, última adquisición, ingesta y cobertura por producto/período. Precisar `dataThrough` por dataset como límite del período respaldado, no hora del navegador; la adquisición máxima se informa aparte. |

`src/lib/provenance.ts` hoy solo permite `synthetic-fixture` y proveedor no
conectado. No reutilizar ese schema para fingir una conexión observada: la
ampliación y sus estados deben acordarse con Ian. Mapas/relieve de Yariel,
marca de Dariana y mensajes de traducción quedan bajo su coordinación.
UTC en almacenamiento/API; conversión `America/Santo_Domingo` solo al mostrar.

## 6. Secuencia por PR, aceptación y reversión

Antes de implementar cada etapa: registrar en #40 carpeta/rama, **archivos
exactos** reservados, contrato, dependencias y pruebas. No quedan reservados
directorios enteros por esta propuesta. Cada PR incluye variables requeridas,
evidencia de conexión o límite explícito y un procedimiento de reversión.

| Orden                         | Alcance propuesto                                                                                                                                                                  | Criterio de aceptación / reversión                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 · este plan                 | Solo `docs/PLAN-INTEGRACIONES-REALES.md`, rama `codex/api-plan`.                                                                                                                   | Revisión central del inventario y prioridades. Revertir el commit documental no afecta runtime. #40 permanece abierto por ser un frente continuo.                                                                                                                         |
| 1 · lecturas acotadas         | Adaptador disponibilidad + smoke FIRMS; lectura Supabase en PR independiente. Candidatos nuevos en `scripts/` y tests; cualquier cambio en cliente/config se reserva expresamente. | Tests mock; smoke mínimo opcional con evidencia saneada. Sin escrituras ni automatización. Revertir scripts/adaptadores; UI sigue demo.                                                                                                                                   |
| 2 · regiones y almacenamiento | Fuente licenciada, importación de regiones/grid; manifiesto/job_runs y persistencia/reconciliación por entregas separadas. Coordinar preview local #35 sin reimplementarlo.        | PostGIS efímero, idempotencia/reanudación, cobertura vacía y promoción SP verificadas; SQL revisado antes de aplicar. Reversión deshabilita escritor y restaura versión compatible; nunca borra observaciones automáticamente.                                            |
| 3 · histórico observado       | Agregación/recalculo e informe, endpoints públicos de fases 1/2 y contratos UI. #16/#38 siguen con sus propietarios.                                                               | Serie trazable y pruebas contra una semana revisada; ausentes no se convierten en cero, NOAA excluido, CSV reproduce API. La validación científica requiere revisión independiente. Volver a modo demo explícito sin mezclar datos.                                       |
| 4 · actualidad/jobs           | NRT, lectura reciente y reconciliación; scheduler después del job manual idempotente. Coordinar Ian #27.                                                                           | Bearer inválido o ausente no ejecuta nada; exclusión concurrente, presupuesto, checkpoint y fallos probados. Desactivar scheduler y escritor conserva datos y permite reanudar.                                                                                           |
| 5 · Auth/zonas/correo         | Fase 4 del ROADMAP: migraciones privadas revisadas, SSR Auth, CRUD y `EmailProvider` mock primero.                                                                                 | Usuario A no lee/escribe zonas de B; anónimo denegado, zonas no verificadas sin avisos, dedupe/baja y destinatarios de prueba comprobados. Auth puede enviar correo: pruebas reales solo tras autorización de ese envío. Reversión pausa jobs y envíos, sin borrar zonas. |
| 6 · completar P0/P1           | APIs de prevención y laboratorio con fuentes/caso revisados; coordinación con Dariana, Ian y Yariel.                                                                               | Aceptación de fases 0–6 registrada por central; no basta que la UI exista.                                                                                                                                                                                                |
| 7 · ampliaciones              | Incidentes/activos, IA, rutas/clima: solo planificación/inventario por ahora.                                                                                                      | Implementar fases 7/8 después del hito anterior; políticas fuera del prompt, mocks, auditoría y aprobación de efectos. Ningún proveedor se habilita por tener una sesión de desarrollo funcional.                                                                         |

## 7. Coordinación, límites y entrega de esta sesión

- Identidad de este frente: Codex Mac @Josezx18; una tarea activa y carpeta
  propia. #16 y #38 están en espera según `equipo/Jose/TAREA-ACTUAL.md`.
  No se encontró trabajo local previo de esas tareas en la carpeta nueva.
- El usuario autorizó después dos sesiones auxiliares de revisión solo lectura
  y una conversación separada para planificar la API de IA. Ninguna recibió
  permiso de editar esta rama compartida ni de adelantarse a implementar
  fases 7/8. Los hallazgos de ambas revisiones se incorporaron al plan.
- No se modifican UI, estilos, traducciones, dependencias, lockfile,
  `.env.example`, contratos compartidos ni migraciones. No se aplicó SQL, no
  se activó cron y no se enviaron mensajes o correos reales.
- El shell no pudo resolver GitHub ni npm. Se recuperó la base mediante la
  conexión GitHub y se verificaron los hashes de los 164 blobs, árboles y el
  commit original; la rama local conserva esa base como checkout superficial.
  No se creó una historia de sustitución ni se alteró el remoto.
- Node 24 está disponible; Corepack no pudo obtener pnpm 10.32.1 por
  `ENOTFOUND registry.npmjs.org`. Por ello lint/typecheck/test de esta entrega
  no están ejecutados localmente. Los checks verdes de la base no se
  presentan como checks del cambio. Ejecutarlos con dependencias disponibles
  antes de publicar; el cambio solo añade Markdown y no introduce lógica.
- La entrega conserva un commit local y un parche aplicable. Según
  `AGENTS.md`, el agente no hace push ni merge; el operador publica la rama/PR
  y central revisa e integra. No se afirma que exista PR ni comentario remoto
  de esta sesión hasta que se publique. Este documento no cierra el issue #40.

Para el relevo en #40: prioridad inmediata propuesta **disponibilidad FIRMS +
lectura de un día sin persistencia**, seguida de lectura de Supabase. Antes del
escritor acordar manifiesto de cobertura, política SP/NRT y reserva de archivos;
antes de API UI acordar estados y metadata con Ian. No esperar claves para
revisar y publicar este plan.
