import database from '@/db';

const INTERNAL_SYNC_METADATA_TABLES = ['sync_operation', 'sync_conflict'] as const;
const LOCAL_ONLY_SYNC_TABLES = ['config_storage', 'sync_operation', 'sync_conflict'] as const;

type UnsafeAdapter = {
  unsafeExecute?: (commands: { sqls: [string, unknown[]][] }) => Promise<unknown>;
};

async function executeSql(sqls: [string, unknown[]][]): Promise<void> {
  const adapter = database.adapter as UnsafeAdapter;
  if (typeof adapter.unsafeExecute !== 'function') {
    return;
  }

  await adapter.unsafeExecute({ sqls });
}

export async function normalizeInternalSyncMetadataTables(): Promise<void> {
  await executeSql(
    INTERNAL_SYNC_METADATA_TABLES.map((table) => [
      `UPDATE "${table}" SET "_status" = 'synced', "_changed" = '' WHERE "_status" != 'synced' OR "_changed" != ''`,
      [],
    ]),
  );
}

export async function markInternalSyncMetadataTableSynced(
  table: (typeof INTERNAL_SYNC_METADATA_TABLES)[number],
): Promise<void> {
  await executeSql([
    [
      `UPDATE "${table}" SET "_status" = 'synced', "_changed" = '' WHERE "_status" != 'synced' OR "_changed" != ''`,
      [],
    ],
  ]);
}

export async function cleanupLocalOnlySyncArtifacts(): Promise<void> {
  const now = Date.now();
  const placeholders = LOCAL_ONLY_SYNC_TABLES.map(() => '?').join(', ');

  await executeSql([
    [
      `UPDATE "sync_operation"
       SET "is_synced" = 1,
           "synced_at" = COALESCE("synced_at", ?),
           "_status" = 'synced',
           "_changed" = ''
       WHERE "table_name" IN (${placeholders})
         AND ("is_synced" != 1 OR "_status" != 'synced' OR "_changed" != '')`,
      [now, ...LOCAL_ONLY_SYNC_TABLES],
    ],
    [
      `UPDATE "sync_conflict"
       SET "status" = 'applied',
           "resolved_at" = COALESCE("resolved_at", ?),
           "_status" = 'synced',
           "_changed" = ''
       WHERE "table_name" IN (${placeholders})
         AND ("status" = 'pending' OR "_status" != 'synced' OR "_changed" != '')`,
      [now, ...LOCAL_ONLY_SYNC_TABLES],
    ],
  ]);
}

export async function dangerouslyClearLocalSyncQueueAndConflicts(): Promise<void> {
  await executeSql([
    ['DELETE FROM "sync_operation"', []],
    ['DELETE FROM "sync_conflict"', []],
  ]);

  await normalizeInternalSyncMetadataTables();
}
