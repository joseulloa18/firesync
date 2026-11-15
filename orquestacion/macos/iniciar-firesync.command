#!/usr/bin/env bash
# FIRESYNC - lanzador de la estacion macOS para el worker distribuido.
#
# Uso directo:
#   ./iniciar-firesync.command [--check | --dry-run] [--sin-pausa] [--help]
#
# Tambien puede llamarse desde equipo/Jose/INICIAR.command. El lanzador solo
# valida, clona o reutiliza el repositorio y ejecuta orquestacion/worker/worker.mjs.
# No borra, no reinicia, no hace reset/checkout/clean ni push.
# El worker comparte la rama limpia y abre el PR en borrador cuando corresponde.

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_SLUG="${FIRESYNC_REPO:-joseulloa18/firesync}"
CUENTA_ESTACION="${FIRESYNC_GITHUB_ACCOUNT:-Josezx18}"
ESTACION="${FIRESYNC_STATION:-mac-jose}"
MAX_SESIONES="${FIRESYNC_MAX_SESSIONS:-2}"
MODELO="${FIRESYNC_MODEL:-opencode/big-pickle}"
PREFIX_OPENCODE="${FIRESYNC_OPENCODE_PREFIX:-$HOME/.local/share/firesync/opencode-cli}"

MODO_WORKER=""
MODO_AYUDA=0
PAUSAR="${FIRESYNC_PAUSAR:-1}"
REPO_DIR=""
WORK_ROOT=""
WORKER_PATH=""
OPENCODE_BIN="${OPENCODE_BIN:-}"
ARGS_WORKER=()

info() { printf '%s\n' "$*"; }
aviso() { printf 'Aviso: %s\n' "$*" >&2; }
error() { printf 'Error: %s\n' "$*" >&2; }

mostrar_ayuda() {
  cat <<'EOF'
FIRESYNC - lanzador macOS del worker distribuido

Uso:
  iniciar-firesync.command [opciones]

Opciones:
  --check       Ejecuta el worker en modo de comprobacion.
  --dry-run     Ejecuta el worker sin lanzar sesiones reales.
  --sin-pausa   No espera Enter al terminar (util para automatizacion).
  -h, --help    Muestra esta ayuda.

Primera configuracion (manual):
  bash orquestacion/macos/preparar-entorno.sh

Variables utiles:
  FIRESYNC_REPO_DIR        Carpeta del clon o destino del clon.
  FIRESYNC_WORK_ROOT       Carpeta absoluta para los worktrees del worker.
  FIRESYNC_STATION         Nombre de estacion (por defecto: mac-jose).
  FIRESYNC_MAX_SESSIONS    Sesiones simultaneas (por defecto: 2).
  FIRESYNC_MODEL           Modelo gratuito (por defecto: opencode/big-pickle).
  FIRESYNC_OPENCODE_PREFIX Prefijo de la CLI oficial (por defecto:
                           ~/.local/share/firesync/opencode-cli).
  OPENCODE_BIN             Ruta explicita al binario opencode2/opencode.
  FIRESYNC_GITHUB_ACCOUNT  Cuenta de esta estacion (por defecto: Josezx18).
  FIRESYNC_NO_INTERACTIVO  1 para no hacer preguntas.
  FIRESYNC_SI              1 para responder si a las confirmaciones.
  FIRESYNC_PAUSAR          0 para no esperar Enter al terminar.

El lanzador no instala dependencias ni lee secretos. Si falta algo, muestra
el comando manual que debes ejecutar.
EOF
}

pausar_en_salida() {
  if [ "${PAUSAR:-1}" = "1" ] && [ -t 0 ]; then
    printf '\nPresiona Enter para cerrar...'
    read -r _ 2>/dev/null || true
  fi
}

es_interactivo() {
  [ "${FIRESYNC_NO_INTERACTIVO:-0}" != "1" ] && [ -t 0 ]
}

