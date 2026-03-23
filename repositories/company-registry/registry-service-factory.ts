import { AresCompanyRegistryService } from './ares-company-registry';
import { AriregisterCompanyRegistryService } from './ariregister-company-registry';
import { BrregCompanyRegistryService } from './brreg-company-registry';
import { normalizeCompanyRegistryCompany } from './company-result-normalizer';
import { CompaniesHouseRegistryService } from './companies-house-registry';
import { CustomCompanyRegistryService } from './custom-company-registry';
import { InseeSireneRegistryService } from './insee-sirene-registry';
import { CompanyRegistryKey } from './registry-options';
import { CompanyRegistryService } from './types';

export type CompanyRegistryRuntimeSettings = Partial<Record<string, string>>;

export function getCompanyRegistryService(
  registryKey: CompanyRegistryKey,
  runtimeSettings?: CompanyRegistryRuntimeSettings,
): CompanyRegistryService | null {
  if (registryKey === 'none') return null;
  const baseService = createBaseService(registryKey, runtimeSettings);
  if (!baseService) return null;

  return {
    countryCode: baseService.countryCode,
    registryName: baseService.registryName,
    async lookupCompanyById(companyId: string) {
      const rawCompany = await baseService.lookupCompanyById(companyId);
      return normalizeCompanyRegistryCompany(rawCompany, baseService.countryCode);
    },
  };
}

function createBaseService(
  registryKey: CompanyRegistryKey,
  runtimeSettings?: CompanyRegistryRuntimeSettings,
): CompanyRegistryService | null {
  if (registryKey === 'ares') return new AresCompanyRegistryService();
  if (registryKey === 'uk_companies_house') {
    return new CompaniesHouseRegistryService({
      apiKey: runtimeSettings?.api_key || runtimeSettings?.rest_api_key,
    });
  }
  if (registryKey === 'no_brreg') return new BrregCompanyRegistryService();
  if (registryKey === 'ee_ariregister') {
    return new AriregisterCompanyRegistryService({ baseUrl: runtimeSettings?.base_url });
  }
  if (registryKey === 'fr_insee') {
    return new InseeSireneRegistryService({
      apiKey: runtimeSettings?.api_key || runtimeSettings?.api_token,
    });
  }
  if (registryKey === 'custom_connector') {
    return new CustomCompanyRegistryService({
      url: runtimeSettings?.url,
      headerKey: runtimeSettings?.header_key,
      headerValue: runtimeSettings?.header_value,
    });
  }
  return null;
}
