import type { ClientModel, InvoiceItemModel, InvoiceModel } from '@/model';
import type { BuyerSnapshot, InvoiceXmlFormat, SellerSnapshot } from '@/templates/invoice/xml';
import { splitStreetAndBuildingNumber } from '@/utils/address-building-number';
import { resolveUneceUnitCode } from '@/utils/e-invoice-unit-code';

export type StructuredInvoiceExportFixTarget = 'buyer' | 'invoice' | 'invoiceDefaults' | 'seller';

export type StructuredInvoiceExportField =
  | 'address'
  | 'bankAccount'
  | 'buyerReference'
  | 'city'
  | 'companyId'
  | 'companyName'
  | 'country'
  | 'currency'
  | 'description'
  | 'dueDate'
  | 'email'
  | 'invoiceNumber'
  | 'name'
  | 'phone'
  | 'postalCode'
  | 'quantity'
  | 'totalPrice'
  | 'unit'
  | 'unitPrice'
  | 'vatNumber'
  | 'vatRate';

export type StructuredInvoiceExportIssue =
  | {
      kind: 'missingField';
      scope: 'buyer' | 'invoice' | 'line' | 'seller';
      field: StructuredInvoiceExportField;
      fixTarget?: StructuredInvoiceExportFixTarget;
      lineIndex?: number;
    }
  | {
      kind: 'invalidField';
      scope: 'invoice' | 'line';
      field: StructuredInvoiceExportField;
      fixTarget?: StructuredInvoiceExportFixTarget;
      lineIndex?: number;
    }
  | {
      kind: 'buildingNumberNotInferred';
      party: 'buyer' | 'seller';
      fixTarget?: StructuredInvoiceExportFixTarget;
    }
  | {
      kind: 'unsupportedRequirement';
      format: Extract<InvoiceXmlFormat, 'peppol' | 'xrechnung'>;
      requirement:
        | 'buyerReference'
        | 'electronicAddressScheme'
        | 'paymentInstructions'
        | 'sellerContactName'
        | 'taxBreakdown'
        | 'unitCode';
      fixTarget?: StructuredInvoiceExportFixTarget;
      lineIndex?: number;
    };

type StructuredInvoiceExportValidationInput = {
  invoice: InvoiceModel;
  items: InvoiceItemModel[];
  client: ClientModel | null;
  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
};

function hasText(value?: string | null): boolean {
  return !!value?.trim();
}

