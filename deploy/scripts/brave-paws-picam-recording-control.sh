#!/usr/bin/env bash
set -euo pipefail

PICAM_HOST_ALIAS="${PICAM_HOST_ALIAS:-picam}"
PICAM_RTSP_URL="${PICAM_RTSP_URL:-rtsp://127.0.0.1:8554/live.stream}"
REMOTE_ROOT="${BRAVE_PAWS_PICAM_RECORDING_ROOT:-/home/harvey/.cache/brave-paws/session-recording}"
LOCAL_RECORDINGS_DIR="${BRAVE_PAWS_RECORDINGS_DIR:-${BRAVE_PAWS_DATA_DIR:-/mnt/q/fermi/brave-paws/data}/recordings}"
RECORDING_VIDEO_HEIGHT="${BRAVE_PAWS_RECORDING_VIDEO_HEIGHT:-540}"
RECORDING_VIDEO_BITRATE="${BRAVE_PAWS_RECORDING_VIDEO_BITRATE:-800k}"
RECORDING_VIDEO_MAXRATE="${BRAVE_PAWS_RECORDING_VIDEO_MAXRATE:-1000k}"
RECORDING_VIDEO_BUFSIZE="${BRAVE_PAWS_RECORDING_VIDEO_BUFSIZE:-1600k}"
RECORDING_AUDIO_BITRATE="${BRAVE_PAWS_RECORDING_AUDIO_BITRATE:-96k}"

