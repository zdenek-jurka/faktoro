import type { BuyerSnapshot, SellerSnapshot } from '@/templates/invoice/xml';

export const INVOICE_VAT_TREATMENTS = [
  'domestic',
  'eu_reverse_charge_service',
  'non_eu_outside_scope_service',
  'exempt',
  'no_vat',
] as const;

export type InvoiceVatTreatment = (typeof INVOICE_VAT_TREATMENTS)[number];

export const INVOICE_ITEM_VAT_CATEGORIES = [
  'standard',
  'zero',
  'reverse_charge',
  'exempt',
  'outside_scope',
] as const;

export type InvoiceItemVatCategory = (typeof INVOICE_ITEM_VAT_CATEGORIES)[number];

export type BuyerVatValidationSnapshot = {
  status: 'not_checked' | 'missing' | 'provided';
  source: 'local';
  vatNumber?: string;
  countryCode?: string;
  checkedAt?: number;
};

type ResolveInvoiceVatTreatmentInput = {
  sellerIsVatPayer: boolean;
  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
  buyerIsBusiness?: boolean;
  requestedTreatment?: string | null;
};

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'EL',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  AUSTRIA: 'AT',
  BELGIUM: 'BE',
  BULGARIA: 'BG',
  CROATIA: 'HR',
  CYPRUS: 'CY',
  CZECHIA: 'CZ',
  'CZECH REPUBLIC': 'CZ',
  CESKO: 'CZ',
  'CESKA REPUBLIKA': 'CZ',
  DENMARK: 'DK',
  ESTONIA: 'EE',
  FINLAND: 'FI',
  FRANCE: 'FR',
  GERMANY: 'DE',
  GREECE: 'EL',
  HUNGARY: 'HU',
  IRELAND: 'IE',
  ITALY: 'IT',
  LATVIA: 'LV',
  LITHUANIA: 'LT',
  LUXEMBOURG: 'LU',
  MALTA: 'MT',
  NETHERLANDS: 'NL',
  POLAND: 'PL',
  PORTUGAL: 'PT',
  ROMANIA: 'RO',
  SLOVAKIA: 'SK',
  SLOVENSKO: 'SK',
  SLOVENIA: 'SI',
  SPAIN: 'ES',
  SWEDEN: 'SE',
  NORWAY: 'NO',
  NORGE: 'NO',
  'UNITED KINGDOM': 'GB',
  UK: 'GB',
  'GREAT BRITAIN': 'GB',
};

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeInvoiceCountryCode(value?: string | null): string | undefined {
  const normalized = stripDiacritics(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (!normalized) return undefined;
  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized === 'GR' ? 'EL' : normalized;
  }
  return COUNTRY_NAME_TO_CODE[normalized];
}

