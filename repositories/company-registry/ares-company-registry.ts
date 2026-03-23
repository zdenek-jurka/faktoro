import {
  CompanyRegistryCompany,
  CompanyRegistryLookupError,
  CompanyRegistryService,
} from './types';

const ARES_BASE_URL = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest';

type AresAddress = {
  [key: string]: unknown;
  textovaAdresa?: string;
  nazevObce?: string;
  pscText?: string;
  psc?: string;
  nazevStatu?: string;
  adresniMistoKod?: {
    [key: string]: unknown;
    textovaAdresa?: string;
    nazevObce?: string;
    pscText?: string;
    psc?: string;
    nazevStatu?: string;
  };
};

type AresCompanyResponse = {
  ico?: string;
  obchodniJmeno?: string;
  obchodniFirma?: string;
  nazev?: string;
  identifikacniCislo?: string;
  dic?: string;
  sidlo?: AresAddress;
  ekonomickySubjekt?: {
    [key: string]: unknown;
  };
  ekonomickeSubjekty?: Array<Record<string, unknown>>;
};

function normalizeCompanyId(companyId: string): string {
  return companyId.replace(/\s+/g, '');
}

function getNestedValue(source: unknown, path: Array<string | number>): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(current) || key < 0 || key >= current.length) {
        return undefined;
      }
      current = current[key];
      continue;
    }
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getFirstString(source: unknown, paths: Array<Array<string | number>>): string | undefined {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function buildStreetFromParts(source: unknown): string | undefined {
  const street = getFirstString(source, [['nazevUlice'], ['ulice'], ['nazevUliceText']]);
  const houseNumber = getFirstString(source, [['cisloDomovni'], ['cisloDomovniText']]);
  const orientationNumber = getFirstString(source, [['cisloOrientacni'], ['cisloOrientacniText']]);

  const parts = [street, houseNumber, orientationNumber].filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
  return `${parts[0]} ${parts[1]}/${parts[2]}`;
}

function mapAresAddress(rawAddress?: AresAddress) {
  if (!rawAddress) {
    return {
      formatted: undefined,
      city: undefined,
      postalCode: undefined,
      country: undefined,
    };
  }

  const primaryAddress = (rawAddress.adresniMistoKod as AresAddress | undefined) ?? rawAddress;
  const formatted =
    getFirstString(primaryAddress, [['textovaAdresa'], ['adresaRadek'], ['adresaText']]) ||
    buildStreetFromParts(primaryAddress) ||
    getFirstString(rawAddress, [['textovaAdresa'], ['adresaRadek'], ['adresaText']]) ||
    buildStreetFromParts(rawAddress);

  const city =
    getFirstString(primaryAddress, [['nazevObce'], ['obec'], ['nazevMestskeCasti']]) ||
    getFirstString(rawAddress, [['nazevObce'], ['obec'], ['nazevMestskeCasti']]);

  const postalCode =
    getFirstString(primaryAddress, [['pscText'], ['psc'], ['pscKod']]) ||
    getFirstString(rawAddress, [['pscText'], ['psc'], ['pscKod']]);

  const country =
    getFirstString(primaryAddress, [['nazevStatu'], ['kodStatu']]) ||
    getFirstString(rawAddress, [['nazevStatu'], ['kodStatu']]);

  return {
    formatted,
    city,
    postalCode,
    country,
  };
}

function mapAresError(status: number): CompanyRegistryLookupError {
  if (status === 400) {
    return new CompanyRegistryLookupError('invalid_company_id', 'Invalid company ID');
  }

  if (status === 404) {
    return new CompanyRegistryLookupError('company_not_found', 'Company not found');
  }

  if (status >= 500) {
    return new CompanyRegistryLookupError('service_unavailable', 'ARES service is unavailable');
  }

  return new CompanyRegistryLookupError('unknown', 'Unknown ARES error');
}

export class AresCompanyRegistryService implements CompanyRegistryService {
  readonly countryCode = 'CZ';
  readonly registryName = 'ARES';

  async lookupCompanyById(companyId: string): Promise<CompanyRegistryCompany> {
    const normalizedCompanyId = normalizeCompanyId(companyId);

    if (!/^\d{8}$/.test(normalizedCompanyId)) {
      throw new CompanyRegistryLookupError(
        'invalid_company_id',
        'Company ID must have 8 digits for CZ ARES lookup',
      );
    }

    let response: Response;
    const url = `${ARES_BASE_URL}/ekonomicke-subjekty/${normalizedCompanyId}`;
    try {
      response = await fetch(url);
    } catch {
      throw new CompanyRegistryLookupError(
        'service_unavailable',
        'Unable to connect to ARES service',
      );
    }

    if (!response.ok) {
      throw mapAresError(response.status);
    }

    let data: AresCompanyResponse;
    try {
      data = (await response.json()) as AresCompanyResponse;
    } catch {
      throw new CompanyRegistryLookupError('unknown', 'Invalid response from ARES service');
    }

    const legalName =
      getFirstString(data, [
        ['obchodniJmeno'],
        ['obchodniFirma'],
        ['nazev'],
        ['jmeno'],
        ['ekonomickySubjekt', 'obchodniJmeno'],
        ['ekonomickySubjekt', 'obchodniFirma'],
        ['ekonomickySubjekt', 'nazev'],
        ['ekonomickySubjekt', 'jmeno'],
        ['ekonomickeSubjekty', 0, 'obchodniJmeno'],
        ['ekonomickeSubjekty', 0, 'obchodniFirma'],
        ['ekonomickeSubjekty', 0, 'nazev'],
        ['ekonomickeSubjekty', 0, 'jmeno'],
      ]) || undefined;
    const companyIdFromData =
      getFirstString(data, [
        ['ico'],
        ['identifikacniCislo'],
        ['ekonomickySubjekt', 'ico'],
        ['ekonomickySubjekt', 'identifikacniCislo'],
        ['ekonomickeSubjekty', 0, 'ico'],
        ['ekonomickeSubjekty', 0, 'identifikacniCislo'],
      ]) || undefined;
    const vatNumber =
      getFirstString(data, [
        ['dic'],
        ['ekonomickySubjekt', 'dic'],
        ['ekonomickeSubjekty', 0, 'dic'],
      ]) || undefined;
    const sidloRaw =
      (getNestedValue(data, ['sidlo']) as AresAddress | undefined) ||
      (getNestedValue(data, ['ekonomickySubjekt', 'sidlo']) as AresAddress | undefined) ||
      (getNestedValue(data, ['ekonomickeSubjekty', 0, 'sidlo']) as AresAddress | undefined);

    if (!legalName || !companyIdFromData) {
      throw new CompanyRegistryLookupError('unknown', 'Incomplete company data from ARES');
    }

    const mappedAddress = mapAresAddress(sidloRaw);

    return {
      companyId: companyIdFromData,
      legalName,
      vatNumber,
      address: mappedAddress,
    };
  }
}
