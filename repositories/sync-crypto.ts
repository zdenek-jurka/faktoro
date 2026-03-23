import { gcm } from '@noble/ciphers/aes';
import * as ExpoCrypto from 'expo-crypto';

type RawRecord = Record<string, unknown>;

const ENC_VERSION = 1;
const ENC_ALGORITHM = 'aes-256-gcm';

type EncryptedRecord = {
  id: string;
  _enc_v: number;
  _enc_alg: string;
  _enc_iv: string;
  _enc_ct: string;
};

type EncryptedSnapshot = {
  _enc_snapshot_v: number;
  _enc_snapshot_alg: string;
  _enc_snapshot_iv: string;
  _enc_snapshot_ct: string;
};

function hasWebCrypto(): boolean {
  return !!globalThis.crypto?.subtle && !!globalThis.crypto?.getRandomValues;
}

function hasSecureRandomSource(): boolean {
  return !!globalThis.crypto?.getRandomValues || typeof ExpoCrypto.getRandomValues === 'function';
}

export function isSecureCryptoAvailable(): boolean {
  return hasWebCrypto() || hasSecureRandomSource();
}

function ensureCryptoAvailable(): void {
  if (!isSecureCryptoAvailable()) {
    throw new Error('Secure crypto API is unavailable on this platform');
  }
}

function fillRandomBytes(bytes: Uint8Array): void {
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return;
  }

  if (typeof ExpoCrypto.getRandomValues !== 'function') {
    throw new Error('Secure crypto random source is unavailable on this platform');
  }
  ExpoCrypto.getRandomValues(bytes);
}

function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Decode(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function ensureRecordId(raw: RawRecord): string {
  const id = raw.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('Record id is required for E2E encryption');
  }
  return id;
}

function ensureInstanceId(instanceId: string): string {
  if (!instanceId.trim()) {
    throw new Error('Instance ID is required for E2E encryption');
  }
  return instanceId.trim();
}

function aadForRecord(instanceId: string, table: string, recordId: string): Uint8Array {
  return new TextEncoder().encode(`${instanceId}|${table}|${recordId}`);
}

function aadForSnapshot(instanceId: string): Uint8Array {
  return new TextEncoder().encode(`${instanceId}|snapshot`);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(rawKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptAesGcm(
  plaintext: Uint8Array,
  keyBytes: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  if (hasWebCrypto()) {
    const key = await importAesKey(keyBytes);
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad),
      },
      key,
      toArrayBuffer(plaintext),
    );
    return new Uint8Array(ciphertext);
  }

  const cipher = gcm(keyBytes, iv, aad);
  return cipher.encrypt(plaintext);
}

async function decryptAesGcm(
  ciphertext: Uint8Array,
  keyBytes: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  if (hasWebCrypto()) {
    const key = await importAesKey(keyBytes);
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad),
      },
      key,
      toArrayBuffer(ciphertext),
    );
    return new Uint8Array(plaintext);
  }

  const cipher = gcm(keyBytes, iv, aad);
  return cipher.decrypt(ciphertext);
}

export function isEncryptedRecord(raw: RawRecord): raw is EncryptedRecord {
  return (
    typeof raw.id === 'string' &&
    typeof raw._enc_v === 'number' &&
    typeof raw._enc_alg === 'string' &&
    typeof raw._enc_iv === 'string' &&
    typeof raw._enc_ct === 'string'
  );
}

export function isEncryptedSnapshot(
  snapshot: Record<string, unknown>,
): snapshot is EncryptedSnapshot {
  return (
    typeof snapshot._enc_snapshot_v === 'number' &&
    typeof snapshot._enc_snapshot_alg === 'string' &&
    typeof snapshot._enc_snapshot_iv === 'string' &&
    typeof snapshot._enc_snapshot_ct === 'string'
  );
}

export function generateInstanceKey(): string {
  ensureCryptoAvailable();
  const keyBytes = new Uint8Array(32);
  fillRandomBytes(keyBytes);
  return base64Encode(keyBytes);
}

function isValidInstanceKeyFormat(instanceKeyB64: string): boolean {
  try {
    const keyBytes = base64Decode(instanceKeyB64);
    return keyBytes.length === 32;
  } catch {
    return false;
  }
}

export function buildInstanceKeyBackupPayload(instanceId: string, instanceKeyB64: string): string {
  if (!isValidInstanceKeyFormat(instanceKeyB64)) {
    throw new Error('Invalid E2E key format');
  }

  return JSON.stringify({
    kind: 'faktoro_instance_key_backup_v1',
    instanceId: instanceId.trim() || null,
    key: instanceKeyB64.trim(),
  });
}

