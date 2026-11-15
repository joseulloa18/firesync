#!/usr/bin/env bash
# FIRESYNC - diagnostico y guia manual de preparacion para macOS.
#
# Este script NO instala nada, NO inicia sesion y NO lee secretos. Solo revisa
# el entorno y muestra los comandos manuales que faltan. Ejecutalo antes del
# primer uso del lanzador:
#
#   bash orquestacion/macos/preparar-entorno.sh

set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PREFIX_OPENCODE="${FIRESYNC_OPENCODE_PREFIX:-$HOME/.local/share/firesync/opencode-cli}"
CUENTA_ESTACION="${FIRESYNC_GITHUB_ACCOUNT:-Josezx18}"
FALLOS=0

ok() { printf '[ok]    %s\n' "$*"; }
falta() { printf '[falta] %s\n' "$*"; FALLOS=$((FALLOS + 1)); }
aviso() { printf '[aviso] %s\n' "$*"; }
nota() { printf '[nota]  %s\n' "$*"; }

mostrar_ayuda() {
  cat <<'EOF'
FIRESYNC macOS - preparacion manual del entorno

Uso:
  bash preparar-entorno.sh

Revisa git, Node.js >= 22, GitHub CLI, autenticacion, identidad de git y la
CLI oficial de OpenCode. No instala ni modifica nada: imprime los comandos
manuales que debes ejecutar.

Variables:
  FIRESYNC_OPENCODE_PREFIX  Prefijo privado de la CLI (por defecto:
                            ~/.local/share/firesync/opencode-cli).
  FIRESYNC_GITHUB_ACCOUNT   Cuenta esperada de la estacion (Josezx18).

Despues de completar los pasos, ejecuta:
  ./iniciar-firesync.command --check
EOF
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

minusculas() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

detectar_repo() {
  local root=""
  if root="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
    printf '%s\n' "$root"
    return 0
  fi
  return 1
}

revisar_git() {
  if command -v git >/dev/null 2>&1; then
    ok "git: $(git --version 2>/dev/null)"
  else
    falta "git no esta instalado."
    nota "En macOS: xcode-select --install"
    nota "O con Homebrew: brew install git"
  fi
}

revisar_node() {
  if ! command -v node >/dev/null 2>&1; then
    falta "Node.js 22 o superior no esta instalado."
    nota "Con Homebrew: brew install node"
    nota "Con nvm: nvm install 22 && nvm use 22"
    return 0
  fi
  if version_node_ok; then
    ok "node: $(node --version 2>/dev/null)"
  else
    falta "Node.js $(node --version 2>/dev/null || printf '?') es antiguo; se requiere >= 22."
    nota "Con Homebrew: brew upgrade node"
    nota "Con nvm: nvm install 22 && nvm use 22"
  fi
  if command -v npm >/dev/null 2>&1; then
    ok "npm: $(npm --version 2>/dev/null)"
  else
    falta "npm no esta disponible; suele venir con Node.js."
  fi
}

revisar_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    falta "GitHub CLI (gh) no esta instalado."
    nota "Con Homebrew: brew install gh"
    return 0
  fi
  ok "gh: $(gh --version 2>/dev/null | head -n 1)"

  if gh auth status >/dev/null 2>&1; then
    ok "gh tiene una sesion iniciada."
    local login=""
    login="$(gh api user --jq .login 2>/dev/null || true)"
    if [ -n "$login" ]; then
      ok "Cuenta activa de GitHub: $login"
      if [ "$(minusculas "$login")" != "$(minusculas "$CUENTA_ESTACION")" ]; then
        aviso "Esta estacion esta registrada con $CUENTA_ESTACION."
        nota "Si corresponde: gh auth switch"
      fi
    fi
  else
    falta "gh no esta autenticado."
    nota "Ejecuta manualmente: gh auth login"
    nota "Comprueba despues con: gh auth status"
  fi
}

revisar_identidad_git() {
  local nombre="" correo=""
  nombre="$(git config --global user.name 2>/dev/null || true)"
  correo="$(git config --global user.email 2>/dev/null || true)"
  if [ -n "$nombre" ]; then
    ok "git user.name: $nombre"
  else
    falta "git user.name no esta configurado."
    nota "git config --global user.name \"Tu Nombre\""
  fi
  if [ -n "$correo" ]; then
    ok "git user.email configurado (valor omitido)."
  else
    falta "git user.email no esta configurado."
    nota "git config --global user.email \"tu@correo\""
  fi
}

