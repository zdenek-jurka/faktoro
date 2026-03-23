import * as ImagePicker from 'expo-image-picker';

type FileSystemLegacyModule = typeof import('expo-file-system/legacy');

function getFileExtensionFromMimeType(mimeType?: string | null): string | null {
  const normalized = mimeType?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'image/tiff') return 'tiff';
  if (normalized === 'image/heic') return 'heic';
  if (normalized === 'image/heif') return 'heif';
  if (normalized === 'image/svg+xml') return 'svg';
  return null;
}

async function getInvoiceAssetStorage(): Promise<{
  fs: FileSystemLegacyModule;
  targetDir: string;
} | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs: FileSystemLegacyModule = require('expo-file-system/legacy');
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

export async function persistLogoUriOffline(
  sourceUri: string,
  options?: { sourceFileName?: string | null; sourceMimeType?: string | null },
): Promise<string> {
  const trimmed = sourceUri.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('file://') && !/^https?:\/\//i.test(trimmed)) return trimmed;

  const storage = await getInvoiceAssetStorage();
  if (!storage) return trimmed;
  const { fs, targetDir } = storage;
  if (trimmed.startsWith(`${targetDir}/`)) return trimmed;

  await clearStoredLogoFiles(fs, targetDir);

  const fileNameExtensionMatch = options?.sourceFileName?.match(/\.([a-zA-Z0-9]+)$/);
  const uriExtensionMatch = trimmed.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);
  const extension = (
    getFileExtensionFromMimeType(options?.sourceMimeType) ||
    fileNameExtensionMatch?.[1] ||
    uriExtensionMatch?.[1] ||
    'png'
  ).toLowerCase();
  const targetUri = `${targetDir}/logo.${extension}`;
  if (trimmed.startsWith('file://')) {
    await fs.copyAsync({ from: trimmed, to: targetUri });
    return targetUri;
  }

  const downloaded = await fs.downloadAsync(trimmed, targetUri);
  return downloaded?.uri || trimmed;
}

export async function deletePersistedLogoUri(sourceUri: string): Promise<void> {
  const trimmed = sourceUri.trim();
  if (!trimmed.startsWith('file://')) return;

  const storage = await getInvoiceAssetStorage();
  if (!storage) return;
  const { fs, targetDir } = storage;
  if (!trimmed.startsWith(`${targetDir}/`)) return;

  await fs.deleteAsync(trimmed, { idempotent: true });
}

export async function persistPickedLogoOffline(
  asset: ImagePicker.ImagePickerAsset,
): Promise<string> {
  return persistLogoUriOffline(asset.uri, {
    sourceFileName: asset.fileName,
    sourceMimeType: asset.mimeType,
  });
}

export function normalizeIbanLike(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function isIbanLike(value: string): boolean {
  const normalized = normalizeIbanLike(value);
  return /^[A-Z]{2}\d{13,32}$/.test(normalized);
}

export function canConvertCzBankAccountToIban(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  const [accountPartRaw, bankCodeRaw] = compact.split('/');
  if (!accountPartRaw || !bankCodeRaw) return false;

  const bankCode = bankCodeRaw.replace(/\D/g, '');
  if (bankCode.length !== 4) return false;

  const [prefixRaw, numberRawMaybe] = accountPartRaw.split('-');
  const numberRaw = numberRawMaybe ?? prefixRaw;
  const prefix = numberRawMaybe ? prefixRaw : '';

  const prefixDigits = prefix.replace(/\D/g, '');
  const numberDigits = numberRaw.replace(/\D/g, '');
  if (!numberDigits || prefixDigits.length > 6 || numberDigits.length > 10) return false;

  return true;
}
