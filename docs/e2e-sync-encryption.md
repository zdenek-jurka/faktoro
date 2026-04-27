# Sync encryption

This document describes the current encryption behavior for online sync and
snapshot backups. It is not the ideal end-to-end design. It documents the real
state of the application and `../faktoro-server` as of 2026-04-26.

## Short summary

The current implementation encrypts business payloads before sending them to the
server with a symmetric `instanceKey`. The server stores online records and
snapshots as encrypted JSON envelopes unless the instance is running in plaintext
fallback mode.

There is an important security limitation: the recovery flow stores the
`instanceKey` on the server in `instance_recovery_bootstraps`. The current state
is therefore not a strict E2E model against a compromised server or database
dump. It is client-side payload encryption with server-side key escrow for
recovery.

## Current implementation goals

- Avoid storing business data in server-side business columns.
- Keep the server sync transport simple and independent of the application
  schema.
- Allow device recovery without manual pairing by using the existing recovery
  payload.
- Preserve plaintext fallback for platforms without available secure
  cryptography.

## What is not implemented

- `XChaCha20-Poly1305`
- `Argon2id`
- `X25519` key exchange
- per-device asymmetric envelopes for the instance key
- storing the key in the OS Keychain/Keystore
- passphrase-wrapped recovery secret
- key rotation
- encrypted-only server mode without plaintext fallback

The server database schema contains `device_public_keys` and
`instance_key_envelopes`, and OpenAPI declares `/api/crypto/*`, but the
application does not use these flows and the `/api/crypto/*` routes are not
wired in the current `main.rs`.

## Crypto profile

Current algorithm:

- records: `AES-GCM` with a 256-bit key
- snapshot: `AES-GCM` with a 256-bit key
- IV: 12 random bytes
- key: base64 value of 32 bytes
- implementation:
  - Web Crypto `crypto.subtle`, when available,
  - fallback through `@noble/ciphers/aes`,
  - randomness through `crypto.getRandomValues` or `expo-crypto`.

The algorithm identifier in payloads is `aes-256-gcm`.

## Instance key

`instanceKey` is one symmetric key for the whole sync instance. The application:

- generates it during pairing when secure crypto exists and a key is not yet
  available,
- stores it locally in `config_storage` as `device_sync.instance_key`,
- uses it to encrypt online records and snapshots,
- can export it as a manual key backup payload.

Local storage is not OS-secure storage today. The key is stored in the local
database inside configuration storage. `device_sync.*` keys are not included in
snapshot backups.

## Online record payload

An encrypted record has this shape:

```json
{
  "id": "record_id",
  "_enc_v": 1,
  "_enc_alg": "aes-256-gcm",
  "_enc_iv": "base64...",
  "_enc_ct": "base64..."
}
```

The plaintext JSON of the original WatermelonDB raw record is encrypted as a
whole.

AAD is not stored in the payload. It is computed deterministically during
encryption and decryption:

```text
<instanceId>|<table>|<recordId>
```

During decryption the client verifies:

- version and algorithm,
- AES-GCM tag,
- that the decrypted `id` matches the envelope `id`.

## Snapshot payload

An encrypted snapshot has this shape:

```json
{
  "_enc_snapshot_v": 1,
  "_enc_snapshot_alg": "aes-256-gcm",
  "_enc_snapshot_iv": "base64...",
  "_enc_snapshot_ct": "base64..."
}
```

Snapshot AAD:

```text
<instanceId>|snapshot
```

## Plaintext fallback

If the platform does not have an available secure crypto API, the application
offers an explicit plaintext fallback during pairing. In that mode:

- `device_sync.allow_plaintext = true`
- `device_sync.instance_key` is empty
- online records and snapshots are sent as plaintext JSON
- the server accepts plaintext payloads when `_enc_v` or `_enc_snapshot_v` is
  missing or is `0`

If a device with a key encounters a plaintext payload during pull, the
application switches the instance locally into plaintext mode so compatibility
with older or unencrypted clients is not blocked.

The maintenance UI includes an action to switch back to encrypted mode. After
switching back, all devices in the same instance must support secure crypto and
share the same `instanceKey`.

## Server validation

For online push and snapshot push the server:

- sanitizes plaintext WatermelonDB metadata `_status` and `_changed`,
- checks required envelope fields for encrypted records,
- accepts only `_enc_v = 1` and `_enc_alg = "aes-256-gcm"`,
- accepts only `_enc_snapshot_v = 1` and
  `_enc_snapshot_alg = "aes-256-gcm"` for encrypted snapshots,
- does not decrypt ciphertext.

The server does not verify the AES-GCM tag or AAD because it is not expected to
perform regular payload decryption.

## Recovery bootstrap

After successful pairing the application calls:

```text
POST /api/sync/recovery-bootstrap
```

In encrypted mode it sends:

```json
{
  "device_id": "...",
  "auth_token": "...",
  "allow_plaintext": false,
  "instance_key": "base64..."
}
```

The server stores `instance_key` in the `instance_recovery_bootstraps` table.
During `POST /api/devices/recover-from-code` it returns the key to the client.

This simplifies recovery, but it means the recovery bootstrap is key escrow.
Without changing this flow, the system cannot claim that the server or a
database dump never has the material required for decryption.

## Add-device payload

A registered device generates a `faktoro_add_device_v1` payload. If it has a
local `instanceKey`, it includes it in the payload:

```json
{
  "kind": "faktoro_add_device_v1",
  "serverUrl": "https://...",
  "instanceId": "...",
  "instanceKey": "base64...",
  "allowPlaintext": false
}
```

The payload can be wrapped into PEM and shown as a QR code. Today the QR image
is generated through the server endpoint:

```text
GET /api/pair/qr?payload=...
```

If the payload contains `instanceKey`, the server receives it in the query
parameter while rendering the QR code. This is practical for the current pairing
flow, but it is not a strictly E2E-safe key exchange.

## Key backup payload

The maintenance UI can create a local key backup:

```json
{
  "kind": "faktoro_instance_key_backup_v1",
  "instanceId": "...",
  "key": "base64..."
}
```

During restore the user can paste either this JSON payload or the raw base64 key
value. The payload is not encrypted with a passphrase.

## Conflicts with encrypted data

The server does not perform field-level content comparison. It stores and
returns raw payloads.

After pull the client:

1. decrypts records,
2. passes them to WatermelonDB,
3. locally compares an incoming `updated` record with the locally edited
   version,
4. stores any conflict in `sync_conflict`.

Field-level merge is therefore a local client feature, not server logic.

## Actual threat model

The current state mainly prevents the sync server from routinely working with
plaintext business payloads in `online_records_shared` and
`sync_snapshots_shared`.

It does not fully protect against:

- device compromise,
- server database compromise when it contains
  `instance_recovery_bootstraps.instance_key`,
- server logs or proxy logs when a QR payload containing `instanceKey` passes
  through `/api/pair/qr`,
- a user sharing the key backup or add-device payload outside a trusted channel.

## What strict E2E would require

For real E2E protection against the server, the implementation would need to:

1. Stop sending `instanceKey` to the server in the recovery bootstrap.
2. Stop generating QR codes containing `instanceKey` through a server query
   parameter.
3. Store `instanceKey` in the OS Keychain/Keystore.
4. Implement per-device public keys and key envelopes in the application and
   server routes.
5. Handle recovery through a user-held recovery secret or trusted-device
   approval, not server-side key escrow.
6. After migration, reject plaintext payloads on the server for encrypted
   instances.