confirmar() {
  local respuesta=""
  if [ "${FIRESYNC_SI:-0}" = "1" ]; then
    return 0
  fi
  if ! es_interactivo; then
    return 1
  fi
  read -r -p "$1 [s/N] " respuesta || true
  case "$respuesta" in
    s|S|si|sí|Si|Sí|SI|SÍ) return 0 ;;
  esac
  return 1
}

asegurar_path_comun() {
  local dir=""
  for dir in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin" "$HOME/.volta/bin" "$HOME/Library/pnpm" "$HOME/.bun/bin"; do
    if [ -d "$dir" ]; then
      PATH="$dir:$PATH"
    fi
  done
  for dir in "$HOME"/.nvm/versions/node/*/bin; do
    if [ -d "$dir" ]; then
      PATH="$dir:$PATH"
    fi
  done
  export PATH
}

minusculas() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

parsear_argumentos() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --help|-h|--ayuda)
        MODO_AYUDA=1
        shift
        ;;
      --check)
        if [ -n "$MODO_WORKER" ] && [ "$MODO_WORKER" != "check" ]; then
          error "Usa --check o --dry-run, no ambos."
          return 1
        fi
        MODO_WORKER="check"
        shift
        ;;
      --dry-run)
        if [ -n "$MODO_WORKER" ] && [ "$MODO_WORKER" != "dry-run" ]; then
          error "Usa --check o --dry-run, no ambos."
          return 1
        fi
        MODO_WORKER="dry-run"
        shift
        ;;
      --sin-pausa|--no-pausa)
        PAUSAR=0
        shift
        ;;
      *)
        error "Opcion no reconocida: $1"
        mostrar_ayuda >&2
        return 1
        ;;
    esac
  done
}

expandir_ruta() {
  case "$1" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s\n' "$HOME/${1#\~/}" ;;
    /*) printf '%s\n' "$1" ;;
    *) return 1 ;;
  esac
}

validar_ruta_absoluta() {
  local ruta="$1"
  if [ -z "$ruta" ]; then
    error "La ruta no puede estar vacia."
    return 1
  fi
  case "$ruta" in
    /*) ;;
    *) error "La ruta debe ser absoluta (empieza con / o ~/): $ruta"; return 1 ;;
  esac
  case "/$ruta/" in
    */../*) error "La ruta no puede contener '..': $ruta"; return 1 ;;
  esac
  case "$ruta" in
    *$'\n'*) error "La ruta no puede contener saltos de linea."; return 1 ;;
  esac
  return 0
}

validar_valores() {
  case "$ESTACION" in
    ''|*[!A-Za-z0-9._-]*) error "FIRESYNC_STATION invalida: $ESTACION"; return 1 ;;
  esac
  case "$MAX_SESIONES" in
    [1-9]|[1-9][0-9]) ;;
    *) error "FIRESYNC_MAX_SESSIONS debe ser un entero entre 1 y 99: $MAX_SESIONES"; return 1 ;;
  esac
  case "$MODELO" in
    ''|*[[:space:]]*) error "FIRESYNC_MODEL invalido: $MODELO"; return 1 ;;
  esac
  case "$REPO_SLUG" in
    */*) ;;
    *) error "FIRESYNC_REPO debe tener formato propietario/repositorio."; return 1 ;;
  esac
  case "$REPO_SLUG" in
    *[!A-Za-z0-9._/-]*) error "FIRESYNC_REPO contiene caracteres no seguros."; return 1 ;;
  esac
  case "/$REPO_SLUG/" in
    */../*|*/./*) error "FIRESYNC_REPO contiene segmentos de ruta no permitidos."; return 1 ;;
  esac
  case "$MODELO" in
    opencode/*) ;;
    *) aviso "El modelo $MODELO no empieza por opencode/; este lanzador no configura respaldo de pago." ;;
  esac
  return 0
}

url_es_firesync() {
  local url="${1:-}"
  while [ "${url%/}" != "$url" ]; do
    url="${url%/}"
  done
  url="${url%.git}"
  case "$url" in
    https://github.com/joseulloa18/firesync) return 0 ;;
    git@github.com:joseulloa18/firesync) return 0 ;;
    ssh://git@github.com/joseulloa18/firesync) return 0 ;;
    *) return 1 ;;
  esac
}

remoto_es_firesync() {
  local repo="$1" url=""
  url="$(git -C "$repo" config --get remote.origin.url 2>/dev/null)" || return 1
  url_es_firesync "$url"
}

repo_valido() {
  local dir="$1" root="" real=""
  git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || return 1
  real="$(cd "$dir" 2>/dev/null && pwd -P)" || return 1
  root="$(cd "$root" 2>/dev/null && pwd -P)" || return 1
  [ "$root" = "$real" ] || return 1
  remoto_es_firesync "$dir"
}

validar_directorio_destino() {
  local dir="$1" root="" real=""
  validar_ruta_absoluta "$dir" || return 1
  if [ -e "$dir" ] && [ ! -d "$dir" ]; then
    error "La ruta existe y no es una carpeta: $dir"
    return 1
  fi
  if [ -d "$dir" ]; then
    if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || return 1
      real="$(cd "$dir" && pwd -P)"
      root="$(cd "$root" && pwd -P)"
      if [ "$root" != "$real" ]; then
        error "La carpeta esta dentro de otro repositorio git: $dir"
        return 1
      fi
      if ! remoto_es_firesync "$dir"; then
        error "La carpeta es un repositorio pero su origin no es $REPO_SLUG. No se modifica."
        return 1
      fi
      return 0
    fi
    if [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
      error "La carpeta existe, no esta vacia y no es un clon validado de $REPO_SLUG: $dir"
      error "Se conserva sin cambios. Elige otra carpeta o corrige su origin a mano."
      return 1
    fi
  fi
  return 0
}

resolver_repo() {
  local root="" destino="" entrada="" padre=""
  if root="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
    if ! remoto_es_firesync "$root"; then
      error "Este lanzador esta dentro de un repositorio cuyo origin no es $REPO_SLUG."
      error "No se modifica nada. Usa el clon oficial o corrige el remoto a mano."
      return 1
    fi
    REPO_DIR="$(cd "$root" && pwd -P)"
    return 0
  fi

  destino="${FIRESYNC_REPO_DIR:-}"
  if [ -z "$destino" ]; then
    if [ -d "$HOME/Documents" ]; then
      destino="$HOME/Documents/FIRESYNC"
    else
      destino="$HOME/FIRESYNC"
    fi
  fi

  if es_interactivo && [ -z "${FIRESYNC_REPO_DIR:-}" ]; then
    info ""
    info "No se detecto un clon de FIRESYNC cerca de este lanzador."
    read -r -p "Carpeta para clonar o reutilizar [$destino]: " entrada || true
    if [ -n "${entrada:-}" ]; then
      destino="$entrada"
    fi
  fi

  if ! destino="$(expandir_ruta "$destino")"; then
    error "Escribe una ruta absoluta o que empiece por ~/: $destino"
    return 1
  fi
  validar_ruta_absoluta "$destino" || return 1
  validar_directorio_destino "$destino" || return 1

  if [ ! -d "$destino" ] || [ -z "$(ls -A "$destino" 2>/dev/null)" ]; then
    padre="$(dirname "$destino")"
    if [ ! -d "$padre" ]; then
      info "Creando carpeta padre: $padre"
      if ! command mkdir -p "$padre"; then
        error "No se pudo crear la carpeta padre: $padre"
        return 1
      fi
    fi
    info "Clonando https://github.com/${REPO_SLUG}.git en $destino"
    if ! git clone --origin origin "https://github.com/${REPO_SLUG}.git" "$destino"; then
      error "No se pudo clonar. La carpeta existente se conserva sin borrar."
      return 1
    fi
  fi

  if ! repo_valido "$destino"; then
    error "La carpeta no quedo como un clon validado de $REPO_SLUG: $destino"
    return 1
  fi
  REPO_DIR="$(cd "$destino" && pwd -P)"
  return 0
}

refrescar_repo() {
  local repo="$1"
  if git -C "$repo" fetch origin; then
    info "origin actualizado sin tocar el arbol de trabajo."
  else
    aviso "No se pudo actualizar origin; se continua con la copia local."
  fi
  if [ -n "$(git -C "$repo" status --porcelain 2>/dev/null)" ]; then
    aviso "Hay cambios locales; se conservan. No se hace reset, checkout ni clean."
  fi
}

comprobar_git() {
  if ! command -v git >/dev/null 2>&1; then
    error "Falta git. Ejecuta: bash orquestacion/macos/preparar-entorno.sh"
    return 1
  fi
  info "git: $(git --version 2>/dev/null)"
}

version_node_ok() {
  local version="" mayor=""
  version="$(node --version 2>/dev/null)" || return 1
  [ -n "$version" ] || return 1
  case "$version" in
    v*) version="${version#v}" ;;
  esac
  mayor="${version%%.*}"
  case "$mayor" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$mayor" -ge 22 ]
}

comprobar_node() {
  if ! command -v node >/dev/null 2>&1; then
    error "Falta Node.js 22 o superior. Ejecuta: bash orquestacion/macos/preparar-entorno.sh"
    return 1
  fi
  if ! version_node_ok; then
    error "Node.js $(node --version 2>/dev/null || printf '?') es demasiado antiguo; se requiere >= 22."
    return 1
  fi
  info "node: $(node --version 2>/dev/null)"
}

comprobar_gh_comando() {
  if ! command -v gh >/dev/null 2>&1; then
    error "Falta GitHub CLI (gh). Ejecuta: bash orquestacion/macos/preparar-entorno.sh"
    return 1
  fi
  info "gh: $(gh --version 2>/dev/null | head -n 1)"
}

informar_cuenta_gh() {
  local login=""
  login="$(gh api user --jq .login 2>/dev/null || true)"
  if [ -z "$login" ]; then
    aviso "No se pudo leer el usuario de GitHub con 'gh api user'. No se leen secretos."
    return 0
  fi
  info "GitHub CLI: sesion de $login."
  if [ "$(minusculas "$login")" != "$(minusculas "$CUENTA_ESTACION")" ]; then
    aviso "La estacion esta registrada con $CUENTA_ESTACION; la cuenta activa es $login."
    aviso "Si corresponde, cambia de cuenta con: gh auth switch"
  fi
  return 0
}

comprobar_gh_autenticacion() {
  if gh auth status >/dev/null 2>&1; then
    informar_cuenta_gh
    return 0
  fi

  if [ "$MODO_WORKER" = "check" ]; then
    aviso "GitHub CLI no esta autenticado; --check continua para que el worker informe el estado."
    return 0
  fi

  aviso "GitHub CLI no esta autenticado."
  if confirmar "Ejecutar 'gh auth login' ahora en esta terminal?"; then
    if ! gh auth login; then
      aviso "gh auth login no termino correctamente."
    fi
  fi
  if gh auth status >/dev/null 2>&1; then
    informar_cuenta_gh
    return 0
  fi
  error "GitHub CLI sigue sin autenticacion. Ejecuta manualmente: gh auth login"
  error "Este lanzador nunca lee ni imprime tokens."
  return 1
}

comprobar_worker() {
  local repo="$1" worker="$2" branch=""
  if [ -f "$worker" ]; then
    return 0
  fi
  printf '\n' >&2
  printf 'No se encontro el trabajador distribuido:\n  %s\n\n' "$worker" >&2
  printf 'El worker se integra desde la sesion central y todavia no esta en esta copia.\n' >&2
  printf 'No se modifico ningun archivo.\n' >&2
  if git -C "$repo" cat-file -e "origin/main:orquestacion/worker/worker.mjs" 2>/dev/null; then
    printf 'origin/main ya contiene el worker, pero tu arbol de trabajo no.\n' >&2
    branch="$(git -C "$repo" symbolic-ref --short -q HEAD 2>/dev/null || true)"
    if [ "$branch" = "main" ] && [ -z "$(git -C "$repo" status --porcelain 2>/dev/null)" ]; then
      printf 'Con main limpio puedes avanzar sin reescribir historia:\n' >&2
      printf '  git -C "%s" merge --ff-only origin/main\n' "$repo" >&2
    else
      printf 'Actualiza tu rama con el flujo habitual del equipo; no se ejecuta ningun merge automatico.\n' >&2
    fi
  else
    printf 'Actualiza la copia cuando la integracion central publique el worker.\n' >&2
  fi
  printf '\n' >&2
  return 1
}

validar_work_root() {
  local wr="$1" repo="$2" repo_real="" wr_real=""
  validar_ruta_absoluta "$wr" || return 1
  if [ "$wr" = "/" ] || [ "$wr" = "$HOME" ]; then
    error "El work root no puede ser / ni tu carpeta personal: $wr"
    return 1
  fi
  repo_real="$(cd "$repo" 2>/dev/null && pwd -P)" || return 1
  if [ -d "$wr" ]; then
    wr_real="$(cd "$wr" 2>/dev/null && pwd -P)" || wr_real="$wr"
  else
    wr_real="$wr"
  fi
  case "$wr_real" in
    "$repo_real"|"$repo_real"/*)
      error "El work root no puede estar dentro del repositorio: $wr"
      return 1
      ;;
  esac
  return 0
}

resolver_work_root() {
  local repo="$1" wr="${FIRESYNC_WORK_ROOT:-}"
  if [ -z "$wr" ]; then
    if [ -d "$HOME/Documents" ]; then
      wr="$HOME/Documents/FIRESYNC-work"
    else
      wr="$HOME/FIRESYNC-work"
    fi
  fi
  if ! wr="$(expandir_ruta "$wr")"; then
    error "FIRESYNC_WORK_ROOT debe ser una ruta absoluta o empezar por ~/: $wr"
    return 1
  fi
  validar_work_root "$wr" "$repo" || return 1
  WORK_ROOT="$wr"
  return 0
}

preparar_work_root() {
  local wr="$1"
  if [ ! -e "$wr" ]; then
    info "Creando work root: $wr"
    if ! command mkdir -p "$wr"; then
      error "No se pudo crear el work root: $wr"
      return 1
    fi
  fi
  if [ ! -d "$wr" ]; then
    error "El work root no es una carpeta: $wr"
    return 1
  fi
  if [ ! -w "$wr" ]; then
    error "El work root no tiene permiso de escritura: $wr"
    return 1
  fi
  if [ -e "$wr/.git" ]; then
    aviso "El work root ya es un repositorio git; se usa tal cual, sin borrar nada."
  fi
}

comprobar_opencode() {
  local candidato="" version="" motivo=""
  if [ -n "${OPENCODE_BIN:-}" ]; then
    candidato="$OPENCODE_BIN"
  elif [ -n "${FIRESYNC_OPENCODE_BIN:-}" ]; then
    candidato="$FIRESYNC_OPENCODE_BIN"
  elif [ -x "$PREFIX_OPENCODE/node_modules/.bin/opencode2" ]; then
    candidato="$PREFIX_OPENCODE/node_modules/.bin/opencode2"
  elif [ -x "$PREFIX_OPENCODE/node_modules/.bin/opencode" ]; then
    candidato="$PREFIX_OPENCODE/node_modules/.bin/opencode"
  elif command -v opencode2 >/dev/null 2>&1; then
    candidato="$(command -v opencode2)"
  elif command -v opencode >/dev/null 2>&1; then
    candidato="$(command -v opencode)"
  fi

  if [ -z "$candidato" ] || [ ! -x "$candidato" ]; then
    error "No se encontro una CLI de OpenCode ejecutable."
    error "Instala la CLI oficial 2 en un prefijo privado (no toca Desktop):"
    error "  npm install --prefix \"$PREFIX_OPENCODE\" @opencode/cli@2.3.0"
    error "Luego revisa:"
    error "  \"$PREFIX_OPENCODE/node_modules/.bin/opencode2\" --version"
    error "  \"$PREFIX_OPENCODE/node_modules/.bin/opencode2\" --help"
    error "Alternativa manual si la CLI no es compatible: abre cada worktree en"
    error "OpenCode Desktop y pega el contexto del issue. No se degrada Desktop."
    return 1
  fi

  version="$("$candidato" --version 2>/dev/null || true)"
  if [ -z "$version" ]; then
    error "La CLI encontrada no respondio a --version: $candidato"
    error "No se usa un binario no verificado. Revisa la instalacion manual."
    return 1
  fi

  case "$version" in
    2.*|*" 2."*) ;;
    *)
      error "La CLI encontrada no es compatible con CLI 2: $version"
      error "Binario: $candidato"
      error "No se degrada OpenCode Desktop. Instala la CLI oficial 2.3.0 en:"
      error "  npm install --prefix \"$PREFIX_OPENCODE\" @opencode/cli@2.3.0"
      error "Fallback manual: abre los worktrees en OpenCode Desktop y pega el contexto."
      return 1
      ;;
  esac

  if ! "$candidato" --help >/dev/null 2>&1; then
    error "La CLI 2 encontrada no respondio a --help: $candidato"
    error "No se usa un binario no verificado. Revisa la instalacion manual."
    return 1
  fi

  PATH="$(dirname "$candidato"):$PATH"
  export PATH
  OPENCODE_BIN="$candidato"
  export OPENCODE_BIN
  info "OpenCode CLI 2 verificada: $OPENCODE_BIN ($version)"
  return 0
}

construir_argumentos() {
  ARGS_WORKER=(
    --station "$ESTACION"
    --max-sessions "$MAX_SESIONES"
    --once
    --repo "$REPO_SLUG"
    --work-root "$WORK_ROOT"
    --model "$MODELO"
  )
  case "$MODO_WORKER" in
    check) ARGS_WORKER+=(--check) ;;
    dry-run) ARGS_WORKER+=(--dry-run) ;;
  esac
}

main() {
  parsear_argumentos "$@"

  if [ "$MODO_AYUDA" = "1" ]; then
    mostrar_ayuda
    PAUSAR=0
    return 0
  fi

  asegurar_path_comun
  comprobar_git
  comprobar_node
  comprobar_gh_comando
  validar_valores

  resolver_repo
  refrescar_repo "$REPO_DIR"

  WORKER_PATH="$REPO_DIR/orquestacion/worker/worker.mjs"
  comprobar_worker "$REPO_DIR" "$WORKER_PATH"

  resolver_work_root "$REPO_DIR"
  preparar_work_root "$WORK_ROOT"

  comprobar_gh_autenticacion

  if ! comprobar_opencode; then
    case "$MODO_WORKER" in
      check|dry-run)
        aviso "Se continua con --$MODO_WORKER para que el worker informe el estado."
        ;;
      *)
        error "Configura la CLI 2 o usa el fallback manual de OpenCode Desktop."
        return 1
        ;;
    esac
  fi

  construir_argumentos

  info ""
  info "Repositorio: $REPO_DIR"
  info "Work root:   $WORK_ROOT"
  info "Estacion:    $ESTACION"
  info "Sesiones:    $MAX_SESIONES"
  info "Modelo:      $MODELO"
  if [ -n "${OPENCODE_BIN:-}" ]; then
    info "OPENCODE_BIN: $OPENCODE_BIN"
  fi
  info "Ejecutando orquestacion/worker/worker.mjs..."

  local estado=0
  (cd "$REPO_DIR" && node "$WORKER_PATH" "${ARGS_WORKER[@]}") || estado=$?
  if [ "$estado" -ne 0 ]; then
    error "El worker termino con codigo $estado."
    return "$estado"
  fi
  info "Worker completado."
  return 0
}

if [ "${BASH_SOURCE[0]:-}" = "$0" ]; then
  trap 'pausar_en_salida' EXIT
  main "$@"
fi
