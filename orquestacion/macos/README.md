# FIRESYNC - estacion macOS

Lanzador para que un operador de macOS prepare una sola vez el entorno y luego
ejecute el worker distribuido de FIRESYNC. El worker vive en
`orquestacion/worker/worker.mjs` y lo integra la sesion central; esta carpeta no
modifica el worker.

La sesion central puede crear `equipo/Jose/INICIAR.command` para llamar a
`orquestacion/macos/iniciar-firesync.command`. El lanzador detecta el repositorio
a partir de su propia ubicacion, asi que funciona igual con doble clic, desde
Terminal o desde ese envoltorio.

## Archivos

| Archivo | Uso |
|---|---|
| `iniciar-firesync.command` | Valida el entorno, reutiliza o clona el repositorio y ejecuta el worker. |
| `preparar-entorno.sh` | Diagnostico manual: revisa dependencias y muestra los comandos que faltan. No instala nada. |
| `probar-lanzador.sh` | Pruebas de sintaxis y de seguridad del lanzador. |

## Primera configuracion (manual)

Ejecuta el diagnostico:

```sh
bash orquestacion/macos/preparar-entorno.sh
```

Completa a mano lo que marque como `[falta]`:

1. **Git.** En macOS suele bastar `xcode-select --install`. Tambien puedes usar
   `brew install git` si tienes Homebrew.
2. **Node.js 22 o superior.** Con Homebrew: `brew install node`. Con nvm:
   `nvm install 22 && nvm use 22`.
3. **GitHub CLI.** Con Homebrew: `brew install gh`. Luego inicia sesion:
   ```sh
   gh auth login
   gh auth status
   ```
   Esta estacion esta registrada con la cuenta `Josezx18`. Si `gh auth status`
   muestra otra cuenta, cambia con `gh auth switch` cuando corresponda. El
   lanzador nunca lee ni imprime tokens.
4. **Identidad de git.**
   ```sh
   git config --global user.name "Tu Nombre"
   git config --global user.email "tu@correo"
   ```
5. **CLI oficial de OpenCode 2.3.0 en un prefijo privado.**
   ```sh
   npm install --prefix "$HOME/.local/share/firesync/opencode-cli" @opencode/cli@2.3.0
   "$HOME/.local/share/firesync/opencode-cli/node_modules/.bin/opencode2" --version
   "$HOME/.local/share/firesync/opencode-cli/node_modules/.bin/opencode2" --help
   ```
   El paquete oficial 2.3.0 instala `opencode` y `opencode2`. El lanzador
   prefiere `opencode2`, verifica que responda `--version` y `--help`, y exporta
   `OPENCODE_BIN` con la ruta absoluta antes de llamar al worker. Tambien puedes
   fijar `OPENCODE_BIN` o `FIRESYNC_OPENCODE_BIN` a mano.

No ejecutes instalaciones globales ni cambies la app Desktop para este paso. Si
prefieres otra via oficial, revisa <https://opencode.ai/docs/>. Este proyecto no
usa Codex CLI.

### OpenCode Desktop

Si OpenCode Desktop esta instalado, el lanzador lo detecta, pero no lo usa para
abrir sesiones por enlace: Desktop no ofrece ese deeplink al worker. La CLI
oficial es la via principal.

Si la CLI instalada no es compatible con la version 2, el lanzador se detiene y
explica el problema. No degrade OpenCode Desktop. El fallback honesto es manual:
ejecuta el worker con `--check` para preparar los worktrees y abre cada worktree
en Desktop pegando el contexto del issue.

## Ejecutar

Desde Terminal:

```sh
./orquestacion/macos/iniciar-firesync.command
```

O con doble clic en Finder. El lanzador:

1. Detecta git, Node.js >= 22 y `gh`.
2. Reutiliza el clon del repositorio si el lanzador esta dentro de el; si no,
   pide una carpeta absoluta y clona `https://github.com/joseulloa18/firesync.git`.
   Nunca borra una carpeta existente.
3. Hace `git fetch origin` sin `pull`, `reset`, `checkout` ni `clean`.
4. Conserva los cambios locales y solo avisa si los hay.
5. Comprueba que exista `orquestacion/worker/worker.mjs`. Si falta porque la
   integracion central aun no lo publico, termina con un mensaje claro.
6. Crea el work root fuera del repositorio si no existe.
7. Verifica la CLI de OpenCode y exporta `OPENCODE_BIN`.
8. Ejecuta:
   ```sh
   node worker.mjs --station mac-jose --max-sessions 2 --once \
     --repo joseulloa18/firesync --work-root <ABS> --model opencode/big-pickle
   ```

