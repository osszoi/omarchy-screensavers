#!/usr/bin/env bash
# hands the screensaver back to nvim if it is installed, to omarchy's own one otherwise
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
ID=eduardo.screensavers
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
ENTRY="${XDG_DATA_HOME:-$HOME/.local/share}/applications/screensavers.desktop"

if [[ -f $CONFIG_HOME/omarchy/plugins/eduardo.nvim-screensaver/config.json ]]; then
  "$ROOT/bin/screensavers-apply" nvim
else
  "$ROOT/bin/screensavers-apply" omarchy
fi

omarchy plugin disable "$ID" || true
if [[ -L $HOME/.config/omarchy/plugins/$ID ]]; then rm "$HOME/.config/omarchy/plugins/$ID"; fi
rm -f "$ENTRY"
rm -rf "$CONFIG_HOME/omarchy-screensavers"
echo "screensavers removed"
