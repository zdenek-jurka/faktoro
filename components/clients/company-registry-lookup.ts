import { CompanyRegistryLookupError } from '@/repositories/company-registry';
import {
  getRequiredCompanyRegistrySettingKeys,
  type CompanyRegistryKey,
} from '@/repositories/company-registry';
import {
  getRegistrySetting,
  getRegistrySettings,
} from '@/repositories/registry-settings-repository';
import { Alert } from 'react-native';

export const COMPANY_REGISTRY_OPTIONS: CompanyRegistryKey[] = [
  'ares',
  'uk_companies_house',
  'no_brreg',
  'ee_ariregister',
  'fr_insee',
  'custom_connector',
];

export type RegistrySettingsRoute =
  | '/settings/company-registry-uk'
  | '/settings/company-registry-fr'
  | '/settings/company-registry-custom';

export type LookupLocalization = {
  common: {
    cancel: () => string;
    error: () => string;
  };
  settings: {
    companyRegistryDefault: () => string;
    companyRegistryOptionNone: () => string;
    companyRegistryOptionAres: () => string;
    companyRegistryOptionUkCompaniesHouse: () => string;
    companyRegistryOptionNoBrreg: () => string;
    companyRegistryOptionEeAriregister: () => string;
    companyRegistryOptionFrInsee: () => string;
    companyRegistryOptionCustomConnector: () => string;
  };
  clients: {
    companyRegistryConfigurationPrompt: () => string;
    companyRegistryOpenSettings: () => string;
    errorCompanyRegistryConfigurationRequired: () => string;
  };
};

export function getRegistryLabel(LL: LookupLocalization, registryKey: CompanyRegistryKey): string {
  if (registryKey === 'none') return LL.settings.companyRegistryOptionNone();
  if (registryKey === 'ares') return LL.settings.companyRegistryOptionAres();
  if (registryKey === 'uk_companies_house')
    return LL.settings.companyRegistryOptionUkCompaniesHouse();
  if (registryKey === 'no_brreg') return LL.settings.companyRegistryOptionNoBrreg();
  if (registryKey === 'ee_ariregister') return LL.settings.companyRegistryOptionEeAriregister();
  if (registryKey === 'fr_insee') return LL.settings.companyRegistryOptionFrInsee();
  return LL.settings.companyRegistryOptionCustomConnector();
}

export function getRegistrySettingsRoute(
  registryKey: CompanyRegistryKey,
): RegistrySettingsRoute | null {
  if (registryKey === 'uk_companies_house') return '/settings/company-registry-uk';
  if (registryKey === 'fr_insee') return '/settings/company-registry-fr';
  if (registryKey === 'custom_connector') return '/settings/company-registry-custom';
  return null;
}

export function requestMissingRegistryConfiguration(
  LL: LookupLocalization,
  registryKey: CompanyRegistryKey,
  onOpenSettings: (route: RegistrySettingsRoute) => void,
  detailMessage?: string,
): void {
  const settingsRoute = getRegistrySettingsRoute(registryKey);
  if (!settingsRoute) {
    Alert.alert(LL.common.error(), LL.clients.errorCompanyRegistryConfigurationRequired());
    return;
  }

  const message = detailMessage?.trim()
    ? `${LL.clients.companyRegistryConfigurationPrompt()}\n${detailMessage}`
    : LL.clients.companyRegistryConfigurationPrompt();

  Alert.alert(LL.common.error(), message, [
    { text: LL.common.cancel(), style: 'cancel' },
    {
      text: LL.clients.companyRegistryOpenSettings(),
      onPress: () => onOpenSettings(settingsRoute),
    },
  ]);
}

export async function loadRegistrySettingsForLookup(
  registryKey: CompanyRegistryKey,
): Promise<Record<string, string>> {
  const requiredKeys = getRequiredCompanyRegistrySettingKeys(registryKey);
  try {
    const loaded = await getRegistrySettings(registryKey);
    if (requiredKeys.length === 0) return loaded;

    const withFallback = { ...loaded };

    if (
      registryKey === 'uk_companies_house' &&
      !withFallback.api_key?.trim() &&
      withFallback.rest_api_key?.trim()
    ) {
      withFallback.api_key = withFallback.rest_api_key.trim();
    }

    if (
      registryKey === 'fr_insee' &&
      !withFallback.api_token?.trim() &&
      withFallback.api_key?.trim()
    ) {
      withFallback.api_token = withFallback.api_key.trim();
    }

    await Promise.all(
      requiredKeys.map(async (requiredKey) => {
        if (withFallback[requiredKey]?.trim()) return;
        const directValue = await getRegistrySetting(registryKey, requiredKey);
        if (directValue?.trim()) {
          withFallback[requiredKey] = directValue.trim();
        }
      }),
    );
    return withFallback;
  } catch {
    if (requiredKeys.length > 0) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Unable to load required registry configuration',
      );
    }
    return {};
  }
}
