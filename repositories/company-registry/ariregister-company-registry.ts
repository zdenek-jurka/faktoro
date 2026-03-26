import {
  CompanyRegistryCompany,
  CompanyRegistryLookupError,
  CompanyRegistryService,
} from './types';

const DEFAULT_ARIREGISTER_BASE_URL =
  process.env.EXPO_PUBLIC_ARIREGISTER_BASE_URL || 'https://avaandmed.ariregister.rik.ee';
const ARIREGISTER_PUBLIC_BASE_URL = 'https://ariregister.rik.ee';

type AriregisterResponse = {
  regCode?: string;
  companyName?: string;
  businessName?: string;
  vatCode?: string;
  address?: {
    fullAddress?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
};

type AriregisterJsonLd = {
  '@type'?: string;
  name?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    postalCode?: string;
    addressCountry?: string | { name?: string; '@id'?: string };
  };
};

function normalizeCompanyId(companyId: string): string {
  return companyId.replace(/\s+/g, '');
}

function mapAriregisterError(status: number): CompanyRegistryLookupError {
  if (status === 400) {
    return new CompanyRegistryLookupError('invalid_company_id', 'Invalid company ID');
  }
  if (status === 404) {
    return new CompanyRegistryLookupError('company_not_found', 'Company not found');
  }
  if (status >= 500) {
    return new CompanyRegistryLookupError(
      'service_unavailable',
      'e-Business Register service is currently unavailable',
    );
  }
  return new CompanyRegistryLookupError('unknown', 'Unknown e-Business Register error');
}

function parseCountryCode(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (/^[A-Z]{2}$/i.test(normalized)) return normalized.toUpperCase();
  if (normalized.toLowerCase() === 'estonia') return 'EE';
  return normalized;
}

function extractJsonLdBlocks(html: string): AriregisterJsonLd[] {
  const matches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const blocks: AriregisterJsonLd[] = [];
  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') blocks.push(item as AriregisterJsonLd);
        }
      } else if (parsed && typeof parsed === 'object') {
        blocks.push(parsed as AriregisterJsonLd);
      }
    } catch {
      // Ignore non-standard JSON-LD blocks and continue.
    }
  }
  return blocks;
}

function decodeHtmlEntities(value: string): string {
  const namedEntityMap: Record<string, string> = {
    amp: '&',
    nbsp: ' ',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    vert: '|',
    Uuml: 'Ü',
    uuml: 'ü',
    Ouml: 'Ö',
    ouml: 'ö',
    Auml: 'Ä',
    auml: 'ä',
    Otilde: 'Õ',
    otilde: 'õ',
    Euml: 'Ë',
    euml: 'ë',
  };

  const withNamed = value.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (full, name: string) => {
    return namedEntityMap[name] ?? full;
  });

  const withNumeric = withNamed
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const codePoint = Number.parseInt(dec, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    });

  return withNumeric.trim();
}

function cleanupCompanyName(value: string, companyId: string): string {
  const decoded = decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
  if (!decoded) return '';

  // If title contains "(regCode)", prefer everything before this marker.
  const beforeCompanyId = decoded.match(new RegExp(`^(.*?)\\s*\\(${companyId}\\)\\b`));
  const withoutCompanyId =
    beforeCompanyId?.[1]?.trim() ||
    decoded.replace(new RegExp(`\\(${companyId}\\)`, 'g'), '').trim();

  return withoutCompanyId
    .replace(/\s*(?:\||-|–|—|·|•)\s*(?:e-?)?(?:äri|ari|business|commercial)?\s*register.*$/i, '')
    .replace(/\s*(?:\||-|–|—|·|•)\s*rik.*$/i, '')
    .replace(/\s*(?:\||-|–|—|·|•)\s*ettev[oõ]tjaportaal.*$/i, '')
    .trim();
}

function extractLegalNameFromHtml(html: string, companyId: string): string | undefined {
  const ogTitle =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
  if (ogTitle) {
    const normalized = cleanupCompanyName(ogTitle, companyId);
    if (normalized) return normalized;
  }

  const titleValue = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (titleValue) {
    const normalized = cleanupCompanyName(titleValue, companyId);
    if (normalized) return normalized;
  }

  const embeddedName =
    html.match(/"name"\s*:\s*"([^"]+?)"/i)?.[1] ||
    html.match(/"businessName"\s*:\s*"([^"]+?)"/i)?.[1] ||
    html.match(/"companyName"\s*:\s*"([^"]+?)"/i)?.[1];
  if (embeddedName) {
    const normalized = cleanupCompanyName(embeddedName, companyId);
    if (normalized) return normalized;
  }

  return undefined;
}

