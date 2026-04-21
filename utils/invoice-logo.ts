type FileSystemLegacyModule = typeof import('expo-file-system/legacy');

export const INVOICE_LOGO_TOO_LARGE_ERROR = 'INVOICE_LOGO_TOO_LARGE';
export const MAX_SYNCED_INVOICE_LOGO_BYTES = 512 * 1024;

export type InvoiceLogoPayload = {
  base64: string;
  mimeType: string;
  byteSize: number;
};

function normalizeMimeType(value?: string | null): string {
  return value?.trim().toLowerCase() || '';
}

export function detectInvoiceLogoMimeType(uri?: string, fallback?: string | null): string {
  const normalizedFallback = normalizeMimeType(fallback);
  if (normalizedFallback) {
    return normalizedFallback;
  }

  const loweredUri = uri?.trim().toLowerCase() || '';
  if (loweredUri.endsWith('.jpg') || loweredUri.endsWith('.jpeg')) return 'image/jpeg';
  if (loweredUri.endsWith('.webp')) return 'image/webp';
  if (loweredUri.endsWith('.gif')) return 'image/gif';
  if (loweredUri.endsWith('.bmp')) return 'image/bmp';
  if (loweredUri.endsWith('.tif') || loweredUri.endsWith('.tiff')) return 'image/tiff';
  if (loweredUri.endsWith('.heif')) return 'image/heif';
  if (loweredUri.endsWith('.heic')) return 'image/heic';
  if (loweredUri.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

export function estimateBase64ByteSize(base64: string): number {
  const normalized = base64.replace(/\s+/g, '');
  if (!normalized) return 0;

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function formatInvoiceLogoSizeLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? String(mb) : mb.toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

export function buildInvoiceLogoDataUri(base64?: string | null, mimeType?: string | null): string {
  const normalizedBase64 = base64?.trim() || '';
  if (!normalizedBase64) return '';

  return `data:${detectInvoiceLogoMimeType(undefined, mimeType)};base64,${normalizedBase64}`;
}

function getLegacyFileSystem(): FileSystemLegacyModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-file-system/legacy') as FileSystemLegacyModule;
}

function assertInvoiceLogoSize(byteSize: number, maxBytes?: number): void {
  if (maxBytes && byteSize > maxBytes) {
    throw new Error(INVOICE_LOGO_TOO_LARGE_ERROR);
  }
}

export async function readInvoiceLogoPayloadFromUri(
  sourceUri: string,
  options?: {
    maxBytes?: number;
    sourceMimeType?: string | null;
  },
): Promise<InvoiceLogoPayload> {
  const trimmed = sourceUri.trim();
  if (!trimmed) {
    throw new Error('Invoice logo source is empty');
  }

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match?.[1] || !match[2]) {
      throw new Error('Invoice logo data URI is invalid');
    }

    const mimeType = detectInvoiceLogoMimeType(undefined, match[1]);
    const base64 = match[2].trim();
    const byteSize = estimateBase64ByteSize(base64);
    assertInvoiceLogoSize(byteSize, options?.maxBytes);
    return { base64, mimeType, byteSize };
  }

  if (!trimmed.startsWith('file://')) {
    throw new Error('Invoice logo source must be a local file');
  }

  const fs = getLegacyFileSystem();
  const base64 = await fs.readAsStringAsync(trimmed, {
    encoding: fs.EncodingType?.Base64 ?? 'base64',
  });
  const mimeType = detectInvoiceLogoMimeType(trimmed, options?.sourceMimeType);
  const byteSize = estimateBase64ByteSize(base64);
  assertInvoiceLogoSize(byteSize, options?.maxBytes);
  return { base64, mimeType, byteSize };
}
