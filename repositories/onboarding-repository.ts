import { getConfigValue, setConfigValue } from '@/repositories/config-storage-repository';

const KEY = 'onboarding_completed';

export async function isOnboardingCompleted(): Promise<boolean> {
  const val = await getConfigValue(KEY);
  return val === 'true';
}

export async function setOnboardingCompleted(): Promise<void> {
  await setConfigValue(KEY, 'true');
}