usage() {
  cat <<'EOF'
Usage: brave-paws-picam-recording-control.sh <status|start|stop>

This command is intended to be called by the Brave Paws backend recording provider.
It manages a passive extra RTSP reader on `picam`, keeping the live HLS preview and
Icecast audio path untouched.

Expected environment from the Brave Paws server:
  BRAVE_PAWS_RECORDING_SESSION_ID
  BRAVE_PAWS_RECORDING_SESSION_DATE
  BRAVE_PAWS_RECORDING_SESSION_STATUS
  BRAVE_PAWS_RECORDING_DISPOSITION   save|discard
  BRAVE_PAWS_RECORDINGS_DIR          canonical local recordings dir on QUANTUM

Optional overrides:
  PICAM_HOST_ALIAS                   SSH host alias (default: picam)
  PICAM_RTSP_URL                     Source RTSP URL on picam (default: rtsp://127.0.0.1:8554/live.stream)
  BRAVE_PAWS_PICAM_RECORDING_ROOT    Remote working directory on picam
  BRAVE_PAWS_RECORDING_VIDEO_HEIGHT  Output height in px, preserving aspect ratio (default: 540)
  BRAVE_PAWS_RECORDING_VIDEO_BITRATE Target video bitrate (default: 800k)
  BRAVE_PAWS_RECORDING_VIDEO_MAXRATE Video VBV maxrate (default: 1000k)
  BRAVE_PAWS_RECORDING_VIDEO_BUFSIZE Video VBV bufsize (default: 1600k)
  BRAVE_PAWS_RECORDING_AUDIO_BITRATE AAC audio bitrate (default: 96k)
EOF
}

json_print() {
  python3 - <<'PY' "$@"
import json, sys
args = sys.argv[1:]
pairs = zip(args[0::2], args[1::2])
out = {}
for key, raw in pairs:
    if raw == '__NULL__':
        out[key] = None
    elif raw == '__TRUE__':
        out[key] = True
    elif raw == '__FALSE__':
        out[key] = False
    else:
        out[key] = raw
print(json.dumps(out))
PY
}

remote_exec() {
  local mode="$1"
  shift || true
  ssh "$PICAM_HOST_ALIAS" \
    REMOTE_ROOT="$REMOTE_ROOT" \
    PICAM_RTSP_URL="$PICAM_RTSP_URL" \
    BRAVE_PAWS_RECORDING_SESSION_ID="${BRAVE_PAWS_RECORDING_SESSION_ID:-}" \
    BRAVE_PAWS_RECORDING_SESSION_DATE="${BRAVE_PAWS_RECORDING_SESSION_DATE:-}" \
    BRAVE_PAWS_RECORDING_SESSION_STATUS="${BRAVE_PAWS_RECORDING_SESSION_STATUS:-}" \
    BRAVE_PAWS_RECORDING_DISPOSITION="${BRAVE_PAWS_RECORDING_DISPOSITION:-save}" \
    BRAVE_PAWS_RECORDING_VIDEO_HEIGHT="$RECORDING_VIDEO_HEIGHT" \
    BRAVE_PAWS_RECORDING_VIDEO_BITRATE="$RECORDING_VIDEO_BITRATE" \
    BRAVE_PAWS_RECORDING_VIDEO_MAXRATE="$RECORDING_VIDEO_MAXRATE" \
    BRAVE_PAWS_RECORDING_VIDEO_BUFSIZE="$RECORDING_VIDEO_BUFSIZE" \
    BRAVE_PAWS_RECORDING_AUDIO_BITRATE="$RECORDING_AUDIO_BITRATE" \
    'bash -s' -- "$mode" <<'EOF'
set -euo pipefail

MODE="${1:-status}"
ROOT="${REMOTE_ROOT:?}"
SESSION_ID="${BRAVE_PAWS_RECORDING_SESSION_ID:-}"
SESSION_DATE="${BRAVE_PAWS_RECORDING_SESSION_DATE:-}"
SESSION_STATUS="${BRAVE_PAWS_RECORDING_SESSION_STATUS:-}"
DISPOSITION="${BRAVE_PAWS_RECORDING_DISPOSITION:-save}"
RTSP_URL="${PICAM_RTSP_URL:?}"
VIDEO_HEIGHT="${BRAVE_PAWS_RECORDING_VIDEO_HEIGHT:-540}"
VIDEO_BITRATE="${BRAVE_PAWS_RECORDING_VIDEO_BITRATE:-800k}"
VIDEO_MAXRATE="${BRAVE_PAWS_RECORDING_VIDEO_MAXRATE:-1000k}"
VIDEO_BUFSIZE="${BRAVE_PAWS_RECORDING_VIDEO_BUFSIZE:-1600k}"
AUDIO_BITRATE="${BRAVE_PAWS_RECORDING_AUDIO_BITRATE:-96k}"
STATE_FILE="$ROOT/state.env"
SESSIONS_DIR="$ROOT/sessions"

mkdir -p "$ROOT" "$SESSIONS_DIR"

json_out() {
  python3 - <<'PY' "$@"
import json, sys
args = sys.argv[1:]
pairs = zip(args[0::2], args[1::2])
out = {}
for key, raw in pairs:
    if raw == '__NULL__':
        out[key] = None
    elif raw == '__TRUE__':
        out[key] = True
    elif raw == '__FALSE__':
        out[key] = False
    else:
        try:
            out[key] = json.loads(raw)
        except Exception:
            out[key] = raw
print(json.dumps(out))
PY
}

load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
  else
    STATE_SESSION_ID=""
    STATE_STARTED_AT=""
    STATE_SESSION_DATE=""
    STATE_PID=""
    STATE_SESSION_DIR=""
    STATE_MKV_PATH=""
    STATE_MP4_PATH=""
    STATE_LOG_PATH=""
    STATE_HAS_AUDIO="true"
  fi
}

write_state() {
  cat >"$STATE_FILE" <<STATE
STATE_SESSION_ID=${STATE_SESSION_ID@Q}
STATE_STARTED_AT=${STATE_STARTED_AT@Q}
STATE_SESSION_DATE=${STATE_SESSION_DATE@Q}
STATE_PID=${STATE_PID@Q}
STATE_SESSION_DIR=${STATE_SESSION_DIR@Q}
STATE_MKV_PATH=${STATE_MKV_PATH@Q}
STATE_MP4_PATH=${STATE_MP4_PATH@Q}
STATE_LOG_PATH=${STATE_LOG_PATH@Q}
STATE_HAS_AUDIO=${STATE_HAS_AUDIO@Q}
STATE
}

clear_state() {
  rm -f "$STATE_FILE"
}

session_result_path() {
  local session_id="$1"
  printf '%s\n' "$SESSIONS_DIR/$session_id/result.json"
}

write_session_result() {
  local session_id="$1"
  local payload="$2"
  local result_path
  local result_dir
  local temp_path
  result_path="$(session_result_path "$session_id")"
  result_dir="$(dirname "$result_path")"
  mkdir -p "$result_dir"
  temp_path="$result_dir/.result.$$.tmp"
  printf '%s\n' "$payload" >"$temp_path"
  mv -f "$temp_path" "$result_path"
}

print_saved_session_result() {
  local session_id="$1"
  if [[ -z "$session_id" ]]; then
    return 1
  fi

  local result_path
  result_path="$(session_result_path "$session_id")"
  if [[ ! -f "$result_path" ]]; then
    return 1
  fi

  cat "$result_path"
  return 0
}

is_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

probe_media_duration_seconds() {
  local media_path="$1"
  ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$media_path" | awk '{printf "%.0f", $1}' || true
}

is_valid_media_file() {
  local media_path="$1"
  [[ -s "$media_path" ]] && ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$media_path" >/dev/null 2>&1
}

terminate_recording_process() {
  local pid="$1"

  if [[ -z "$pid" ]] || ! is_pid_alive "$pid"; then
    return 0
  fi

  kill -INT "$pid" 2>/dev/null || true
  for _ in $(seq 1 120); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done

  kill -KILL "$pid" 2>/dev/null || true
  for _ in $(seq 1 10); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done

  echo "recording process failed to stop: $pid" >&2
  return 1
}

status_json() {
  load_state
  if [[ -n "$STATE_PID" ]] && is_pid_alive "$STATE_PID"; then
    json_out \
      key '"sessionRecording"' \
      label '"Session recording"' \
      provider '"command"' \
      supported __TRUE__ \
      canStart __TRUE__ \
      canStop __TRUE__ \
      active __TRUE__ \
      sessionId "\"$STATE_SESSION_ID\"" \
      detail __NULL__ \
      recording "$(python3 - <<'PY' "$STATE_SESSION_ID" "$STATE_STARTED_AT" "$STATE_HAS_AUDIO"
import json, sys
print(json.dumps({
  'status': 'recording',
  'sessionId': sys.argv[1],
  'startedAt': sys.argv[2] or None,
  'hasAudio': sys.argv[3].lower() == 'true',
  'detail': None,
}))
PY
)"
    return
  fi

  if [[ -f "$STATE_FILE" ]]; then
    json_out \
      key '"sessionRecording"' \
      label '"Session recording"' \
      provider '"command"' \
      supported __TRUE__ \
      canStart __TRUE__ \
      canStop __TRUE__ \
      active __FALSE__ \
      sessionId "\"$STATE_SESSION_ID\"" \
      detail '"A previous recording process is no longer running."' \
      recording "$(python3 - <<'PY' "$STATE_SESSION_ID" "$STATE_STARTED_AT"
import json, sys
print(json.dumps({
  'status': 'failed',
  'sessionId': sys.argv[1] or None,
  'startedAt': sys.argv[2] or None,
  'detail': 'A previous recording process is no longer running.',
}))
PY
)"
    return
  fi

  json_out \
    key '"sessionRecording"' \
    label '"Session recording"' \
    provider '"command"' \
    supported __TRUE__ \
    canStart __TRUE__ \
    canStop __TRUE__ \
    active __FALSE__ \
    sessionId __NULL__ \
    detail __NULL__ \
    recording __NULL__
}

