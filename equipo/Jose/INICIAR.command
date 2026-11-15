#!/usr/bin/env bash
set -euo pipefail
here="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
launcher="$here/../../orquestacion/macos/iniciar-firesync.command"
if [ ! -f "$launcher" ]; then
  launcher="$here/kit/orquestacion/macos/iniciar-firesync.command"
fi
if [ ! -f "$launcher" ]; then
  printf '%s\n' 'Descomprime todo el paquete FIRESYNC-Jose.zip antes de ejecutar.' >&2
  exit 1
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
tools="$HOME/.local/share/firesync/opencode-cli"
if command -v npm >/dev/null 2>&1; then
  if [ ! -x "$tools/node_modules/.bin/opencode2" ] || [ ! -x "$tools/node_modules/.bin/pnpm" ]; then
    printf '%s\n' 'Preparando el motor auxiliar de FIRESYNC (primer uso)...'
    npm install --prefix "$tools" --no-audit --no-fund @opencode/cli@2.3.0 pnpm@10.32.1
  fi
  export PATH="$tools/node_modules/.bin:$PATH"
fi
exec bash "$launcher" "$@"
