# Brave Paws Streamer Loopback API

Brave Paws Streamer now separates into two layers:

1. A hosted UI deployed to `https://harvey.cash/separation/streamer/`
2. A local helper bound to `http://127.0.0.1:<port>`

The hosted page connects to the helper through a platform-agnostic loopback contract. The current implementation ships a Windows adapter behind that contract.

## Security Model

- The helper binds to loopback only.
- The helper validates browser `Origin` against the hosted streamer UI origin, plus any extra origins supplied via `STREAMER_ALLOWED_ORIGINS`.
- Every API request requires a per-launch session token.
- The helper opens the hosted UI with a hash fragment containing the loopback base URL and session token.

## Launch Parameters

The helper opens the hosted UI with a fragment like this:

```text
https://harvey.cash/separation/streamer/#loopback=http%3A%2F%2F127.0.0.1%3A4380&token=<launch-token>&platform=windows&protocol=1.0
```

## HTTP Endpoints

All authenticated requests accept the token through `x-brave-paws-session`, `Authorization: Bearer <token>`, or a `token` query parameter.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Unauthenticated manifest with protocol version, helper metadata, and the hosted UI launch URL. |
| `GET` | `/api/bootstrap` | Resolve dependency state, enumerate devices, and return the full loopback payload. |
| `GET` | `/api/status` | Return the current full loopback payload. |
| `POST` | `/api/refresh-devices` | Re-enumerate local capture devices and return the updated payload. |
| `POST` | `/api/start` | Start streaming with the selected devices and return the updated payload. |
| `POST` | `/api/stop` | Stop streaming and return the updated payload. |
| `GET` | `/api/events` | Server-sent events stream for state, log, and status updates. |

## Payload Shape

```json
{
  "protocolVersion": "1.0",
  "helper": {
    "name": "brave-paws-streamer",
    "platform": "windows",
    "version": "0.1.22",
    "apiBaseUrl": "http://127.0.0.1:4380",
    "uiUrl": "https://harvey.cash/separation/streamer/",
    "eventStreamUrl": "http://127.0.0.1:4380/api/events"
  },
  "session": {
    "launchToken": "<token>"
  },
  "api": {
    "bootstrap": "/api/bootstrap",
    "status": "/api/status",
    "refreshDevices": "/api/refresh-devices",
    "start": "/api/start",
    "stop": "/api/stop",
    "events": "/api/events"
  },
  "state": {
    "status": "idle",
    "preview": {
      "localUrl": "",
      "publicUrl": "",
      "pairingUrl": "",
      "qrCodeDataUrl": ""
    },
    "selection": {
      "video": "",
      "audio": ""
    },
    "dependencies": {
      "go2rtc": { "available": true, "path": "..." },
      "cloudflared": { "available": true, "path": "..." },
      "ffmpeg": { "available": true, "path": "..." }
    },
    "devices": {
      "video": [],
      "audio": [],
      "lastRefreshedAt": null
    },
    "logs": [],
    "error": null,
    "lastUpdatedAt": "2026-03-14T00:00:00.000Z"
  }
}
```

## Event Model

The helper emits server-sent events with JSON payloads.

| Event | Meaning |
|---|---|
| `hello` | Initial payload when the event stream is attached or bootstrap completes. |
| `state` | Generic full-state refresh. |
| `status` | State transition like `idle`, `bootstrapping`, `starting`, `running`, or `error`. |
| `devices` | Device enumeration update. |
| `log` | A new log line plus current state snapshot. |
| `error` | Machine-readable error payload plus current state snapshot. |

Every event includes helper metadata and the latest state snapshot so future helpers can reuse the same consumer logic even if their internal runtime differs.