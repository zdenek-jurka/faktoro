import type { SellerSnapshot } from '@/templates/invoice/xml';
import { normalizeCurrencyCode } from '@/utils/currency-utils';

export type PaymentQrType = 'none' | 'spayd' | 'epc' | 'swiss';

export type PaymentQrProfileRequirement =
  | 'epcIban'
  | 'epcSwift'
  | 'spaydAccount'
  | 'swissAddress'
  | 'swissIban'
  | 'swissQrIbanReference';

export type PaymentQrExportRequirement =
  | PaymentQrProfileRequirement
  | 'epcPayloadTooLong'
  | 'epcCurrency'
  | 'paymentAmount'
  | 'swissCurrency';

export type PaymentQrExportContext = {
  invoiceCurrency?: string | null;
  totalAmount?: number | null;
  receiverName?: string | null;
  invoiceReference?: string | null;
};

const IBAN_COUNTRY_LENGTHS: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BR: 29,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MR: 27,
  MT: 31,
  MU: 30,
  NL: 18,
  NO: 15,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  SA: 24,
  SC: 31,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
};

const PAYMENT_QR_AMOUNT_LIMITS: Record<Exclude<PaymentQrType, 'none'>, number> = {
  spayd: 9999999.99,
  epc: 999999999.99,
  swiss: 999999999.99,
};

export function normalizePaymentQrType(value?: string | null): PaymentQrType {
  return value === 'spayd' || value === 'epc' || value === 'swiss' ? value : 'none';
}

export function normalizePaymentQrIban(value?: string | null): string {
  return (value || '').replace(/\s+/g, '').toUpperCase();
}

export function normalizePaymentQrSwift(value?: string | null): string {
  return (value || '').replace(/\s+/g, '').toUpperCase();
}

export function normalizePaymentQrCountryCode(value?: string | null): string {
  const trimmed = (value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : '';
}

export function sanitizePaymentQrText(value?: string | null): string {
  return (value || '')
    .replace(/[\r\n*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncatePaymentQrText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function formatPaymentQrAmount(value: number): string {
  return value.toFixed(2);
}

function mod97(value: string): number {
  let remainder = 0;
  for (const char of value) {
    const digit = char.charCodeAt(0) - 48;
    if (digit < 0 || digit > 9) return Number.NaN;
    remainder = (remainder * 10 + digit) % 97;
  }
  return remainder;
}

function toIbanNumeric(value: string): string | null {
  let numeric = '';
  for (const char of value.toUpperCase()) {
    if (char >= '0' && char <= '9') {
      numeric += char;
      continue;
    }
    if (char >= 'A' && char <= 'Z') {
      numeric += String(char.charCodeAt(0) - 55);
      continue;
    }
    return null;
  }
  return numeric;
}

function getIbanCheckDigitsInput(countryCode: string, bban: string): string {
  const countryNumeric = countryCode
    .toUpperCase()
    .split('')
    .map((char) => String(char.charCodeAt(0) - 55))
    .join('');
  return `${bban}${countryNumeric}00`;
}

export function isValidPaymentQrIban(value?: string | null): boolean {
  const iban = normalizePaymentQrIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  const expectedLength = IBAN_COUNTRY_LENGTHS[iban.slice(0, 2)];
  if (!expectedLength || iban.length !== expectedLength) return false;

  const numeric = toIbanNumeric(`${iban.slice(4)}${iban.slice(0, 4)}`);
  return !!numeric && mod97(numeric) === 1;
}

export function isValidPaymentQrSwift(value?: string | null): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalizePaymentQrSwift(value));
}

export function isValidPaymentQrAmount(qrType: PaymentQrType, value?: number | null): boolean {
  if (qrType === 'none' || value == null || !Number.isFinite(value)) return false;
  return value >= 0.01 && value <= PAYMENT_QR_AMOUNT_LIMITS[qrType];
}

export function isSwissQrIban(value?: string | null): boolean {
  const iban = normalizePaymentQrIban(value);
  if (!isValidPaymentQrIban(iban) || (!iban.startsWith('CH') && !iban.startsWith('LI'))) {
    return false;
  }
  const iid = Number(iban.slice(4, 9));
  return Number.isInteger(iid) && iid >= 30000 && iid <= 31999;
}

function getUtf8ByteLength(value: string): number {
  let length = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      length += 1;
    } else if (codePoint <= 0x7ff) {
      length += 2;
    } else if (codePoint <= 0xffff) {
      length += 3;
    } else {
      length += 4;
    }
  }
  return length;
}

export function isPaymentQrEpcPayloadWithinByteLimit(payload: string): boolean {
  return getUtf8ByteLength(payload) <= 331;
}