function parseAddressFromRaw(raw: string): {
  formatted?: string;
  city?: string;
  postalCode?: string;
} {
  const compact = decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim();
  if (!compact) return {};

  const segments = compact
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length === 0) return {};

  const postalSegment = [...segments].reverse().find((segment) => /\b\d{5}\b/.test(segment));
  const postalCode = postalSegment?.match(/\b\d{5}\b/)?.[0];
  const street =
    segments.find((segment) => /\d/.test(segment) && !/\b\d{5}\b/.test(segment)) ||
    segments[segments.length - 2] ||
    segments[0];
  const city =
    segments.find(
      (segment) =>
        !/\d/.test(segment) && !/\b(maakond|linnaosa|vald|küla|alev|alevik)\b/i.test(segment),
    ) ||
    segments.find((segment) => /\b(tallinn|tartu|pärnu|narva)\b/i.test(segment)) ||
    undefined;

  return {
    formatted: street?.trim() || undefined,
    city: city?.trim() || undefined,
    postalCode: postalCode?.trim() || undefined,
  };
}

function extractAddressFromHtml(html: string): {
  formatted?: string;
  city?: string;
  postalCode?: string;
} {
  const embeddedStreet = html.match(/"streetAddress"\s*:\s*"([^"]+?)"/i)?.[1];
  const embeddedCity = html.match(/"addressLocality"\s*:\s*"([^"]+?)"/i)?.[1];
  const embeddedPostal = html.match(/"postalCode"\s*:\s*"([^"]+?)"/i)?.[1];
  if (embeddedStreet || embeddedCity || embeddedPostal) {
    return {
      formatted: embeddedStreet ? decodeHtmlEntities(embeddedStreet) : undefined,
      city: embeddedCity ? decodeHtmlEntities(embeddedCity) : undefined,
      postalCode: embeddedPostal ? decodeHtmlEntities(embeddedPostal) : undefined,
    };
  }

  const rawAddress =
    html.match(/"businessAddress"\s*:\s*"([^"]+?\d{5})"/i)?.[1] ||
    html.match(/"address"\s*:\s*"([^"]+?\d{5})"/i)?.[1] ||
    html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+?\d{5})["']/i,
    )?.[1] ||
    html.match(
      /([A-ZÕÄÖÜa-zõäöü0-9\-\/.\s]+,\s*[A-ZÕÄÖÜa-zõäöü0-9\-\/.\s]+,\s*[A-ZÕÄÖÜa-zõäöü0-9\-\/.\s]+,\s*[A-ZÕÄÖÜa-zõäöü0-9\-\/.\s]+,\s*\d{5})/,
    )?.[1];

  if (!rawAddress) return {};
  return parseAddressFromRaw(rawAddress);
}

function extractVatNumberFromHtml(html: string): string | undefined {
  const directPatterns = [
    /"vatNumber"\s*:\s*"([^"]+)"/i,
    /"vat_number"\s*:\s*"([^"]+)"/i,
    /"vatCode"\s*:\s*"([^"]+)"/i,
    /"kmkr"\s*:\s*"([^"]+)"/i,
    /"kmdNr"\s*:\s*"([^"]+)"/i,
    /\bVAT(?:\s+number)?\b[^A-Z0-9]{0,20}(EE\d{9})\b/i,
    /\bKMKR\b[^A-Z0-9]{0,20}(EE\d{9})\b/i,
    /\bKMD\b[^A-Z0-9]{0,20}(EE\d{9})\b/i,
    /\b(EE\d{9})\b/,
  ];

  for (const pattern of directPatterns) {
    const match = html.match(pattern);
    const candidate = match?.[1]?.trim();
    if (!candidate) continue;

    const normalized = decodeHtmlEntities(candidate).replace(/\s+/g, '').toUpperCase();
    if (/^EE\d{9}$/.test(normalized)) return normalized;
  }

  return undefined;
}

