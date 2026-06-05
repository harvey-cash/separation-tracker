#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${BRAVE_PAWS_REPO_ROOT:-$HOME/services/separation-tracker-live}"
REPO_SLUG="${BRAVE_PAWS_GITHUB_REPO:-harvey-cash/separation-tracker}"
SERVICE_NAME="${BRAVE_PAWS_SYSTEMD_SERVICE_NAME:-brave-paws.service}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/brave-paws"
STATE_FILE="$STATE_DIR/cd-sync-state.json"
HEALTHCHECK_URL="${BRAVE_PAWS_HEALTHCHECK_URL:-http://127.0.0.1:4310/separation/api/health}"
SYSTEMD_UNIT_SOURCE_REL="${BRAVE_PAWS_SYSTEMD_UNIT_SOURCE_REL:-deploy/systemd/brave-paws.live.service}"
SYSTEMD_UNIT_DEST="${BRAVE_PAWS_SYSTEMD_UNIT_DEST:-/etc/systemd/system/${SERVICE_NAME}}"
DRY_RUN=0
FORCE=0

usage() {
  cat <<'EOF'
Usage: sync-brave-paws-backend-to-latest-release.sh [--dry-run] [--force]

Updates the live QUARK backend checkout to the latest release tag produced by
separation-tracker CD on `main`, then rebuilds and restarts the backend service.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    --force)
      FORCE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

mkdir -p "$STATE_DIR"
cd "$REPO_ROOT"

if [[ ! -d .git ]]; then
  echo "Repo root is not a git checkout: $REPO_ROOT" >&2
  exit 1
fi

tracked_dirty="$(git status --porcelain --untracked-files=no)"
if [[ -n "$tracked_dirty" ]]; then
  echo "Refusing to sync with tracked local changes present in $REPO_ROOT" >&2
  git status --short --branch >&2
  exit 1
fi

git fetch origin --prune --tags

mapfile -t release_fields < <(git tag -l 'v*' | python3 -c 'import re, sys

def version_key(tag: str):
    m = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", tag.strip())
    if not m:
        return (-1, -1, -1)
    return tuple(int(part) for part in m.groups())

tags = [line.strip() for line in sys.stdin if line.strip()]
valid = [tag for tag in tags if version_key(tag) != (-1, -1, -1)]
if not valid:
    raise SystemExit(1)
latest = max(valid, key=version_key)
print(latest)
')
release_tag="${release_fields[0]:-}"

if [[ -z "$release_tag" ]]; then
  echo "Could not determine latest release tag for $REPO_SLUG" >&2
  exit 1
fi

release_id="$release_tag"
release_published_at="$(git log -1 --format=%cI "refs/tags/$release_tag")"

if ! desired_sha="$(git rev-parse -q --verify "refs/tags/$release_tag^{commit}")"; then
  echo "Latest release tag $release_tag is not available locally after fetch." >&2
  exit 1
fi

current_branch="$(git branch --show-current || true)"
current_sha="$(git rev-parse HEAD)"
service_state="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
last_release_id=""
if [[ -f "$STATE_FILE" ]]; then
  last_release_id="$(python3 - "$STATE_FILE" <<'PY'
import json, sys
try:
    with open(sys.argv[1], 'r', encoding='utf-8') as fh:
        data = json.load(fh)
    print(data.get('release_id', ''))
except Exception:
    print('')
PY
)"
fi

need_sync=0
if [[ "$FORCE" -eq 1 || "$current_branch" != "main" || "$current_sha" != "$desired_sha" || "$service_state" != "active" || "$last_release_id" != "$release_id" ]]; then
  need_sync=1
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  cat <<EOF
release_id=$release_id
release_tag=$release_tag
release_published_at=$release_published_at
desired_sha=$desired_sha
current_branch=$current_branch
current_sha=$current_sha
service_state=$service_state
last_release_id=$last_release_id
systemd_unit_source=$REPO_ROOT/$SYSTEMD_UNIT_SOURCE_REL
systemd_unit_dest=$SYSTEMD_UNIT_DEST
need_sync=$need_sync
EOF
  exit 0
fi

if [[ "$need_sync" -eq 0 ]]; then
  echo "Already synced to $release_tag ($desired_sha) with $SERVICE_NAME active."
  exit 0
fi

if [[ "$current_branch" != "main" ]]; then
  git switch main >/dev/null
fi

git reset --hard "$desired_sha"
install -D -m 0644 "$REPO_ROOT/$SYSTEMD_UNIT_SOURCE_REL" "$SYSTEMD_UNIT_DEST"
systemctl daemon-reload
npm ci
npm run build
systemctl restart "$SERVICE_NAME"
sleep 2
health_json="$(curl -fsS "$HEALTHCHECK_URL")"
health_version="$(printf '%s' "$health_json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("version", ""))')"
applied_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$STATE_FILE" <<PY
import json
from pathlib import Path
path = Path(${STATE_FILE@Q})
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({
  "release_id": ${release_id@Q},
  "release_tag": ${release_tag@Q},
  "release_published_at": ${release_published_at@Q},
  "desired_sha": ${desired_sha@Q},
  "health_version": ${health_version@Q},
  "applied_at": ${applied_at@Q}
}, indent=2) + "\n", encoding="utf-8")
PY

echo "Synced $SERVICE_NAME to $release_tag ($desired_sha); health version=$health_version"
