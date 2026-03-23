import database from '@/db';
import { normalizeAppSettingsRecords } from '@/repositories/app-settings-singleton';
import {
  getDeviceSyncSettings,
  updateDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { gcm } from '@noble/ciphers/aes';
import * as ExpoCrypto from 'expo-crypto';
import type { DirtyRaw } from '@nozbe/watermelondb/RawRecord';

type RawRecord = Record<string, unknown>;
type FileSystemLegacyModule = typeof import('expo-file-system/legacy');

const BACKUP_KIND = 'faktoro_offline_backup_v1';
const BACKUP_VERSION = 1;
const BACKUP_AES_VERSION = 1;
const BACKUP_AES_ALGORITHM = 'aes-256-gcm';
const BACKUP_AAD = 'faktoro|offline-backup|v1';
const BACKUP_PBKDF2_ROUNDS = 210_000;
const BACKUP_FALLBACK_KDF_ROUNDS = 4_096;
const DEVICE_SYNC_CONFIG_PREFIX = 'device_sync.';
const INVOICE_LOGO_ASSET_KIND = 'invoice_logo_v1';

const BACKUP_TABLES = [
  'app_settings',
  'config_storage',
  'currency_setting',
  'client',
  'client_address',
  'price_list_item',
  'client_price_override',
  'time_entry',
  'vat_code',
  'vat_rate',
  'timesheet',
  'invoice',
  'invoice_item',
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

export type OfflineBackupSnapshot = {
  [K in BackupTable]: RawRecord[];
};

type BackupAsset = {
  kind: typeof INVOICE_LOGO_ASSET_KIND;
  fileName: string;
  mimeType: string;
  base64: string;
};

type OfflineBackupPlainPayload = {
  snapshot: OfflineBackupSnapshot;
  assets?: {
    invoiceLogo?: BackupAsset | null;
  };
};

type OfflineBackupEncryptedPayload = {
  v: typeof BACKUP_AES_VERSION;
  alg: typeof BACKUP_AES_ALGORITHM;
  kdf: 'pbkdf2-sha256' | 'iter-sha256';
  rounds: number;
  saltB64: string;
  ivB64: string;
  ctB64: string;
};

type OfflineBackupFile =
  | {
      kind: typeof BACKUP_KIND;
      version: typeof BACKUP_VERSION;
      createdAt: number;
      encrypted: false;
      payload: OfflineBackupPlainPayload;
    }
  | {
      kind: typeof BACKUP_KIND;
      version: typeof BACKUP_VERSION;
      createdAt: number;
      encrypted: true;
      payload: OfflineBackupEncryptedPayload;
    };

export type OfflineBackupInspection = {
  createdAt: number;
  encrypted: boolean;
};

export type CreatedOfflineBackup = {
  uri: string;
  fileName: string;
  encrypted: boolean;
};

export async function createOfflineBackupFile(options?: {
  password?: string | null;
}): Promise<CreatedOfflineBackup> {
  const createdAt = Date.now();
  const password = options?.password?.trim() || '';
  const snapshot = await createOfflineBackupSnapshot();
  const payload: OfflineBackupPlainPayload = {
    snapshot,
    assets: await collectOfflineBackupAssets(snapshot),
  };

  const backupFile: OfflineBackupFile = password
    ? {
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        createdAt,
        encrypted: true,
        payload: await encryptBackupPayload(payload, password),
      }
    : {
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        createdAt,
        encrypted: false,
        payload,
      };

  const fileName = buildBackupFileName(createdAt, !!password);
  const uri = await writeBackupFile(fileName, JSON.stringify(backupFile));
  return {
    uri,
    fileName,
    encrypted: !!password,
  };
}

export function inspectOfflineBackupContent(content: string): OfflineBackupInspection {
  const parsed = parseOfflineBackupFile(content);
  return {
    createdAt: parsed.createdAt,
    encrypted: parsed.encrypted,
  };
}

export async function restoreOfflineBackupContent(
  content: string,
  options?: { password?: string | null },
): Promise<void> {
  const parsed = parseOfflineBackupFile(content);
  const password = options?.password?.trim() || '';
  const payload = parsed.encrypted
    ? await decryptBackupPayload(parsed.payload, password)
    : parsed.payload;

  const preservedDeviceSettings = await getDeviceSyncSettings();
  let snapshot = normalizeOfflineBackupSnapshot(payload.snapshot);
  const restoredLogoUri = await restoreInvoiceLogoAsset(payload.assets?.invoiceLogo || null);
  snapshot = overrideSnapshotInvoiceLogoUri(snapshot, restoredLogoUri);

  await applyOfflineBackupSnapshot(snapshot);
  await updateDeviceSyncSettings(preservedDeviceSettings);
}

function parseOfflineBackupFile(content: string): OfflineBackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid backup file format.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file format.');
  }

  const candidate = parsed as Partial<OfflineBackupFile> & Record<string, unknown>;
  if (candidate.kind !== BACKUP_KIND || candidate.version !== BACKUP_VERSION) {
    throw new Error('Unsupported backup file version.');
  }
  if (typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)) {
    throw new Error('Backup file is missing creation metadata.');
  }
  if (typeof candidate.encrypted !== 'boolean') {
    throw new Error('Backup file is missing encryption metadata.');
  }
  if (!candidate.payload || typeof candidate.payload !== 'object') {
    throw new Error('Backup file payload is missing.');
  }

  if (candidate.encrypted) {
    const payload = candidate.payload as Partial<OfflineBackupEncryptedPayload>;
    if (
      payload.v !== BACKUP_AES_VERSION ||
      payload.alg !== BACKUP_AES_ALGORITHM ||
      (payload.kdf !== 'pbkdf2-sha256' && payload.kdf !== 'iter-sha256') ||
      typeof payload.rounds !== 'number' ||
      typeof payload.saltB64 !== 'string' ||
      typeof payload.ivB64 !== 'string' ||
      typeof payload.ctB64 !== 'string'
    ) {
      throw new Error('Backup file encryption payload is invalid.');
    }
  }

  return candidate as OfflineBackupFile;
}

