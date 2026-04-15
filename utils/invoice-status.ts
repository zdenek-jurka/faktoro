import type InvoiceModel from '@/model/InvoiceModel';
import type { useI18nContext } from '@/i18n/i18n-react';

export type InvoiceCancellationMode = 'void_before_delivery' | 'issue_cancellation';

type LL = ReturnType<typeof useI18nContext>['LL'];

function isMutableIssuedInvoice(invoice: Pick<InvoiceModel, 'status' | 'correctionKind'>): boolean {
  return invoice.status === 'issued' && !isInvoiceCancellationDocument(invoice);
}

export function isInvoiceCancellationDocument(
  invoice: Pick<InvoiceModel, 'correctionKind'>,
): boolean {
  return invoice.correctionKind === 'cancellation';
}

export function canEditIssuedInvoice(
  invoice: Pick<InvoiceModel, 'status' | 'correctionKind'>,
): boolean {
  return isMutableIssuedInvoice(invoice);
}

export function canCancelIssuedInvoice(
  invoice: Pick<InvoiceModel, 'status' | 'correctionKind'>,
): boolean {
  return isMutableIssuedInvoice(invoice);
}

export function isInvoiceVatPayer(
  invoice?: Pick<InvoiceModel, 'sellerSnapshotJson'> | null,
): boolean {
  if (!invoice?.sellerSnapshotJson) return false;
  try {
    const sellerSnapshot = JSON.parse(invoice.sellerSnapshotJson) as { vatNumber?: string };
    return !!sellerSnapshot.vatNumber?.trim();
  } catch {
    return false;
  }
}

export function getRecommendedInvoiceCancellationMode(
  invoice: Pick<InvoiceModel, 'lastExportedAt'>,
): InvoiceCancellationMode {
  return invoice.lastExportedAt ? 'issue_cancellation' : 'void_before_delivery';
}

export function getInvoiceStatusLabel(
  invoice: Pick<InvoiceModel, 'status' | 'correctionKind' | 'sellerSnapshotJson'>,
  LL: LL,
): string | null {
  if (isInvoiceCancellationDocument(invoice)) {
    return isInvoiceVatPayer(invoice)
      ? LL.invoices.exportCancellationTaxDocumentTitle()
      : LL.invoices.statusCancellationDocument();
  }
  if (invoice.status === 'voided_before_delivery') {
    return LL.invoices.statusVoidedBeforeDelivery();
  }
  if (invoice.status === 'canceled_by_correction') {
    return LL.invoices.statusCanceledByCorrection();
  }
  return null;
}
