import {
  CompanyRegistryCompany,
  CompanyRegistryLookupError,
  CompanyRegistryService,
} from './types';

const BRREG_BASE_URL = 'https://data.brreg.no/enhetsregisteret/api';

type BrregAddress = {
  adresse?: string[];
  postnummer?: string;
  poststed?: string;
  landkode?: string;
  land?: string;
};

type BrregCompanyResponse = {
  organisasjonsnummer?: string;
  navn?: string;
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  beliggenhetsadresse?: BrregAddress;
};

type BrregCollectionResponse = {
  _embedded?: {
    enheter?: BrregCompanyResponse[];
    underenheter?: BrregCompanyResponse[];
  };
};

function normalizeCompanyId(companyId: string): string {
  return companyId.replace(/\s+/g, '');
}

function mapBrregError(status: number, statusText?: string): CompanyRegistryLookupError {
  if (status === 400) {
    return new CompanyRegistryLookupError('invalid_company_id', 'Invalid company ID');
  }
  if (status === 404 || status === 410) {
    return new CompanyRegistryLookupError('company_not_found', 'Company not found');
  }
  if (status === 429 || status >= 500) {
    return new CompanyRegistryLookupError(
      'service_unavailable',
      'Brreg service is currently unavailable',
    );
  }
  return new CompanyRegistryLookupError(
    'unknown',
    `Unknown Brreg error (${status}${statusText ? ` ${statusText}` : ''})`,
  );
}

async function fetchBrregJson<T>(url: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
  } catch {
    throw new CompanyRegistryLookupError(
      'service_unavailable',
      'Unable to connect to Brreg service',
    );
  }

  if (!response.ok) {
    const mappedError = mapBrregError(response.status, response.statusText);
    if (mappedError.code === 'company_not_found') {
      return null;
    }
    throw mappedError;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new CompanyRegistryLookupError('unknown', 'Invalid response from Brreg service');
  }
}

async function fetchBrregEntityByPath(
  endpoint: 'enheter' | 'underenheter',
  companyId: string,
): Promise<BrregCompanyResponse | null> {
  return fetchBrregJson<BrregCompanyResponse>(`${BRREG_BASE_URL}/${endpoint}/${companyId}`);
}

async function fetchBrregEntityByQuery(
  endpoint: 'enheter' | 'underenheter',
  companyId: string,
): Promise<BrregCompanyResponse | null> {
  const queryUrl = `${BRREG_BASE_URL}/${endpoint}?organisasjonsnummer=${companyId}`;
  const data = await fetchBrregJson<BrregCollectionResponse>(queryUrl);
  if (!data?._embedded) return null;

  const list = endpoint === 'enheter' ? data._embedded.enheter : data._embedded.underenheter;
  if (!list || list.length === 0) return null;
  return list[0];
}

export class BrregCompanyRegistryService implements CompanyRegistryService {
  readonly countryCode = 'NO';
  readonly registryName = 'Brreg';

  async lookupCompanyById(companyId: string): Promise<CompanyRegistryCompany> {
    const normalizedCompanyId = normalizeCompanyId(companyId);
    if (!/^\d{9}$/.test(normalizedCompanyId)) {
      throw new CompanyRegistryLookupError(
        'invalid_company_id',
        'Company ID must have 9 digits for Norway Brreg lookup',
      );
    }

    const lookupStrategies = [
      {
        name: 'path_enheter',
        run: () => fetchBrregEntityByPath('enheter', normalizedCompanyId),
      },
      {
        name: 'path_underenheter',
        run: () => fetchBrregEntityByPath('underenheter', normalizedCompanyId),
      },
      {
        name: 'query_enheter',
        run: () => fetchBrregEntityByQuery('enheter', normalizedCompanyId),
      },
      {
        name: 'query_underenheter',
        run: () => fetchBrregEntityByQuery('underenheter', normalizedCompanyId),
      },
    ];

    let data: BrregCompanyResponse | null = null;
    let lastUnknownError: CompanyRegistryLookupError | null = null;

    for (const lookup of lookupStrategies) {
      try {
        data = await lookup.run();
        if (data) {
          break;
        }
      } catch (error) {
        if (!(error instanceof CompanyRegistryLookupError)) {
          throw error;
        }
        if (error.code === 'service_unavailable' || error.code === 'invalid_company_id') {
          throw error;
        }
        if (error.code === 'unknown') {
          lastUnknownError = error;
        }
      }
    }

    if (!data) {
      if (lastUnknownError) {
        throw lastUnknownError;
      }
      throw new CompanyRegistryLookupError('company_not_found', 'Company not found');
    }

    if (!data.organisasjonsnummer || !data.navn) {
      throw new CompanyRegistryLookupError('unknown', 'Incomplete company data from Brreg');
    }

    const address = data.forretningsadresse || data.beliggenhetsadresse || data.postadresse;
    const street = address?.adresse?.filter(Boolean).join(', ') || undefined;

    return {
      companyId: data.organisasjonsnummer,
      legalName: data.navn,
      countryCode: 'NO',
      address: {
        formatted: street,
        city: address?.poststed,
        postalCode: address?.postnummer,
        country: address?.land || address?.landkode || 'NO',
      },
    };
  }
}
