#!/usr/bin/env bash
# Install (or update) Varnish into your term-llm extensions directory.
#
#   ./install.sh                 # copy into ~/.config/term-llm/extensions/varnish
#   ./install.sh --enable        # ...and enable it on the running local server
#   TERM_LLM_EXTENSIONS_DIR=/path ./install.sh
#
# term-llm does not follow symlinked extension folders, so this copies the
# runtime files (it never touches your other extensions or extensions.yaml
# unless you pass --enable).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_ROOT="${TERM_LLM_EXTENSIONS_DIR:-$HOME/.config/term-llm/extensions}"
DEST="$DEST_ROOT/varnish"
QUIET=0
ENABLE=0
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --enable) ENABLE=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { [ "$QUIET" = 1 ] || echo "$@"; }

mkdir -p "$DEST/fonts"
FILES=(extension.yaml style.css main.js util.js thread.js composer.js palette.js notify.js favicon.js)
for f in "${FILES[@]}"; do cp "$HERE/$f" "$DEST/$f"; done
cp "$HERE"/fonts/*.woff2 "$HERE/fonts/OFL.txt" "$DEST/fonts/"
# Optional, untracked per-machine config (node default accents).
if [ -f "$HERE/local.json" ]; then cp "$HERE/local.json" "$DEST/local.json"; fi
# Remove files from older versions that are no longer shipped.
for f in "$DEST"/*.js; do
  name="$(basename "$f")"
  printf '%s\n' "${FILES[@]}" | grep -qx "$name" || rm -f "$f"
done

say "Installed Varnish to $DEST"

if [ "$ENABLE" = 1 ]; then
  args="$(ps -axo args | grep -E '^([^ ]*/)?term-llm serve( |$)' | head -1 || true)"
  tok="$(sed -n 's/.*--token \([^ ]*\).*/\1/p' <<<"$args")"
  port="$(sed -n 's/.*--port \([0-9]*\).*/\1/p' <<<"$args")"
  if [ -z "$args" ] || [ -z "$tok" ]; then
    say "No running 'term-llm serve' with --token found; enable it in Settings → Extensions."
    exit 0
  fi
  base="$(curl -fsSL -o /dev/null -w '%{url_effective}' "http://127.0.0.1:${port:-8080}/")"
  base="${base%/}"
  hdr=(-H "Authorization: Bearer $tok" -H 'Content-Type: application/json')
  status="$(curl -fsS -X POST "${hdr[@]}" -d '{}' "$base/admin/extensions/reload")"
  python3 - "$status" "$base" "$tok" <<'PY'
import json, sys, urllib.request
status, base, tok = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3]
enabled = status.get("enabled", [])
if "varnish" not in enabled:
    enabled.append("varnish")
req = urllib.request.Request(f"{base}/admin/extensions/config", method="POST",
    data=json.dumps({"enabled": enabled, "revision": status["config_revision"]}).encode(),
    headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
out = json.load(urllib.request.urlopen(req))
print("Enabled:", ", ".join(out.get("enabled", [])), "| errors:", out.get("errors") or "none")
PY
  say "Reload the web UI to see it."
else
  say "Next: open Settings → Extensions in the term-llm web UI and enable Varnish (or run ./install.sh --enable)."
fi