export function inferCountryCodeFromVatNumber(value?: string | null): string | undefined {
  const normalized = (value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const prefix = normalized.slice(0, 2);
  if (/^[A-Z]{2}$/.test(prefix)) {
    return prefix === 'GR' ? 'EL' : prefix;
  }
  return undefined;
}

export function normalizeInvoiceVatTreatment(
  value?: string | null,
): InvoiceVatTreatment | undefined {
  return INVOICE_VAT_TREATMENTS.includes(value as InvoiceVatTreatment)
    ? (value as InvoiceVatTreatment)
    : undefined;
}

export function normalizeInvoiceItemVatCategory(
  value?: string | null,
): InvoiceItemVatCategory | undefined {
  return INVOICE_ITEM_VAT_CATEGORIES.includes(value as InvoiceItemVatCategory)
    ? (value as InvoiceItemVatCategory)
    : undefined;
}

export function isEuCountryCode(value?: string | null): boolean {
  const countryCode = normalizeInvoiceCountryCode(value);
  return !!countryCode && EU_COUNTRY_CODES.has(countryCode);
}

export function isReverseChargeVatTreatment(value?: string | null): boolean {
  return normalizeInvoiceVatTreatment(value) === 'eu_reverse_charge_service';
}

export function getReverseChargeNote(treatment: InvoiceVatTreatment): string | undefined {
  if (treatment === 'eu_reverse_charge_service') {
    return 'Daň odvede zákazník.';
  }
  return undefined;
}

export function getVatExemptionReason(treatment: InvoiceVatTreatment): string | undefined {
  if (treatment === 'eu_reverse_charge_service') {
    return 'Reverse charge';
  }
  if (treatment === 'non_eu_outside_scope_service') {
    return 'Outside scope of Czech VAT';
  }
  if (treatment === 'exempt') {
    return 'VAT exempt';
  }
  return undefined;
}

export function resolveInvoiceVatTreatment({
  sellerIsVatPayer,
  seller,
  buyer,
  buyerIsBusiness,
  requestedTreatment,
}: ResolveInvoiceVatTreatmentInput): {
  treatment: InvoiceVatTreatment;
  placeOfSupplyCountryCode?: string;
  reverseChargeReason?: string;
  reverseChargeNote?: string;
  buyerVatValidation: BuyerVatValidationSnapshot;
} {
  const explicitTreatment = normalizeInvoiceVatTreatment(requestedTreatment);
  const sellerCountry =
    normalizeInvoiceCountryCode(seller.country) || inferCountryCodeFromVatNumber(seller.vatNumber);
  const buyerVatCountry = inferCountryCodeFromVatNumber(buyer.vatNumber);
  const buyerCountry = normalizeInvoiceCountryCode(buyer.country) || buyerVatCountry;
  const hasBuyerVatNumber = !!buyer.vatNumber?.trim();
  const effectiveBuyerIsBusiness =
    !!buyerIsBusiness || hasBuyerVatNumber || !!buyer.companyId?.trim();
  const buyerVatValidation: BuyerVatValidationSnapshot = {
    status: hasBuyerVatNumber ? 'provided' : 'missing',
    source: 'local',
    vatNumber: buyer.vatNumber?.trim() || undefined,
    countryCode: buyerVatCountry || buyerCountry,
  };

  if (!sellerIsVatPayer) {
    return {
      treatment: 'no_vat',
      placeOfSupplyCountryCode: buyerCountry || sellerCountry,
      buyerVatValidation,
    };
  }

  if (explicitTreatment && explicitTreatment !== 'no_vat') {
    return {
      treatment: explicitTreatment,
      placeOfSupplyCountryCode: buyerCountry || sellerCountry,
      reverseChargeReason:
        explicitTreatment === 'eu_reverse_charge_service' ? 'eu_b2b_service' : undefined,
      reverseChargeNote: getReverseChargeNote(explicitTreatment),
      buyerVatValidation,
    };
  }

  const isForeignBuyer = !!buyerCountry && !!sellerCountry && buyerCountry !== sellerCountry;
  if (effectiveBuyerIsBusiness && isForeignBuyer && isEuCountryCode(buyerCountry)) {
    return {
      treatment: hasBuyerVatNumber ? 'eu_reverse_charge_service' : 'domestic',
      placeOfSupplyCountryCode: buyerCountry,
      reverseChargeReason: hasBuyerVatNumber ? 'eu_b2b_service' : undefined,
      reverseChargeNote: hasBuyerVatNumber
        ? getReverseChargeNote('eu_reverse_charge_service')
        : undefined,
      buyerVatValidation,
    };
  }

  if (effectiveBuyerIsBusiness && isForeignBuyer && !isEuCountryCode(buyerCountry)) {
    return {
      treatment: 'non_eu_outside_scope_service',
      placeOfSupplyCountryCode: buyerCountry,
      buyerVatValidation,
    };
  }

  return {
    treatment: 'domestic',
    placeOfSupplyCountryCode: buyerCountry || sellerCountry,
    buyerVatValidation,
  };
}

export function getVatCategoryForRate(rate?: number | null): InvoiceItemVatCategory | undefined {
  if (rate == null) return undefined;
  return Number(rate) > 0 ? 'standard' : 'zero';
}

export function getVatCategoryForTreatment(
  treatment: InvoiceVatTreatment,
  rate?: number | null,
): InvoiceItemVatCategory | undefined {
  if (treatment === 'eu_reverse_charge_service') return 'reverse_charge';
  if (treatment === 'non_eu_outside_scope_service') return 'outside_scope';
  if (treatment === 'exempt') return 'exempt';
  if (treatment === 'no_vat') return undefined;
  return getVatCategoryForRate(rate);
}
