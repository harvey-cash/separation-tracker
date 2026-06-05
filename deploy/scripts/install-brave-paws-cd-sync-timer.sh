#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
UNIT_SOURCE="$REPO_ROOT/deploy/systemd/brave-paws-cd-sync.service"
TIMER_SOURCE="$REPO_ROOT/deploy/systemd/brave-paws-cd-sync.timer"
UNIT_DEST="/etc/systemd/system/brave-paws-cd-sync.service"
TIMER_DEST="/etc/systemd/system/brave-paws-cd-sync.timer"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root (for example via sudo)." >&2
  exit 1
fi

install -m 0644 "$UNIT_SOURCE" "$UNIT_DEST"
install -m 0644 "$TIMER_SOURCE" "$TIMER_DEST"
systemctl daemon-reload
systemctl enable --now brave-paws-cd-sync.timer
systemctl start brave-paws-cd-sync.service
systemctl status brave-paws-cd-sync.timer --no-pager

echo
echo "Installed: $TIMER_DEST"
echo "Service: $UNIT_DEST"
echo "Live repo: $HOME/services/separation-tracker-live"
