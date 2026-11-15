#!/usr/bin/env bash
# Pruebas de sintaxis y seguridad del lanzador macOS de FIRESYNC.
# No toca el repositorio real: todo ocurre en una carpeta temporal.

set -u

DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
COMMAND="$DIR/iniciar-firesync.command"
BOOTSTRAP="$DIR/preparar-entorno.sh"
BASH_BIN="${BASH:-bash}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/firesync-macos-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

TOTAL=0
FALLOS=0

pasa() { TOTAL=$((TOTAL + 1)); printf 'ok %d - %s\n' "$TOTAL" "$1"; }
falla() { TOTAL=$((TOTAL + 1)); FALLOS=$((FALLOS + 1)); printf 'not ok %d - %s\n' "$TOTAL" "$1"; }

assert_ok() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    pasa "$desc"
  else
    falla "$desc"
  fi
}

assert_falla() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    falla "$desc"
  else
    pasa "$desc"
  fi
}

# Carga las funciones del lanzador sin ejecutar main.
# shellcheck disable=SC1090
source "$COMMAND"
set +e
set +u
set +o pipefail

# Evita que una prueba mal construida clone por red en la carpeta del usuario.
git() {
  if [ "${1:-}" = "clone" ]; then
    printf 'TEST: git clone bloqueado para evitar efectos fuera de la carpeta temporal\n' >&2
    return 1
  fi
  command git "$@"
}

crear_repo() {
  local dir="$1" remoto="${2:-https://github.com/joseulloa18/firesync.git}"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "$remoto"
}

crear_fake_opencode() {
  local ruta="$1" version="$2" ayuda="$3"
  mkdir -p "$(dirname "$ruta")"
  cat >"$ruta" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "--version" ]; then
  printf '%s\n' "$version"
  exit 0
fi
if [ "\${1:-}" = "--help" ]; then
  exit $ayuda
fi
exit 0
EOF
  chmod +x "$ruta"
}

probar_url() {
  local desc="$1" url="$2" esperado="$3" obtenido=0
  if url_es_firesync "$url"; then obtenido=0; else obtenido=1; fi
  if [ "$obtenido" = "$esperado" ]; then
    pasa "$desc"
  else
    falla "$desc (esperado $esperado, obtenido $obtenido)"
  fi
}

probar_node() {
  local desc="$1" fake="$2" esperado="$3" obtenido=0
  if ( node() { printf '%s\n' "$fake"; }; version_node_ok ); then
    obtenido=0
  else
    obtenido=1
  fi
  if [ "$obtenido" = "$esperado" ]; then
    pasa "$desc"
  else
    falla "$desc (esperado $esperado, obtenido $obtenido)"
  fi
}

caso_reuse() {
  (
    SCRIPT_DIR="$TMP/reuse/orquestacion/macos"
    resolver_repo
    [ "$REPO_DIR" = "$(cd "$TMP/reuse" && pwd -P)" ]
  )
}

caso_mismatch() {
  (
    SCRIPT_DIR="$TMP/mismatch/orquestacion/macos"
    FIRESYNC_REPO_DIR="$TMP/mismatch"
    FIRESYNC_NO_INTERACTIVO=1
    resolver_repo
  )
}

caso_env_repo() {
  (
    SCRIPT_DIR="$TMP/standalone"
    FIRESYNC_REPO_DIR="$TMP/envrepo"
    FIRESYNC_NO_INTERACTIVO=1
    resolver_repo
    [ "$REPO_DIR" = "$(cd "$TMP/envrepo" && pwd -P)" ]
  )
}

caso_env_otro() {
  (
    SCRIPT_DIR="$TMP/standalone2"
    FIRESYNC_REPO_DIR="$TMP/otro"
    FIRESYNC_NO_INTERACTIVO=1
    resolver_repo
  )
}

caso_opencode_v2() {
  (
    OPENCODE_BIN="$TMP/bin/opencode2"
    PREFIX_OPENCODE="$TMP/prefix-vacio"
    comprobar_opencode
    [ "$OPENCODE_BIN" = "$TMP/bin/opencode2" ]
  )
}

