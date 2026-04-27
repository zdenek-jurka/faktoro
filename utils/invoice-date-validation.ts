import { parseISODate, todayISODate } from '@/utils/iso-date';

const TAXABLE_SUPPLY_ISSUE_WINDOW_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InvoiceDateValidationInput = {
  issuedDate?: string;
  taxableDate?: string;
  dueDate?: string;
  isVatPayer: boolean;
};

export type InvoiceDateValidationResult = {
  invalidIssuedDate: boolean;
  invalidTaxableDate: boolean;
  invalidDueDate: boolean;
  taxableDateRequired: boolean;
  issuedAfterTaxableWindow: boolean;
  dueDateBeforeIssue: boolean;
  dueDatePast: boolean;
};

function hasDateText(value?: string): boolean {
  return !!value?.trim();
}

export function getInvoiceDateValidation(
  input: InvoiceDateValidationInput,
): InvoiceDateValidationResult {
  const issuedAt = parseISODate(input.issuedDate);
  const taxableAt = parseISODate(input.taxableDate);
  const dueAt = parseISODate(input.dueDate);
  const todayAt = parseISODate(todayISODate());
  const taxableDateRequired = input.isVatPayer && !hasDateText(input.taxableDate);

  return {
    invalidIssuedDate: hasDateText(input.issuedDate) && issuedAt == null,
    invalidTaxableDate: hasDateText(input.taxableDate) && taxableAt == null,
    invalidDueDate: hasDateText(input.dueDate) && dueAt == null,
    taxableDateRequired,
    issuedAfterTaxableWindow:
      input.isVatPayer &&
      issuedAt != null &&
      taxableAt != null &&
      issuedAt > taxableAt + TAXABLE_SUPPLY_ISSUE_WINDOW_DAYS * DAY_MS,
    dueDateBeforeIssue: issuedAt != null && dueAt != null && dueAt < issuedAt,
    dueDatePast: dueAt != null && todayAt != null && dueAt < todayAt,
  };
}