export function parseInstanceKeyBackupPayload(input: string): {
  instanceId: string | null;
  key: string;
} {
  const raw = input.trim();
  if (!raw) {
    throw new Error('Key backup payload is empty');
  }

  if (isValidInstanceKeyFormat(raw)) {
    return { instanceId: null, key: raw };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid key backup payload format');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid key backup payload format');
  }

  const kind = (parsed as { kind?: unknown }).kind;
  const key = (parsed as { key?: unknown }).key;
  const instanceId = (parsed as { instanceId?: unknown }).instanceId;

  if (kind !== 'faktoro_instance_key_backup_v1' || typeof key !== 'string') {
    throw new Error('Invalid key backup payload format');
  }
  if (!isValidInstanceKeyFormat(key)) {
    throw new Error('Invalid E2E key format');
  }
  if (instanceId !== null && instanceId !== undefined && typeof instanceId !== 'string') {
    throw new Error('Invalid key backup payload format');
  }

  return {
    instanceId: typeof instanceId === 'string' && instanceId.trim() ? instanceId.trim() : null,
    key: key.trim(),
  };
}

export async function encryptRecord(
  raw: RawRecord,
  instanceKeyB64: string,
  instanceId: string,
  table: string,
): Promise<RawRecord> {
  ensureCryptoAvailable();
  const recordId = ensureRecordId(raw);
  const scopedInstanceId = ensureInstanceId(instanceId);

  const keyBytes = base64Decode(instanceKeyB64);
  if (keyBytes.length !== 32) {
    throw new Error('Invalid E2E key format');
  }

  const iv = new Uint8Array(12);
  fillRandomBytes(iv);

  const plaintext = new TextEncoder().encode(JSON.stringify(raw));
  const ciphertext = await encryptAesGcm(
    plaintext,
    keyBytes,
    iv,
    aadForRecord(scopedInstanceId, table, recordId),
  );

  return {
    id: recordId,
    _enc_v: ENC_VERSION,
    _enc_alg: ENC_ALGORITHM,
    _enc_iv: base64Encode(iv),
    _enc_ct: base64Encode(ciphertext),
  };
}

export async function decryptRecord(
  encrypted: RawRecord,
  instanceKeyB64: string,
  instanceId: string,
  table: string,
): Promise<RawRecord> {
  ensureCryptoAvailable();
  if (!isEncryptedRecord(encrypted)) {
    throw new Error('Encrypted payload is missing required fields');
  }
  if (encrypted._enc_v !== ENC_VERSION || encrypted._enc_alg !== ENC_ALGORITHM) {
    throw new Error('Unsupported encrypted payload format');
  }

  const scopedInstanceId = ensureInstanceId(instanceId);
  const keyBytes = base64Decode(instanceKeyB64);
  if (keyBytes.length !== 32) {
    throw new Error('Invalid E2E key format');
  }

  const iv = base64Decode(encrypted._enc_iv);
  const ciphertext = base64Decode(encrypted._enc_ct);

  const plaintext = await decryptAesGcm(
    ciphertext,
    keyBytes,
    iv,
    aadForRecord(scopedInstanceId, table, encrypted.id),
  );

  const raw = JSON.parse(new TextDecoder().decode(plaintext)) as RawRecord;
  if (typeof raw.id !== 'string' || raw.id !== encrypted.id) {
    throw new Error('Decrypted payload ID mismatch');
  }
  return raw;
}

export async function encryptSnapshot(
  snapshot: Record<string, unknown>,
  instanceKeyB64: string,
  instanceId: string,
): Promise<Record<string, unknown>> {
  ensureCryptoAvailable();
  const scopedInstanceId = ensureInstanceId(instanceId);
  const keyBytes = base64Decode(instanceKeyB64);
  if (keyBytes.length !== 32) {
    throw new Error('Invalid E2E key format');
  }

  const iv = new Uint8Array(12);
  fillRandomBytes(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = await encryptAesGcm(plaintext, keyBytes, iv, aadForSnapshot(scopedInstanceId));

  return {
    _enc_snapshot_v: ENC_VERSION,
    _enc_snapshot_alg: ENC_ALGORITHM,
    _enc_snapshot_iv: base64Encode(iv),
    _enc_snapshot_ct: base64Encode(ciphertext),
  };
}

export async function decryptSnapshot(
  encryptedSnapshot: Record<string, unknown>,
  instanceKeyB64: string,
  instanceId: string,
): Promise<Record<string, unknown>> {
  ensureCryptoAvailable();
  const scopedInstanceId = ensureInstanceId(instanceId);

  const encVersion = encryptedSnapshot._enc_snapshot_v;
  const encAlg = encryptedSnapshot._enc_snapshot_alg;
  const encIv = encryptedSnapshot._enc_snapshot_iv;
  const encCt = encryptedSnapshot._enc_snapshot_ct;

  if (
    encVersion !== ENC_VERSION ||
    encAlg !== ENC_ALGORITHM ||
    typeof encIv !== 'string' ||
    typeof encCt !== 'string'
  ) {
    throw new Error('Invalid encrypted snapshot payload');
  }

  const keyBytes = base64Decode(instanceKeyB64);
  if (keyBytes.length !== 32) {
    throw new Error('Invalid E2E key format');
  }
  const iv = base64Decode(encIv);
  const ciphertext = base64Decode(encCt);
  const plaintext = await decryptAesGcm(ciphertext, keyBytes, iv, aadForSnapshot(scopedInstanceId));

  return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;
}
