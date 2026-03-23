import type { Locales } from './i18n-types';
import { isLocale } from './i18n-util';
import * as Localization from 'expo-localization';

export type LocaleLabelLocalization = {
  settings: {
    languageOptionEnglish: () => string;
    languageOptionCzech: () => string;
    languageOptionGerman: () => string;
    languageOptionFrench: () => string;
    languageOptionPortuguese: () => string;
    languageOptionPolish: () => string;
    languageOptionSpanish: () => string;
  };
};

export const APP_LOCALE_OPTIONS: Locales[] = ['en', 'cs', 'de', 'fr', 'pt', 'pl', 'es'];
export type AppLanguageSetting = Locales | 'system';
export const APP_LANGUAGE_SETTING_OPTIONS: AppLanguageSetting[] = ['system', ...APP_LOCALE_OPTIONS];

const APP_LOCALE_NATIVE_LABELS: Record<Locales, string> = {
  en: 'English',
  cs: 'Čeština',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  pl: 'Polski',
  es: 'Español',
};

const APP_LANGUAGE_SYSTEM_LABELS: Record<Locales, string> = {
  en: 'System default',
  cs: 'Podle systému',
  de: 'Systemstandard',
  fr: 'Par défaut du système',
  pt: 'Padrão do sistema',
  pl: 'Domyślny systemowy',
  es: 'Predeterminado del sistema',
};

const APP_LOCALE_MORE_LABELS: Record<Locales, string> = {
  en: 'More',
  cs: 'Další',
  de: 'Mehr',
  fr: 'Plus',
  pt: 'Mais',
  pl: 'Więcej',
  es: 'Más',
};

const APP_LOCALE_INTL_TAGS: Record<Locales, string> = {
  en: 'en-US',
  cs: 'cs-CZ',
  de: 'de-DE',
  fr: 'fr-FR',
  pt: 'pt-PT',
  pl: 'pl-PL',
  es: 'es-ES',
};

export function getLocaleLabel(LL: LocaleLabelLocalization, locale: Locales): string {
  void LL;
  return APP_LOCALE_NATIVE_LABELS[locale];
}

export function getLocaleOptions(LL: LocaleLabelLocalization): {
  value: Locales;
  label: string;
}[] {
  return APP_LOCALE_OPTIONS.map((option) => ({
    value: option,
    label: getLocaleLabel(LL, option),
  }));
}

export function getLanguageSettingLabel(
  displayLocale: Locales,
  languageSetting: AppLanguageSetting,
): string {
  if (languageSetting === 'system') {
    return APP_LANGUAGE_SYSTEM_LABELS[displayLocale] ?? APP_LANGUAGE_SYSTEM_LABELS.en;
  }
  return APP_LOCALE_NATIVE_LABELS[languageSetting];
}

export function getLanguageSettingOptions(displayLocale: Locales): {
  value: AppLanguageSetting;
  label: string;
}[] {
  return APP_LANGUAGE_SETTING_OPTIONS.map((option) => ({
    value: option,
    label: getLanguageSettingLabel(displayLocale, option),
  }));
}

export function normalizeLanguageSetting(
  value: unknown,
  fallback: AppLanguageSetting = 'system',
): AppLanguageSetting {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'system') {
      return 'system';
    }
    if (isLocale(normalized)) {
      return normalized;
    }
  }
  return fallback;
}

export function getSystemLocaleFallbackEn(): Locales {
  const locales = Localization.getLocales();
  for (const localeOption of locales) {
    const normalizedLanguageCode = localeOption.languageCode?.trim().toLowerCase();
    if (normalizedLanguageCode && isLocale(normalizedLanguageCode)) {
      return normalizedLanguageCode;
    }

    const normalizedTagPrefix = localeOption.languageTag?.split('-')[0]?.trim().toLowerCase();
    if (normalizedTagPrefix && isLocale(normalizedTagPrefix)) {
      return normalizedTagPrefix;
    }
  }
  return 'en';
}

export function resolveAppLanguageSetting(
  languageSetting: unknown,
  fallback: Locales = 'en',
): Locales {
  const normalizedSetting = normalizeLanguageSetting(languageSetting, 'system');
  if (normalizedSetting === 'system') {
    return getSystemLocaleFallbackEn();
  }
  return normalizeLocale(normalizedSetting, fallback);
}

export function normalizeLocale(value: unknown, fallback: Locales = 'en'): Locales {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (isLocale(normalized)) {
      return normalized;
    }
  }
  return fallback;
}

export function getIntlLocale(locale: Locales): string {
  return APP_LOCALE_INTL_TAGS[locale];
}

export function normalizeIntlLocale(value: unknown, fallback: Locales = 'en'): string {
  const normalized = normalizeLocale(value, fallback);
  return getIntlLocale(normalized);
}

export function getMoreSectionTitle(locale: Locales): string {
  return APP_LOCALE_MORE_LABELS[locale];
}
