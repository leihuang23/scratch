#!/bin/bash
# Scratch launcher: ensure the local backend is up, then open the installed PWA.
# Double-click in Finder, or symlink it into ~/Applications and launch from there.
set -uo pipefail

# Resolve the repo root even when this file is reached through a symlink.
src="${BASH_SOURCE[0]}"
while [ -L "$src" ]; do
  dir="$(cd -P "$(dirname "$src")" && pwd)"
  src="$(readlink "$src")"
  [[ "$src" = /* ]] || src="$dir/$src"
done
ROOT="$(cd -P "$(dirname "$src")" && pwd)"

HEALTH_URL="http://127.0.0.1:4173/api/health"
PWA_BUNDLE_ID="com.google.Chrome.app.mobfckblkbpnblbfdlcpeglhccehnjmo"
PWA_APP="$HOME/Applications/Chrome Apps.localized/Scratch.app"
LOG="$HOME/.scratch-server/server.log"

# Loopback must bypass any system proxy, otherwise the check hits the proxy.
# Match the scratch payload too, so a foreign process on the port is not mistaken for ours.
healthy() {
  /usr/bin/curl --noproxy '*' -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null |
    grep -q '"runtime":"server"'
}

# Finder-launched shells can miss the node toolchain; cover the common locations.
export PATH="$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:$PATH"

if healthy; then
  echo "Scratch backend already running."
else
  npm_bin="$(command -v npm || true)"
  if [ -z "$npm_bin" ]; then
    echo "error: npm not found; install Node.js 18+ or add it to PATH." >&2
    exit 1
  fi

  mkdir -p "$(dirname "$LOG")"
  echo "Starting Scratch backend..."
  cd "$ROOT" || exit 1
  nohup "$npm_bin" run start >>"$LOG" 2>&1 &
  backend_pid=$!
  disown "$backend_pid" 2>/dev/null

  for _ in $(seq 1 60); do
    if healthy; then break; fi
    if ! kill -0 "$backend_pid" 2>/dev/null; then break; fi
    sleep 0.5
  done

  if ! healthy; then
    echo "error: backend did not become healthy at $HEALTH_URL" >&2
    echo "last log lines ($LOG):" >&2
    tail -n 20 "$LOG" >&2
    exit 1
  fi
  echo "Scratch backend ready (pid $backend_pid)."
fi

if ! /usr/bin/open -b "$PWA_BUNDLE_ID" 2>/dev/null; then
  /usr/bin/open "$PWA_APP" || exit 1
fi
