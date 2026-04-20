import type AppSettingsModel from '@/model/AppSettingsModel';
import {
  getDeviceSyncSettings,
  updateDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { getSettings } from '@/repositories/settings-repository';
import { buildSyncAuthHeaders } from '@/utils/sync-auth';
import {
  extractRecoveryPayload,
  fetchWithTimeout,
  parseRecoveryPayloadFromRawOrPem,
  type ParsedRecoveryPayload,
} from '@/utils/sync-pairing-utils';

type RecoveryResponse = {
  device_id?: string | null;
  device_name?: string | null;
  auth_token?: string | null;
  instance_id?: string | null;
  allow_plaintext?: boolean;
  instance_key?: string | null;
  server_base_url?: string | null;
};

export type RecoverySyncBootstrap = {
  serverBaseUrl: string;
  deviceId: string;
  deviceName: string;
  authToken: string;
  instanceId: string;
  allowPlaintext: boolean;
  instanceKey: string;
  parsedPayload: ParsedRecoveryPayload | null;
};

type UpsertRecoveryBootstrapInput = {
  serverBaseUrl: string;
  deviceId: string;
  authToken: string;
  allowPlaintext: boolean;
  instanceKey?: string | null;
};

function normalizeString(value: string | null | undefined): string {
  return value?.trim() || '';
}

function normalizeServerUrl(value: string | null | undefined): string {
  return normalizeString(value).replace(/\/+$/, '');
}

export async function recoverSyncDeviceFromRawInput(
  rawInput: string,
  settingsOverride?: AppSettingsModel | null,
): Promise<RecoverySyncBootstrap> {
  const extracted = extractRecoveryPayload(rawInput);
  const parsedPayload = parseRecoveryPayloadFromRawOrPem(extracted);
  const settings = settingsOverride ?? (await getSettings());
  const currentDeviceSettings = await getDeviceSyncSettings(settings);

  const serverBaseUrl =
    normalizeServerUrl(parsedPayload?.serverBaseUrl) ||
    normalizeServerUrl(currentDeviceSettings.syncServerUrl);
  if (!serverBaseUrl) {
    throw new Error('Sync server URL is missing');
  }

  const rawCode = normalizeString(extracted);
  if (!rawCode) {
    throw new Error('Recovery code is required.');
  }

  const response = await fetchWithTimeout(`${serverBaseUrl}/api/devices/recover-from-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_code: rawCode }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const result = ((await response.json()) as RecoveryResponse | null) ?? {};
  const deviceId =
    normalizeString(result.device_id) ||
    normalizeString(parsedPayload?.deviceId) ||
    normalizeString(currentDeviceSettings.syncDeviceId);
  const deviceName =
    normalizeString(result.device_name) || normalizeString(currentDeviceSettings.syncDeviceName);
  const authToken = normalizeString(result.auth_token);
  const instanceId =
    normalizeString(result.instance_id) ||
    normalizeString(parsedPayload?.instanceId) ||
    normalizeString(currentDeviceSettings.syncInstanceId);

  if (!deviceId) {
    throw new Error('Sync device ID is missing');
  }
  if (!authToken) {
    throw new Error('Sync auth token is missing (device not registered)');
  }
  if (!instanceId) {
    throw new Error('Sync instance ID is missing');
  }

  const allowPlaintext =
    typeof result.allow_plaintext === 'boolean'
      ? result.allow_plaintext
      : typeof parsedPayload?.allowPlaintext === 'boolean'
        ? parsedPayload.allowPlaintext
        : currentDeviceSettings.syncAllowPlaintext;
  const instanceKey =
    normalizeString(result.instance_key) ||
    normalizeString(parsedPayload?.instanceKey) ||
    normalizeString(currentDeviceSettings.syncInstanceKey);

  await updateDeviceSyncSettings(
    {
      syncServerUrl: normalizeServerUrl(result.server_base_url) || serverBaseUrl,
      syncInstanceId: instanceId,
      syncDeviceId: deviceId,
      syncDeviceName: deviceName || null,
      syncPairingToken: null,
      syncAuthToken: authToken,
      syncIsRegistered: true,
      syncInstanceKey: instanceKey || null,
      syncAllowPlaintext: allowPlaintext,
    },
    settings,
  );

  return {
    serverBaseUrl: normalizeServerUrl(result.server_base_url) || serverBaseUrl,
    deviceId,
    deviceName,
    authToken,
    instanceId,
    allowPlaintext,
    instanceKey,
    parsedPayload,
  };
}

export async function upsertSyncRecoveryBootstrap(
  input: UpsertRecoveryBootstrapInput,
): Promise<void> {
  const serverBaseUrl = normalizeServerUrl(input.serverBaseUrl);
  const deviceId = normalizeString(input.deviceId);
  const authToken = normalizeString(input.authToken);
  if (!serverBaseUrl) {
    throw new Error('Sync server URL is missing');
  }
  if (!deviceId) {
    throw new Error('Sync device ID is missing');
  }
  if (!authToken) {
    throw new Error('Sync auth token is missing (device not registered)');
  }

  const response = await fetchWithTimeout(`${serverBaseUrl}/api/sync/recovery-bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildSyncAuthHeaders(authToken, deviceId),
    },
    body: JSON.stringify({
      device_id: deviceId,
      auth_token: authToken,
      allow_plaintext: input.allowPlaintext,
      instance_key: normalizeString(input.instanceKey) || null,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
