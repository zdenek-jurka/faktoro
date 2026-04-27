# Offline multi-device sync

This document describes the current online/offline synchronization
implementation across devices. It is not a target design. It documents the real
state of the application and server as of 2026-04-26.

## Goals

- The application remains offline-first: the primary storage is local
  WatermelonDB.
- Registered devices in the same instance exchange changes through the sync
  server.
- The server stores shared record state and the latest snapshot, while
  application-level conflicts are resolved locally in the client application.
- Manual snapshot backup/restore remains available next to incremental sync as a
  fallback.

## Local application state

Sync settings are stored in `config_storage` under the `device_sync.*` prefix.
Currently used values:

- `server_url`
- `instance_id`
- `device_id`
- `device_name`
- `auth_token`
- `is_registered`
- `auto_enabled`
- `feature_enabled`
- `instance_key`
- `allow_plaintext`

Local sync metadata:

- `sync_operation`
  - local overview of operations created during the WatermelonDB push phase,
  - used for diagnostics, retry counters, and maintenance,
  - not a separate server operation-log endpoint.
- `sync_conflict`
  - local conflict inbox,
  - stores local and remote payloads,
  - supports `pending`, `resolved`, and `applied` states.

## Registered sync tables

Incremental online sync currently includes:

- `app_settings`
- `currency_setting`
- `client`
- `client_address`
- `price_list_item`
- `client_price_override`
- `time_entry`
- `timesheet`
- `invoice`
- `invoice_item`
- `vat_code`
- `vat_rate`

The full snapshot additionally includes selected entries from `config_storage`.
The snapshot filters only safely shared configuration keys, for example
`registry.*` and `export_integrations.list`; `device_sync.*` is not included in
the snapshot.

## Record identity

The application does not use the historically proposed `<device_id>_<ulid>`
format. Records use the standard WatermelonDB `id`. The server only validates
that `record_id` is non-empty and contains allowed characters.

In practice, the system relies on uniqueness of locally generated IDs.
Insert/insert collisions are therefore not modeled as a separate server conflict.

## Pairing and device registration

Basic registration:

1. The application calls `POST /api/pairing/init` with a recovery e-mail, device
   name, and optional `instance_id`.
2. The server creates an instance or uses the existing one, creates a device with
   a one-time pairing token, and returns the pairing payload.
3. The application then calls `POST /api/devices/register-from-scan` with the
   same payload.
4. The server verifies the pairing token, marks the device as registered, stores
   the auth token hash, and returns the plaintext auth token to the client.
5. The server sends a recovery e-mail with the recovery payload.

Adding another device:

1. A registered device generates a PEM/QR payload `faktoro_add_device_v1`.
2. The payload contains `serverUrl`, `instanceId`, `allowPlaintext`, and also
   `instanceKey` when it exists.
3. The new device pastes or scans the payload and starts the regular pairing
   flow against the same instance.

Recovery:

1. The user pastes or scans the recovery payload.
2. The application calls `POST /api/devices/recover-from-code`.
3. The server verifies the recovery token, rotates the auth token and recovery
   token, and returns new credentials.
4. If a recovery bootstrap is stored for the instance, the server also returns
   `allow_plaintext` and optionally `instance_key`.

## Authentication

The server stores hashes of the auth token, pairing token, and recovery token.
For most sync endpoints the client sends `device_id` and `auth_token` in the JSON
body. Some endpoints and the WebSocket also use headers:

- `Authorization: Bearer <auth_token>`
- `X-Device-Id: <device_id>`

During authorization the server updates `last_seen_at` for both the device and
the instance.

## Incremental online sync

The client uses WatermelonDB `synchronize()`.

Pull:

- endpoint: `POST /api/sync/online/pull`
- input: `device_id`, `auth_token`, `last_pulled_at`
- the server returns changes from `online_records_shared`, where:
  - `last_modified_at > last_pulled_at`,
  - `source_device_id` is not the current device,
  - a record is `created` when `first_seen_at > last_pulled_at`,
  - otherwise it is `updated`,
  - deleted records are returned in `deleted`.

Push:

- endpoint: `POST /api/sync/online/push`
- input: `device_id`, `auth_token`, `last_pulled_at`, `changes`
- changes are grouped by table into `created`, `updated`, and `deleted`
- the server writes to `online_records_shared`
- for the same `instance_id`, `table_name`, and `record_id` combination,
  last-write-wins applies according to the incoming push timestamp
- after push the server creates an `online_push` event and publishes it through
  Postgres `LISTEN/NOTIFY`

The current server does not have `/api/sync/ops/push`, `/api/sync/ops/pull`, or
`/api/sync/conflicts/resolve` endpoints.

## Auto-sync

Automatic synchronization runs when:

- the sync feature is enabled,
- the device is registered,
- the server is available,
- `device_sync.auto_enabled` is not disabled.

Sync is triggered:

- when the hook starts,
- when the application returns to the foreground,
- after sync settings change,
- after a local change in synced tables with a `1200 ms` debounce,
- periodically every `30 s`,
- after a remote `online_push` event.

For remote events the client prefers WebSocket `GET /api/sync/events/ws`. If the
WebSocket does not work or does not connect in time, the client falls back to
polling `POST /api/sync/events/pull` every `5 s`.

## Snapshot backup/restore

Full snapshot backup exists next to incremental sync:

- `POST /api/sync/push` stores the latest instance snapshot in
  `sync_snapshots_shared`
- `POST /api/sync/pull` returns the latest snapshot
- restore locally performs `unsafeResetDatabase()` and recreates records from
  the snapshot
- sync device registration is preserved after restore

If `instanceKey` is available, the snapshot is encrypted with the same mechanism
as online records. If the instance runs in plaintext fallback mode, the server
accepts a plaintext snapshot.

## Conflicts

The server does not perform semantic or field-level merge. It stores the latest
known record state and overwrites the shared raw payload during push.

The client locally detects a conflict during pull as follows:

- for an incoming `updated` record, it finds the local record with the same ID,
- if the local record is not in `_status = synced`, it creates a local
  `sync_conflict`,
- it stores the local payload, remote payload, and the list of different fields,
- the UI in `sync-maintenance` allows the user to:
  - keep the local version,
  - use the remote version,
  - perform a field-level merge.

The current implementation does not model a server-side `delete/update` conflict
as a separate type. Deletion arrives as a WatermelonDB `deleted` change.

## Device management

Server endpoints:

- `GET /api/devices`
- `POST /api/devices/remove`
- `POST /api/devices/forget-registration`

Devices can be listed, and another device in the same instance can be removed.
The server does not allow removing the last registered device in an instance. A
complete registration forget deletes the whole instance and related server data.

## Server tables

Currently used server tables:

- `client_instances`
- `devices`
- `sync_snapshots_shared`
- `online_records_shared`
- `instance_recovery_bootstraps`
- `instance_sync_events`

The DB schema also contains `device_public_keys` and `instance_key_envelopes`,
but the current application does not use them and the server routes for
`/api/crypto/*` are not wired in `main.rs`.

## Known limitations

- The server uses last-write-wins and does not keep a server-side operation log.
- Local `sync_operation` is not a replay queue with its own push endpoint.
- Conflicts are detected only for incoming `updated` records.
- Field-level conflict resolution happens locally in the application, not on the
  server.
- The add-device payload can currently carry `instanceKey`; if the QR is
  rendered through server-side `/api/pair/qr`, the payload is sent to the server
  in a query parameter.
- OpenAPI in `../faktoro-server/openapi.yaml` also contains `/api/crypto/*`
  endpoints that are not wired in the current server routing.
