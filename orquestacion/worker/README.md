# Ejecutor de estaciones FIRESYNC

Los puntos de entrada por miembro estan en `equipo/`. Los ZIP de Releases
incluyen las instrucciones y los scripts comunes, sin claves ni archivos .env.

El primer arranque requiere herramientas y autenticacion local. En Windows el
bootstrap instala Git, GitHub CLI y Node mediante winget cuando faltan; puede
requerir la confirmacion del sistema. Instala OpenCode 2.3.0 y pnpm en un prefijo
privado de FIRESYNC. En Mac `preparar-entorno.sh` muestra lo que falta instalar.
Las sesiones de Desktop no sustituyen la autenticacion de GitHub CLI.

El worker comprueba usuario, asignacion y etiquetas del issue. Crea o retoma un
worktree por rama `hackathon/issue-N`, instala dependencias propias y ejecuta
OpenCode con el modelo gratuito predeterminado. CLI 2 usa `--auto` para ejecutar
las herramientas autorizadas sin preguntas por cada comando. El agente deja un
commit; el worker comprueba `lint`, `typecheck` y `test`, publica la rama y abre
un PR borrador. No fusiona a main. Un fallo conserva el trabajo local.

El cupo limita las tareas de cada pasada; esta version las procesa en secuencia,
con una sesion independiente por tarea. No promete dos sesiones simultaneas.
`--once` procesa una; otra ejecucion toma las siguientes tareas listas.
Al publicar, cambia `worker:ready` por `worker:review` para evitar repetir tareas.

Comprobaciones sin arrancar el modelo:

```sh
node orquestacion/worker/worker.mjs --station pc-1-dariana --check
node orquestacion/worker/worker.mjs --station pc-1-dariana --dry-run
node --test tests/orchestration/worker.test.mjs
```

Pruebas de asignacion/publicacion usan un ejecutor simulado; se comprobaron
tambien el motor CLI 2 real y stdin/shims en Windows. El primer PR de cada
computadora sigue siendo el ensayo necesario para verificar esa estacion.
