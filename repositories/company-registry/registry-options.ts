export type CompanyRegistryKey =
  | 'none'
  | 'ares'
  | 'uk_companies_house'
  | 'no_brreg'
  | 'ee_ariregister'
  | 'fr_insee'
  | 'custom_connector';

export function normalizeCompanyRegistryKey(value?: string | null): CompanyRegistryKey {
  if (value === 'ares') return 'ares';
  if (value === 'uk_companies_house') return 'uk_companies_house';
  if (value === 'no_brreg') return 'no_brreg';
  if (value === 'ee_ariregister') return 'ee_ariregister';
  if (value === 'fr_insee') return 'fr_insee';
  if (value === 'custom_connector') return 'custom_connector';
  return 'none';
}
