import {
  getConfigValue,
  getConfigValuesByPrefix,
  setConfigValue,
} from '@/repositories/config-storage-repository';

function toConfigKey(registryKey: string, settingKey: string): string {
  return `registry.${registryKey}.${settingKey}`;
}

function getRegistryPrefix(registryKey: string): string {
  return `registry.${registryKey}.`;
}

export async function getRegistrySetting(
  registryKey: string,
  settingKey: string,
): Promise<string | null> {
  return getConfigValue(toConfigKey(registryKey, settingKey));
}

export async function getRegistrySettings(registryKey: string): Promise<Record<string, string>> {
  const prefix = getRegistryPrefix(registryKey);
  const values = await getConfigValuesByPrefix(prefix);
  return Object.entries(values).reduce<Record<string, string>>((acc, [fullKey, value]) => {
    const settingKey = fullKey.slice(prefix.length);
    if (settingKey) {
      acc[settingKey] = value;
    }
    return acc;
  }, {});
}

export async function upsertRegistrySetting(
  registryKey: string,
  settingKey: string,
  value: string | null | undefined,
): Promise<void> {
  await setConfigValue(toConfigKey(registryKey, settingKey), value);
}
