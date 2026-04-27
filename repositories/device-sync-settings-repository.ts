import database from '@/db';
import ConfigStorageModel from '@/model/ConfigStorageModel';
import { getConfigValue, getConfigValuesByPrefix } from '@/repositories/config-storage-repository';

const KEY_PREFIX = 'device_sync.';
const SYNC_SERVER_URL_KEY = `${KEY_PREFIX}server_url`;
const SYNC_INSTANCE_ID_KEY = `${KEY_PREFIX}instance_id`;
const SYNC_DEVICE_ID_KEY = `${KEY_PREFIX}device_id`;
const SYNC_DEVICE_NAME_KEY = `${KEY_PREFIX}device_name`;
const SYNC_PAIRING_TOKEN_KEY = `${KEY_PREFIX}pairing_token`;
const SYNC_AUTH_TOKEN_KEY = `${KEY_PREFIX}auth_token`;
const SYNC_IS_REGISTERED_KEY = `${KEY_PREFIX}is_registered`;
const SYNC_AUTO_ENABLED_KEY = `${KEY_PREFIX}auto_enabled`;
const SYNC_INSTANCE_KEY_KEY = `${KEY_PREFIX}instance_key`;
const SYNC_ALLOW_PLAINTEXT_KEY = `${KEY_PREFIX}allow_plaintext`;
const SYNC_FEATURE_ENABLED_KEY = `${KEY_PREFIX}feature_enabled`;
const TIMER_WIDGETS_ENABLED_KEY = `${KEY_PREFIX}timer_widgets_enabled`;
const SYNC_STATUS_INDICATOR_ENABLED_KEY = `${KEY_PREFIX}status_indicator_enabled`;

const ALL_KEYS = [
  SYNC_SERVER_URL_KEY,
  SYNC_INSTANCE_ID_KEY,
  SYNC_DEVICE_ID_KEY,
  SYNC_DEVICE_NAME_KEY,
  SYNC_PAIRING_TOKEN_KEY,
  SYNC_AUTH_TOKEN_KEY,
  SYNC_IS_REGISTERED_KEY,
  SYNC_AUTO_ENABLED_KEY,
  SYNC_INSTANCE_KEY_KEY,
  SYNC_ALLOW_PLAINTEXT_KEY,
  SYNC_FEATURE_ENABLED_KEY,
  TIMER_WIDGETS_ENABLED_KEY,
  SYNC_STATUS_INDICATOR_ENABLED_KEY,
] as const;

export type DeviceSyncSettings = {
  syncServerUrl: string;
  syncInstanceId: string;
  syncDeviceId: string;
  syncDeviceName: string;
  syncPairingToken: string;
  syncAuthToken: string;
  syncIsRegistered: boolean;
  syncAutoEnabled: boolean;
  syncInstanceKey: string;
  syncAllowPlaintext: boolean;
  syncFeatureEnabled: boolean;
  timerWidgetsEnabled: boolean;
  syncStatusIndicatorEnabled: boolean;
};

export type UpdateDeviceSyncSettingsInput = {
  syncServerUrl?: string | null;
  syncInstanceId?: string | null;
  syncDeviceId?: string | null;
  syncDeviceName?: string | null;
  syncPairingToken?: string | null;
  syncAuthToken?: string | null;
  syncIsRegistered?: boolean;
  syncAutoEnabled?: boolean;
  syncInstanceKey?: string | null;
  syncAllowPlaintext?: boolean;
  syncFeatureEnabled?: boolean;
  timerWidgetsEnabled?: boolean;
  syncStatusIndicatorEnabled?: boolean;
};

const DEFAULT_DEVICE_SYNC_SETTINGS: DeviceSyncSettings = {
  syncServerUrl: '',
  syncInstanceId: '',
  syncDeviceId: '',
  syncDeviceName: '',
  syncPairingToken: '',
  syncAuthToken: '',
  syncIsRegistered: false,
  syncAutoEnabled: true,
  syncInstanceKey: '',
  syncAllowPlaintext: false,
  syncFeatureEnabled: false,
  timerWidgetsEnabled: true,
  syncStatusIndicatorEnabled: false,
};

function normalizeString(value: string | null | undefined): string {
  return value?.trim() || '';
}

function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return value === 'true';
}

