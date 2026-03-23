# End-to-End Encryption for Faktoro Sync

## Goal
- Ensure only end clients can read synced business data.
- Keep server-side sync orchestration (pairing, transport, fan-out, conflict transport), but never plaintext data.
- Preserve current online sync and snapshot backup capabilities with encrypted payloads.

## Non-Goals
- Server-side querying/reporting over business fields (not possible on ciphertext).
- Recovering data without user-controlled key material.
- "Transparent" encryption where server can still resolve field-level semantic conflicts.

## Threat Model
- Protect against database dump leakage and server operator access to data.
- Protect data in transit (TLS) and at rest (ciphertext in DB).
- Out of scope:
  - fully compromised client device
  - user sharing recovery secret intentionally
  - metadata leakage (table names, record IDs, timestamps) unless explicitly minimized

## High-Level Architecture
- App encrypts record payloads before sending to server.
- Server stores and relays only encrypted blobs.
- App decrypts pulled changes locally.
- Key material is generated and kept on clients; server stores only encrypted key envelopes if needed.

## Crypto Profile (Recommended)
- Symmetric data encryption: `XChaCha20-Poly1305` (AEAD).
- KDF for passphrase/recovery secret: `Argon2id`.
- Device key exchange / wrapping: `X25519` + `HKDF-SHA256` (or libsodium sealed boxes).
- Hashing/fingerprints: `SHA-256`.
- Randomness: CSPRNG from platform secure APIs.

## Key Hierarchy
- `IK` (Instance Key, 256-bit): master key for one client instance.
- `DK` (Device Key Pair): per-device asymmetric key pair for wrapping/unwrapping `IK`.
- `RK` (Recovery Key): key derived from user recovery passphrase or recovery payload secret.

Suggested usage:
- Business payload encryption uses `IK`.
- New device enrollment receives `IK` encrypted for that device using device public key.
- Recovery flow rehydrates `IK` using `RK`-protected envelope.

## Pairing and Device Enrollment (Updated)
1. App scans server bootstrap QR (`/api/pair/bootstrap`).
2. App requests pairing init (`/api/pairing/init`) with email/device name.
3. App creates or reuses device key pair.
4. App registers (`/api/devices/register-from-scan`) and uploads device public key.
5. If this is the first device in instance:
   - App generates `IK`.
   - App creates recovery package (email QR payload or passphrase-wrapped envelope).
6. If instance already has devices:
   - Existing trusted device approves and shares `IK` envelope for new device.
   - Server relays envelope but cannot decrypt it.

## Recovery Flow
- Email QR should not contain plaintext `IK`.
- Email QR should contain either:
  - encrypted `IK` envelope + metadata, or
  - one-time token to fetch encrypted envelope (still useless without recovery secret).
- Recovery endpoint restores access by proving possession of recovery secret and/or trusted device approval.

## Encrypted Sync Payload Format
For each record `raw`:
```json
{
  "id": "record_id",
  "_enc_v": 1,
  "_enc_alg": "xchacha20poly1305",
  "_enc_nonce": "base64...",
  "_enc_ct": "base64...",
  "_enc_aad": {
    "table": "client",
    "record_id": "record_id",
    "instance_id": "..."
  }
}
```

Notes:
- AAD binds ciphertext to table/record/instance to prevent swap attacks.
- Server must treat `_enc_*` fields as opaque and never parse plaintext model fields.

## Conflict Handling with E2E
- Server can detect structural conflicts (same record changed/deleted), but not semantic field differences.
- Recommended:
  - server marks conflict candidates by version/vector metadata only,
  - client decrypts both versions and performs field-level conflict UI.
- Existing `sync_conflict` local table remains the right place for user-facing conflict resolution.

## Server Changes
- Keep current endpoints, but treat record payloads as opaque encrypted blobs.
- Do not validate business schema of `raw` beyond required transport fields (`id` and encryption envelope keys, if enforced).
- Persist optional crypto metadata:
  - `instance_public_params` (algorithm/version policies)
  - per-device public keys
  - key envelopes (encrypted `IK` per device)

## App Changes
- Add crypto module abstraction:
  - `encryptRecord(table, recordId, plaintext, IK) -> encryptedRaw`
  - `decryptRecord(table, recordId, encryptedRaw, IK) -> plaintext`
- Hook encryption before `pushChanges`.
- Hook decryption after `pullChanges`, before applying to WatermelonDB.
- Store keys in OS-secure storage (Keychain/Keystore), not plain DB.

## Deployment Strategy (Encrypted-Only)
1. Enable encrypted payload contract from day one.
2. Reject plaintext writes on server immediately.
3. Keep a single payload format (`_enc_*`) across all clients.
4. Require key setup during pairing before first sync push.
5. Fail fast on missing/invalid encryption envelope fields.

## DB and Schema Notes
- App DB schema (`database.dbml`) remains mostly unchanged for business tables.
- Sync transport records (`online_records_shared.raw`) carry encrypted payload format.
- Add server tables for device keys / key envelopes (new migration).

## Operational Recommendations
- Keep TLS termination in reverse proxy (Traefik/Nginx/Caddy).
- Rotate tokens independently from encryption keys.
- Add key rotation plan for `IK` (versioned keys and lazy re-encryption).
- Log only metadata; never log ciphertext payload bodies at debug level in production.

## Testing Plan
- Unit tests:
  - encrypt/decrypt roundtrip
  - AAD mismatch rejection
  - wrong key and tampered ciphertext rejection
- Integration tests:
  - online push/pull with encrypted payloads
  - multi-device conflict detection + local resolution
  - recovery path from email payload
- Chaos tests:
  - out-of-order sync packets
  - duplicate deliveries
  - partial migration states (plaintext/encrypted mix)

## Implementation Backlog (Suggested)
1. Add crypto abstraction module in app (no endpoint change yet).
2. Add server support for device public keys and key envelopes.
3. Add encrypted payload validation contract (`_enc_v`, `_enc_alg`, `_enc_nonce`, `_enc_ct`).
4. Enforce encrypted-only writes for all instances.
5. Add strict startup check that disables sync if key material is missing.
6. Add key rotation and envelope refresh flows.

## Compatibility Decision
- New deployments: start directly in encrypted mode.
- Backward compatibility with plaintext sync is not required.
- Plaintext fallback is not supported.
