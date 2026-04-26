import {
  isSyncEnabled,
  isSyncPullEnabled,
  isSyncPushEnabled,
  isSyncSynchronizeEnabled,
} from '@/constants/features';
import database from '@/db';
import AppSettingsModel from '@/model/AppSettingsModel';
import {
  APP_SETTINGS_SINGLETON_ID,
  mergeAppSettingsRecords,
  normalizeAppSettingsRecords,
} from '@/repositories/app-settings-singleton';
import {
  getDeviceSyncSettings,
  updateDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { getSettings } from '@/repositories/settings-repository';
import {
  increaseOperationRetryByOpId,
  queueOperation,
  upsertConflict,
  markOperationSyncedByOpId,
  type QueueOperationInput,
  type ConflictPayload,
} from '@/repositories/sync-conflict-repository';
import { normalizeInternalSyncMetadataTables } from '@/repositories/sync-internal-metadata-repository';
import {
  decryptRecord,
  decryptSnapshot,
  encryptRecord,
  encryptSnapshot,
  generateInstanceKey,
  isEncryptedRecord,
  isEncryptedSnapshot,
  isSecureCryptoAvailable,
} from '@/repositories/sync-crypto';
import { buildSyncAuthHeaders } from '@/utils/sync-auth';
import { requestAppDataReload } from '@/utils/app-data-reload';
import { Model } from '@nozbe/watermelondb';
import type { DirtyRaw, RawRecord as WMRawRecord } from '@nozbe/watermelondb/RawRecord';
import type { SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { synchronize } from '@nozbe/watermelondb/sync';

type RawRecord = Record<string, unknown>;

type WebSocketWithOptionsConstructor = new (
  uri: string,
  protocols?: string | string[] | null,
  options?: { headers: Record<string, string>; [optionName: string]: unknown } | null,
) => WebSocket;

/** Internal WatermelonDB model properties not exposed in public types */
interface ModelInternals {
  _raw: WMRawRecord;
  _setRaw: (key: string, value: unknown) => void;
}

export const SYNC_TABLES = [
  'app_settings',
  'currency_setting',
  'client',
  'client_address',
  'price_list_item',
  'client_price_override',
  'time_entry',
  'timesheet',
  'invoice',
  'invoice_item',
  'vat_code',
  'vat_rate',
] as const;

const SNAPSHOT_TABLES = [...SYNC_TABLES, 'config_storage'] as const;
const SNAPSHOT_SYNCED_CONFIG_EXACT_KEYS = new Set(['export_integrations.list']);
const SNAPSHOT_SYNCED_CONFIG_PREFIXES = ['registry.'] as const;

type SnapshotPayload = {
  [K in (typeof SNAPSHOT_TABLES)[number]]: RawRecord[];
};

type SyncResponse = {
  error?: string;
};

type OnlinePullResponse = {
  changes: Record<string, OnlineTableChangeSet>;
  timestamp: number;
};

type OnlineTableChangeSet = {
  created: RawRecord[];
  updated: RawRecord[];
  deleted: string[];
};

export type SyncEvent = {
  event_id: number;
  source_device_id: string;
  event_type: string;
  timestamp: number;
  payload: Record<string, unknown>;
};

type SyncEventsPullResponse = {
  events: SyncEvent[];
  latest_timestamp: number;
};

type SyncEventsWsMessage = {
  source_device_id: string;
  event_type: string;
  timestamp: number;
  payload: Record<string, unknown>;
};

let syncInFlight: Promise<void> | null = null;
const LOCAL_ONLY_SYNC_TABLES = new Set(['config_storage', 'sync_operation', 'sync_conflict']);

async function getResolvedSyncConfiguration(settings: AppSettingsModel): Promise<{
  serverUrl: string;
  instanceId: string;
  deviceId: string;
  authToken: string;
  syncAllowPlaintext: boolean;
  syncInstanceKey: string;
  syncIsRegistered: boolean;
}> {
  const deviceSettings = await getDeviceSyncSettings(settings);
  const serverUrl = deviceSettings.syncServerUrl.trim().replace(/\/+$/, '') || '';
  const instanceId = deviceSettings.syncInstanceId.trim() || '';
  const deviceId = deviceSettings.syncDeviceId.trim() || '';
  const authToken = deviceSettings.syncAuthToken.trim() || '';

  if (!serverUrl) throw new Error('Sync server URL is missing');
  if (!instanceId) throw new Error('Sync instance ID is missing');
  if (!deviceId) throw new Error('Sync device ID is missing');
  if (!authToken) throw new Error('Sync auth token is missing (device not registered)');

  return {
    serverUrl,
    instanceId,
    deviceId,
    authToken,
    syncAllowPlaintext: deviceSettings.syncAllowPlaintext,
    syncInstanceKey: deviceSettings.syncInstanceKey,
    syncIsRegistered: deviceSettings.syncIsRegistered,
  };
}

async function parseErrorResponse(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `Sync request failed (${response.status})`;

  try {
    const parsed = JSON.parse(text) as SyncResponse;
    return parsed.error || text;
  } catch {
    return text;
  }
}

export async function createFullSnapshot(): Promise<SnapshotPayload> {
  const snapshot: Partial<SnapshotPayload> = {};

  for (const table of SNAPSHOT_TABLES) {
    const rows = await database.get(table).query().fetch();
    const rawRows = rows.map((row) => ({ ...(row as unknown as ModelInternals)._raw }));
    if (table === 'config_storage') {
      snapshot[table] = filterSnapshotConfigStorageRows(rawRows);
      continue;
    }
    snapshot[table] = table === 'app_settings' ? normalizeAppSettingsRecords(rawRows) : rawRows;
  }

  return snapshot as SnapshotPayload;
}

function isSnapshotSyncableConfigKey(key: unknown): boolean {
  if (typeof key !== 'string') return false;
  return (
    SNAPSHOT_SYNCED_CONFIG_EXACT_KEYS.has(key) ||
    SNAPSHOT_SYNCED_CONFIG_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function filterSnapshotConfigStorageRows(rows: RawRecord[]): RawRecord[] {
  return rows.filter((row) => isSnapshotSyncableConfigKey(row.config_key));
}

async function ensureInstanceKey(settings: AppSettingsModel): Promise<string> {
  const deviceSettings = await getDeviceSyncSettings(settings);
  const secureCrypto = isSecureCryptoAvailable();
  if (deviceSettings.syncAllowPlaintext) {
    // Explicit plaintext mode: keep sync unencrypted until user switches to crypto mode.
    return '';
  }

  if (!secureCrypto) {
    throw new Error(
      'Secure Crypto API is unavailable. Enable insecure plaintext fallback to continue.',
    );
  }

  const existing = deviceSettings.syncInstanceKey.trim() || '';
  if (existing) return existing;

  const generated = generateInstanceKey();
  await updateDeviceSyncSettings({ syncInstanceKey: generated }, settings);
  return generated;
}

async function encryptOnlineChanges(
  changes: Record<string, OnlineTableChangeSet>,
  instanceKey: string,
  instanceId: string,
): Promise<Record<string, OnlineTableChangeSet>> {
  if (!instanceKey) {
    return changes;
  }

  const encrypted: Record<string, OnlineTableChangeSet> = {};
  const entries = Object.entries(changes || {});

  for (const [table, tableChanges] of entries) {
    const created = await Promise.all(
      (tableChanges.created || []).map((raw) => encryptRecord(raw, instanceKey, instanceId, table)),
    );
    const updated = await Promise.all(
      (tableChanges.updated || []).map((raw) => encryptRecord(raw, instanceKey, instanceId, table)),
    );

    encrypted[table] = {
      created,
      updated,
      deleted: tableChanges.deleted || [],
    };
  }

  return encrypted;
}

async function decryptOnlineChanges(
  changes: Record<string, OnlineTableChangeSet>,
  instanceKey: string,
  instanceId: string,
): Promise<{ changes: Record<string, OnlineTableChangeSet>; hasPlaintextPayload: boolean }> {
  const decrypted: Record<string, OnlineTableChangeSet> = {};
  const entries = Object.entries(changes || {});
  let hasPlaintextPayload = false;

  for (const [table, tableChanges] of entries) {
    if (LOCAL_ONLY_SYNC_TABLES.has(table)) {
      continue;
    }

    const createdRaw = await Promise.all(
      (tableChanges.created || []).map((raw) =>
        decryptOnlineRecordIfNeeded(raw, instanceKey, instanceId, table),
      ),
    );
    const updatedRaw = await Promise.all(
      (tableChanges.updated || []).map((raw) =>
        decryptOnlineRecordIfNeeded(raw, instanceKey, instanceId, table),
      ),
    );

    decrypted[table] = {
      created: sanitizePulledRecords(createdRaw, table, 'created'),
      updated: sanitizePulledRecords(updatedRaw, table, 'updated'),
      deleted: tableChanges.deleted || [],
    };

    if (
      instanceKey &&
      ((tableChanges.created || []).some((raw) => !isEncryptedRecord(raw)) ||
        (tableChanges.updated || []).some((raw) => !isEncryptedRecord(raw)))
    ) {
      hasPlaintextPayload = true;
    }
  }

  return { changes: decrypted, hasPlaintextPayload };
}

function stripLocalOnlyTables(
  changes: Record<string, OnlineTableChangeSet>,
): Record<string, OnlineTableChangeSet> {
  return Object.fromEntries(
    Object.entries(changes || {}).filter(([table]) => !LOCAL_ONLY_SYNC_TABLES.has(table)),
  );
}

async function decryptOnlineRecordIfNeeded(
  raw: RawRecord,
  instanceKey: string,
  instanceId: string,
  table: string,
): Promise<RawRecord> {
  if (!instanceKey || !isEncryptedRecord(raw)) {
    return raw;
  }

  return decryptRecord(raw, instanceKey, instanceId, table);
}

function sanitizePulledRecords(
  records: RawRecord[],
  table: string,
  changeType: 'created' | 'updated',
): RawRecord[] {
  const sanitized: RawRecord[] = [];

  for (const raw of records || []) {
    if (!raw || typeof raw !== 'object') {
      console.warn(
        `[sync] Dropping invalid ${changeType} record for table '${table}': not an object`,
      );
      continue;
    }

    const candidate = { ...raw } as RawRecord;
    delete candidate._status;
    delete candidate._changed;

    if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
      console.warn(`[sync] Dropping invalid ${changeType} record for table '${table}': missing id`);
      continue;
    }

    sanitized.push(candidate);
  }

  return sanitized;
}

async function normalizePulledSingletonChanges(
  changes: Record<string, OnlineTableChangeSet>,
): Promise<Record<string, OnlineTableChangeSet>> {
  const appSettingsChanges = changes.app_settings;
  if (!appSettingsChanges) {
    return changes;
  }

  const mergedRecords = [
    ...(appSettingsChanges.created || []),
    ...(appSettingsChanges.updated || []),
  ];
  const filteredDeleted = Array.from(new Set(appSettingsChanges.deleted || [])).filter(
    (id) => id !== APP_SETTINGS_SINGLETON_ID,
  );

  if (mergedRecords.length === 0) {
    return {
      ...changes,
      app_settings: {
        created: [],
        updated: [],
        deleted: filteredDeleted,
      },
    };
  }

  const canonicalRecord = stripSyncMetadata(mergeAppSettingsRecords(mergedRecords));
  const localRows = await database.get<AppSettingsModel>(AppSettingsModel.table).query().fetch();
  const hasLocalCanonical = localRows.some((row) => row.id === APP_SETTINGS_SINGLETON_ID);

  return {
    ...changes,
    app_settings: {
      created: hasLocalCanonical ? [] : [canonicalRecord],
      updated: hasLocalCanonical ? [canonicalRecord] : [],
      deleted: filteredDeleted,
    },
  };
}

function stripSyncMetadata(record: Record<string, unknown>): RawRecord {
  const sanitized = { ...record } as RawRecord;
  delete sanitized._status;
  delete sanitized._changed;
  return sanitized;
}

function sanitizeOutgoingSyncRecord(table: string, record: RawRecord): RawRecord {
  const sanitized = stripSyncMetadata(record);

  // Timer duration is derived UI state while an entry is actively running.
  // We persist the definitive value on stable transitions (stop, and optionally
  // pause-related flows), but we do not want churn from transient running values
  // to fan out through sync and amplify device load.
  if (table === 'time_entry' && sanitized.is_running === true) {
    delete sanitized.duration;
  }

  return sanitized;
}

function getRecordStatus(record: RawRecord): string | undefined {
  const status = record._status;
  return typeof status === 'string' ? status : undefined;
}

function getConflictFieldNames(local: RawRecord, remote: RawRecord): string[] {
  const ignored = new Set(['id', '_status', '_changed', 'created_at', 'updated_at']);
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  const conflicts: string[] = [];

  for (const key of keys) {
    if (ignored.has(key)) continue;
    if (JSON.stringify(local[key]) !== JSON.stringify(remote[key])) {
      conflicts.push(key);
    }
  }

  return conflicts;
}

async function collectIncomingConflicts(
  changes: Record<string, OnlineTableChangeSet>,
): Promise<ConflictPayload[]> {
  const conflicts: ConflictPayload[] = [];

  for (const [table, tableChanges] of Object.entries(changes || {})) {
    if (LOCAL_ONLY_SYNC_TABLES.has(table)) continue;

    for (const remoteRecord of tableChanges.updated || []) {
      const recordId = typeof remoteRecord.id === 'string' ? remoteRecord.id : '';
      if (!recordId) continue;

      try {
        const localRecord = (await database.get(table).find(recordId)) as unknown as ModelInternals;
        const localRaw = { ...localRecord._raw } as RawRecord;
        if (getRecordStatus(localRaw) === 'synced') continue;

        conflicts.push({
          tableName: table,
          recordId,
          conflictType: 'update/update',
          localPayloadJson: JSON.stringify(stripSyncMetadata(localRaw)),
          remotePayloadJson: JSON.stringify(stripSyncMetadata(remoteRecord)),
          conflictingFieldsJson: JSON.stringify(
            getConflictFieldNames(stripSyncMetadata(localRaw), stripSyncMetadata(remoteRecord)),
          ),
        });
      } catch {
        // No local record or collection lookup failed for this table; skip conflict capture.
      }
    }
  }

  return conflicts;
}

function buildQueuedOperations(
  changes: Record<string, OnlineTableChangeSet>,
  lastPulledAt: number | undefined,
): QueueOperationInput[] {
  const queued: QueueOperationInput[] = [];

  for (const [table, tableChanges] of Object.entries(changes || {})) {
    if (LOCAL_ONLY_SYNC_TABLES.has(table)) continue;

    for (const created of tableChanges.created || []) {
      const recordId = typeof created.id === 'string' ? created.id : '';
      if (!recordId) continue;
      const payload = sanitizeOutgoingSyncRecord(table, created);
      const version =
        typeof created.updated_at === 'number' ? created.updated_at : (lastPulledAt ?? undefined);
      queued.push({
        opId: `${table}:insert:${recordId}:${version ?? 'na'}`,
        tableName: table,
        recordId,
        operationType: 'insert',
        payloadJson: JSON.stringify(payload),
        baseVersion: lastPulledAt ?? undefined,
      });
    }

    for (const updated of tableChanges.updated || []) {
      const recordId = typeof updated.id === 'string' ? updated.id : '';
      if (!recordId) continue;
      const payload = sanitizeOutgoingSyncRecord(table, updated);
      const version =
        typeof updated.updated_at === 'number' ? updated.updated_at : (lastPulledAt ?? undefined);
      queued.push({
        opId: `${table}:update:${recordId}:${version ?? 'na'}`,
        tableName: table,
        recordId,
        operationType: 'update',
        payloadJson: JSON.stringify(payload),
        baseVersion: lastPulledAt ?? undefined,
      });
    }

    for (const deletedId of tableChanges.deleted || []) {
      queued.push({
        opId: `${table}:delete:${deletedId}:${lastPulledAt ?? 'na'}`,
        tableName: table,
        recordId: deletedId,
        operationType: 'delete',
        baseVersion: lastPulledAt ?? undefined,
      });
    }
  }

  return queued;
}

export async function runOnlineSync(settings: AppSettingsModel): Promise<void> {
  if (!isSyncEnabled) {
    return;
  }

  const { serverUrl, instanceId, deviceId, authToken } =
    await getResolvedSyncConfiguration(settings);
  let instanceKey = await ensureInstanceKey(settings);
  const deferredQueueOperations = new Map<string, QueueOperationInput>();
  const deferredSyncedOpIds = new Set<string>();
  const deferredRetryOpIds = new Set<string>();
  const deferredConflicts: ConflictPayload[] = [];
  let syncError: unknown = null;

  try {
    await normalizeInternalSyncMetadataTables();

    if (!isSyncSynchronizeEnabled) {
      return;
    }

    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt }) => {
        if (!isSyncPullEnabled) {
          return {
            changes: {} as SyncDatabaseChangeSet,
            timestamp: lastPulledAt ?? Date.now(),
          };
        }

        const response = await fetch(`${serverUrl}/api/sync/online/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: deviceId,
            auth_token: authToken,
            last_pulled_at: lastPulledAt ?? null,
          }),
        });

        if (!response.ok) {
          throw new Error(await parseErrorResponse(response));
        }

        const result = (await response.json()) as OnlinePullResponse;
        const { changes: decryptedChanges, hasPlaintextPayload } = await decryptOnlineChanges(
          result.changes || {},
          instanceKey,
          instanceId,
        );

        if (instanceKey && hasPlaintextPayload) {
          instanceKey = '';
          await persistPlaintextMode();
        }

        const normalizedChanges = await normalizePulledSingletonChanges(decryptedChanges);
        const collectedConflicts = await collectIncomingConflicts(normalizedChanges);
        deferredConflicts.push(...collectedConflicts);

        return {
          changes: normalizedChanges as unknown as SyncDatabaseChangeSet,
          timestamp: result.timestamp,
        };
      },
      pushChanges: async ({ changes, lastPulledAt }) => {
        if (!isSyncPushEnabled) {
          return;
        }

        const outgoingChanges = Object.fromEntries(
          Object.entries(changes as unknown as Record<string, OnlineTableChangeSet>).map(
            ([table, tableChanges]) => [
              table,
              {
                created: (tableChanges.created || []).map((raw) =>
                  sanitizeOutgoingSyncRecord(table, raw),
                ),
                updated: (tableChanges.updated || []).map((raw) =>
                  sanitizeOutgoingSyncRecord(table, raw),
                ),
                deleted: tableChanges.deleted || [],
              },
            ],
          ),
        ) as Record<string, OnlineTableChangeSet>;

        const queueInputs = buildQueuedOperations(outgoingChanges, lastPulledAt ?? undefined);
        queueInputs.forEach((input) => {
          deferredQueueOperations.set(input.opId, input);
        });

        const encryptedChanges = await encryptOnlineChanges(
          stripLocalOnlyTables(outgoingChanges),
          instanceKey,
          instanceId,
        );
        try {
          const response = await fetch(`${serverUrl}/api/sync/online/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              device_id: deviceId,
              auth_token: authToken,
              last_pulled_at: lastPulledAt,
              changes: encryptedChanges,
            }),
          });

          if (!response.ok) {
            throw new Error(await parseErrorResponse(response));
          }

          queueInputs.forEach((input) => {
            deferredSyncedOpIds.add(input.opId);
            deferredRetryOpIds.delete(input.opId);
          });
        } catch (error) {
          queueInputs.forEach((input) => {
            deferredRetryOpIds.add(input.opId);
            deferredSyncedOpIds.delete(input.opId);
          });
          throw error;
        }
      },
      migrationsEnabledAtVersion: 1,
    });
  } catch (error) {
    syncError = error;
  }

  const queuedOperations = Array.from(deferredQueueOperations.values());
  if (queuedOperations.length > 0) {
    await Promise.all(queuedOperations.map((input) => queueOperation(input)));
  }

  if (deferredConflicts.length > 0) {
    await Promise.all(deferredConflicts.map((input) => upsertConflict(input)));
  }

  if (deferredSyncedOpIds.size > 0) {
    await Promise.all(
      Array.from(deferredSyncedOpIds).map((opId) => markOperationSyncedByOpId(opId)),
    );
  }

  if (deferredRetryOpIds.size > 0) {
    await Promise.all(
      Array.from(deferredRetryOpIds).map((opId) => increaseOperationRetryByOpId(opId)),
    );
  }

  if (syncError) {
    throw syncError;
  }

  await getSettings();

  async function persistPlaintextMode() {
    const deviceSettings = await getDeviceSyncSettings(settings);
    if (deviceSettings.syncAllowPlaintext && !deviceSettings.syncInstanceKey) return;
    await updateDeviceSyncSettings(
      {
        syncAllowPlaintext: true,
        syncInstanceKey: null,
      },
      settings,
    );
  }
}