start_recording() {
  load_state

  if [[ -z "$SESSION_ID" ]]; then
    echo 'session id is required' >&2
    exit 2
  fi

  if [[ -n "$STATE_PID" ]] && is_pid_alive "$STATE_PID"; then
    if [[ "$STATE_SESSION_ID" == "$SESSION_ID" ]]; then
      status_json
      return
    fi

    echo "another session is already recording: $STATE_SESSION_ID" >&2
    exit 1
  fi

  local session_dir="$SESSIONS_DIR/$SESSION_ID"
  local mkv_path="$session_dir/capture.mkv"
  local mp4_path="$session_dir/final.mp4"
  local log_path="$session_dir/ffmpeg.log"
  local result_path
  result_path="$(session_result_path "$SESSION_ID")"
  mkdir -p "$session_dir"
  rm -f "$mkv_path" "$mp4_path" "$result_path"

  local has_audio="false"
  if ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$RTSP_URL" 2>/dev/null | grep -q '^audio$'; then
    has_audio="true"
  fi

  local scale_filter
  scale_filter="scale=-2:${VIDEO_HEIGHT}:flags=lanczos"

  local pid
  pid="$({ nohup ffmpeg -nostdin -hide_banner -loglevel warning -rtsp_transport tcp -i "$RTSP_URL" -map 0:v:0 -map 0:a? -vf "$scale_filter" -c:v libx264 -preset veryfast -pix_fmt yuv420p -b:v "$VIDEO_BITRATE" -maxrate "$VIDEO_MAXRATE" -bufsize "$VIDEO_BUFSIZE" -c:a aac -b:a "$AUDIO_BITRATE" -f matroska "$mkv_path" >"$log_path" 2>&1 < /dev/null & echo $!; } )"
  sleep 1

  if ! kill -0 "$pid" 2>/dev/null; then
    echo 'recording process failed to start' >&2
    exit 1
  fi

  STATE_SESSION_ID="$SESSION_ID"
  STATE_STARTED_AT="$(date -Is)"
  STATE_SESSION_DATE="$SESSION_DATE"
  STATE_PID="$pid"
  STATE_SESSION_DIR="$session_dir"
  STATE_MKV_PATH="$mkv_path"
  STATE_MP4_PATH="$mp4_path"
  STATE_LOG_PATH="$log_path"
  STATE_HAS_AUDIO="$has_audio"
  write_state
  status_json
}