function isEpcPayloadWithinByteLimit(
  seller: SellerSnapshot,
  context: PaymentQrExportContext,
): boolean {
  if (context.totalAmount == null || !isValidPaymentQrAmount('epc', context.totalAmount)) {
    return true;
  }

  const iban = normalizePaymentQrIban(seller.iban);
  const bic = normalizePaymentQrSwift(seller.swift);
  const name = truncatePaymentQrText(
    sanitizePaymentQrText(seller.companyName || context.receiverName),
    70,
  );
  if (!isValidPaymentQrIban(iban) || !isValidPaymentQrSwift(bic) || !name) {
    return true;
  }

  const reference = truncatePaymentQrText(sanitizePaymentQrText(context.invoiceReference), 140);
  const payload = [
    'BCD',
    '002',
    '1',
    'SCT',
    bic,
    name,
    iban,
    `EUR${formatPaymentQrAmount(context.totalAmount)}`,
    '',
    '',
    reference,
  ].join('\n');

  return isPaymentQrEpcPayloadWithinByteLimit(payload);
}

function convertCzechBankAccountToIban(bankAccount?: string | null): string | null {
  if (!bankAccount) return null;
  const compact = bankAccount.replace(/\s+/g, '');
  const [accountPartRaw, bankCodeRaw] = compact.split('/');
  if (!accountPartRaw || !bankCodeRaw) return null;

  const bankCode = bankCodeRaw.replace(/\D/g, '');
  if (bankCode.length !== 4) return null;

  const [prefixRaw, numberRawMaybe] = accountPartRaw.split('-');
  const numberRaw = numberRawMaybe ?? prefixRaw;
  const prefix = numberRawMaybe ? prefixRaw : '';

  const prefixDigits = prefix.replace(/\D/g, '');
  const numberDigits = numberRaw.replace(/\D/g, '');
  if (!numberDigits || prefixDigits.length > 6 || numberDigits.length > 10) return null;

  const bban = `${bankCode}${prefixDigits.padStart(6, '0')}${numberDigits.padStart(10, '0')}`;
  const checkInput = getIbanCheckDigitsInput('CZ', bban);
  const checkDigits = String(98 - mod97(checkInput)).padStart(2, '0');
  return `CZ${checkDigits}${bban}`;
}

export function resolvePaymentQrSpaydAccount(seller: SellerSnapshot): string | null {
  const iban = normalizePaymentQrIban(seller.iban);
  if (isValidPaymentQrIban(iban)) return iban;

  const converted = convertCzechBankAccountToIban(seller.bankAccount);
  if (converted) return converted;

  const normalizedBankAccount = normalizePaymentQrIban(seller.bankAccount);
  return isValidPaymentQrIban(normalizedBankAccount) ? normalizedBankAccount : null;
}

export function getPaymentQrBusinessProfileRequirement(
  qrType: PaymentQrType,
  seller: SellerSnapshot,
): PaymentQrProfileRequirement | null {
  if (qrType === 'none') return null;

  if (qrType === 'spayd') {
    return resolvePaymentQrSpaydAccount(seller) ? null : 'spaydAccount';
  }

  if (qrType === 'epc') {
    if (!isValidPaymentQrIban(seller.iban)) return 'epcIban';
    if (!isValidPaymentQrSwift(seller.swift)) return 'epcSwift';
    return null;
  }

  const iban = normalizePaymentQrIban(seller.iban);
  if (!isValidPaymentQrIban(iban) || (!iban.startsWith('CH') && !iban.startsWith('LI'))) {
    return 'swissIban';
  }

  if (isSwissQrIban(iban)) {
    return 'swissQrIbanReference';
  }

  if (
    !seller.companyName?.trim() ||
    !seller.address?.trim() ||
    !seller.city?.trim() ||
    !seller.postalCode?.trim() ||
    !normalizePaymentQrCountryCode(seller.country)
  ) {
    return 'swissAddress';
  }

  return null;
}

export function getPaymentQrExportRequirement(
  qrType: PaymentQrType,
  seller: SellerSnapshot,
  context: PaymentQrExportContext = {},
): PaymentQrExportRequirement | null {
  const profileRequirement = getPaymentQrBusinessProfileRequirement(qrType, seller);
  if (profileRequirement) return profileRequirement;

  const currency = normalizeCurrencyCode(context.invoiceCurrency).toUpperCase();
  if (qrType === 'epc' && currency !== 'EUR') return 'epcCurrency';
  if (qrType === 'swiss' && currency !== 'CHF' && currency !== 'EUR') return 'swissCurrency';

  if (qrType !== 'none' && !isValidPaymentQrAmount(qrType, context.totalAmount)) {
    return 'paymentAmount';
  }

  if (qrType === 'epc' && !isEpcPayloadWithinByteLimit(seller, context)) {
    return 'epcPayloadTooLong';
  }

  return null;
}

export function isPaymentQrProfileRequirement(
  requirement: PaymentQrExportRequirement,
): requirement is PaymentQrProfileRequirement {
  return (
    requirement === 'epcIban' ||
    requirement === 'epcSwift' ||
    requirement === 'spaydAccount' ||
    requirement === 'swissAddress' ||
    requirement === 'swissIban' ||
    requirement === 'swissQrIbanReference'
  );
}
