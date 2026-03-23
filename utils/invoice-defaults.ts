export const DEFAULT_INVOICE_PAYMENT_METHOD = 'bank_transfer';
export const DEFAULT_INVOICE_DUE_DAYS = 14;
export const INVOICE_PAYMENT_METHOD_OPTIONS = [
  'bank_transfer',
  'cash',
  'card',
  'card_nfc',
] as const;

type InvoiceDefaultsSource = {
  defaultInvoicePaymentMethod?: string | null;
  defaultInvoiceDueDays?: number | null;
};

type ClientInvoiceDefaultsSource = {
  invoicePaymentMethod?: string | null;
  invoiceDueDays?: number | null;
};

const SUPPORTED_PAYMENT_METHODS = new Set<string>(INVOICE_PAYMENT_METHOD_OPTIONS);

export function normalizeInvoicePaymentMethod(value?: string | null): string {
  const normalized = value?.trim() || '';
  return SUPPORTED_PAYMENT_METHODS.has(normalized) ? normalized : DEFAULT_INVOICE_PAYMENT_METHOD;
}

export function sanitizeInvoiceDueDays(value?: number | null): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : undefined;
}

export function parseInvoiceDueDaysInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  return sanitizeInvoiceDueDays(Number(trimmed));
}

export function resolveInvoicePaymentMethod(
  client?: ClientInvoiceDefaultsSource | null,
  settings?: InvoiceDefaultsSource | null,
): string {
  return normalizeInvoicePaymentMethod(
    client?.invoicePaymentMethod || settings?.defaultInvoicePaymentMethod,
  );
}

export function resolveInvoiceDueDays(
  client?: ClientInvoiceDefaultsSource | null,
  settings?: InvoiceDefaultsSource | null,
): number {
  return (
    sanitizeInvoiceDueDays(client?.invoiceDueDays) ??
    sanitizeInvoiceDueDays(settings?.defaultInvoiceDueDays) ??
    DEFAULT_INVOICE_DUE_DAYS
  );
}

export function addDaysToIsoDate(baseIsoDate: string, days: number): string {
  const date = new Date(`${baseIsoDate}T00:00:00`);
  if (!Number.isFinite(date.getTime())) {
    return baseIsoDate;
  }

  date.setDate(date.getDate() + Math.max(0, Math.trunc(days)));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