stop_recording() {
  load_state

  if [[ -z "$STATE_SESSION_ID" ]]; then
    if print_saved_session_result "$SESSION_ID"; then
      return
    fi
    status_json
    return
  fi

  if [[ -n "$SESSION_ID" && "$SESSION_ID" != "$STATE_SESSION_ID" ]]; then
    echo "active recording belongs to a different session: $STATE_SESSION_ID" >&2
    exit 1
  fi

  if ! terminate_recording_process "$STATE_PID"; then
    exit 1
  fi

  local stopped_at
  stopped_at="$(date -Is)"

  if [[ "$DISPOSITION" == 'discard' ]]; then
    rm -rf "$STATE_SESSION_DIR"
    local discarded_session_id="$STATE_SESSION_ID"
    local discarded_started_at="$STATE_STARTED_AT"
    local discarded_has_audio="$STATE_HAS_AUDIO"
    clear_state
    json_out \
      key '"sessionRecording"' \
      label '"Session recording"' \
      provider '"command"' \
      supported __TRUE__ \
      canStart __TRUE__ \
      canStop __TRUE__ \
      active __FALSE__ \
      sessionId "\"$discarded_session_id\"" \
      detail __NULL__ \
      recording "$(python3 - <<'PY' "$discarded_session_id" "$discarded_started_at" "$stopped_at" "$discarded_has_audio"
import json, sys
print(json.dumps({
  'status': 'discarded',
  'sessionId': sys.argv[1] or None,
  'startedAt': sys.argv[2] or None,
  'stoppedAt': sys.argv[3] or None,
  'hasAudio': sys.argv[4].lower() == 'true',
  'detail': None,
}))
PY
)"
    return
  fi

  local session_id="$STATE_SESSION_ID"
  local started_at="$STATE_STARTED_AT"
  local has_audio="$STATE_HAS_AUDIO"
  local mkv_path="$STATE_MKV_PATH"
  local mp4_path="$STATE_MP4_PATH"

  if [[ ! -s "$mkv_path" ]]; then
    clear_state
    json_out \
      key '"sessionRecording"' \
      label '"Session recording"' \
      provider '"command"' \
      supported __TRUE__ \
      canStart __TRUE__ \
      canStop __TRUE__ \
      active __FALSE__ \
      sessionId "\"$session_id\"" \
      detail '"Recording ended before media data was written."' \
      recording "$(python3 - <<'PY' "$session_id" "$started_at" "$stopped_at" "$has_audio"
