# Operación del equipo

## Alta

En el issue de coordinación registra la rama de integración y una tabla con estación, sistema operativo, operador (@usuario), agentes y estado, capacidad total, capacidad por agente si aplica, sesiones activas y estado del alta. Usa estados de agente como disponible, agotado y pendiente de verificar. Registra límites compartidos si los operadores los conocen.

- **Estación central (macOS o Windows).** Verifica acceso de Codex al repositorio por el conector de GitHub o por GitHub CLI, identidad del coordinador y permisos para las acciones acordadas. Si se usa `gh`, comprueba `gh auth status`. El administrador del repositorio invita al equipo y configura las reglas de integración.
- **Cada estación.** El operador acepta la invitación con su cuenta personal, instala Git y GitHub CLI, ejecuta `gh auth login` y verifica el usuario con `gh auth status`. Configura `user.name` y `user.email` en Git. Inicia sesión en cada agente que vaya a usar y comprueba su disponibilidad. Varias sesiones del mismo operador pueden usar su cuenta de GitHub.
- **Ensayo.** Verifica que el operador puede leer el issue, hacer push de la rama y abrir un PR. Abre tantos issues de prueba simultáneos como cupos quiera declarar. Confirma que las sesiones quedan aisladas, que el coordinador puede revisar los PRs y que al menos un relevo conserva el avance. Marca la estación como lista cuando cumpla las verificaciones aplicables.

## Distribuir el kit

Copia los archivos de `assets/windows/` a `orquestacion/windows/` en el repositorio compartido. Los operadores clonan el repo y hacen doble clic en el .bat de su agente dentro del clon. El lanzador pide los números de issue y abre una consola por tarea. También acepta números como argumentos. Si se omite la rama base, usa la rama predeterminada del remoto. Si el equipo integra en otra rama, configura `HACKATHON_BASE_BRANCH` con su nombre antes de ejecutar el lanzador. El remoto debe llamarse `origin`.

El kit de Windows crea o retoma el worktree y copia el contexto del issue al portapapeles al pulsar C en la consola correspondiente. El operador abre el worktree en el agente y pega el contexto. Cada consola conserva la copia de su propio contexto aunque se arranquen varias tareas juntas. Si el equipo quiere arranque directo, comprueba la interfaz de la versión instalada y adapta el lanzador para abrir una instancia por worktree. Conserva el flujo manual para herramientas cuya interfaz no admita esa operación. Para estaciones de ejecución macOS o Linux, prepara un lanzador equivalente cuando se confirmen esas estaciones.

## Estados y relevos

Usa estados distinguibles para lista, en curso, pendiente de relevo, en revisión e integrada. El issue de tarea conserva la asignación actual y los comentarios de relevo. Usa la tabla de coordinación para resumir capacidad y disponibilidad.

1. Al recibir «PC 1 agotó OpenCode», registra el agotamiento y busca todos los issues activos que dependan de ese acceso. Confirma si quedan cambios locales y que la sesión anterior dejó de editar antes de reactivar cada tarea.
2. Registra qué quedó hecho, qué falta, qué verificaciones se ejecutaron, la rama y el PR si existe. Si falta el estado local, pídelo al operador. Incluye el resumen en un comentario del issue.
3. En la misma estación, el nuevo agente abre el mismo issue con su lanzador y usa el worktree existente, incluidos cambios sin commit. En otra estación, el operador saliente sube el avance a la rama del issue, con PR en borrador si conviene. Confirma el commit remoto antes de reasignar. Si la estación original quedó inaccesible, registra el último commit disponible y qué avance local queda pendiente de recuperar.
4. Actualiza operador, estación y agente. Comprueba que la estación receptora tiene cupo y acceso a la rama. Si todavía no hay relevo viable, conserva el issue como pendiente de relevo. Si hay avance local anterior sin publicar, coordina su incorporación antes de que dos estaciones actualicen la rama.

Si la estación receptora ya trabajó en ese issue, compara su rama local con el commit de relevo en GitHub antes de editar. Incorpora el avance remoto con fast-forward cuando sea posible. Si hay divergencia o cambios locales, conserva el trabajo y coordina la reconciliación con el operador.
