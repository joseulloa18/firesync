# FIRESYNC — coordinación

Repositorio: https://github.com/joseulloa18/firesync
Rama de integración: main. Operador: @joseulloa18. Estación PC-1 Windows.
Coordinador: Codex desktop. Capacidad inicial: tres sesiones ejecutoras aisladas.

| Issue | Agente | Rama | Estado |
|---|---|---|---|
| #2 Base app | Codex CLI | codex/base-app | en curso |
| #3 Datos | OpenCode sesión datos | codex/datos | en curso |
| #4 Esquema | OpenCode sesión esquema | codex/esquema | en curso |

## Sesiones y aislamiento
- Codex CLI: 01a1dc95-9722-7382-90e1-ebeb032a1a03; worktree nasa-base.
- OpenCode datos: ses_e236a530bffeJsPI3KoK10YaUI; worktree nasa-datos.
- OpenCode esquema: ses_e236a5322ffeE7YW0Z7GlM4bqQ; worktree nasa-esquema.
- Ubicación de worktrees: C:/Users/Josex/.codex/worktrees/ (cada uno tiene su carpeta Nasa app challenge).
- Sesiones por tarea, sin edición compartida. Integrar solo tras revisión y comprobaciones.

## Disponibilidad de agentes
- Codex CLI: autenticado con ChatGPT; no se verificó si es cuenta distinta del desktop.
- OpenCode: proveedor NVIDIA respondió muy lento; OpenRouter rechazó autenticación (401).
- Relevo a opencode/big-pickle: respondió y ejecuta tareas en ambas sesiones. Cuotas compartidas de proveedor sin cuantificar.

## Primer hito
Base local ejecutable, navegación bilingüe, configuración, health, parser/armonización probados y migración inicial revisable. Se mantienen fuera de esta tanda ingesta histórica completa, alertas reales y agente operativo.

## Pendientes externos
- Usuarios GitHub del grupo para invitaciones; no se han enviado invitaciones.
- Supabase/PostGIS, clave FIRMS y muestra real de datos del caso de demo.
- Selección y validación científica del método; ningún ejemplo sintético cuenta como validación.
- Sin envíos reales de correo en desarrollo.