caso_opencode_v1() {
  (
    OPENCODE_BIN="$TMP/bin-v1/opencode"
    PREFIX_OPENCODE="$TMP/prefix-vacio"
    comprobar_opencode
  )
}

caso_opencode_sin_ayuda() {
  (
    OPENCODE_BIN="$TMP/bin-sin-ayuda/opencode2"
    PREFIX_OPENCODE="$TMP/prefix-vacio"
    comprobar_opencode
  )
}

caso_opencode_ausente() {
  (
    OPENCODE_BIN=""
    FIRESYNC_OPENCODE_BIN=""
    PREFIX_OPENCODE="$TMP/prefix-vacio"
    PATH="$TMP/path-vacio"
    comprobar_opencode
  )
}

# --- Sintaxis -------------------------------------------------------------

for archivo in "$COMMAND" "$BOOTSTRAP" "$0"; do
  if "$BASH_BIN" -n "$archivo" >/dev/null 2>&1; then
    pasa "sintaxis bash valida: $(basename "$archivo")"
  else
    falla "sintaxis bash invalida: $(basename "$archivo")"
  fi
done

# --- URL del remoto -------------------------------------------------------

probar_url "acepta https sin .git" "https://github.com/joseulloa18/firesync" 0
probar_url "acepta https con .git" "https://github.com/joseulloa18/firesync.git" 0
probar_url "acepta https con barra final" "https://github.com/joseulloa18/firesync/" 0
probar_url "acepta SSH scp" "git@github.com:joseulloa18/firesync.git" 0
probar_url "acepta SSH url" "ssh://git@github.com/joseulloa18/firesync.git" 0
probar_url "rechaza otro propietario" "https://github.com/otro/firesync.git" 1
probar_url "rechaza otro host" "https://gitlab.com/joseulloa18/firesync.git" 1
probar_url "rechaza cadena vacia" "" 1

# --- Version de Node ------------------------------------------------------

probar_node "acepta Node 22" "v22.0.0" 0
probar_node "acepta Node 24" "v24.18.0" 0
probar_node "rechaza Node 21" "v21.9.9" 1
probar_node "rechaza version invalida" "garbage" 1
probar_node "rechaza version vacia" "" 1
if ( node() { return 127; }; version_node_ok ); then
  falla "rechaza node que falla"
else
  pasa "rechaza node que falla"
fi

# --- Rutas ----------------------------------------------------------------

(HOME="$TMP/home"; [ "$(expandir_ruta "~/a b")" = "$TMP/home/a b" ]) && pasa "expande ~/ con espacios" || falla "expande ~/ con espacios"
[ "$(expandir_ruta "/ruta con espacios")" = "/ruta con espacios" ] && pasa "conserva ruta absoluta con espacios" || falla "conserva ruta absoluta con espacios"
if expandir_ruta "relativa" >/dev/null 2>&1; then falla "rechaza ruta relativa"; else pasa "rechaza ruta relativa"; fi
if validar_ruta_absoluta "/tmp/../etc" >/dev/null 2>&1; then falla "rechaza .."; else pasa "rechaza .."; fi

# --- Carpetas de destino --------------------------------------------------

assert_ok "acepta carpeta inexistente" validar_directorio_destino "$TMP/nueva"
mkdir -p "$TMP/vacia"
assert_ok "acepta carpeta vacia" validar_directorio_destino "$TMP/vacia"

mkdir -p "$TMP/ajena"
printf 'importante\n' >"$TMP/ajena/archivo.txt"
assert_falla "rechaza carpeta no vacia sin git" validar_directorio_destino "$TMP/ajena"
if [ -f "$TMP/ajena/archivo.txt" ] && [ "$(cat "$TMP/ajena/archivo.txt")" = "importante" ]; then
  pasa "conserva archivo de carpeta ajena"
else
  falla "conserva archivo de carpeta ajena"
fi

crear_repo "$TMP/reuse"
mkdir -p "$TMP/reuse/orquestacion/macos"
assert_ok "acepta clon validado" validar_directorio_destino "$TMP/reuse"
assert_ok "reutiliza clon validado" caso_reuse

