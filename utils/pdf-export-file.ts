export type PdfCacheFile = {
  fileName: string;
  uri: string;
};

type PrintHtmlToPdfCacheFileInput = {
  html: string;
  fileName: string;
  errorMessage: string;
};

export async function printHtmlToPdfCacheFile({
  html,
  fileName,
  errorMessage,
}: PrintHtmlToPdfCacheFileInput): Promise<PdfCacheFile> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystemLegacy =
    require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Print = require('expo-print') as typeof import('expo-print');

  const cacheDirectory: string | null | undefined = FileSystemLegacy.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error(errorMessage);
  }

  const pdfResult = await Print.printToFileAsync({ html });
  const targetUri = `${cacheDirectory}${fileName}`;
  await FileSystemLegacy.deleteAsync(targetUri, { idempotent: true });
  await FileSystemLegacy.copyAsync({
    from: pdfResult.uri,
    to: targetUri,
  });

  return { fileName, uri: targetUri };
}
