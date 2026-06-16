import database from '@/db';
import ConfigStorageModel from '@/model/ConfigStorageModel';
import { getConfigValue, setConfigValue } from '@/repositories/config-storage-repository';
import { resolveSeriesDeviceToken } from '@/utils/series-utils';
import { Q } from '@nozbe/watermelondb';

export type DocumentSeriesKind = 'invoice' | 'timesheet';

export type DocumentSeriesCounter = {
  kind: DocumentSeriesKind;
  perDevice: boolean;
  deviceCode: string;
  deviceToken: string;
  nextNumber: number;
  counterKey?: string;
};

type ResolveDocumentSeriesCounterInput = {
  kind: DocumentSeriesKind;
  perDevice?: boolean | null;
  sharedDeviceCode?: string | null;
  syncDeviceName?: string | null;
  syncDeviceId?: string | null;
  sharedNextNumber?: number | string | null;
};

const KEY_PREFIX = 'document_numbering.';

function deviceCodeKey(kind: DocumentSeriesKind): string {
  return `${KEY_PREFIX}${kind}.device_code`;
}

function nextNumberKey(kind: DocumentSeriesKind, deviceToken: string): string {
  return `${KEY_PREFIX}${kind}.next_number.${deviceToken}`;
}

function normalizeNextNumber(value: number | string | null | undefined, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

export async function getLocalSeriesDeviceCode(
  kind: DocumentSeriesKind,
  sharedDeviceCode?: string | null,
): Promise<string> {
  const localCode = await getConfigValue(deviceCodeKey(kind));
  return localCode?.trim() || sharedDeviceCode?.trim() || '';
}

export async function setLocalSeriesDeviceCode(
  kind: DocumentSeriesKind,
  deviceCode: string | null | undefined,
): Promise<void> {
  await setConfigValue(deviceCodeKey(kind), deviceCode?.trim() || null);
}

export async function resolveDocumentSeriesCounter(
  input: ResolveDocumentSeriesCounterInput,
): Promise<DocumentSeriesCounter> {
  const perDevice = !!input.perDevice;
  const deviceCode = await getLocalSeriesDeviceCode(input.kind, input.sharedDeviceCode);
  const deviceToken = resolveSeriesDeviceToken({
    perDevice,
    deviceCode,
    syncDeviceName: input.syncDeviceName,
    syncDeviceId: input.syncDeviceId,
  });
  const sharedNextNumber = normalizeNextNumber(input.sharedNextNumber);

  if (!perDevice) {
    return {
      kind: input.kind,
      perDevice,
      deviceCode,
      deviceToken,
      nextNumber: sharedNextNumber,
    };
  }

  const counterKey = nextNumberKey(input.kind, deviceToken);
  const localNextNumber = await getConfigValue(counterKey);

  return {
    kind: input.kind,
    perDevice,
    deviceCode,
    deviceToken,
    nextNumber: normalizeNextNumber(localNextNumber, sharedNextNumber),
    counterKey,
  };
}

export async function setDocumentSeriesCounterNextNumber(
  counter: DocumentSeriesCounter,
  nextNumber: number,
): Promise<void> {
  if (!counter.perDevice || !counter.counterKey) {
    return;
  }

  await setConfigValue(counter.counterKey, String(normalizeNextNumber(nextNumber)));
}

export async function setDocumentSeriesCounterNextNumberInCurrentWrite(
  counter: DocumentSeriesCounter,
  nextNumber: number,
): Promise<void> {
  if (!counter.perDevice || !counter.counterKey) {
    return;
  }

  const normalizedValue = String(normalizeNextNumber(nextNumber));
  const collection = database.get<ConfigStorageModel>(ConfigStorageModel.table);
  const existing = await collection.query(Q.where('config_key', counter.counterKey)).fetch();

  if (existing.length > 0) {
    await existing[0].update((record) => {
      record.configValue = normalizedValue;
    });
    if (existing.length > 1) {
      await Promise.all(existing.slice(1).map((record) => record.markAsDeleted()));
    }
    return;
  }

  await collection.create((record) => {
    record.configKey = counter.counterKey || '';
    record.configValue = normalizedValue;
  });
}
