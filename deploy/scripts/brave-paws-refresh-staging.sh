#!/usr/bin/env bash
set -euo pipefail

SOURCE_REPO="${BRAVE_PAWS_STAGING_SOURCE_REPO:-/mnt/q/repos/separation-tracker}"
STAGING_WORKTREE="${BRAVE_PAWS_STAGING_WORKTREE:-/mnt/q/repos/separation-tracker-staging}"
SERVICE_NAME="${BRAVE_PAWS_STAGING_SERVICE_NAME:-brave-paws.service}"
HEALTH_URL="${BRAVE_PAWS_STAGING_HEALTH_URL:-http://127.0.0.1:4310/separation/api/health}"
CAPABILITIES_URL="${BRAVE_PAWS_STAGING_CAPABILITIES_URL:-http://127.0.0.1:4310/separation/api/capabilities}"
RUN_AS_USER="${BRAVE_PAWS_STAGING_RUN_AS_USER:-harvey}"
ALLOW_DIRTY="${BRAVE_PAWS_STAGING_ALLOW_DIRTY:-0}"
FORCE=0

log() {
  printf '[brave-paws-staging] %s\n' "$*"
}

usage() {
  cat <<'EOF'
Usage: brave-paws-refresh-staging.sh [--force]

Refreshes the dedicated QUANTUM staging worktree from the local development repo's
latest committed HEAD, rebuilds Brave Paws there, installs the canonical staging
systemd unit from the staging worktree, restarts the live staging service, and
verifies health/capabilities.

By default, dirty uncommitted changes in the source repo are not deployed.
Set BRAVE_PAWS_STAGING_ALLOW_DIRTY=1 to override that safeguard.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This script must run as root (it installs systemd units and restarts ${SERVICE_NAME})." >&2
  exit 1
fi

if ! command -v runuser >/dev/null 2>&1; then
  echo "runuser is required but not available." >&2
  exit 1
fi

if ! id "$RUN_AS_USER" >/dev/null 2>&1; then
  echo "Configured staging user does not exist: $RUN_AS_USER" >&2
  exit 1
fi

if [[ ! -d "$SOURCE_REPO/.git" ]]; then
  echo "Source repo not found or not a git repo: $SOURCE_REPO" >&2
  exit 1
fi

export SOURCE_REPO STAGING_WORKTREE FORCE ALLOW_DIRTY
set +e
runuser -u "$RUN_AS_USER" -- env SOURCE_REPO="$SOURCE_REPO" STAGING_WORKTREE="$STAGING_WORKTREE" FORCE="$FORCE" ALLOW_DIRTY="$ALLOW_DIRTY" bash <<'EOS'
set -euo pipefail

SOURCE_REPO="${SOURCE_REPO:?}"
STAGING_WORKTREE="${STAGING_WORKTREE:?}"
FORCE="${FORCE:-0}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"

log() {
  printf '[brave-paws-staging:user] %s\n' "$*"
}

source_status="$(git -C "$SOURCE_REPO" status --porcelain)"
if [[ -n "$source_status" && "$ALLOW_DIRTY" != "1" ]]; then
  log "source repo has uncommitted changes; skipping deploy until a commit exists"
  exit 10
fi

source_rev="$(git -C "$SOURCE_REPO" rev-parse HEAD)"
source_branch="$(git -C "$SOURCE_REPO" rev-parse --abbrev-ref HEAD)"
current_rev=""
if git -C "$STAGING_WORKTREE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  current_rev="$(git -C "$STAGING_WORKTREE" rev-parse HEAD)"
fi

if [[ "$FORCE" != "1" && -n "$current_rev" && "$current_rev" == "$source_rev" ]]; then
  log "staging worktree already at ${source_rev}"
  exit 20
fi

mkdir -p "$(dirname "$STAGING_WORKTREE")"
if ! git -C "$STAGING_WORKTREE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "creating staging worktree at $STAGING_WORKTREE from $source_branch ($source_rev)"
  git -C "$SOURCE_REPO" worktree add --force --detach "$STAGING_WORKTREE" "$source_rev"
fi

log "resetting staging worktree to $source_branch ($source_rev)"
git -C "$STAGING_WORKTREE" reset --hard "$source_rev"
git -C "$STAGING_WORKTREE" clean -fdx

cd "$STAGING_WORKTREE"
log "installing dependencies"
npm ci
log "building Brave Paws staging"
npm run build
EOS
user_status=$?
set -e

if [[ $user_status -eq 10 ]]; then
  log "source repo is dirty; leaving staging on the last deployed commit"
  exit 0
fi

if [[ $user_status -ne 0 && $user_status -ne 20 ]]; then
  exit "$user_status"
fi

UNIT_SOURCE="$STAGING_WORKTREE/deploy/systemd/brave-paws.service"
UNIT_DEST="/etc/systemd/system/${SERVICE_NAME}"
needs_restart=1

if [[ -f "$UNIT_DEST" && -f "$UNIT_SOURCE" ]] && cmp -s "$UNIT_SOURCE" "$UNIT_DEST" && [[ $user_status -eq 20 ]]; then
  needs_restart=0
fi

if [[ ! -f "$UNIT_SOURCE" ]]; then
  echo "Canonical staging unit not found: $UNIT_SOURCE" >&2
  exit 1
fi

if [[ $needs_restart -eq 1 ]]; then
  log "installing canonical staging unit to $UNIT_DEST"
  install -m 0644 "$UNIT_SOURCE" "$UNIT_DEST"
  log "reloading systemd and restarting ${SERVICE_NAME}"
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"
else
  log "no code or unit change detected; leaving ${SERVICE_NAME} running"
fi

python3 - "$HEALTH_URL" "$CAPABILITIES_URL" <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request

health_url, capabilities_url = sys.argv[1:3]
last_error = None
health = None

for attempt in range(1, 13):
    try:
        with urllib.request.urlopen(health_url, timeout=10) as response:
            health = json.load(response)
        if health.get('status') != 'ok':
            raise RuntimeError(f"health check failed: {health!r}")
        break
    except (urllib.error.URLError, TimeoutError, RuntimeError, ConnectionError) as error:
        last_error = error
        time.sleep(5)
else:
    raise SystemExit(f"staging health check never became ready: {last_error}")

with urllib.request.urlopen(capabilities_url, timeout=10) as response:
    capabilities = json.load(response)

camera = capabilities.get('cameraStreaming') or {}
recording = capabilities.get('sessionRecording') or {}

if not camera.get('supported'):
    raise SystemExit(f"camera capability missing or unsupported: {camera!r}")
if not recording.get('supported'):
    raise SystemExit(f"recording capability missing or unsupported: {recording!r}")

print(json.dumps({
    'health': health.get('status'),
    'sessionCount': health.get('sessionCount'),
    'cameraProvider': camera.get('provider'),
    'recordingProvider': recording.get('provider'),
}, indent=2))
PY

log "staging refresh complete"
