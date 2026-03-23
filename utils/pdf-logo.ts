function detectMimeType(uri: string): string {
  const lowered = uri.toLowerCase();
  if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) return 'image/jpeg';
  if (lowered.endsWith('.webp')) return 'image/webp';
  if (lowered.endsWith('.gif')) return 'image/gif';
  if (lowered.endsWith('.bmp')) return 'image/bmp';
  if (lowered.endsWith('.tif') || lowered.endsWith('.tiff')) return 'image/tiff';
  if (lowered.endsWith('.heif')) return 'image/heif';
  if (lowered.endsWith('.heic')) return 'image/heic';
  if (lowered.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

export async function buildPdfLogoHtml(
  logoUri?: string,
  options?: { maxHeight?: number; maxWidth?: number },
): Promise<string> {
  if (!logoUri?.trim()) return '';

  const maxHeight = options?.maxHeight ?? 72;
  const maxWidth = options?.maxWidth ?? 180;
  const imageStyle = `max-height:${maxHeight}px; max-width:${maxWidth}px; object-fit:contain; display:block;`;

  if (logoUri.startsWith('file://')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystemLegacy = require('expo-file-system/legacy');
      const base64 = await FileSystemLegacy.readAsStringAsync(logoUri, {
        encoding: FileSystemLegacy.EncodingType?.Base64 ?? 'base64',
      });
      const mimeType = detectMimeType(logoUri);
      return `<img src="data:${mimeType};base64,${base64}" style="${imageStyle}" />`;
    } catch {
      return '';
    }
  }

  return `<img src="${logoUri}" style="${imageStyle}" />`;
}