crear_repo "$TMP/mismatch" "https://github.com/otro/firesync.git"
mkdir -p "$TMP/mismatch/orquestacion/macos"
assert_falla "rechaza origin distinto" validar_directorio_destino "$TMP/mismatch"
assert_falla "no reutiliza origin distinto" caso_mismatch

assert_ok "reutiliza repo indicado por variable" caso_env_repo

mkdir -p "$TMP/otro"
printf 'no tocar\n' >"$TMP/otro/dato.txt"
assert_falla "rechaza repo indicado si no es clon" caso_env_otro
if [ -f "$TMP/otro/dato.txt" ]; then
  pasa "conserva datos del destino rechazado"
else
  falla "conserva datos del destino rechazado"
fi

crear_repo "$TMP/outer"
mkdir -p "$TMP/outer/sub"
assert_falla "rechaza carpeta vacia dentro de otro repo" validar_directorio_destino "$TMP/outer/sub"

crear_repo "$TMP/outer2"
crear_repo "$TMP/outer2/inner"
assert_ok "acepta repo propio anidado" validar_directorio_destino "$TMP/outer2/inner"

printf 'cambio local\n' >"$TMP/reuse/sucio.txt"
assert_ok "acepta repo validado con cambios locales" validar_directorio_destino "$TMP/reuse"
[ -f "$TMP/reuse/sucio.txt" ] && pasa "conserva cambios locales" || falla "conserva cambios locales"

# --- Worker ---------------------------------------------------------------

mkdir -p "$TMP/sinworker/orquestacion/worker"
salida="$(comprobar_worker "$TMP/sinworker" "$TMP/sinworker/orquestacion/worker/worker.mjs" 2>&1)"
estado=$?
if [ "$estado" -ne 0 ] && printf '%s\n' "$salida" | grep -q "No se encontro el trabajador distribuido"; then
  pasa "falla con mensaje util si falta el worker"
else
  falla "falla con mensaje util si falta el worker"
fi

printf '// worker de prueba\n' >"$TMP/sinworker/orquestacion/worker/worker.mjs"
assert_ok "acepta worker presente" comprobar_worker "$TMP/sinworker" "$TMP/sinworker/orquestacion/worker/worker.mjs"

# --- Argumentos del worker ------------------------------------------------

ESTACION="mac-jose"
MAX_SESIONES="2"
REPO_SLUG="joseulloa18/firesync"
WORK_ROOT="$TMP/work root con espacios"
MODELO="opencode/big-pickle"

MODO_WORKER=""
construir_argumentos
[ "${ARGS_WORKER[0]}" = "--station" ] && [ "${ARGS_WORKER[1]}" = "mac-jose" ] && pasa "pasa estacion" || falla "pasa estacion"
[ "${ARGS_WORKER[2]}" = "--max-sessions" ] && [ "${ARGS_WORKER[3]}" = "2" ] && pasa "pasa max-sessions" || falla "pasa max-sessions"
encontrado_once=0
encontrado_work=0
encontrado_check=0
i=0
while [ "$i" -lt "${#ARGS_WORKER[@]}" ]; do
  case "${ARGS_WORKER[$i]}" in
    --once) encontrado_once=1 ;;
    --work-root) valor_work="${ARGS_WORKER[$((i + 1))]}"; encontrado_work=1 ;;
    --check) encontrado_check=1 ;;
  esac
  i=$((i + 1))
done
[ "$encontrado_once" = "1" ] && pasa "pasa --once" || falla "pasa --once"
[ "$encontrado_work" = "1" ] && [ "$valor_work" = "$WORK_ROOT" ] && pasa "conserva work-root con espacios" || falla "conserva work-root con espacios"
[ "$encontrado_check" = "0" ] && pasa "no agrega --check por defecto" || falla "no agrega --check por defecto"

MODO_WORKER="check"
construir_argumentos
[ "${ARGS_WORKER[${#ARGS_WORKER[@]}-1]}" = "--check" ] && pasa "agrega --check" || falla "agrega --check"

