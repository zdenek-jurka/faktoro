import schema from '@/db/schema';
import database from '@/db';
import SyncConflictModel from '@/model/SyncConflictModel';
import SyncOperationModel from '@/model/SyncOperationModel';
import { markInternalSyncMetadataTableSynced } from '@/repositories/sync-internal-metadata-repository';
import { Q } from '@nozbe/watermelondb';
import type { RawRecord as WMRawRecord } from '@nozbe/watermelondb/RawRecord';

export type OperationType = 'insert' | 'update' | 'delete';
export type ConflictResolutionStrategy = 'keep_local' | 'use_remote' | 'field_merge';

export type QueueOperationInput = {
  opId: string;
  tableName: string;
  recordId: string;
  operationType: OperationType;
  payloadJson?: string;
  baseVersion?: number;
};

export type ConflictPayload = {
  tableName: string;
  recordId: string;
  conflictType: string;
  basePayloadJson?: string;
  localPayloadJson?: string;
  remotePayloadJson?: string;
  conflictingFieldsJson?: string;
};

type RawRecord = Record<string, unknown>;

type ConflictResolution = {
  strategy: ConflictResolutionStrategy;
  resolvedAt: number;
  fieldSources?: Record<string, 'local' | 'remote'>;
};

type ModelInternals = {
  _raw: WMRawRecord;
  _setRaw: (key: string, value: unknown) => void;
};

type TableColumn = {
  name: string;
  isOptional?: boolean;
};

type RuntimeTableSchema = {
  name: string;
  columns: unknown;
};

function normalizeColumns(columns: unknown): TableColumn[] {
  if (Array.isArray(columns)) {
    return columns.filter(
      (column): column is TableColumn => !!column && typeof column === 'object' && 'name' in column,
    );
  }

  if (columns && typeof columns === 'object') {
    return Object.values(columns).filter(
      (column): column is TableColumn => !!column && typeof column === 'object' && 'name' in column,
    );
  }

  return [];
}

function getRuntimeSchemaTables(): RuntimeTableSchema[] {
  const tables = (schema as unknown as { tables?: unknown }).tables;
  if (Array.isArray(tables)) {
    return tables.filter(
      (table): table is RuntimeTableSchema =>
        !!table && typeof table === 'object' && 'name' in table && 'columns' in table,
    );
  }

  if (tables && typeof tables === 'object') {
    return Object.values(tables).filter(
      (table): table is RuntimeTableSchema =>
        !!table && typeof table === 'object' && 'name' in table && 'columns' in table,
    );
  }

  return [];
}

const SYNCABLE_TABLE_COLUMNS = new Map<string, TableColumn[]>(
  getRuntimeSchemaTables().map((table) => [table.name, normalizeColumns(table.columns)]),
);

function parseConflictPayload(json?: string): RawRecord | null {
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as RawRecord;
  } catch {
    return null;
  }
}

function parseConflictResolution(json?: string): ConflictResolution | null {
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const candidate = parsed as Partial<ConflictResolution>;
    if (
      (candidate.strategy !== 'keep_local' &&
        candidate.strategy !== 'use_remote' &&
        candidate.strategy !== 'field_merge') ||
      typeof candidate.resolvedAt !== 'number'
    ) {
      return null;
    }

    return candidate as ConflictResolution;
  } catch {
    return null;
  }
}

function getTableColumns(tableName: string): TableColumn[] {
  return SYNCABLE_TABLE_COLUMNS.get(tableName) ?? [];
}

async function markOperationsForRecordSynced(tableName: string, recordId: string): Promise<void> {
  const collection = database.get<SyncOperationModel>(SyncOperationModel.table);
  const pendingForRecord = await collection
    .query(
      Q.where('table_name', tableName),
      Q.where('record_id', recordId),
      Q.where('is_synced', false),
    )
    .fetch();

  if (pendingForRecord.length === 0) {
    return;
  }

  const syncedAt = Date.now();
  await database.write(async () => {
    await Promise.all(
      pendingForRecord.map((operation) =>
        operation.update((record) => {
          record.isSynced = true;
          record.syncedAt = syncedAt;
        }),
      ),
    );
  });

  await markInternalSyncMetadataTableSynced('sync_operation');
}

