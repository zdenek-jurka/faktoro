import * as Linking from 'expo-linking';

export async function openLocalFile(fileUri: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystemLegacy =
    require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');

  const targetUri =
    typeof FileSystemLegacy.getContentUriAsync === 'function'
      ? await FileSystemLegacy.getContentUriAsync(fileUri)
      : fileUri;

  await Linking.openURL(targetUri);
}
