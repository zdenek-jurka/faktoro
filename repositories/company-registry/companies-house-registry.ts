import {
  CompanyRegistryCompany,
  CompanyRegistryLookupError,
  CompanyRegistryService,
} from './types';

const COMPANIES_HOUSE_BASE_URL = 'https://api.company-information.service.gov.uk';

type CompaniesHouseAddress = {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  postal_code?: string;
  country?: string;
};

type CompaniesHouseResponse = {
  company_name?: string;
  company_number?: string;
  registered_office_address?: CompaniesHouseAddress;
};

function normalizeCompanyId(companyId: string): string {
  return companyId.replace(/\s+/g, '').toUpperCase();
}

function mapCompaniesHouseError(status: number): CompanyRegistryLookupError {
  if (status === 400) {
    return new CompanyRegistryLookupError('invalid_company_id', 'Invalid company ID');
  }
  if (status === 401 || status === 403) {
    return new CompanyRegistryLookupError(
      'configuration_required',
      'Companies House API key is missing or invalid',
    );
  }
  if (status === 404) {
    return new CompanyRegistryLookupError('company_not_found', 'Company not found');
  }
  if (status >= 500) {
    return new CompanyRegistryLookupError(
      'service_unavailable',
      'Companies House service is currently unavailable',
    );
  }
  return new CompanyRegistryLookupError('unknown', 'Unknown Companies House error');
}

function base64Encode(input: string): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes =
    typeof TextEncoder !== 'undefined'
      ? Array.from(new TextEncoder().encode(input))
      : Array.from(input).map((char) => char.charCodeAt(0) & 0xff);

  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i] ?? 0;
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    const combined = (b1 << 16) | (b2 << 8) | b3;

    output += table[(combined >> 18) & 63];
    output += table[(combined >> 12) & 63];
    output += i + 1 < bytes.length ? table[(combined >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? table[combined & 63] : '=';
  }

  return output;
}

function getCompaniesHouseAuthHeader(apiKey: string): string {
  const credentials = `${apiKey.trim()}:`;
  return `Basic ${base64Encode(credentials)}`;
}

export class CompaniesHouseRegistryService implements CompanyRegistryService {
  readonly countryCode = 'GB';
  readonly registryName = 'Companies House';
  private readonly apiKey?: string;

  constructor(input?: { apiKey?: string }) {
    this.apiKey = input?.apiKey?.trim();
  }

  async lookupCompanyById(companyId: string): Promise<CompanyRegistryCompany> {
    const normalizedCompanyId = normalizeCompanyId(companyId);
    if (!/^[A-Z0-9]{6,8}$/.test(normalizedCompanyId)) {
      throw new CompanyRegistryLookupError(
        'invalid_company_id',
        'Company ID must be 6-8 alphanumeric characters for UK Companies House lookup',
      );
    }

    const apiKey = this.apiKey;
    if (!apiKey?.trim()) {
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Set Companies House API key in registry settings',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${COMPANIES_HOUSE_BASE_URL}/company/${normalizedCompanyId}`, {
        headers: {
          Accept: 'application/json',
          Authorization: getCompaniesHouseAuthHeader(apiKey),
        },
      });
    } catch {
      throw new CompanyRegistryLookupError(
        'service_unavailable',
        'Unable to connect to Companies House service',
      );
    }

    if (!response.ok) {
      throw mapCompaniesHouseError(response.status);
    }

    let data: CompaniesHouseResponse;
    try {
      data = (await response.json()) as CompaniesHouseResponse;
    } catch {
      throw new CompanyRegistryLookupError(
        'unknown',
        'Invalid response from Companies House service',
      );
    }

    if (!data.company_name || !data.company_number) {
      throw new CompanyRegistryLookupError(
        'unknown',
        'Incomplete company data from Companies House',
      );
    }

    const officeAddress = data.registered_office_address;
    const formattedAddress = [
      officeAddress?.address_line_1,
      officeAddress?.address_line_2,
      officeAddress?.locality,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      companyId: data.company_number,
      legalName: data.company_name,
      countryCode: 'GB',
      address: {
        formatted: formattedAddress || undefined,
        city: officeAddress?.locality,
        postalCode: officeAddress?.postal_code,
        country: officeAddress?.country || 'GB',
      },
    };
  }
}