async function applyPayloadToRecord(
  tableName: string,
  recordId: string,
  payload: RawRecord,
  options?: {
    markSynced?: boolean;
    overrideUpdatedAt?: number;
  },
): Promise<void> {
  const columns = getTableColumns(tableName);
  if (columns.length === 0) {
    throw new Error(`Unsupported conflict table: ${tableName}`);
  }

  const record = (await database.get(tableName).find(recordId)) as unknown as ModelInternals;
  const currentRaw = { ...(record._raw as Record<string, unknown>) };
  const payloadWithTimestamps: RawRecord = {
    ...payload,
    updated_at:
      options?.overrideUpdatedAt ?? payload.updated_at ?? currentRaw.updated_at ?? Date.now(),
  };

  await database.write(async () => {
    await (record as unknown as { update: (updater: () => void) => Promise<void> }).update(() => {
      for (const column of columns) {
        if (Object.prototype.hasOwnProperty.call(payloadWithTimestamps, column.name)) {
          record._setRaw(column.name, payloadWithTimestamps[column.name]);
          continue;
        }

        if (column.isOptional) {
          record._setRaw(column.name, null);
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(currentRaw, column.name)) {
          record._setRaw(column.name, currentRaw[column.name]);
        }
      }
    });
  });

  if (!options?.markSynced) {
    return;
  }

  const adapter = database.adapter as {
    unsafeExecute?: (commands: { sqls: [string, unknown[]][] }) => Promise<unknown>;
  };

  if (typeof adapter.unsafeExecute !== 'function') {
    return;
  }

  await adapter.unsafeExecute({
    sqls: [
      [
        `UPDATE "${tableName}" SET "_status" = 'synced', "_changed" = '' WHERE "id" = ?`,
        [recordId],
      ],
    ],
  });
}

async function hasMatchingKeepLocalResolution(input: ConflictPayload): Promise<boolean> {
  const collection = database.get<SyncConflictModel>(SyncConflictModel.table);
  const historicalConflicts = await collection
    .query(Q.where('table_name', input.tableName), Q.where('record_id', input.recordId))
    .fetch();

  return historicalConflicts.some((conflict) => {
    if (conflict.status === 'pending') {
      return false;
    }

    const resolution = parseConflictResolution(conflict.resolutionJson);
    return (
      resolution?.strategy === 'keep_local' &&
      conflict.remotePayloadJson === input.remotePayloadJson
    );
  });
}

async function markSupersededOperationsSynced(current: SyncOperationModel): Promise<void> {
  const collection = database.get<SyncOperationModel>(SyncOperationModel.table);
  const pendingForRecord = await collection
    .query(
      Q.where('table_name', current.tableName),
      Q.where('record_id', current.recordId),
      Q.where('is_synced', false),
    )
    .fetch();

  const superseded = pendingForRecord.filter((operation) => operation.id !== current.id);
  if (superseded.length === 0) {
    return;
  }

  const syncedAt = Date.now();
  await database.write(async () => {
    await Promise.all(
      superseded.map((operation) =>
        operation.update((record) => {
          record.isSynced = true;
          record.syncedAt = syncedAt;
        }),
      ),
    );
  });

  await markInternalSyncMetadataTableSynced('sync_operation');
}

export async function queueOperation(input: QueueOperationInput): Promise<void> {
  const collection = database.get<SyncOperationModel>(SyncOperationModel.table);
  const existing = await collection.query(Q.where('op_id', input.opId)).fetch();

  if (existing.length > 0) {
    const current = existing[0];
    await database.write(async () => {
      await current.update((op) => {
        op.tableName = input.tableName;
        op.recordId = input.recordId;
        op.operationType = input.operationType;
        op.payloadJson = input.payloadJson;
        op.baseVersion = input.baseVersion;
        op.isSynced = false;
      });
    });
    await markInternalSyncMetadataTableSynced('sync_operation');
    await markSupersededOperationsSynced(current);
    return;
  }

  let createdOperation: SyncOperationModel | null = null;
  await database.write(async () => {
    createdOperation = await collection.create((op) => {
      op.opId = input.opId;
      op.tableName = input.tableName;
      op.recordId = input.recordId;
      op.operationType = input.operationType;
      op.payloadJson = input.payloadJson;
      op.baseVersion = input.baseVersion;
      op.isSynced = false;
      op.retryCount = 0;
    });
  });

  await markInternalSyncMetadataTableSynced('sync_operation');
  if (createdOperation) {
    await markSupersededOperationsSynced(createdOperation);
  }
}

export async function getPendingOperations(limit = 200): Promise<SyncOperationModel[]> {
  const collection = database.get<SyncOperationModel>(SyncOperationModel.table);
  return collection
    .query(Q.where('is_synced', false), Q.sortBy('created_at', Q.asc), Q.take(limit))
    .fetch();
}

export async function markOperationSynced(operationId: string): Promise<void> {
  const collection = database.get<SyncOperationModel>(SyncOperationModel.table);
  const op = await collection.find(operationId);

  await database.write(async () => {
    await op.update((record) => {
      record.isSynced = true;
      record.syncedAt = Date.now();
    });
  });

  await markInternalSyncMetadataTableSynced('sync_operation');
  await markSupersededOperationsSynced(op);
}

export async function markOperationSyncedByOpId(opId: string): Promise<void> {
  const collection = database.get<SyncOperationModel>(SyncOperationModel.table);
  const existing = await collection.query(Q.where('op_id', opId)).fetch();
  if (existing.length === 0) return;
  await markOperationSynced(existing[0].id);
}

export async function increaseOperationRetry(operationId: string): Promise<void> {
  const collection = database.get<SyncOperationModel>(SyncOperationModel.table);
  const op = await collection.find(operationId);

  await database.write(async () => {
    await op.update((record) => {
      record.retryCount = (record.retryCount || 0) + 1;
    });
  });

  await markInternalSyncMetadataTableSynced('sync_operation');
}

