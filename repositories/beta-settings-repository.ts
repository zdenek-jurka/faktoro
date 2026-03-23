import database from '@/db';
import ConfigStorageModel from '@/model/ConfigStorageModel';
import { getConfigValuesByPrefix } from '@/repositories/config-storage-repository';

const KEY_PREFIX = 'beta.';
const EXPORT_INTEGRATIONS_KEY = `${KEY_PREFIX}export_integrations_enabled`;

export type BetaSettings = {
  exportIntegrationsEnabled: boolean;
};

const DEFAULT_BETA_SETTINGS: BetaSettings = {
  exportIntegrationsEnabled: false,
};

function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return value === 'true';
}

function hydrateBetaSettings(values: Record<string, string>): BetaSettings {
  return {
    exportIntegrationsEnabled: parseBoolean(
      values[EXPORT_INTEGRATIONS_KEY],
      DEFAULT_BETA_SETTINGS.exportIntegrationsEnabled,
    ),
  };
}

export async function getBetaSettings(): Promise<BetaSettings> {
  const values = await getConfigValuesByPrefix(KEY_PREFIX);
  if (Object.keys(values).length > 0) {
    return hydrateBetaSettings(values);
  }
  return { ...DEFAULT_BETA_SETTINGS };
}

export async function updateBetaSettings(input: Partial<BetaSettings>): Promise<BetaSettings> {
  const current = await getBetaSettings();
  const next: BetaSettings = {
    exportIntegrationsEnabled:
      input.exportIntegrationsEnabled !== undefined
        ? input.exportIntegrationsEnabled
        : current.exportIntegrationsEnabled,
  };

  const keysAndValues: Array<[string, string]> = [
    [EXPORT_INTEGRATIONS_KEY, String(next.exportIntegrationsEnabled)],
  ];

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
      const existing = recordsByKey.get(key) ?? [];
      if (existing.length > 0) {
        await existing[0].update((r) => {
          r.configValue = value;
        });
        if (existing.length > 1) {
          await Promise.all(existing.slice(1).map((r) => r.markAsDeleted()));
        }
        continue;
      }
      await collection.create((r) => {
        r.configKey = key;
        r.configValue = value;
      });
    }
  });

  return next;
}

export function observeBetaSettings(listener: (settings: BetaSettings) => void): () => void {
  const collection = database.get<ConfigStorageModel>(ConfigStorageModel.table);
  const subscription = collection
    .query()
    .observe()
    .subscribe((records) => {
      const values = records.reduce<Record<string, string>>((acc, record) => {
        if (!record.configKey.startsWith(KEY_PREFIX)) return acc;
        acc[record.configKey] = record.configValue || '';
        return acc;
      }, {});
      listener(hydrateBetaSettings(values));
    });
  return () => subscription.unsubscribe();
}
