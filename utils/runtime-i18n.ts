import { resolveAppLanguageSetting } from '@/i18n/locale-options';
import type { TranslationFunctions } from '@/i18n/i18n-types';
import { baseLocale, i18nObject } from '@/i18n/i18n-util';
import { loadLocaleAsync } from '@/i18n/i18n-util.async';
import { getSettings } from '@/repositories/settings-repository';

export async function getStoredTranslationFunctions(): Promise<TranslationFunctions> {
  const settings = await getSettings();
  const locale = resolveAppLanguageSetting(settings.language, baseLocale);
  await loadLocaleAsync(locale);
  return i18nObject(locale);
}