async function createOfflineBackupSnapshot(): Promise<OfflineBackupSnapshot> {
  const snapshot: Partial<OfflineBackupSnapshot> = {};

  for (const table of BACKUP_TABLES) {
    const rows = await database.get(table).query().fetch();
    let rawRows = rows.map((row) => ({ ...((row as { _raw: DirtyRaw })._raw as RawRecord) }));

    if (table === 'app_settings') {
      rawRows = normalizeAppSettingsRecords(rawRows).map((raw) => ({
        ...raw,
        app_lock_enabled: false,
        app_lock_biometric_enabled: false,
      }));
    }

    if (table === 'config_storage') {
      rawRows = rawRows.filter((raw) => {
        const configKey = typeof raw.config_key === 'string' ? raw.config_key.trim() : '';
        return !configKey.startsWith(DEVICE_SYNC_CONFIG_PREFIX);
      });
    }

    snapshot[table] = rawRows;
  }

  return snapshot as OfflineBackupSnapshot;
}

function normalizeOfflineBackupSnapshot(
  snapshot: Partial<Record<BackupTable, unknown>>,
): OfflineBackupSnapshot {
  const normalized = {} as Partial<OfflineBackupSnapshot>;

  for (const table of BACKUP_TABLES) {
    const rows = Array.isArray(snapshot[table])
      ? (snapshot[table] as unknown[]).filter(
          (row): row is RawRecord => !!row && typeof row === 'object' && !Array.isArray(row),
        )
      : [];

    if (table === 'app_settings') {
      normalized[table] = normalizeAppSettingsRecords(rows).map((raw) => ({
        ...raw,
        app_lock_enabled: false,
        app_lock_biometric_enabled: false,
      }));
      continue;
    }

    if (table === 'config_storage') {
      normalized[table] = rows.filter((raw) => {
        const configKey = typeof raw.config_key === 'string' ? raw.config_key.trim() : '';
        return !configKey.startsWith(DEVICE_SYNC_CONFIG_PREFIX);
      });
      continue;
    }

    normalized[table] = rows;
  }

  return normalized as OfflineBackupSnapshot;
}

async function collectOfflineBackupAssets(
  snapshot: OfflineBackupSnapshot,
): Promise<OfflineBackupPlainPayload['assets']> {
  const invoiceLogo = await readInvoiceLogoAsset(snapshot);
  return invoiceLogo ? { invoiceLogo } : undefined;
}

