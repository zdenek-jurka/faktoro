import { buildInvoiceLogoDataUri, detectInvoiceLogoMimeType } from '@/utils/invoice-logo';

type PdfLogoSource =
  | string
  | {
      logoUri?: string | null;
      logoBase64?: string | null;
      logoMimeType?: string | null;
    };

type PdfLogoHtmlOptions = {
  maxHeight?: number | string | null;
  maxWidth?: number | string | null;
};

function toCssLength(value: number | string | null | undefined, fallbackPx?: number): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`;
  }

  if (fallbackPx == null) {
    return '';
  }

  return `${fallbackPx}px`;
}

function buildImageStyle(options?: PdfLogoHtmlOptions): string {
  const maxWidth = toCssLength(options?.maxWidth, 180);
  const maxHeight = toCssLength(options?.maxHeight, options?.maxHeight === null ? undefined : 72);

  return [
    'display:block',
    'width:auto',
    'height:auto',
    maxWidth ? `max-width:${maxWidth}` : '',
    maxHeight ? `max-height:${maxHeight}` : '',
  ]
    .filter(Boolean)
    .join(';');
}

export async function buildPdfLogoHtml(
  logoSource?: PdfLogoSource,
  options?: PdfLogoHtmlOptions,
): Promise<string> {
  const logoUri = typeof logoSource === 'string' ? logoSource : logoSource?.logoUri;
  const logoBase64 = typeof logoSource === 'string' ? '' : logoSource?.logoBase64?.trim() || '';
  const logoMimeType = typeof logoSource === 'string' ? '' : logoSource?.logoMimeType?.trim() || '';
  const imageStyle = buildImageStyle(options);

  if (logoBase64) {
    return `<img src="${buildInvoiceLogoDataUri(logoBase64, logoMimeType)}" style="${imageStyle}" />`;
  }

  if (!logoUri?.trim()) return '';

  if (logoUri.startsWith('file://')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystemLegacy = require('expo-file-system/legacy');
      const base64 = await FileSystemLegacy.readAsStringAsync(logoUri, {
        encoding: FileSystemLegacy.EncodingType?.Base64 ?? 'base64',
      });
      const mimeType = detectInvoiceLogoMimeType(logoUri);
      return `<img src="data:${mimeType};base64,${base64}" style="${imageStyle}" />`;
    } catch {
      return '';
    }
  }

  return `<img src="${logoUri}" style="${imageStyle}" />`;
}
