# Estado de desarrollo — FIRESYNC

Fecha: 2026-11-15. Rama de integración local: `codex/integration`.
La revisión final, el push y el PR los hace la estación central.

## Entregables integrados

- Base Next.js ejecutable con navegación bilingüe, configuración, `/api/health`
  y calendario demo explícitamente marcado como sintético.
- Parser CSV de FIRMS (MODIS y VIIRS) y funciones puras de armonización.
- Cliente servidor de descarga FIRMS con throttle, reintentos acotados, timeout,
  cancelación y errores sin clave ni URL.
- Generador de informe de calibración y exportación CSV.
- Migración inicial y comprobación de esquema/PostGIS (tarea de base de datos).

## Correcciones de esta revisión

- El cliente FIRMS cancela el cuerpo de respuestas no `200` sin leerlo, para
  liberar la conexión.
- El informe trata `NaN`, `Infinity` y negativos como ausentes, sin emitirlos en
  la serie ni en el CSV.
- El CSV neutraliza fórmulas de hoja de cálculo en campos de texto y conserva
  los signos de los números.
- `.gitattributes` fija `eol=lf` para evitar diferencias de CRLF en worktrees
  Windows.

## Verificación local

| Comando | Resultado |
|---|---|
| `pnpm lint` | pasa (ESLint + Prettier) |
| `pnpm typecheck` | pasa |
| `pnpm test` | 9 archivos, 85 pruebas, todas pasan |
| `pnpm test:db` | 8 pruebas, todas pasan |
| `pnpm build` | no verificable en este worktree |

`pnpm build` falla solo por el `node_modules` compartido mediante junction y el
root hermético de Turbopack (`Could not find the Next.js package`). No es un
defecto del código ni de la configuración. La CI fresca validará el build
canónico cuando la estación central suba la rama. No se movieron ni instalaron
dependencias.

E2E no se repitió: esta tanda no cambió interfaz.

## Límites y modo demo

- Sin claves externas la app arranca en modo demo explícito. Los datos de prueba
  son sintéticos y están identificados; no hay ingesta real de NASA FIRMS.
- No hay base Supabase/PostGIS real ni datos observados en esta rama. Falta
  `FIRMS_MAP_KEY`, una muestra real de FIRMS y la validación científica del
  método de armonización.
- Alertas por correo, respuesta con activos y agente de IA no están operativos.
- No se envían correos reales en desarrollo.

## Equipo y acceso

Usuarios de GitHub invitados con permiso de escritura pendiente: `DarianaSM15`,
`Eshefany13`, `NunezIan`, `sarah2928`, `yarielDR32`. No se publican correos.

Proveedores: OpenCode gratuito funciona; NVIDIA Muse Glimmer responde para
revisión. Baseten Muse Spark Open devolvió 403 y OpenRouter Free devolvió 401;
ambos quedan pendientes.
