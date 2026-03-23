import { CompanyRegistryKey } from './registry-options';

export type CompanyRegistrySettingKey =
  | 'api_key'
  | 'api_token'
  | 'url'
  | 'header_key'
  | 'header_value';

const REQUIRED_SETTINGS: Partial<Record<CompanyRegistryKey, CompanyRegistrySettingKey[]>> = {
  uk_companies_house: ['api_key'],
  fr_insee: ['api_token'],
  custom_connector: ['url'],
};

export function getRequiredCompanyRegistrySettingKeys(
  registryKey: CompanyRegistryKey,
): CompanyRegistrySettingKey[] {
  return REQUIRED_SETTINGS[registryKey] ?? [];
}
