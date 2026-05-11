#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
SYSTEMD_DIR="$REPO_ROOT/deploy/systemd"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root (for example via sudo)." >&2
  exit 1
fi

install -m 0644 "$SYSTEMD_DIR/brave-paws-staging-refresh.service" /etc/systemd/system/brave-paws-staging-refresh.service
install -m 0644 "$SYSTEMD_DIR/brave-paws-staging-refresh.timer" /etc/systemd/system/brave-paws-staging-refresh.timer
systemctl daemon-reload
systemctl enable --now brave-paws-staging-refresh.timer
systemctl start brave-paws-staging-refresh.service
systemctl status brave-paws-staging-refresh.service --no-pager
systemctl status brave-paws-staging-refresh.timer --no-pager