revisar_opencode() {
  local bin="" version=""
  if [ -x "$PREFIX_OPENCODE/node_modules/.bin/opencode2" ]; then
    bin="$PREFIX_OPENCODE/node_modules/.bin/opencode2"
  elif [ -x "$PREFIX_OPENCODE/node_modules/.bin/opencode" ]; then
    bin="$PREFIX_OPENCODE/node_modules/.bin/opencode"
  elif command -v opencode2 >/dev/null 2>&1; then
    bin="$(command -v opencode2)"
  elif command -v opencode >/dev/null 2>&1; then
    bin="$(command -v opencode)"
  fi

  if [ -z "$bin" ]; then
    falta "No se encontro una CLI de OpenCode ejecutable."
    nota "Instala la CLI oficial 2.3.0 en un prefijo privado:"
    nota "  npm install --prefix \"$PREFIX_OPENCODE\" @opencode/cli@2.3.0"
    nota "Verifica:"
    nota "  \"$PREFIX_OPENCODE/node_modules/.bin/opencode2\" --version"
    nota "  \"$PREFIX_OPENCODE/node_modules/.bin/opencode2\" --help"
    nota "El lanzador detecta ese binario y exporta OPENCODE_BIN."
    return 0
  fi

  version="$("$bin" --version 2>/dev/null || true)"
  if [ -z "$version" ]; then
    falta "La CLI encontrada no respondio a --version: $bin"
    return 0
  fi
  case "$version" in
    2.*|*" 2."*|*" v2."*)
      if "$bin" --help >/dev/null 2>&1; then
        ok "OpenCode CLI 2 verificada: $bin ($version)"
      else
        falta "La CLI 2 no respondio a --help: $bin"
      fi
      ;;
    *)
      falta "La CLI encontrada no es compatible con CLI 2: $version"
      nota "Binario: $bin"
      nota "No se degrada OpenCode Desktop. Instala la CLI oficial 2.3.0:"
      nota "  npm install --prefix \"$PREFIX_OPENCODE\" @opencode/cli@2.3.0"
      ;;
  esac
}

revisar_desktop() {
  if [ -d "/Applications/OpenCode.app" ] || [ -d "$HOME/Applications/OpenCode.app" ]; then
    aviso "OpenCode Desktop esta instalado."
    nota "Desktop no permite abrir una sesion/worktree por enlace desde el worker."
    nota "El lanzador usa la CLI oficial y exporta OPENCODE_BIN."
    nota "Si la CLI 2 no es compatible, el fallback es manual: abre cada worktree"
    nota "en Desktop y pega el contexto del issue. No se degrada Desktop."
  else
    nota "OpenCode Desktop no esta en /Applications; la CLI oficial es la via principal."
  fi
}

revisar_worker() {
  local root="" worker=""
  if root="$(detectar_repo)"; then
    worker="$root/orquestacion/worker/worker.mjs"
    if [ -f "$worker" ]; then
      ok "worker presente: $worker"
    else
      aviso "El worker aun no esta en esta copia: $worker"
      nota "Llega con la integracion central. El lanzador fallara con un mensaje claro."
    fi
  else
    nota "No se detecto un clon del repositorio alrededor de este script."
  fi
}

main() {
  case "${1:-}" in
    --help|-h|--ayuda)
      mostrar_ayuda
      return 0
      ;;
  esac

  printf 'FIRESYNC macOS - preparacion manual del entorno\n'
  printf '================================================\n\n'

  if [ "$(uname -s 2>/dev/null || true)" != "Darwin" ]; then
    aviso "Este diagnostico esta pensado para macOS; se ejecuta igual para revisar."
  fi

  asegurar_path_comun
  revisar_git
  revisar_node
  revisar_gh
  revisar_identidad_git
  revisar_opencode
  revisar_desktop
  revisar_worker

  printf '\nResumen\n-------\n'
  if [ "$FALLOS" -eq 0 ]; then
    ok "No faltan dependencias obligatorias."
    nota "Siguiente paso: ./iniciar-firesync.command --check"
    return 0
  fi
  falta "Faltan $FALLOS comprobacion(es) obligatoria(s)."
  nota "Completa los comandos manuales de arriba y vuelve a ejecutar este script."
  nota "No se instalo ni modifico nada automaticamente."
  return 1
}

main "$@"
