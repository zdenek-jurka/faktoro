import database from '@/db';
import ConfigStorageModel from '@/model/ConfigStorageModel';
import { Q } from '@nozbe/watermelondb';

function isMissingConfigStorageTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return false;
  return message.toLowerCase().includes('no such table') && message.includes('config_storage');
}

async function ensureConfigStorageTableExists(): Promise<void> {
  const adapter = database.adapter as {
    unsafeExecute?: (commands: { sqls: Array<[string, unknown[]]> }) => Promise<unknown>;
  };
  if (typeof adapter.unsafeExecute !== 'function') return;

  await adapter.unsafeExecute({
    sqls: [
      [
        `CREATE TABLE IF NOT EXISTS config_storage (
          id TEXT PRIMARY KEY,
          _status TEXT,
          _changed TEXT,
          config_key TEXT NOT NULL,
          config_value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        [],
      ],
      [
        'CREATE INDEX IF NOT EXISTS config_storage_config_key_idx ON config_storage (config_key)',
        [],
      ],
    ],
  });
}

export async function getConfigValue(configKey: string): Promise<string | null> {
  const normalizedKey = configKey.trim();
  if (!normalizedKey) return null;

  const load = async () => {
    const collection = database.get<ConfigStorageModel>(ConfigStorageModel.table);
    const records = await collection.query(Q.where('config_key', normalizedKey)).fetch();
    if (records.length === 0) return null;
    return records[0].configValue || null;
  };

  try {
    return await load();
  } catch (error) {
    if (!isMissingConfigStorageTableError(error)) throw error;
    await ensureConfigStorageTableExists();
    return load();
  }
}

export async function setConfigValue(
  configKey: string,
  value: string | null | undefined,
): Promise<void> {
  const normalizedKey = configKey.trim();
  if (!normalizedKey) return;

  const upsert = async () => {
    const normalizedValue = value?.trim() ?? '';
    const collection = database.get<ConfigStorageModel>(ConfigStorageModel.table);
    const existing = await collection.query(Q.where('config_key', normalizedKey)).fetch();

    await database.write(async () => {
      if (!normalizedValue) {
        await Promise.all(existing.map((record) => record.markAsDeleted()));
        return;
      }

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
        record.configKey = normalizedKey;
        record.configValue = normalizedValue;
      });
    });
  };

  try {
    await upsert();
  } catch (error) {
    if (!isMissingConfigStorageTableError(error)) throw error;
    await ensureConfigStorageTableExists();
    await upsert();
  }
}

export async function getConfigValuesByPrefix(prefix: string): Promise<Record<string, string>> {
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix) return {};

  const load = async () => {
    const collection = database.get<ConfigStorageModel>(ConfigStorageModel.table);
    const records = await collection.query().fetch();

    return records.reduce<Record<string, string>>((acc, record) => {
      if (!record.configKey.startsWith(normalizedPrefix)) return acc;
      if (!record.configValue?.trim()) return acc;
      acc[record.configKey] = record.configValue.trim();
      return acc;
    }, {});
  };

  try {
    return await load();
  } catch (error) {
    if (!isMissingConfigStorageTableError(error)) throw error;
    await ensureConfigStorageTableExists();
    return load();
  }
}