export async function increaseOperationRetryByOpId(opId: string): Promise<void> {
  const collection = database.get<SyncOperationModel>(SyncOperationModel.table);
  const existing = await collection.query(Q.where('op_id', opId)).fetch();
  if (existing.length === 0) return;
  await increaseOperationRetry(existing[0].id);
}

export async function upsertConflict(input: ConflictPayload): Promise<void> {
  if (await hasMatchingKeepLocalResolution(input)) {
    return;
  }

  const collection = database.get<SyncConflictModel>(SyncConflictModel.table);
  const existing = await collection
    .query(
      Q.where('table_name', input.tableName),
      Q.where('record_id', input.recordId),
      Q.where('status', 'pending'),
    )
    .fetch();

  if (existing.length > 0) {
    const current = existing[0];
    await database.write(async () => {
      await current.update((conflict) => {
        conflict.conflictType = input.conflictType;
        conflict.basePayloadJson = input.basePayloadJson;
        conflict.localPayloadJson = input.localPayloadJson;
        conflict.remotePayloadJson = input.remotePayloadJson;
        conflict.conflictingFieldsJson = input.conflictingFieldsJson;
      });
    });
    await markInternalSyncMetadataTableSynced('sync_conflict');
    return;
  }

  await database.write(async () => {
    await collection.create((conflict) => {
      conflict.tableName = input.tableName;
      conflict.recordId = input.recordId;
      conflict.conflictType = input.conflictType;
      conflict.basePayloadJson = input.basePayloadJson;
      conflict.localPayloadJson = input.localPayloadJson;
      conflict.remotePayloadJson = input.remotePayloadJson;
      conflict.conflictingFieldsJson = input.conflictingFieldsJson;
      conflict.status = 'pending';
    });
  });

  await markInternalSyncMetadataTableSynced('sync_conflict');
}

export async function getPendingConflicts(): Promise<SyncConflictModel[]> {
  const collection = database.get<SyncConflictModel>(SyncConflictModel.table);
  return collection.query(Q.where('status', 'pending'), Q.sortBy('created_at', Q.asc)).fetch();
}

export async function resolveConflict(conflictId: string, resolutionJson: string): Promise<void> {
  const collection = database.get<SyncConflictModel>(SyncConflictModel.table);
  const conflict = await collection.find(conflictId);

  await database.write(async () => {
    await conflict.update((record) => {
      record.resolutionJson = resolutionJson;
      record.status = 'resolved';
      record.resolvedAt = Date.now();
    });
  });

  await markInternalSyncMetadataTableSynced('sync_conflict');
}

export async function markConflictApplied(conflictId: string): Promise<void> {
  const collection = database.get<SyncConflictModel>(SyncConflictModel.table);
  const conflict = await collection.find(conflictId);

  await database.write(async () => {
    await conflict.update((record) => {
      record.status = 'applied';
    });
  });

  await markInternalSyncMetadataTableSynced('sync_conflict');
}

export async function resolveConflictWithStrategy(
  conflictId: string,
  strategy: ConflictResolutionStrategy,
): Promise<void> {
  const collection = database.get<SyncConflictModel>(SyncConflictModel.table);
  const conflict = await collection.find(conflictId);
  const resolvedAt = Date.now();

  if (strategy === 'keep_local') {
    const localPayload = parseConflictPayload(conflict.localPayloadJson);
    if (!localPayload) {
      throw new Error('Missing local conflict payload');
    }

    await applyPayloadToRecord(conflict.tableName, conflict.recordId, localPayload, {
      overrideUpdatedAt: resolvedAt,
    });
  } else {
    const remotePayload = parseConflictPayload(conflict.remotePayloadJson);
    if (!remotePayload) {
      throw new Error('Missing remote conflict payload');
    }

    await applyPayloadToRecord(conflict.tableName, conflict.recordId, remotePayload, {
      markSynced: true,
    });
    await markOperationsForRecordSynced(conflict.tableName, conflict.recordId);
  }

  await resolveConflict(
    conflictId,
    JSON.stringify({
      strategy,
      resolvedAt,
    } satisfies ConflictResolution),
  );
  await markConflictApplied(conflictId);
}

export async function resolveConflictWithMergedPayload(
  conflictId: string,
  mergedPayload: RawRecord,
  fieldSources: Record<string, 'local' | 'remote'>,
): Promise<void> {
  const collection = database.get<SyncConflictModel>(SyncConflictModel.table);
  const conflict = await collection.find(conflictId);
  const resolvedAt = Date.now();

  await applyPayloadToRecord(conflict.tableName, conflict.recordId, mergedPayload, {
    overrideUpdatedAt: resolvedAt,
  });

  await resolveConflict(
    conflictId,
    JSON.stringify({
      strategy: 'field_merge',
      resolvedAt,
      fieldSources,
    } satisfies ConflictResolution),
  );
  await markConflictApplied(conflictId);
}