export async function runOnlineSyncSafely(settings: AppSettingsModel): Promise<void> {
  if (!isSyncEnabled) {
    return;
  }

  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = runOnlineSync(settings).finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export async function pullSyncEvents(
  settings: AppSettingsModel,
  since: number,
  limit = 100,
): Promise<SyncEventsPullResponse> {
  const { serverUrl, deviceId, authToken } = await getResolvedSyncConfiguration(settings);

  const response = await fetch(`${serverUrl}/api/sync/events/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      auth_token: authToken,
      since,
      limit,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return (await response.json()) as SyncEventsPullResponse;
}

export function subscribeToSyncEvents(
  config: {
    settings: AppSettingsModel;
    syncServerUrl: string;
    syncDeviceId: string;
    syncAuthToken: string;
    syncIsRegistered: boolean;
  },
  handlers: {
    onRemoteOnlinePush: (event: SyncEvent) => void;
    onError?: (error: unknown) => void;
    onTransportModeChange?: (mode: 'ws' | 'polling') => void;
  },
  options?: {
    pollIntervalMs?: number;
    initialSinceMs?: number;
  },
): () => void {
  if (!isSyncEnabled || !config.syncIsRegistered) {
    return () => {};
  }

  const serverUrl = config.syncServerUrl.trim().replace(/\/+$/, '') || '';
  const deviceId = config.syncDeviceId.trim() || '';
  const authToken = config.syncAuthToken.trim() || '';
  const ownDeviceId = deviceId;
  if (!serverUrl || !deviceId || !authToken) {
    return () => {};
  }
  const pollIntervalMs = options?.pollIntervalMs ?? 5000;
  const initialSinceMs = options?.initialSinceMs ?? Date.now();
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let wsHandshakeTimer: ReturnType<typeof setTimeout> | null = null;
  let wsConnected = false;
  let ws: WebSocket | null = null;
  let pollUnsubscribe: (() => void) | null = null;

  const toWsUrl = (httpUrl: string): string => {
    if (httpUrl.startsWith('https://')) return `wss://${httpUrl.slice('https://'.length)}`;
    if (httpUrl.startsWith('http://')) return `ws://${httpUrl.slice('http://'.length)}`;
    return httpUrl;
  };

  const startPollingFallback = () => {
    if (disposed || pollUnsubscribe) return;
    handlers.onTransportModeChange?.('polling');
    pollUnsubscribe = subscribeToSyncEventsViaPolling(
      config.settings,
      handlers,
      {
        pollIntervalMs,
        initialSinceMs,
      },
      ownDeviceId,
    );
  };

  const stopPollingFallback = () => {
    if (!pollUnsubscribe) return;
    pollUnsubscribe();
    pollUnsubscribe = null;
  };

  const clearReconnect = () => {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const clearHandshakeTimer = () => {
    if (!wsHandshakeTimer) return;
    clearTimeout(wsHandshakeTimer);
    wsHandshakeTimer = null;
  };

  const connect = () => {
    if (disposed) return;
    clearReconnect();
    clearHandshakeTimer();

    const wsUrl = toWsUrl(serverUrl);
    const endpoint = `${wsUrl}/api/sync/events/ws`;

    try {
      const NativeWebSocket = WebSocket as unknown as WebSocketWithOptionsConstructor;
      ws = new NativeWebSocket(endpoint, null, {
        headers: buildSyncAuthHeaders(authToken, deviceId),
      });
    } catch (error) {
      handlers.onError?.(error);
      startPollingFallback();
      reconnectTimer = setTimeout(connect, 3000);
      return;
    }

    wsConnected = false;
    wsHandshakeTimer = setTimeout(() => {
      if (!wsConnected && !disposed) {
        startPollingFallback();
      }
    }, 4500);

    ws.onopen = () => {
      wsConnected = true;
      clearHandshakeTimer();
      stopPollingFallback();
      handlers.onTransportModeChange?.('ws');
    };

    ws.onmessage = (message) => {
      const data = typeof message.data === 'string' ? message.data : '';
      if (!data) return;

      try {
        const event = JSON.parse(data) as SyncEventsWsMessage;
        if (event.event_type !== 'online_push') return;
        if (event.source_device_id === ownDeviceId) return;

        handlers.onRemoteOnlinePush({
          event_id: 0,
          source_device_id: event.source_device_id,
          event_type: event.event_type,
          timestamp: event.timestamp,
          payload: event.payload,
        });
      } catch (error) {
        handlers.onError?.(error);
      }
    };

    ws.onerror = (event) => {
      handlers.onError?.(event);
    };

    ws.onclose = () => {
      wsConnected = false;
      clearHandshakeTimer();
      if (disposed) return;

      startPollingFallback();
      reconnectTimer = setTimeout(connect, 3000);
    };
  };

  connect();

  return () => {
    disposed = true;
    clearReconnect();
    clearHandshakeTimer();
    stopPollingFallback();
    if (ws) {
      ws.close();
      ws = null;
    }
  };
}

function subscribeToSyncEventsViaPolling(
  settings: AppSettingsModel,
  handlers: {
    onRemoteOnlinePush: (event: SyncEvent) => void;
    onError?: (error: unknown) => void;
  },
  options: {
    pollIntervalMs: number;
    initialSinceMs: number;
  },
  ownDeviceId: string,
): () => void {
  const pollIntervalMs = options.pollIntervalMs;
  let since = options.initialSinceMs;
  let disposed = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (disposed || inFlight) return;

    inFlight = true;
    try {
      const result = await pullSyncEvents(settings, since);
      since = Math.max(since, result.latest_timestamp || 0);

      for (const event of result.events || []) {
        if (event.event_type !== 'online_push') continue;
        if (event.source_device_id === ownDeviceId) continue;
        handlers.onRemoteOnlinePush(event);
      }
    } catch (error) {
      handlers.onError?.(error);
    } finally {
      inFlight = false;
      if (!disposed) {
        timer = setTimeout(() => void tick(), pollIntervalMs);
      }
    }
  };

  timer = setTimeout(() => void tick(), pollIntervalMs);

  return () => {
    disposed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export async function createSnapshotBackup(settings: AppSettingsModel): Promise<void> {
  const { serverUrl, instanceId, deviceId, authToken } =
    await getResolvedSyncConfiguration(settings);
  const instanceKey = await ensureInstanceKey(settings);

  const snapshot = await createFullSnapshot();
  const encryptedSnapshot = instanceKey
    ? await encryptSnapshot(snapshot, instanceKey, instanceId)
    : (snapshot as unknown as Record<string, unknown>);
  const response = await fetch(`${serverUrl}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      auth_token: authToken,
      snapshot: encryptedSnapshot,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
}

export async function touchAllSyncData(options?: {
  excludeTables?: readonly (typeof SYNC_TABLES)[number][];
}): Promise<number> {
  const timestamp = Date.now();
  let touched = 0;
  const excludedTables = new Set(options?.excludeTables ?? []);

  await database.write(async () => {
    const operations: Model[] = [];

    for (const table of SYNC_TABLES) {
      if (excludedTables.has(table)) {
        continue;
      }

      const rows = await database.get(table).query().fetch();
      touched += rows.length;

      for (const row of rows) {
        operations.push(
          row.prepareUpdate(() => {
            touchRecordUpdatedAt(row as unknown as ModelInternals, timestamp);
          }),
        );
      }
    }

    if (operations.length > 0) {
      await database.batch(...operations);
    }
  });

  return touched;
}

export async function restoreSnapshotBackup(settings: AppSettingsModel): Promise<void> {
  const { serverUrl, instanceId, deviceId, authToken } =
    await getResolvedSyncConfiguration(settings);
  const preservedDeviceSettings = await getDeviceSyncSettings(settings);
  let instanceKey = await ensureInstanceKey(settings);

  const response = await fetch(`${serverUrl}/api/sync/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      auth_token: authToken,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const result = (await response.json()) as { snapshot?: SnapshotPayload | null };
  if (!result.snapshot) return;
  const rawSnapshot = result.snapshot as unknown as Record<string, unknown>;
  const snapshotIsEncrypted = isEncryptedSnapshot(rawSnapshot);
  if (instanceKey && !snapshotIsEncrypted) {
    instanceKey = '';
    const deviceSettings = await getDeviceSyncSettings(settings);
    if (!deviceSettings.syncAllowPlaintext || deviceSettings.syncInstanceKey) {
      await updateDeviceSyncSettings(
        {
          syncAllowPlaintext: true,
          syncInstanceKey: null,
        },
        settings,
      );
    }
  }
  const decryptedSnapshot =
    instanceKey && snapshotIsEncrypted
      ? await decryptSnapshot(rawSnapshot, instanceKey, instanceId)
      : rawSnapshot;
  await applySnapshot(decryptedSnapshot as SnapshotPayload);
  await updateDeviceSyncSettings(preservedDeviceSettings);
  requestAppDataReload();
}

export async function forgetServerRegistration(settings: AppSettingsModel): Promise<void> {
  const { serverUrl, deviceId, authToken } = await getResolvedSyncConfiguration(settings);

  const response = await fetch(`${serverUrl}/api/devices/forget-registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      auth_token: authToken,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
}

async function applySnapshot(snapshot: SnapshotPayload): Promise<void> {
  const normalizedSnapshot = {
    ...snapshot,
    app_settings: normalizeAppSettingsRecords(snapshot.app_settings || []),
    config_storage: filterSnapshotConfigStorageRows(snapshot.config_storage || []),
  } as SnapshotPayload;

  await database.write(async () => {
    await database.unsafeResetDatabase();

    const operations = SNAPSHOT_TABLES.flatMap((table) => {
      const rows = normalizedSnapshot[table] || [];
      const collection = database.get(table);
      return rows.map((raw) => collection.prepareCreateFromDirtyRaw(raw as DirtyRaw));
    });

    if (operations.length > 0) {
      await database.batch(...operations);
    }
  });
}

function touchRecordUpdatedAt(record: ModelInternals, timestamp: number): void {
  if (typeof record._setRaw === 'function') {
    record._setRaw('updated_at', timestamp);
    return;
  }

  if (record._raw && typeof record._raw === 'object') {
    (record._raw as Record<string, unknown>).updated_at = timestamp;
  }
}
