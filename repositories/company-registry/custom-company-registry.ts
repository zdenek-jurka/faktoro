import {
  CompanyRegistryCompany,
  CompanyRegistryLookupError,
  CompanyRegistryService,
} from './types';

type CustomRegistryResponse = {
  companyId?: string;
  company_id?: string;
  legalName?: string;
  legal_name?: string;
  vatNumber?: string;
  vat_number?: string;
  importAddresses?: Array<{
    type?: 'billing' | 'shipping' | 'other';
    street?: string;
    city?: string;
    postalCode?: string;
    postal_code?: string;
    country?: string;
  }>;
};

type CustomConnectorConfig = {
  url?: string;
  headerKey?: string;
  headerValue?: string;
};

function normalizeCompanyId(value: string): string {
  return value.trim();
}

function buildLookupUrl(baseUrl: string, companyId: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return '';

  if (trimmed.includes('{companyId}')) {
    return trimmed.replaceAll('{companyId}', encodeURIComponent(companyId));
  }

  return `${trimmed.replace(/\/+$/, '')}/${encodeURIComponent(companyId)}`;
}

export class CustomCompanyRegistryService implements CompanyRegistryService {
  readonly countryCode = 'ZZ';
  readonly registryName = 'Custom Connector';
  private readonly url: string;
  private readonly headerKey: string;
  private readonly headerValue: string;

  constructor(config?: CustomConnectorConfig) {
    this.url = config?.url?.trim() || '';
    this.headerKey = config?.headerKey?.trim() || '';
    this.headerValue = config?.headerValue?.trim() || '';
  }

  async lookupCompanyById(companyId: string): Promise<CompanyRegistryCompany> {
    const normalizedCompanyId = normalizeCompanyId(companyId);
    if (!normalizedCompanyId) {
      throw new CompanyRegistryLookupError('invalid_company_id', 'Company ID is required');
    }

    const lookupUrl = buildLookupUrl(this.url, normalizedCompanyId);
    if (!lookupUrl) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Custom connector requires valid URL',
      );
    }

    if ((this.headerKey && !this.headerValue) || (!this.headerKey && this.headerValue)) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Custom connector requires both header key and header value',
      );
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.headerKey && this.headerValue) {
      headers[this.headerKey] = this.headerValue;
    }

    let response: Response;
    try {
      response = await fetch(lookupUrl, {
        method: 'GET',
        headers,
      });
    } catch {
      throw new CompanyRegistryLookupError(
        'service_unavailable',
        'Unable to connect to custom connector service',
      );
    }

    if (response.status === 400) {
      throw new CompanyRegistryLookupError('invalid_company_id', 'Invalid company ID');
    }
    if (response.status === 401 || response.status === 403) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Custom connector credentials are invalid',
      );
    }
    if (response.status === 404) {
      throw new CompanyRegistryLookupError('company_not_found', 'Company not found');
    }
    if (response.status >= 500) {
      throw new CompanyRegistryLookupError(
        'service_unavailable',
        'Custom connector service is currently unavailable',
      );
    }
    if (!response.ok) {
      throw new CompanyRegistryLookupError('unknown', 'Custom connector request failed');
    }

    let data: CustomRegistryResponse;
    try {
      data = (await response.json()) as CustomRegistryResponse;
    } catch {
      throw new CompanyRegistryLookupError(
        'unknown',
        'Invalid response from custom connector service',
      );
    }

    const legalName = data.legalName || data.legal_name;
    const companyIdFromData = data.companyId || data.company_id || normalizedCompanyId;
    if (!legalName) {
      throw new CompanyRegistryLookupError(
        'unknown',
        'Custom connector response must contain legalName',
      );
    }

    const normalizedImportAddresses = (data.importAddresses || [])
      .map((address) => ({
        type: address.type || 'billing',
        street: address.street || '',
        city: address.city || '',
        postalCode: address.postalCode || address.postal_code || '',
        country: address.country || '',
      }))
      .filter(
        (address) =>
          address.street.trim() &&
          address.city.trim() &&
          address.postalCode.trim() &&
          address.country.trim(),
      );

    return {
      companyId: companyIdFromData,
      legalName,
      vatNumber: data.vatNumber || data.vat_number,
      importAddresses: normalizedImportAddresses.length > 0 ? normalizedImportAddresses : undefined,
    };
  }
}