function hydrateDeviceSyncSettings(values: Record<string, string>): DeviceSyncSettings {
  return {
    syncServerUrl: normalizeString(values[SYNC_SERVER_URL_KEY]),
    syncInstanceId: normalizeString(values[SYNC_INSTANCE_ID_KEY]),
    syncDeviceId: normalizeString(values[SYNC_DEVICE_ID_KEY]),
    syncDeviceName: normalizeString(values[SYNC_DEVICE_NAME_KEY]),
    syncPairingToken: normalizeString(values[SYNC_PAIRING_TOKEN_KEY]),
    syncAuthToken: normalizeString(values[SYNC_AUTH_TOKEN_KEY]),
    syncIsRegistered: parseBoolean(
      values[SYNC_IS_REGISTERED_KEY],
      DEFAULT_DEVICE_SYNC_SETTINGS.syncIsRegistered,
    ),
    syncAutoEnabled: parseBoolean(
      values[SYNC_AUTO_ENABLED_KEY],
      DEFAULT_DEVICE_SYNC_SETTINGS.syncAutoEnabled,
    ),
    syncInstanceKey: normalizeString(values[SYNC_INSTANCE_KEY_KEY]),
    syncAllowPlaintext: parseBoolean(
      values[SYNC_ALLOW_PLAINTEXT_KEY],
      DEFAULT_DEVICE_SYNC_SETTINGS.syncAllowPlaintext,
    ),
    syncFeatureEnabled: parseBoolean(
      values[SYNC_FEATURE_ENABLED_KEY],
      DEFAULT_DEVICE_SYNC_SETTINGS.syncFeatureEnabled,
    ),
    timerWidgetsEnabled: parseBoolean(
      values[TIMER_WIDGETS_ENABLED_KEY],
      DEFAULT_DEVICE_SYNC_SETTINGS.timerWidgetsEnabled,
    ),
    syncStatusIndicatorEnabled: parseBoolean(
      values[SYNC_STATUS_INDICATOR_ENABLED_KEY],
      DEFAULT_DEVICE_SYNC_SETTINGS.syncStatusIndicatorEnabled,
    ),
  };
}

async function persistDeviceSyncSettings(settings: DeviceSyncSettings): Promise<void> {
  const keysAndValues: [string, string | null][] = [
    [SYNC_SERVER_URL_KEY, settings.syncServerUrl || null],
    [SYNC_INSTANCE_ID_KEY, settings.syncInstanceId || null],
    [SYNC_DEVICE_ID_KEY, settings.syncDeviceId || null],
    [SYNC_DEVICE_NAME_KEY, settings.syncDeviceName || null],
    [SYNC_PAIRING_TOKEN_KEY, settings.syncPairingToken || null],
    [SYNC_AUTH_TOKEN_KEY, settings.syncAuthToken || null],
    [SYNC_IS_REGISTERED_KEY, String(settings.syncIsRegistered)],
    [SYNC_AUTO_ENABLED_KEY, String(settings.syncAutoEnabled)],
    [SYNC_INSTANCE_KEY_KEY, settings.syncInstanceKey || null],
    [SYNC_ALLOW_PLAINTEXT_KEY, String(settings.syncAllowPlaintext)],
    [SYNC_FEATURE_ENABLED_KEY, String(settings.syncFeatureEnabled)],
    [TIMER_WIDGETS_ENABLED_KEY, String(settings.timerWidgetsEnabled)],
    [SYNC_STATUS_INDICATOR_ENABLED_KEY, String(settings.syncStatusIndicatorEnabled)],
  ];

  // Read existing records before the write so the observer fires only once
  // with the complete final state (not after each individual key write).
  const collection = database.get<ConfigStorageModel>(ConfigStorageModel.table);
  const allRecords = await collection.query().fetch();
  const recordsByKey = new Map<string, ConfigStorageModel[]>();
  for (const record of allRecords) {
    if (!record.configKey.startsWith(KEY_PREFIX)) continue;
    const arr = recordsByKey.get(record.configKey) ?? [];
    arr.push(record);
    recordsByKey.set(record.configKey, arr);
  }

  await database.write(async () => {
    for (const [key, value] of keysAndValues) {
      const normalizedValue = value?.trim() ?? '';
      const existing = recordsByKey.get(key) ?? [];

      if (!normalizedValue) {
        await Promise.all(existing.map((r) => r.markAsDeleted()));
        continue;
      }

      if (existing.length > 0) {
        await existing[0].update((r) => {
          r.configValue = normalizedValue;
        });
        if (existing.length > 1) {
          await Promise.all(existing.slice(1).map((r) => r.markAsDeleted()));
        }
        continue;
      }

      await collection.create((r) => {
        r.configKey = key;
        r.configValue = normalizedValue;
      });
    }
  });
}

