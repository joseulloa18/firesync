# FIRESYNC — coordinación

Repositorio: https://github.com/joseulloa18/firesync. Integración: `main`.
Coordinador Windows: @joseulloa18, Codex desktop. No utilizar Codex CLI.

| Estación | Sistema | Operador GitHub | Agente | Cupos provisionales | Estado |
|---|---|---|---|---|---|
| pc-1-dariana | Windows | @DarianaSM15 | OpenCode Desktop | 2 | Pendiente de primer arranque |
| pc-2-ian | Windows | @NunezIan | OpenCode Desktop | 2 | Pendiente de primer arranque |
| pc-3-yariel | Windows | @yarielDR32 | OpenCode Desktop | 2 | Pendiente de primer arranque |
| mac-jose | macOS | @Josezx18 | OpenCode; Codex instalado sin uso | 2 | Escritura verificada; tarea #16 asignada |

Los cupos son valores iniciales ajustables, no capacidad medida. Las cuotas pueden
compartirse por proveedor. El operador debe ejecutar localmente su lanzador y
completar la autenticación. No se publican correos, claves ni contraseñas.
El registro legible por el kit está en `equipo.json`.

## Trabajo central verificado

- PRs #5, #8, #9, #11 y #12 integrados. CI de aplicación y PostGIS en verde.
- Demo pública: https://firesync-eight.vercel.app/es (datos sintéticos).
- Supabase FIRESYNC creado; migración `20261114000100_initial_core` aplicada.
- Cliente FIRMS e informes disponibles; aún sin ingesta real ni validación científica.
- Alertas y agente de IA pendientes.
- Kit de estaciones publicado en Releases. Ian completó #14 y su PR #17 fue revisado e integrado.

## Proveedores

OpenCode gratuito funciona. NVIDIA Muse Glimmer respondió en revisión.
Baseten Muse rechazó la clave (403). OpenRouter rechazó autenticación (401);
si se recupera se permite únicamente `openrouter/openrouter/free`.
Cada estación conserva sus credenciales y verifica sus modelos disponibles.

## Protocolo distribuido

Un issue por tarea, asignado a un operador y con etiquetas `station:ID` y
`worker:ready`. Una sesión por worktree `hackathon/issue-N`, sin edición
compartida ni merge automático. La coordinación revisa e integra.
El ensayo debe demostrar pruebas y un PR antes de marcar la estación lista.
Un lanzador descargado no demuestra que la estación esté online.