async function readInvoiceLogoAsset(snapshot: OfflineBackupSnapshot): Promise<BackupAsset | null> {
  const settingsRow = snapshot.app_settings[0];
  const logoUri =
    typeof settingsRow?.invoice_logo_uri === 'string' ? settingsRow.invoice_logo_uri : '';
  const trimmedLogoUri = logoUri.trim();
  if (!trimmedLogoUri.startsWith('file://')) {
    return null;
  }

  try {
    const fs = getLegacyFileSystem();
    const info = await fs.getInfoAsync(trimmedLogoUri);
    if (!info.exists) {
      return null;
    }

    const extension = inferFileExtension(trimmedLogoUri) || 'png';
    const base64 = await fs.readAsStringAsync(trimmedLogoUri, {
      encoding: fs.EncodingType?.Base64 ?? 'base64',
    });

    return {
      kind: INVOICE_LOGO_ASSET_KIND,
      fileName: `logo.${extension}`,
      mimeType: getMimeTypeFromExtension(extension),
      base64,
    };
  } catch {
    return null;
  }
}

async function restoreInvoiceLogoAsset(asset: BackupAsset | null): Promise<string | null> {
  if (!asset || asset.kind !== INVOICE_LOGO_ASSET_KIND || !asset.base64?.trim()) {
    return null;
  }

  const storage = await getInvoiceAssetStorage();
  if (!storage) return null;

  const { fs, targetDir } = storage;
  await clearStoredLogoFiles(fs, targetDir);

  const extension =
    inferFileExtension(asset.fileName) || getFileExtensionFromMimeType(asset.mimeType) || 'png';
  const targetUri = `${targetDir}/logo.${extension}`;
  await fs.writeAsStringAsync(targetUri, asset.base64, {
    encoding: fs.EncodingType?.Base64 ?? 'base64',
  });
  return targetUri;
}

function overrideSnapshotInvoiceLogoUri(
  snapshot: OfflineBackupSnapshot,
  invoiceLogoUri: string | null,
): OfflineBackupSnapshot {
  return {
    ...snapshot,
    app_settings: snapshot.app_settings.map((row) => ({
      ...row,
      invoice_logo_uri: invoiceLogoUri || null,
      app_lock_enabled: false,
      app_lock_biometric_enabled: false,
    })),
  };
}

async function applyOfflineBackupSnapshot(snapshot: OfflineBackupSnapshot): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();

    const operations = BACKUP_TABLES.flatMap((table) => {
      const rows = snapshot[table] || [];
      const collection = database.get(table);
      return rows.map((raw) => collection.prepareCreateFromDirtyRaw(raw as DirtyRaw));
    });

    if (operations.length > 0) {
      await database.batch(...operations);
    }
  });
}

async function encryptBackupPayload(
  payload: OfflineBackupPlainPayload,
  password: string,
): Promise<OfflineBackupEncryptedPayload> {
  if (!password.trim()) {
    throw new Error('Backup password is required.');
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const salt = await getRandomBytes(16);
  const iv = await getRandomBytes(12);
  const kdf =
    typeof globalThis.crypto?.subtle?.deriveBits === 'function' ? 'pbkdf2-sha256' : 'iter-sha256';
  const rounds = kdf === 'pbkdf2-sha256' ? BACKUP_PBKDF2_ROUNDS : BACKUP_FALLBACK_KDF_ROUNDS;
  const key = await derivePasswordKey(password, salt, kdf, rounds);
  const ciphertext = await encryptAesGcm(plaintext, key, iv);

  return {
    v: BACKUP_AES_VERSION,
    alg: BACKUP_AES_ALGORITHM,
    kdf,
    rounds,
    saltB64: base64Encode(salt),
    ivB64: base64Encode(iv),
    ctB64: base64Encode(ciphertext),
  };
}

async function decryptBackupPayload(
  payload: OfflineBackupEncryptedPayload,
  password: string,
): Promise<OfflineBackupPlainPayload> {
  if (!password.trim()) {
    throw new Error('Backup password is required.');
  }

  try {
    const salt = base64Decode(payload.saltB64);
    const iv = base64Decode(payload.ivB64);
    const ciphertext = base64Decode(payload.ctB64);
    const key = await derivePasswordKey(password, salt, payload.kdf, payload.rounds);
    const plaintext = await decryptAesGcm(ciphertext, key, iv);
    const decoded = new TextDecoder().decode(plaintext);
    const parsed = JSON.parse(decoded) as OfflineBackupPlainPayload;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.snapshot ||
      typeof parsed.snapshot !== 'object'
    ) {
      throw new Error('Backup payload is invalid.');
    }

    return {
      snapshot: normalizeOfflineBackupSnapshot(parsed.snapshot),
      assets: parsed.assets,
    };
  } catch {
    throw new Error('Unable to decrypt backup. Check the password and try again.');
  }
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array,
  kdf: OfflineBackupEncryptedPayload['kdf'],
  rounds: number,
): Promise<Uint8Array> {
  if (kdf === 'pbkdf2-sha256' && typeof globalThis.crypto?.subtle?.deriveBits === 'function') {
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: toArrayBuffer(salt),
        iterations: rounds,
        hash: 'SHA-256',
      },
      keyMaterial,
      256,
    );
    return new Uint8Array(bits);
  }

  let current = `${base64Encode(salt)}:${password}`;
  for (let index = 0; index < rounds; index += 1) {
    current = await ExpoCrypto.digestStringAsync(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      `${index}:${password}:${current}`,
    );
  }
  return hexToBytes(current);
}