export async function getDeviceSyncSettings(
  _sharedSettings?: unknown,
): Promise<DeviceSyncSettings> {
  const values = await getConfigValuesByPrefix(KEY_PREFIX);
  if (Object.keys(values).length > 0) {
    return hydrateDeviceSyncSettings(values);
  }

  return { ...DEFAULT_DEVICE_SYNC_SETTINGS };
}

export async function updateDeviceSyncSettings(
  input: UpdateDeviceSyncSettingsInput,
  _sharedSettings?: unknown,
): Promise<DeviceSyncSettings> {
  const current = await getDeviceSyncSettings();
  const next: DeviceSyncSettings = {
    syncServerUrl:
      input.syncServerUrl !== undefined
        ? normalizeString(input.syncServerUrl)
        : current.syncServerUrl,
    syncInstanceId:
      input.syncInstanceId !== undefined
        ? normalizeString(input.syncInstanceId)
        : current.syncInstanceId,
    syncDeviceId:
      input.syncDeviceId !== undefined ? normalizeString(input.syncDeviceId) : current.syncDeviceId,
    syncDeviceName:
      input.syncDeviceName !== undefined
        ? normalizeString(input.syncDeviceName)
        : current.syncDeviceName,
    syncPairingToken:
      input.syncPairingToken !== undefined
        ? normalizeString(input.syncPairingToken)
        : current.syncPairingToken,
    syncAuthToken:
      input.syncAuthToken !== undefined
        ? normalizeString(input.syncAuthToken)
        : current.syncAuthToken,
    syncIsRegistered:
      input.syncIsRegistered !== undefined ? input.syncIsRegistered : current.syncIsRegistered,
    syncAutoEnabled:
      input.syncAutoEnabled !== undefined ? input.syncAutoEnabled : current.syncAutoEnabled,
    syncInstanceKey:
      input.syncInstanceKey !== undefined
        ? normalizeString(input.syncInstanceKey)
        : current.syncInstanceKey,
    syncAllowPlaintext:
      input.syncAllowPlaintext !== undefined
        ? input.syncAllowPlaintext
        : current.syncAllowPlaintext,
    syncFeatureEnabled:
      input.syncFeatureEnabled !== undefined
        ? input.syncFeatureEnabled
        : current.syncFeatureEnabled,
    timerWidgetsEnabled:
      input.timerWidgetsEnabled !== undefined
        ? input.timerWidgetsEnabled
        : current.timerWidgetsEnabled,
    syncStatusIndicatorEnabled:
      input.syncStatusIndicatorEnabled !== undefined
        ? input.syncStatusIndicatorEnabled
        : current.syncStatusIndicatorEnabled,
  };

  await persistDeviceSyncSettings(next);
  return next;
}

export function observeDeviceSyncSettings(
  listener: (settings: DeviceSyncSettings) => void,
): () => void {
  const collection = database.get<ConfigStorageModel>(ConfigStorageModel.table);
  const subscription = collection
    .query()
    // Re-emit when config values change on existing rows, not only when the
    // result set membership changes. This keeps runtime feature toggles in sync
    // without requiring an app restart.
    .observeWithColumns(['config_key', 'config_value'])
    .subscribe((records) => {
      const values = records.reduce<Record<string, string>>((acc, record) => {
        if (!record.configKey.startsWith(KEY_PREFIX)) return acc;
        acc[record.configKey] = record.configValue || '';
        return acc;
      }, {});
      listener(hydrateDeviceSyncSettings(values));
    });

  return () => subscription.unsubscribe();
}

export async function getLocalDeviceContext(
  _sharedSettings?: unknown,
): Promise<{ deviceId?: string; deviceName?: string }> {
  const settings = await getDeviceSyncSettings();
  return {
    deviceId: settings.syncDeviceId || undefined,
    deviceName: settings.syncDeviceName || undefined,
  };
}

export async function getDeviceSyncValue(
  configKey: (typeof ALL_KEYS)[number],
): Promise<string | null> {
  if (!ALL_KEYS.includes(configKey)) {
    return null;
  }
  return getConfigValue(configKey);
}