import json, sys
print(json.dumps({
  'status': 'failed',
  'sessionId': sys.argv[1] or None,
  'startedAt': sys.argv[2] or None,
  'stoppedAt': sys.argv[3] or None,
  'hasAudio': sys.argv[4].lower() == 'true',
  'detail': 'Recording ended before media data was written.',
}))
PY
)"
    return
  fi

  if ! is_valid_media_file "$mkv_path"; then
    clear_state
    json_out \
      key '"sessionRecording"' \
      label '"Session recording"' \
      provider '"command"' \
      supported __TRUE__ \
      canStart __TRUE__ \
      canStop __TRUE__ \
      active __FALSE__ \
      sessionId "\"$session_id\"" \
      detail '"Recording ended with an unreadable capture file."' \
      recording "$(python3 - <<'PY' "$session_id" "$started_at" "$stopped_at" "$has_audio"
import json, sys
print(json.dumps({
  'status': 'failed',
  'sessionId': sys.argv[1] or None,
  'startedAt': sys.argv[2] or None,
  'stoppedAt': sys.argv[3] or None,
  'hasAudio': sys.argv[4].lower() == 'true',
  'detail': 'Recording ended with an unreadable capture file.',
}))
PY
)"
    return
  fi

  local remote_file="$mkv_path"
  local duration_seconds
  duration_seconds="$(probe_media_duration_seconds "$mkv_path")"
  local detail=""

  rm -f "$mp4_path"
  if ffmpeg -y -i "$mkv_path" -map 0 -c copy -movflags +faststart "$mp4_path" >>"$STATE_LOG_PATH" 2>&1; then
    if is_valid_media_file "$mp4_path"; then
      remote_file="$mp4_path"
      duration_seconds="$(probe_media_duration_seconds "$mp4_path")"
      rm -f "$mkv_path"
    else
      rm -f "$mp4_path"
      detail='MP4 finalization failed validation; saved MKV fallback.'
    fi
  else
    rm -f "$mp4_path"
    detail='MP4 finalization failed; saved MKV fallback.'
  fi

  local size_bytes
  size_bytes="$(stat -c '%s' "$remote_file")"
  local completed_payload
  completed_payload="$(json_out \
    key '"sessionRecording"' \
    label '"Session recording"' \
    provider '"command"' \
    supported __TRUE__ \
    canStart __TRUE__ \
    canStop __TRUE__ \
    active __FALSE__ \
    sessionId "\"$session_id\"" \
    detail "$(python3 - <<'PY' "$detail"
import json, sys
print(json.dumps(sys.argv[1] or None))
PY
)" \
    recording "$(python3 - <<'PY' "$session_id" "$started_at" "$stopped_at" "$has_audio" "$remote_file" "$duration_seconds" "$size_bytes" "$detail"
import json, sys
print(json.dumps({
  'status': 'completed',
  'sessionId': sys.argv[1] or None,
  'startedAt': sys.argv[2] or None,
  'stoppedAt': sys.argv[3] or None,
  'hasAudio': sys.argv[4].lower() == 'true',
  'remoteFilePath': sys.argv[5],
  'durationSeconds': int(sys.argv[6]) if sys.argv[6] else None,
  'sizeBytes': int(sys.argv[7]) if sys.argv[7] else None,
  'detail': sys.argv[8] or None,
}))
PY
)")"
  clear_state
  write_session_result "$session_id" "$completed_payload"
  echo "$completed_payload"
}

case "$MODE" in
  status) status_json ;;
  start) start_recording ;;
  stop) stop_recording ;;
  *) echo "Unknown mode: $MODE" >&2; exit 2 ;;
esac
EOF
}

extract_json_field() {
  local json="$1"
  local field="$2"
  python3 - <<'PY' "$json" "$field"
import json, sys
payload = json.loads(sys.argv[1])
field = sys.argv[2]
value = payload
for part in field.split('.'):
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None:
    sys.exit(1)
print(value)
PY
}

is_valid_local_media_file() {
  local media_path="$1"
  [[ -s "$media_path" ]] && ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$media_path" >/dev/null 2>&1
}

status_cmd() {
  remote_exec status
}

start_cmd() {
  remote_exec start
}

