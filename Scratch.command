#!/bin/bash
# Scratch launcher: ensure the local backend is up, then open the installed PWA.
# Double-click in Finder, or symlink it into ~/Applications and launch from there.
#
# The app to open is discovered: any Chromium-family app bundle whose
# CrAppModeShortcutURL points at this server (Chrome, Edge, Brave, Vivaldi, ...).
# Override it with SCRATCH_PWA_BUNDLE, either a bundle path or an identifier
# such as com.microsoft.edgemac.app.<id>.
set -uo pipefail

# Resolve the repo root even when this file is reached through a symlink.
src="${BASH_SOURCE[0]}"
while [ -L "$src" ]; do
  dir="$(cd -P "$(dirname "$src")" && pwd)"
  src="$(readlink "$src")"
  [[ "$src" = /* ]] || src="$dir/$src"
done
ROOT="$(cd -P "$(dirname "$src")" && pwd)"

PORT=4173
ORIGIN="http://127.0.0.1:$PORT"
HEALTH_URL="$ORIGIN/api/health"
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

app_url() {
  /usr/bin/plutil -extract CrAppModeShortcutURL raw "$1/Contents/Info.plist" 2>/dev/null
}

# Several browsers may have installed the same app; lowest rank wins.
app_rank() {
  local id
  id=$(/usr/bin/plutil -extract CrBundleIdentifier raw "$1/Contents/Info.plist" 2>/dev/null)
  case "$id" in
    com.google.Chrome*) printf '0\n' ;;
    com.microsoft.edgemac*) printf '1\n' ;;
    *) printf '2\n' ;;
  esac
}

find_pwa() {
  local app url root rank best="" best_rank=99
  while IFS= read -r app; do
    url="$(app_url "$app")" || continue
    case "${url%/}" in
      "$ORIGIN" | "http://localhost:$PORT") ;;
      *) continue ;;
    esac
    rank="$(app_rank "$app")"
    if [ "$rank" -lt "$best_rank" ]; then
      best="$app"
      best_rank="$rank"
    fi
  done < <(
    for root in "$HOME/Applications" /Applications; do
      [ -d "$root" ] && find "$root" -maxdepth 2 -name '*.app' -type d -prune
    done | LC_ALL=C sort
  )
  [ -n "$best" ] && printf '%s\n' "$best"
}

if [ -n "${SCRATCH_PWA_BUNDLE:-}" ] && [ ! -d "$SCRATCH_PWA_BUNDLE" ]; then
  echo "Opening $SCRATCH_PWA_BUNDLE"
  exec /usr/bin/open -b "$SCRATCH_PWA_BUNDLE"
fi

bundle="${SCRATCH_PWA_BUNDLE:-$(find_pwa)}"
if [ -n "$bundle" ]; then
  echo "Opening $bundle"
  /usr/bin/open "$bundle" || exit 1
else
  echo "No installed Scratch app found; opening $ORIGIN in the default browser." >&2
  echo "Install the page as an app from Chrome or Edge for a standalone window." >&2
  /usr/bin/open "$ORIGIN/" || exit 1
fi
