import database from '@/db';
import { clearPinHash } from '@/repositories/app-lock-repository';
import { clearAllExportIntegrationSecrets } from '@/repositories/export-integration-repository';
import { syncTimerToWidget } from '@/widgets/timer-widget-sync';

type FileSystemLegacyModule = typeof import('expo-file-system/legacy');

function getLegacyFileSystem(): FileSystemLegacyModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system/legacy');
  } catch {
    return null;
  }
}

async function deleteDirectoryIfExists(
  fs: FileSystemLegacyModule,
  targetUri: string | undefined,
): Promise<void> {
  if (!targetUri) return;

  try {
    const info = await fs.getInfoAsync(targetUri);
    if (!info.exists) return;
    await fs.deleteAsync(targetUri, { idempotent: true });
  } catch {
    // Best-effort cleanup only.
  }
}

async function clearKnownLocalFiles(): Promise<void> {
  const fs = getLegacyFileSystem();
  if (!fs) return;

  await Promise.all([
    deleteDirectoryIfExists(
      fs,
      fs.documentDirectory ? `${fs.documentDirectory}invoice-assets` : '',
    ),
    deleteDirectoryIfExists(
      fs,
      fs.documentDirectory ? `${fs.documentDirectory}offline-backups` : '',
    ),
    deleteDirectoryIfExists(fs, fs.cacheDirectory ? `${fs.cacheDirectory}offline-backups` : ''),
  ]);
}

export async function dangerouslyResetAllLocalAppData(): Promise<void> {
  syncTimerToWidget(null, undefined);

  await Promise.allSettled([
    clearPinHash(),
    clearAllExportIntegrationSecrets(),
    clearKnownLocalFiles(),
  ]);

  await database.write(async () => {
    await database.unsafeResetDatabase();
  });

  syncTimerToWidget(null, undefined);
}
