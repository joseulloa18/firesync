#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/usr/local/bin:/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:$HOME/.local/node/bin:$PATH"

pause_on_exit() {
  local task_exit=$?
  trap - EXIT
  print
  if (( task_exit == 2 )); then
    print "La conexión funcionó, pero el esquema requiere revisión. No se aplicó ninguna migración."
  elif (( task_exit != 0 )); then
    print "La comprobación falló. No se escribió en la base de datos."
  fi
  read -r "task_response?Pulsa Enter para cerrar esta ventana. "
  exit "$task_exit"
}
trap pause_on_exit EXIT

print "FIRESYNC — comprobar Supabase con una transacción de solo lectura"
if ! command -v node >/dev/null || ! command -v corepack >/dev/null; then
  print "Hace falta Node 24 LTS con Corepack."
  exit 1
fi
node --input-type=module -e 'if(Number(process.versions.node.split(".")[0])<24){console.error("Hace falta Node 24 LTS.");process.exit(1)}'
node --env-file-if-exists=.env.local --input-type=module -e '
  if(!process.env.DATABASE_URL?.trim()){
    console.error("Configura DATABASE_URL en .env.local sin compartirla en chats.");
    process.exit(1);
  }
  console.log("Cadena local detectada; su valor no se muestra.");
'
corepack pnpm install --frozen-lockfile
node --env-file-if-exists=.env.local scripts/db-readonly-smoke.mjs
print "Comprobación terminada. No se consultaron filas privadas ni se ejecutaron escrituras."
