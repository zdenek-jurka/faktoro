import type { SellerSnapshot } from '@/templates/invoice/xml';
import { splitStreetAndBuildingNumber } from '@/utils/address-building-number';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import {
  formatPaymentQrAmount,
  isPaymentQrEpcPayloadWithinByteLimit,
  isSwissQrIban,
  isValidPaymentQrAmount,
  isValidPaymentQrIban,
  isValidPaymentQrSwift,
  normalizePaymentQrCountryCode,
  normalizePaymentQrIban,
  normalizePaymentQrSwift,
  resolvePaymentQrSpaydAccount,
  sanitizePaymentQrText,
  truncatePaymentQrText,
  type PaymentQrType,
} from '@/utils/payment-qr-requirements';

export type PaymentQrPayloadInvoice = {
  currency: string;
  invoiceNumber: string;
  total: number;
};

export type PaymentQrPayloadLabels = {
  receiverFallback: string;
  invoiceReference: string;
};

function buildSpaydPayload(
  invoice: PaymentQrPayloadInvoice,
  seller: SellerSnapshot,
  labels: PaymentQrPayloadLabels,
): string | null {
  const account = resolvePaymentQrSpaydAccount(seller);
  if (!account) return null;
  if (!isValidPaymentQrAmount('spayd', invoice.total)) return null;

  const amount = formatPaymentQrAmount(invoice.total);
  const currency = normalizeCurrencyCode(invoice.currency).toUpperCase();
  const variableSymbol = invoice.invoiceNumber.replace(/\D/g, '').slice(0, 10);
  const message = truncatePaymentQrText(sanitizePaymentQrText(labels.invoiceReference), 60);
  const parts = ['SPD*1.0', `ACC:${account}`, `AM:${amount}`, `CC:${currency}`, `MSG:${message}`];
  if (variableSymbol) {
    parts.push(`X-VS:${variableSymbol}`);
  }
  return parts.join('*');
}

function buildEpcPayload(
  invoice: PaymentQrPayloadInvoice,
  seller: SellerSnapshot,
  labels: PaymentQrPayloadLabels,
): string | null {
  const iban = normalizePaymentQrIban(seller.iban);
  if (!isValidPaymentQrIban(iban)) return null;
  if (normalizeCurrencyCode(invoice.currency).toUpperCase() !== 'EUR') return null;
  if (!isValidPaymentQrAmount('epc', invoice.total)) return null;

  const bic = normalizePaymentQrSwift(seller.swift);
  if (!isValidPaymentQrSwift(bic)) return null;
  const name = truncatePaymentQrText(
    sanitizePaymentQrText(seller.companyName || labels.receiverFallback),
    70,
  );
  if (!name) return null;
  const amount = formatPaymentQrAmount(invoice.total);
  const reference = truncatePaymentQrText(sanitizePaymentQrText(labels.invoiceReference), 140);

  const payload = [
    'BCD',
    '002',
    '1',
    'SCT',
    bic,
    name,
    iban,
    `EUR${amount}`,
    '',
    '',
    reference,
  ].join('\n');
  return isPaymentQrEpcPayloadWithinByteLimit(payload) ? payload : null;
}

function buildSwissPayload(
  invoice: PaymentQrPayloadInvoice,
  seller: SellerSnapshot,
  labels: PaymentQrPayloadLabels,
): string | null {
  const iban = normalizePaymentQrIban(seller.iban);
  if (!isValidPaymentQrIban(iban) || (!iban.startsWith('CH') && !iban.startsWith('LI'))) {
    return null;
  }
  if (isSwissQrIban(iban)) return null;

  const currency = normalizeCurrencyCode(invoice.currency).toUpperCase();
  if (currency !== 'CHF' && currency !== 'EUR') return null;
  if (!isValidPaymentQrAmount('swiss', invoice.total)) return null;

  const addressParts = splitStreetAndBuildingNumber(seller.address);
  const name = truncatePaymentQrText(sanitizePaymentQrText(seller.companyName), 70);
  const street = truncatePaymentQrText(sanitizePaymentQrText(addressParts.streetName), 70);
  const buildingNumber = addressParts.inferred
    ? truncatePaymentQrText(sanitizePaymentQrText(addressParts.buildingNumber), 16)
    : '';
  const city = truncatePaymentQrText(sanitizePaymentQrText(seller.city), 35);
  const postal = truncatePaymentQrText(sanitizePaymentQrText(seller.postalCode), 16);
  const country = normalizePaymentQrCountryCode(seller.country);
  if (!name || !street || !city || !postal || !country) return null;

  const amount = formatPaymentQrAmount(invoice.total);
  const message = truncatePaymentQrText(sanitizePaymentQrText(labels.invoiceReference), 140);

  return [
    'SPC',
    '0200',
    '1',
    iban,
    'S',
    name,
    street,
    buildingNumber,
    postal,
    city,
    country,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    amount,
    currency,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'NON',
    '',
    message,
    'EPD',
    '',
    '',
    '',
  ].join('\n');
}

export function buildPaymentQrPayload(
  qrType: PaymentQrType,
  invoice: PaymentQrPayloadInvoice,
  seller: SellerSnapshot,
  labels: PaymentQrPayloadLabels,
): string | null {
  if (qrType === 'spayd') return buildSpaydPayload(invoice, seller, labels);
  if (qrType === 'epc') return buildEpcPayload(invoice, seller, labels);
  if (qrType === 'swiss') return buildSwissPayload(invoice, seller, labels);
  return null;
}