MODO_WORKER="dry-run"
construir_argumentos
[ "${ARGS_WORKER[${#ARGS_WORKER[@]}-1]}" = "--dry-run" ] && pasa "agrega --dry-run" || falla "agrega --dry-run"

# --- Work root ------------------------------------------------------------

assert_falla "rechaza work root dentro del repo" validar_work_root "$TMP/reuse/sub" "$TMP/reuse"
assert_ok "acepta work root fuera del repo" validar_work_root "$TMP/work-fuera" "$TMP/reuse"
assert_falla "rechaza work root raiz" validar_work_root "/" "$TMP/reuse"
assert_falla "rechaza work root HOME" validar_work_root "$HOME" "$TMP/reuse"

# --- OpenCode CLI ---------------------------------------------------------

crear_fake_opencode "$TMP/bin/opencode2" "2.3.0" 0
assert_ok "acepta CLI 2.3.0 con --help" caso_opencode_v2

crear_fake_opencode "$TMP/bin-v1/opencode" "1.9.0" 0
assert_falla "rechaza CLI 1.x" caso_opencode_v1

crear_fake_opencode "$TMP/bin-sin-ayuda/opencode2" "2.3.0" 1
assert_falla "rechaza CLI 2 que falla --help" caso_opencode_sin_ayuda

mkdir -p "$TMP/prefix-vacio" "$TMP/path-vacio"
assert_falla "rechaza CLI ausente" caso_opencode_ausente

# --- Ayuda y errores ------------------------------------------------------

salida="$("$BASH_BIN" "$COMMAND" --help 2>&1)"
if [ $? -eq 0 ] && printf '%s\n' "$salida" | grep -q -- "--check"; then
  pasa "muestra ayuda sin ejecutar"
else
  falla "muestra ayuda sin ejecutar"
fi

if "$BASH_BIN" "$COMMAND" --opcion-invalida >/dev/null 2>&1; then
  falla "rechaza opcion desconocida"
else
  pasa "rechaza opcion desconocida"
fi

salida="$("$BASH_BIN" "$BOOTSTRAP" --help 2>&1)"
if [ $? -eq 0 ] && printf '%s\n' "$salida" | grep -q "preparacion manual"; then
  pasa "bootstrap muestra ayuda"
else
  falla "bootstrap muestra ayuda"
fi

# --- Seguridad de los scripts --------------------------------------------

patron_peligro='(^|[^A-Za-z0-9_])(rm[[:space:]]+-[A-Za-z]*[rf]|git[[:space:]]+(reset|clean|checkout|pull|push)|gh[[:space:]]+auth[[:space:]]+token|GH_TOKEN|GITHUB_TOKEN|hosts\.yml)'
if grep -nE "$patron_peligro" "$COMMAND" "$BOOTSTRAP" >/dev/null 2>&1; then
  falla "sin comandos destructivos ni lectura de secretos"
else
  pasa "sin comandos destructivos ni lectura de secretos"
fi

patron_codex='(^|[^A-Za-z0-9_])codex([[:space:]]|$)'
if grep -nEi "$patron_codex" "$COMMAND" "$BOOTSTRAP" >/dev/null 2>&1; then
  falla "no invoca Codex CLI"
else
  pasa "no invoca Codex CLI"
fi

# --- Bits ejecutables en git ---------------------------------------------

REPO_ROOT="$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$REPO_ROOT" ]; then
  for rel in "orquestacion/macos/iniciar-firesync.command" "orquestacion/macos/preparar-entorno.sh" "orquestacion/macos/probar-lanzador.sh"; do
    modo="$(git -C "$REPO_ROOT" ls-files -s -- "$rel" 2>/dev/null | awk '{print $1}')"
    if [ "$modo" = "100755" ]; then
      pasa "modo ejecutable en git: $(basename "$rel")"
    else
      falla "modo ejecutable en git: $(basename "$rel") (obtenido '${modo:-sin registrar}')"
    fi
  done
else
  falla "no se pudo ubicar el repositorio git para comprobar modos"
fi

printf '\n%d pruebas, %d fallos\n' "$TOTAL" "$FALLOS"
[ "$FALLOS" -eq 0 ]
