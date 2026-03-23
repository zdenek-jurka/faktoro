# Offline Multi-Device Sync with Conflict Resolution

## Goal
- Support multiple devices working offline at the same time.
- Preserve newly created records without collisions.
- Detect concurrent updates and present field-level conflict resolution UI.

## Record Identity Strategy
- Every newly created record ID must be globally unique.
- Recommended format: `<device_id>_<ulid>`.
- This prevents insert/insert collisions across devices.

## App-side Persistence (Prepared)
- `sync_operation` table (operation queue)
  - Tracks offline operations: insert/update/delete
  - Contains `op_id`, `table_name`, `record_id`, `operation_type`, `payload_json`, `base_version`, retry/sync metadata
- `sync_conflict` table (local conflict inbox)
  - Stores unresolved conflicts for UI
  - Includes base/local/remote payload snapshots and `conflicting_fields_json`

## Server-side Persistence (Prepared)
- `device_operations`
  - Idempotent operation ingestion via `op_id`
- `server_conflicts`
  - Persists pending/resolved conflicts
- `records_state`
  - Holds authoritative `record_version`, `updated_by_device`, `updated_at_ms`, delete marker

## Recommended API Contract
### POST `/api/sync/ops/push`
Request:
```json
{
  "device_id": "...",
  "auth_token": "...",
  "last_pulled_at": 1739277000000,
  "operations": [
    {
      "op_id": "deviceA_01J...",
      "table_name": "client",
      "record_id": "deviceA_01J...",
      "operation_type": "update",
      "payload": {"name": "New name"},
      "base_version": 7,
      "updated_at_ms": 1739277000000
    }
  ]
}
```
Response:
```json
{
  "accepted_op_ids": ["..."],
  "conflicts": [
    {
      "conflict_id": "uuid",
      "table_name": "client",
      "record_id": "...",
      "conflict_type": "update_update",
      "base_payload": {"name": "Old"},
      "local_payload": {"name": "New name"},
      "remote_payload": {"name": "Remote name"},
      "conflicting_fields": ["name"]
    }
  ]
}
```

### POST `/api/sync/ops/pull`
Request:
```json
{
  "device_id": "...",
  "auth_token": "...",
  "last_pulled_at": 1739277000000
}
```
Response:
```json
{
  "changes": {
    "client": {
      "created": [],
      "updated": [],
      "deleted": []
    }
  },
  "conflicts": [],
  "timestamp": 1739277200000
}
```

### POST `/api/sync/conflicts/resolve`
Request:
```json
{
  "device_id": "...",
  "auth_token": "...",
  "resolutions": [
    {
      "conflict_id": "uuid",
      "winner": "field_level",
      "resolution": {
        "name": "local",
        "vat_number": "remote"
      }
    }
  ]
}
```
Response:
```json
{ "resolved": ["uuid"] }
```

## Conflict Rules
- `insert/insert` with same id: should not happen with unique IDs; if occurs, suffix/rename strategy + conflict entry.
- `update/update`:
  - Auto-merge when fields do not overlap.
  - Queue conflict when same field differs.
- `delete/update`:
  - Always conflict in UI: choose restore-with-update vs keep-deleted.

## UI Flow (Prepared for implementation)
1. Sync banner in settings/home: `N unresolved conflicts`.
2. Conflict list screen:
   - Group by table/record.
3. Conflict detail screen:
   - For each conflicting field show base/local/remote.
   - Toggle winner per field.
   - Bulk actions: `All local`, `All remote`.
4. Save resolution:
   - Mark local `sync_conflict.status = resolved`.
   - Send to `/api/sync/conflicts/resolve`.
   - On success mark `applied`.

## Incremental Rollout Plan
1. Ship operation queue writes for all create/update/delete actions.
2. Introduce push/pull ops endpoints and keep snapshot backup untouched.
3. Start collecting conflicts into `sync_conflict`.
4. Add conflict UI and resolution endpoint.
5. Enable background online sync; keep snapshot as manual backup/restore fallback.
