import { CompanyRegistryCompany, CompanyRegistryImportAddress } from './types';

function extractPostalAndCityFromFormattedAddress(formattedAddress: string): {
  postalCode?: string;
  city?: string;
} {
  const compact = formattedAddress.replace(/\s+/g, ' ').trim();
  const postalMatch = compact.match(/\b\d{3}\s?\d{2}\b/);
  if (!postalMatch) return {};

  const postalCode = postalMatch[0].replace(/\s+/g, '');
  const tail = compact.slice(postalMatch.index! + postalMatch[0].length).trim();
  const city = tail.replace(/^[,.\-;:\s]+/, '').trim() || undefined;

  return { postalCode, city };
}

function sanitizeStreetFromFormattedAddress(formattedAddress: string): string {
  const compact = formattedAddress.replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  // In many registries the first comma-separated part is the street line.
  const firstSegment = compact
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!firstSegment) return '';

  // Safety fallback for formats without commas where postal code leaks into street.
  const postalStart = firstSegment.search(/\b\d{3}\s?\d{2}\b/);
  if (postalStart > 0) {
    return firstSegment.slice(0, postalStart).trim();
  }

  return firstSegment;
}

function buildImportAddress(
  company: CompanyRegistryCompany,
  fallbackCountry: string,
): CompanyRegistryImportAddress | undefined {
  const formattedStreet = company.address?.formatted?.trim() || '';
  if (!formattedStreet) return undefined;

  const parsed = extractPostalAndCityFromFormattedAddress(formattedStreet);
  const city = company.address?.city?.trim() || parsed.city || '';
  const postalCode =
    company.address?.postalCode?.replace(/\s+/g, '').trim() || parsed.postalCode || '';
  const country = company.address?.country?.trim() || fallbackCountry;

  if (!city || !postalCode) return undefined;

  const street = sanitizeStreetFromFormattedAddress(formattedStreet);
  if (!street) return undefined;

  return {
    type: 'billing',
    street,
    city,
    postalCode,
    country,
  };
}

export function normalizeCompanyRegistryCompany(
  company: CompanyRegistryCompany,
  fallbackCountry: string,
): CompanyRegistryCompany {
  const normalizedSingleImport = buildImportAddress(company, fallbackCountry);
  const normalizedImportAddresses = company.importAddresses?.filter(
    (address) =>
      !!address.street?.trim() &&
      !!address.city?.trim() &&
      !!address.postalCode?.trim() &&
      !!address.country?.trim(),
  );

  return {
    ...company,
    importAddress: company.importAddress || normalizedSingleImport,
    importAddresses:
      normalizedImportAddresses && normalizedImportAddresses.length > 0
        ? normalizedImportAddresses
        : normalizedSingleImport
          ? [normalizedSingleImport]
          : undefined,
  };
}
