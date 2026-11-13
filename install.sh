#!/usr/bin/env bash
# links the plugin into the omarchy shell, adds a "Screensavers" launcher entry for the chooser
# and, the first time, makes the living cave the active screensaver
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
ID=eduardo.screensavers
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/omarchy-screensavers/config.json"
ENTRY="${XDG_DATA_HOME:-$HOME/.local/share}/applications/screensavers.desktop"

mkdir -p "$HOME/.config/omarchy/plugins" "$(dirname "$ENTRY")"
ln -sfn "$ROOT" "$HOME/.config/omarchy/plugins/$ID"

# the shell takes a moment to notice a new plugin folder, enabling it before that fails
enabled=false
for _ in 1 2 3 4 5 6 7 8; do
  omarchy-shell shell rescanPlugins >/dev/null 2>&1 || true
  if omarchy plugin enable "$ID" >/dev/null 2>&1; then
    enabled=true
    break
  fi
  sleep 1
done
if [[ $enabled != true ]]; then
  echo "could not enable $ID, is omarchy-shell running?" >&2
  exit 1
fi

cat >"$ENTRY" <<ENTRY
[Desktop Entry]
Version=1.0
Type=Application
Name=Screensavers
Comment=Pick the screensaver, or preview one
Exec=omarchy-shell shell toggle $ID
Icon=preferences-desktop-screensaver
Terminal=false
Categories=Settings;
Keywords=screensaver;idle;cave;maze;
ENTRY

[[ -s $CONFIG ]] || "$ROOT/bin/screensavers-apply" cave
echo "screensavers installed, open the chooser with: omarchy-shell shell toggle $ID"
