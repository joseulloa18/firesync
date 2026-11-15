# Josezx18 — Codex Mac: integraciones reales

## Prioridad vigente

El usuario asignó a Codex en la Mac el **frente continuo de planificación y
conexiones con APIs reales**, registrado en [#40](https://github.com/joseulloa18/firesync/issues/40).
Participa en la planificación, acuerda contratos con diseño y conecta servicios
por etapas. Consulta el issue completo antes de trabajar.

Primera carpeta: `FIRESYNC-api`; rama `codex/api-plan`, desde `main` actualizada.
Primer PR: solo `docs/PLAN-INTEGRACIONES-REALES.md`, con auditoría de conexiones,
prioridades, variables requeridas (sin valores), dependencias y evidencia.
Después, una integración acordada por PR. No modificar diseño ni archivos de
Ian/Dariana/Yariel sin coordinación. No iniciar este frente con INICIAR.command.

El informe #38 y las pruebas #16 quedan **en espera**. Si ya hay trabajo iniciado,
conservarlo y reportar su estado antes del cambio; no borrarlo ni duplicarlo.
Lo que sigue documenta sus entregas previas, no la prioridad actual.

## Codex de la PC adicional

Tarea [#38: CLI local de informe de calibración](https://github.com/joseulloa18/firesync/issues/38).
Carpeta propia `FIRESYNC-codex-report`; rama `hackathon/issue-38`; base `main` actualizada.
Abre esa carpeta en Codex y proporciona el enlace del issue. Esta tarea no se inicia
con INICIAR.command: ese lanzador ejecuta OpenCode y recoge otras tareas elegibles.

Antes de editar, confirma carpeta, rama y archivos en #38. Respeta su lista de
archivos reservados; coordina package.json y pnpm-lock.yaml antes de modificarlos.
Entrega un PR en borrador con pruebas y resumen. El operador publica la rama;
el agente no hace push ni merge. La coordinación revisa e integra.

## OpenCode en la Mac

La tarea [#16: pruebas independientes del informe](https://github.com/joseulloa18/firesync/issues/16)
sigue abierta, pero en espera; no ejecutar INICIAR.command para recogerla ahora. Tiene archivos
distintos de #38: no uses el mismo worktree ni dos agentes sobre la misma tarea.
No se considera una sesión conectada hasta recibir un resultado verificable.

Las credenciales quedan en cada computadora. No enviar correos reales ni aplicar SQL.