async function encryptAesGcm(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const aad = new TextEncoder().encode(BACKUP_AAD);

  if (typeof globalThis.crypto?.subtle?.encrypt === 'function') {
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      toArrayBuffer(key),
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad),
      },
      cryptoKey,
      toArrayBuffer(plaintext),
    );
    return new Uint8Array(ciphertext);
  }

  return gcm(key, iv, aad).encrypt(plaintext);
}

async function decryptAesGcm(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const aad = new TextEncoder().encode(BACKUP_AAD);

  if (typeof globalThis.crypto?.subtle?.decrypt === 'function') {
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      toArrayBuffer(key),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad),
      },
      cryptoKey,
      toArrayBuffer(ciphertext),
    );
    return new Uint8Array(plaintext);
  }

  return gcm(key, iv, aad).decrypt(ciphertext);
}

async function writeBackupFile(fileName: string, content: string): Promise<string> {
  const fs = getLegacyFileSystem();
  const baseDirectory = fs.cacheDirectory || fs.documentDirectory;
  if (!baseDirectory) {
    throw new Error('Backup storage is unavailable on this device.');
  }

  const backupDirectory = `${baseDirectory}offline-backups`;
  const info = await fs.getInfoAsync(backupDirectory);
  if (!info.exists) {
    await fs.makeDirectoryAsync(backupDirectory, { intermediates: true });
  }

  const targetUri = `${backupDirectory}/${fileName}`;
  await fs.writeAsStringAsync(targetUri, content);
  return targetUri;
}

function buildBackupFileName(createdAt: number, encrypted: boolean): string {
  const date = new Date(createdAt);
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const suffix = encrypted ? 'enc' : 'plain';
  return `faktoro-backup-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${suffix}.json`;
}

async function getRandomBytes(length: number): Promise<Uint8Array> {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  return ExpoCrypto.getRandomBytesAsync(length);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64Decode(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  const result = new Uint8Array(Math.floor(normalized.length / 2));
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

function inferFileExtension(filePathOrName: string): string | null {
  const match = filePathOrName.trim().match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);
  return match?.[1]?.toLowerCase() || null;
}

function getMimeTypeFromExtension(extension: string): string {
  switch (extension.trim().toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function getFileExtensionFromMimeType(mimeType?: string | null): string | null {
  switch (mimeType?.trim().toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/bmp':
      return 'bmp';
    case 'image/tiff':
      return 'tiff';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    case 'image/svg+xml':
      return 'svg';
    default:
      return null;
  }
}

function getLegacyFileSystem(): FileSystemLegacyModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-file-system/legacy');
}

async function getInvoiceAssetStorage(): Promise<{
  fs: FileSystemLegacyModule;
  targetDir: string;
} | null> {
  const fs = getLegacyFileSystem();
  const documentDirectory = fs.documentDirectory;
  if (!documentDirectory) return null;

  const targetDir = `${documentDirectory}invoice-assets`;
  const dirInfo = await fs.getInfoAsync(targetDir);
  if (!dirInfo.exists) {
    await fs.makeDirectoryAsync(targetDir, { intermediates: true });
  }

  return { fs, targetDir };
}

async function clearStoredLogoFiles(fs: FileSystemLegacyModule, targetDir: string): Promise<void> {
  const files = await fs.readDirectoryAsync(targetDir);
  await Promise.all(
    files
      .filter((fileName) => fileName.startsWith('logo.'))
      .map((fileName) => fs.deleteAsync(`${targetDir}/${fileName}`, { idempotent: true })),
  );
}
