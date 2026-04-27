import {
  CompanyRegistryCompany,
  CompanyRegistryLookupError,
  CompanyRegistryService,
} from './types';
import {
  type HttpAuth,
  parseSecureOrLocalHttpUrl,
  resolveHttpAuthHeaders,
} from '@/utils/http-auth';

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
  auth?: HttpAuth;
  tokenCacheStorageKey?: string;
};

function normalizeCompanyId(value: string): string {
  return value.trim();
}

function buildLookupUrl(baseUrl: string, companyId: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return '';
  try {
    parseSecureOrLocalHttpUrl(trimmed, 'Custom connector URL');
  } catch {
    return '';
  }

  if (trimmed.includes('{companyId}')) {
    return trimmed.replaceAll('{companyId}', encodeURIComponent(companyId));
  }

  return `${trimmed.replace(/\/+$/, '')}/${encodeURIComponent(companyId)}`;
}

export class CustomCompanyRegistryService implements CompanyRegistryService {
  readonly countryCode = 'ZZ';
  readonly registryName = 'Custom Connector';
  private readonly url: string;
  private readonly auth: HttpAuth;
  private readonly tokenCacheStorageKey: string;

  constructor(config?: CustomConnectorConfig) {
    this.url = config?.url?.trim() || '';
    this.auth = config?.auth ?? { type: 'none' };
    this.tokenCacheStorageKey =
      config?.tokenCacheStorageKey || 'company_registry_oauth2_token.custom_connector';
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

    const headers = {
      Accept: 'application/json',
      ...(await this.resolveAuthHeaders()),
    };

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

  private validateAuthConfig(): void {
    if (this.auth.type === 'bearer' && !this.auth.token.trim()) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Custom connector bearer token is required',
      );
    }
    if (this.auth.type === 'api_key' && (!this.auth.headerName.trim() || !this.auth.value.trim())) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Custom connector API key header name and value are required',
      );
    }
    if (this.auth.type === 'basic' && (!this.auth.username.trim() || !this.auth.password.trim())) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Custom connector basic username and password are required',
      );
    }
    if (
      this.auth.type === 'oauth2_cc' &&
      (!this.auth.tokenUrl.trim() || !this.auth.clientId.trim() || !this.auth.clientSecret.trim())
    ) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Custom connector OAuth2 token URL, client ID and client secret are required',
      );
    }
  }

  private async resolveAuthHeaders(): Promise<Record<string, string>> {
    this.validateAuthConfig();

    try {
      return await resolveHttpAuthHeaders(this.auth, {
        tokenCacheStorageKey: this.tokenCacheStorageKey,
      });
    } catch (error) {
      const status =
        typeof error === 'object' && error
          ? (error as { httpStatus?: number }).httpStatus
          : undefined;
      if (status === 401 || status === 403) {
        throw new CompanyRegistryLookupError(
          'configuration_required',
          'Custom connector credentials are invalid',
        );
      }
      if (
        status === 408 ||
        status === 429 ||
        (typeof status === 'number' && status >= 500) ||
        (error instanceof Error && /network request failed|timed out/i.test(error.message))
      ) {
        throw new CompanyRegistryLookupError(
          'service_unavailable',
          'Unable to connect to custom connector auth service',
        );
      }
      throw new CompanyRegistryLookupError(
        'configuration_required',
        error instanceof Error ? error.message : 'Custom connector auth configuration is invalid',
      );
    }
  }
}
