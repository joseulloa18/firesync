---
name: orquestar-hackathon
description: Coordina desde Codex en macOS o Windows un equipo de hackathon con varias estaciones y sesiones de agentes de código, usando GitHub para altas, tareas, relevos y PRs.
---

# Orquestar un hackathon

La sesión central en macOS o Windows administra el equipo, asigna trabajo, revisa PRs e integra. Si la estación central también implementa tareas, usa otra sesión y su propio worktree. GitHub es el registro compartido. Mantén un issue de coordinación y un issue por tarea. Trabaja con el alcance autorizado. Si el usuario está planificando, prepara el diseño sin modificar GitHub.

## Alta o recuperación

1. Al iniciar, pregunta en un solo bloque por el repositorio, el operador y el sistema operativo de la estación central, cuántas estaciones de trabajo hay y, por estación, nombre, sistema operativo, operador, usuario de GitHub, agentes disponibles y capacidad total de sesiones simultáneas. Registra límites por agente cuando existan y si la cuota se comparte con otras estaciones. Si el producto sigue abierto, puedes completar el alta y hacer el ensayo.
2. Recupera el issue de coordinación si ya existe. Lee [operación del equipo](references/operacion.md) para registrar y verificar el alta, preparar el kit o coordinar un relevo. Usa GitHub conectado o `gh` desde la estación central. Registra las cuentas por nombre de usuario y deja las credenciales en cada estación.

## Delegación e integración

- Acordar el recorrido de demo y las interfaces compartidas antes de repartir tareas dependientes. Cada issue identifica resultado, alcance, dependencias, criterios de aceptación, verificación y rama `hackathon/issue-N` para el kit incluido. Publica primero tareas independientes o que puedan avanzar con contratos acordados y datos de prueba.
- Asigna cada issue al operador en GitHub y anota en el issue su estación y agente activo. Ocupa un cupo por issue. Respeta los límites de la estación, del agente y de las cuotas compartidas. Cada sesión trabaja en su propio worktree. Cada tarea tiene un solo operador activo y un PR hacia la rama de integración acordada.
- El operador recibe el número de issue y ejecuta el lanzador. Si hay varias asignaciones en la misma estación, puede introducir varios números separados por espacios. GitHub registra el estado. El arranque lo hace el operador local.
- Para revisar, consulta el PR y su diff actual, los criterios del issue y las comprobaciones requeridas por el repo. Deja observaciones concretas o integra si está autorizado y las verificaciones pasan. Actualiza el estado y los cupos tras el merge, y habilita los issues dependientes.
- Ante una cuota agotada, identifica todos los issues afectados, actualiza la disponibilidad y coordina el relevo según la referencia. Al recuperar la sesión, reconcilia asignaciones, PRs y estados con GitHub antes de volver a delegar.