function hasValidAmount(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasValidQuantity(value: number | undefined): boolean {
  return hasValidAmount(value) && value !== 0;
}

function hasValidCurrencyCode(value?: string | null): boolean {
  return /^[A-Z]{3}$/.test((value || '').trim().toUpperCase());
}

function getBuyerFixTarget(
  input: StructuredInvoiceExportValidationInput,
): StructuredInvoiceExportFixTarget {
  return input.client?.id || input.invoice.clientId ? 'buyer' : 'invoice';
}

function hasBankPaymentDetails(seller: SellerSnapshot): boolean {
  return hasText(seller.iban) || hasText(seller.bankAccount);
}

function isBankTransfer(paymentMethod?: string): boolean {
  return !paymentMethod || paymentMethod === 'bank_transfer';
}

function addPartyIssues(
  issues: StructuredInvoiceExportIssue[],
  scope: 'buyer' | 'seller',
  snapshot: BuyerSnapshot | SellerSnapshot,
  fixTarget: StructuredInvoiceExportFixTarget,
  format: InvoiceXmlFormat,
) {
  const nameField = scope === 'seller' ? 'companyName' : 'name';
  const nameValue =
    scope === 'seller'
      ? (snapshot as SellerSnapshot).companyName
      : (snapshot as BuyerSnapshot).name;

  if (!hasText(nameValue)) {
    issues.push({ kind: 'missingField', scope, field: nameField, fixTarget });
  }
  if (!hasText(snapshot.address)) {
    issues.push({ kind: 'missingField', scope, field: 'address', fixTarget });
  }
  if (!hasText(snapshot.city)) {
    issues.push({ kind: 'missingField', scope, field: 'city', fixTarget });
  }
  if (!hasText(snapshot.postalCode)) {
    issues.push({ kind: 'missingField', scope, field: 'postalCode', fixTarget });
  }
  if (!hasText(snapshot.country)) {
    issues.push({ kind: 'missingField', scope, field: 'country', fixTarget });
  }

  if (format === 'isdoc' && hasText(snapshot.address)) {
    const addressParts = splitStreetAndBuildingNumber(snapshot.address);
    if (!addressParts.inferred) {
      issues.push({ kind: 'buildingNumberNotInferred', party: scope, fixTarget });
    }
  }
}

export function getStructuredInvoiceExportIssues(
  format: InvoiceXmlFormat,
  input: StructuredInvoiceExportValidationInput,
): StructuredInvoiceExportIssue[] {
  const issues: StructuredInvoiceExportIssue[] = [];
  const { buyer, invoice, items, seller } = input;
  const buyerFixTarget = getBuyerFixTarget(input);

  if (!hasText(invoice.invoiceNumber)) {
    issues.push({
      kind: 'missingField',
      scope: 'invoice',
      field: 'invoiceNumber',
      fixTarget: 'invoice',
    });
  }

  if (!hasValidCurrencyCode(invoice.currency)) {
    issues.push({
      kind: 'invalidField',
      scope: 'invoice',
      field: 'currency',
      fixTarget: 'invoice',
    });
  }

  if (invoice.total > 0 && !invoice.dueAt && (format === 'peppol' || format === 'xrechnung')) {
    issues.push({ kind: 'missingField', scope: 'invoice', field: 'dueDate', fixTarget: 'invoice' });
  }

  addPartyIssues(issues, 'seller', seller, 'seller', format);
  addPartyIssues(issues, 'buyer', buyer, buyerFixTarget, format);

  const hasVatLines = items.some((item) => Number(item.vatRate ?? 0) > 0);
  if (hasVatLines && !hasText(seller.vatNumber)) {
    issues.push({ kind: 'missingField', scope: 'seller', field: 'vatNumber', fixTarget: 'seller' });
  }

  items.forEach((item, index) => {
    if (!hasText(item.description)) {
      issues.push({
        kind: 'missingField',
        scope: 'line',
        field: 'description',
        lineIndex: index,
        fixTarget: 'invoice',
      });
    }
    if (!hasValidQuantity(item.quantity)) {
      issues.push({
        kind: 'invalidField',
        scope: 'line',
        field: 'quantity',
        lineIndex: index,
        fixTarget: 'invoice',
      });
    }
    if (!hasValidAmount(item.unitPrice)) {
      issues.push({
        kind: 'invalidField',
        scope: 'line',
        field: 'unitPrice',
        lineIndex: index,
        fixTarget: 'invoice',
      });
    }
    if (!hasValidAmount(item.totalPrice)) {
      issues.push({
        kind: 'invalidField',
        scope: 'line',
        field: 'totalPrice',
        lineIndex: index,
        fixTarget: 'invoice',
      });
    }
    if (!hasText(item.unit)) {
      issues.push({
        kind: 'missingField',
        scope: 'line',
        field: 'unit',
        lineIndex: index,
        fixTarget: 'invoice',
      });
    }
    if (format !== 'isdoc' && !resolveUneceUnitCode(item.unit)) {
      issues.push({
        kind: 'unsupportedRequirement',
        format,
        requirement: 'unitCode',
        lineIndex: index,
        fixTarget: 'invoice',
      });
    }
  });

  if (format === 'peppol' || format === 'xrechnung') {
    const hasZeroOrMissingVatCategory = items.some((item) => Number(item.vatRate ?? 0) <= 0);

    if (!hasText(invoice.buyerReference)) {
      issues.push({
        kind: 'missingField',
        scope: 'invoice',
        field: 'buyerReference',
        fixTarget: 'invoice',
      });
    }

    issues.push({
      kind: 'unsupportedRequirement',
      format,
      requirement: 'electronicAddressScheme',
      fixTarget: !hasText(seller.email)
        ? 'seller'
        : !hasText(buyer.email)
          ? buyerFixTarget
          : undefined,
    });

    if (hasZeroOrMissingVatCategory) {
      issues.push({
        kind: 'unsupportedRequirement',
        format,
        requirement: 'taxBreakdown',
      });
    }

    if (isBankTransfer(invoice.paymentMethod) && !hasBankPaymentDetails(seller)) {
      issues.push({
        kind: 'unsupportedRequirement',
        format,
        requirement: 'paymentInstructions',
        fixTarget: 'invoiceDefaults',
      });
    }
  }

  if (format === 'xrechnung') {
    issues.push({
      kind: 'unsupportedRequirement',
      format,
      requirement: 'sellerContactName',
    });

    if (!hasText(seller.email)) {
      issues.push({ kind: 'missingField', scope: 'seller', field: 'email', fixTarget: 'seller' });
    }
    if (!hasText(seller.phone)) {
      issues.push({ kind: 'missingField', scope: 'seller', field: 'phone', fixTarget: 'seller' });
    }
  }

  return issues;
}
