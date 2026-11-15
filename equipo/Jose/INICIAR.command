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
exec bash "$launcher" "$@"
