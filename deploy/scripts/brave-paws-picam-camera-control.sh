#!/usr/bin/env bash
set -euo pipefail

PICAM_PRIVACY_SCRIPT="${BRAVE_PAWS_PICAM_PRIVACY_SCRIPT:-$HOME/.openclaw/workspace/skills/picam-privacy-toggle/scripts/picam-privacy.sh}"

usage() {
  cat <<'EOF'
Usage: brave-paws-picam-camera-control.sh <status|enable|disable>

status   Print `on` when picam streaming is enabled, `off` when privacy mode is active.
enable   Re-enable picam streaming via the shared privacy-toggle skill.
disable  Disable picam streaming via the shared privacy-toggle skill.

Environment:
  BRAVE_PAWS_PICAM_PRIVACY_SCRIPT   Override the underlying picam privacy skill path.
  PICAM_HOST_ALIAS                  Optional host alias forwarded to the skill script.
EOF
}

require_skill_script() {
  if [[ ! -x "$PICAM_PRIVACY_SCRIPT" ]]; then
    echo "picam privacy script is missing or not executable: $PICAM_PRIVACY_SCRIPT" >&2
    exit 1
  fi
}

run_skill() {
  require_skill_script
  "$PICAM_PRIVACY_SCRIPT" "$@"
}

status_cmd() {
  local output privacy_mode
  output="$(run_skill status)"
  privacy_mode="$(awk -F= '/^privacy_mode=/{print $2; exit}' <<<"$output")"

  case "$privacy_mode" in
    off) echo on ;;
    on) echo off ;;
    *)
      echo "Unable to parse picam privacy status" >&2
      echo "$output" >&2
      exit 1
      ;;
  esac
}

main() {
  local command="${1:-}"
  case "$command" in
    status) status_cmd ;;
    enable) run_skill enable ;;
    disable) run_skill disable ;;
    -h|--help|help|'') usage ;;
    *)
      echo "Unknown command: $command" >&2
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