stop_cmd() {
  local remote_json session_id remote_file started_at relative_file destination_dir destination_path duration_seconds has_audio size_bytes recording_status remote_extension transfer_tmp detail
  remote_json="$(remote_exec stop)"

  if [[ "${BRAVE_PAWS_RECORDING_DISPOSITION:-save}" == 'discard' ]]; then
    echo "$remote_json"
    return
  fi

  recording_status="$(extract_json_field "$remote_json" 'recording.status' || true)"
  if [[ "$recording_status" != 'completed' ]]; then
    echo "$remote_json"
    return
  fi

  remote_file="$(extract_json_field "$remote_json" 'recording.remoteFilePath')"
  session_id="$(extract_json_field "$remote_json" 'recording.sessionId')"
  started_at="$(extract_json_field "$remote_json" 'recording.startedAt' || true)"
  duration_seconds="$(extract_json_field "$remote_json" 'recording.durationSeconds' || true)"
  has_audio="$(extract_json_field "$remote_json" 'recording.hasAudio' || true)"
  detail="$(extract_json_field "$remote_json" 'recording.detail' || true)"

  if [[ -z "$started_at" || "$started_at" == 'None' ]]; then
    destination_dir="$LOCAL_RECORDINGS_DIR/unknown-date"
  else
    destination_dir="$LOCAL_RECORDINGS_DIR/$(date -d "$started_at" '+%Y/%m/%d')"
  fi

  remote_extension="${remote_file##*.}"
  if [[ -z "$remote_extension" || "$remote_extension" == "$remote_file" ]]; then
    remote_extension='mp4'
  fi

  mkdir -p "$destination_dir"
  destination_path="$destination_dir/${session_id}.${remote_extension}"
  transfer_tmp="$(mktemp "/tmp/brave-paws-recording-${session_id}.XXXXXX.${remote_extension}")"
  trap "rm -f '$transfer_tmp'" RETURN

  scp -q "$PICAM_HOST_ALIAS:$remote_file" "$transfer_tmp"

  if ! is_valid_local_media_file "$transfer_tmp"; then
    python3 - <<'PY' "$remote_json"
import json, sys
payload = json.loads(sys.argv[1])
recording = payload.get('recording') or {}
recording['status'] = 'failed'
recording['detail'] = 'Transferred recording failed validation on QUARK; remote source kept on picam.'
payload['recording'] = recording
print(json.dumps(payload))
PY
    return
  fi

  cp -f "$transfer_tmp" "$destination_path"
  if ! is_valid_local_media_file "$destination_path"; then
    rm -f "$destination_path"
    cp -f "$transfer_tmp" "$destination_path"
  fi
  if ! is_valid_local_media_file "$destination_path"; then
    python3 - <<'PY' "$remote_json"
import json, sys
payload = json.loads(sys.argv[1])
recording = payload.get('recording') or {}
recording['status'] = 'failed'
recording['detail'] = 'Archive copy on QUARK failed validation; remote source kept on picam.'
payload['recording'] = recording
print(json.dumps(payload))
PY
    return
  fi

  ssh "$PICAM_HOST_ALIAS" "rm -rf $(printf '%q' "$(dirname "$remote_file")")" >/dev/null

  size_bytes="$(stat -c '%s' "$destination_path")"
  relative_file="$(python3 - <<'PY' "$LOCAL_RECORDINGS_DIR" "$destination_path"
import os, sys
print(os.path.relpath(sys.argv[2], sys.argv[1]).replace(os.sep, '/'))
PY
)"

  python3 - <<'PY' "$remote_json" "$relative_file" "$size_bytes" "$duration_seconds" "$has_audio" "$detail"
import json, sys
payload = json.loads(sys.argv[1])
recording = payload.get('recording') or {}
recording['relativeFilePath'] = sys.argv[2]
recording['sizeBytes'] = int(sys.argv[3]) if sys.argv[3] else recording.get('sizeBytes')
if sys.argv[4]:
    recording['durationSeconds'] = int(sys.argv[4])
if sys.argv[5]:
    recording['hasAudio'] = sys.argv[5].lower() == 'true'
if sys.argv[6]:
    recording['detail'] = sys.argv[6]
recording.pop('remoteFilePath', None)
payload['recording'] = recording
print(json.dumps(payload))
PY
}

main() {
  local command="${1:-}"
  case "$command" in
    status) status_cmd ;;
    start) start_cmd ;;
    stop) stop_cmd ;;
    -h|--help|help|'') usage ;;
    *)
      echo "Unknown command: $command" >&2
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
