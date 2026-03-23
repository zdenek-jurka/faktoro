export interface CompanyRegistryAddress {
  formatted?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface CompanyRegistryImportAddress {
  type: 'billing' | 'shipping' | 'other';
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface CompanyRegistryCompany {
  companyId: string;
  legalName: string;
  vatNumber?: string;
  address?: CompanyRegistryAddress;
  importAddress?: CompanyRegistryImportAddress;
  importAddresses?: CompanyRegistryImportAddress[];
}

export interface CompanyRegistryService {
  readonly countryCode: string;
  readonly registryName: string;
  lookupCompanyById(companyId: string): Promise<CompanyRegistryCompany>;
}

export type CompanyRegistryLookupErrorCode =
  | 'invalid_company_id'
  | 'company_not_found'
  | 'configuration_required'
  | 'service_unavailable'
  | 'unknown';

export class CompanyRegistryLookupError extends Error {
  code: CompanyRegistryLookupErrorCode;

  constructor(code: CompanyRegistryLookupErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