function parsePublicCompanyFromHtml(
  html: string,
  normalizedCompanyId: string,
): CompanyRegistryCompany | null {
  const blocks = extractJsonLdBlocks(html);
  const orgBlock = blocks.find((block) => {
    const type = block['@type']?.toLowerCase() || '';
    return type.includes('organization') || type.includes('corporation') || type.includes('thing');
  });

  const legalName =
    (orgBlock?.name ? decodeHtmlEntities(orgBlock.name) : undefined) ||
    extractLegalNameFromHtml(html, normalizedCompanyId);
  if (!legalName) return null;

  const address = orgBlock?.address;
  const parsedAddress =
    address?.streetAddress || address?.addressLocality || address?.postalCode
      ? {
          formatted: address?.streetAddress?.trim() || undefined,
          city: address?.addressLocality?.trim() || undefined,
          postalCode: address?.postalCode?.trim() || undefined,
        }
      : extractAddressFromHtml(html);
  const vatNumber = extractVatNumberFromHtml(html);

  return {
    companyId: normalizedCompanyId,
    legalName,
    vatNumber,
    address: {
      formatted: parsedAddress.formatted,
      city: parsedAddress.city,
      postalCode: parsedAddress.postalCode,
      country:
        (typeof address?.addressCountry === 'string'
          ? parseCountryCode(address.addressCountry)
          : parseCountryCode(
              address?.addressCountry?.name || address?.addressCountry?.['@id'] || '',
            )) || 'EE',
    },
  };
}

async function fetchPublicCompanyProfile(
  companyId: string,
): Promise<CompanyRegistryCompany | null> {
  const urls = [
    `${ARIREGISTER_PUBLIC_BASE_URL}/eng/company/${companyId}`,
    `${ARIREGISTER_PUBLIC_BASE_URL}/est/company/${companyId}`,
  ];

  for (const url of urls) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'text/html',
        },
      });
    } catch {
      throw new CompanyRegistryLookupError(
        'service_unavailable',
        'Unable to connect to e-Business Register service',
      );
    }

    if (response.status === 404) {
      continue;
    }
    if (!response.ok) {
      if (response.status >= 500) {
        throw new CompanyRegistryLookupError(
          'service_unavailable',
          'e-Business Register service is currently unavailable',
        );
      }
      continue;
    }

    const html = await response.text();
    const parsed = parsePublicCompanyFromHtml(html, companyId);
    if (parsed) return parsed;
  }

  return null;
}

export class AriregisterCompanyRegistryService implements CompanyRegistryService {
  readonly countryCode = 'EE';
  readonly registryName = 'e-Business Register';
  private readonly baseUrl: string;

  constructor(input?: { baseUrl?: string }) {
    this.baseUrl = input?.baseUrl?.trim() || DEFAULT_ARIREGISTER_BASE_URL;
  }

  async lookupCompanyById(companyId: string): Promise<CompanyRegistryCompany> {
    const normalizedCompanyId = normalizeCompanyId(companyId);
    if (!/^\d{8}$/.test(normalizedCompanyId)) {
      throw new CompanyRegistryLookupError(
        'invalid_company_id',
        'Company ID must have 8 digits for Estonia registry lookup',
      );
    }

    let response: Response;
    const apiUrl = `${this.baseUrl}/ettevotja/${normalizedCompanyId}`;
    try {
      response = await fetch(apiUrl);
    } catch {
      throw new CompanyRegistryLookupError(
        'service_unavailable',
        'Unable to connect to e-Business Register service',
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        const publicCompany = await fetchPublicCompanyProfile(normalizedCompanyId);
        if (publicCompany) return publicCompany;
      }
      throw mapAriregisterError(response.status);
    }

    let data: AriregisterResponse;
    try {
      data = (await response.json()) as AriregisterResponse;
    } catch {
      throw new CompanyRegistryLookupError(
        'unknown',
        'Invalid response from e-Business Register service',
      );
    }

    const legalName = data.companyName || data.businessName;
    const companyIdFromData = data.regCode || normalizedCompanyId;

    if (!legalName) {
      const publicCompany = await fetchPublicCompanyProfile(normalizedCompanyId);
      if (publicCompany) return publicCompany;
      throw new CompanyRegistryLookupError(
        'unknown',
        'Incomplete company data from e-Business Register',
      );
    }

    return {
      companyId: companyIdFromData,
      legalName: decodeHtmlEntities(legalName),
      countryCode: 'EE',
      vatNumber: data.vatCode ? decodeHtmlEntities(data.vatCode) : undefined,
      address: {
        formatted: data.address?.fullAddress
          ? decodeHtmlEntities(data.address.fullAddress)
          : undefined,
        city: data.address?.city ? decodeHtmlEntities(data.address.city) : undefined,
        postalCode: data.address?.postalCode
          ? decodeHtmlEntities(data.address.postalCode)
          : undefined,
        country: data.address?.country ? decodeHtmlEntities(data.address.country) : 'EE',
      },
    };
  }
}
