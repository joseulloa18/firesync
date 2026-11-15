#!/bin/zsh
# Ejecutar con doble clic desde Finder, fuera de la sesión restringida del agente.
set -eu

cd -- "${0:A:h}"
# Preferir Node 24 del sistema; ~/.local/node puede conservar una versión vieja.
export PATH="/usr/local/bin:/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:$HOME/.local/node/bin:$PATH"

pause_on_exit() {
  local task_exit=$?
  trap - EXIT
  print
  if (( task_exit != 0 )); then
    print "La comprobación no terminó. Revisa el mensaje anterior."
  fi
  read -r "task_response?Pulsa Enter para cerrar esta ventana. "
  exit "$task_exit"
}
trap pause_on_exit EXIT

print "FIRESYNC — prueba de conexión con NASA FIRMS"
print "No se guardan detecciones ni se modifica la aplicación publicada."

if ! command -v node >/dev/null || ! command -v corepack >/dev/null; then
  print "Hace falta Node 24 LTS con Corepack para ejecutar esta comprobación."
  exit 1
fi

node --input-type=module -e '
  if (Number(process.versions.node.split(".")[0]) < 24) {
    console.error("Esta herramienta requiere Node 24 LTS o posterior.");
    process.exit(1);
  }
'
print "Usando Node $(node --version)."

node --env-file-if-exists=.env.local --input-type=module -e '
  if (!process.env.FIRMS_MAP_KEY?.trim()) {
    console.error("Guarda FIRMS_MAP_KEY en .env.local antes de continuar.");
    process.exit(1);
  }
  console.log("Clave local detectada; su valor no se muestra.");
'

print "Comprobando dependencias según el lockfile del proyecto..."
corepack pnpm install --frozen-lockfile

print "Consultando disponibilidad y una muestra de un día..."
node --env-file-if-exists=.env.local scripts/firms-smoke.mjs

print "Prueba completada. persisted=false indica que no se escribió en la base."
print "Puedes compartir el JSON de resultado; no compartas la clave ni .env.local."