El worker se encarga de compartir las ramas limpias que haya comprobado y de
abrir el PR en borrador. El lanzador no hace push.

## Opciones

```sh
./iniciar-firesync.command --check      # comprobacion del worker
./iniciar-firesync.command --dry-run    # sin sesiones reales
./iniciar-firesync.command --sin-pausa  # para automatizacion
./iniciar-firesync.command --help
```

`--check` y `--dry-run` se pasan al worker. Si la CLI de OpenCode falta o es
incompatible, el lanzador informa y solo continua en esos modos para que el
worker pueda reportar el estado.

## Variables de entorno

| Variable | Valor por defecto | Uso |
|---|---|---|
| `FIRESYNC_REPO_DIR` | `~/Documents/FIRESYNC` o `~/FIRESYNC` | Carpeta para clonar o reutilizar. |
| `FIRESYNC_WORK_ROOT` | `~/Documents/FIRESYNC-work` o `~/FIRESYNC-work` | Carpeta absoluta para worktrees. No puede estar dentro del repositorio. |
| `FIRESYNC_STATION` | `mac-jose` | Nombre de la estacion. |
| `FIRESYNC_MAX_SESSIONS` | `2` | Sesiones simultaneas (1-99). |
| `FIRESYNC_MODEL` | `opencode/big-pickle` | Modelo gratuito de OpenCode. |
| `OPENCODE_BIN` | detectado | Binario `opencode2`/`opencode` ya validado. |
| `FIRESYNC_OPENCODE_BIN` | vacio | Alternativa para indicar el binario. |
| `FIRESYNC_OPENCODE_PREFIX` | `~/.local/share/firesync/opencode-cli` | Prefijo privado de la CLI. |
| `FIRESYNC_GITHUB_ACCOUNT` | `Josezx18` | Cuenta esperada de la estacion. |
| `FIRESYNC_NO_INTERACTIVO` | `0` | `1` para no hacer preguntas. |
| `FIRESYNC_SI` | `0` | `1` para confirmar automaticamente. |
| `FIRESYNC_PAUSAR` | `1` | `0` para no esperar Enter. |

No hay respaldo automatico a proveedores de pago. Si cambias el modelo, el
lanzador solo avisa cuando no empieza por `opencode/`; no configura nada mas.

## Seguridad

- No se borran carpetas ni archivos del usuario.
- No se ejecutan `git reset`, `git clean`, `git checkout`, `git pull` ni push.
- Solo se hace `git fetch origin`; el arbol de trabajo no se toca.
- Si una carpeta existe y no es un clon validado, se rechaza sin modificarla.
- No se leen tokens ni archivos de credenciales. Solo se usa `gh auth status` y
  `gh api user --jq .login`.
- No se instala nada automaticamente. Los comandos de preparacion son manuales.
- El lanzador no usa Codex CLI.

## Pruebas

En macOS o Linux:

```sh
bash orquestacion/macos/probar-lanzador.sh
```

En Windows con Git Bash:

```powershell
& "C:/Program Files/Git/bin/bash.exe" -n orquestacion/macos/iniciar-firesync.command
& "C:/Program Files/Git/bin/bash.exe" -n orquestacion/macos/preparar-entorno.sh
& "C:/Program Files/Git/bin/bash.exe" orquestacion/macos/probar-lanzador.sh
```

Las pruebas revisan sintaxis, validacion de URL, version de Node, rutas con
espacios, rechazo de carpetas ajenas sin borrar su contenido, deteccion del
worker ausente, argumentos del worker, validacion de CLI 2 y ausencia de
comandos destructivos.

## Problemas comunes

**El worker no aparece.** La integracion central aun no lo publico en tu copia.
El lanzador te dice la ruta exacta y no modifica nada. Actualiza la rama con el
flujo del equipo.

**Node no se encuentra al hacer doble clic.** Finder no carga el perfil de la
terminal. El lanzador busca rutas comunes de Homebrew, nvm, Volta, pnpm y Bun.
Si aun falla, ejecuta el lanzador desde Terminal.

**macOS bloquea el archivo descargado.** Quita la cuarentena solo de ese archivo
o usa clic derecho > Abrir:
```sh
xattr -d com.apple.quarantine iniciar-firesync.command
chmod +x iniciar-firesync.command
```

**La CLI de OpenCode falta o es 1.x.** Instala la CLI oficial 2.3.0 en el prefijo
privado y verifica `opencode2 --version` y `--help`. No degrada Desktop. Si no
puedes, usa el fallback manual con Desktop.

**`gh` usa otra cuenta.** `gh auth status` muestra la cuenta activa. Usa
`gh auth switch` o `gh auth login` segun corresponda. No compartas tokens.
