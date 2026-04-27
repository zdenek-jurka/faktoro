import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getPriceListUnitLabel } from '@/components/price-list/unit-options';
import { PaymentQrModal } from '@/components/invoices/payment-qr-modal';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { OptionSheetModal } from '@/components/ui/option-sheet-modal';
import {
  isInvoiceHtmlExportEnabled,
  isPdfOpenEnabled,
  isPdfSaveEnabled,
} from '@/constants/features';
import { Colors, withOpacity } from '@/constants/theme';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale, normalizeLocale } from '@/i18n/locale-options';
import type { Locales } from '@/i18n/i18n-types';
import { i18nObject } from '@/i18n/i18n-util';
import { ClientModel, InvoiceItemModel, InvoiceModel } from '@/model';
import { renderInvoicePdfHtml } from '@/repositories/invoice-template-repository';
import {
  deliverIntegrationResult,
  getExportIntegrations,
  transformExportXml,
  type ExportIntegration,
  validateBaseExportXml,
} from '@/repositories/export-integration-repository';
import { getConfigValue, setConfigValue } from '@/repositories/config-storage-repository';
import {
  type DraftInvoiceItemInput,
  getInvoiceCancellationLink,
  getInvoiceItems,
  getSuggestedInvoiceNumber,
  markInvoiceExported,
} from '@/repositories/invoice-repository';
import { getSettings } from '@/repositories/settings-repository';
import { observeBetaSettings } from '@/repositories/beta-settings-repository';
import {
  type BuyerSnapshot,
  buildBaseInvoiceXml,
  buildInvoiceXml,
  getInvoiceXmlFileSuffix,
  type InvoiceXmlFormat,
  type SellerSnapshot,
} from '@/templates/invoice/xml';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import {
  getStructuredInvoiceExportIssues,
  type StructuredInvoiceExportField,
  type StructuredInvoiceExportFixTarget,
  type StructuredInvoiceExportIssue,
} from '@/utils/structured-invoice-export-validation';
import {
  getErrorMessage,
  getExportIntegrationErrorMessage,
  getRawErrorMessage,
  isHttpError,
  isNetworkError,
} from '@/utils/error-utils';
import { openLocalFile } from '@/utils/open-local-file';
import { buildCopyFileName } from '@/utils/file-name-utils';
import { toLocalISODate } from '@/utils/iso-date';
import type { InvoiceDraftBuyerMode } from '@/utils/invoice-buyer';
import {
  canCancelIssuedInvoice,
  canCopyInvoice,
  canDeleteInvoice,
  canEditIssuedInvoice,
  getInvoiceStatusLabel,
  isInvoiceCancellationDocument,
  isInvoiceVatPayer,
} from '@/utils/invoice-status';
import {
  getPaymentQrExportRequirement,
  isPaymentQrProfileRequirement,
  normalizePaymentQrType,
  type PaymentQrExportRequirement,
  type PaymentQrType,
} from '@/utils/payment-qr-requirements';
import { buildPaymentQrPayload, type PaymentQrPayloadLabels } from '@/utils/payment-qr-payload';
import { buildPdfLogoHtml } from '@/utils/pdf-logo';
import { printHtmlToPdfCacheFile } from '@/utils/pdf-export-file';
import { formatPrice } from '@/utils/price-utils';
import { isIos } from '@/utils/platform';
import { Q } from '@nozbe/watermelondb';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Pressable, View, type AlertButton } from 'react-native';

const LAST_INVOICE_EXPORT_ACTION_KEY = 'invoice_export.last_action';

type LastInvoiceExportAction =
  | 'pdf'
  | 'open_pdf'
  | 'html'
  | 'save_pdf'
  | 'xml_base'
  | `structured:${InvoiceXmlFormat}`
  | `integration:${string}`;

type StructuredExportFormat = 'none' | InvoiceXmlFormat;
type PendingExportSheetAction =
  | 'pdf'
  | 'open_pdf'
  | 'html'
  | 'save_pdf'
  | 'xml_base'
  | `structured:${InvoiceXmlFormat}`
  | `integration:${string}`
  | null;
type InvoicePdfExportResult = {
  fileName: string;
  uri: string;
};

type InvoiceHtmlExportResult = {
  fileName: string;
  uri: string;
};

type InvoiceCopyTimesheetMode = 'convert' | 'omit';
type StructuredExportWarningDecision = 'cancel' | 'continue' | 'fix';
type TranslationFunctions = ReturnType<typeof useI18nContext>['LL'];

type HeaderDraft = {
  clientId: string;
  buyerMode?: InvoiceDraftBuyerMode;
  buyerSnapshot?: BuyerSnapshot;
  invoiceNumber: string;
  buyerReference?: string;
  issuedDate: string;
  taxableDate?: string;
  dueDate: string;
  currency: string;
  paymentMethod: string;
};

type FooterDraft = {
  headerNote: string;
  footerNote: string;
};

function getStructuredExportFieldLabel(
  LL: TranslationFunctions,
  field: StructuredInvoiceExportField,
): string {
  switch (field) {
    case 'address':
      return LL.settings.address();
    case 'bankAccount':
      return LL.settings.bankAccount();
    case 'buyerReference':
      return LL.invoices.buyerReference();
    case 'city':
      return LL.clients.city();
    case 'companyId':
      return LL.clients.companyId();
    case 'companyName':
      return LL.settings.companyName();
    case 'country':
      return LL.clients.country();
    case 'currency':
      return LL.invoices.currency();
    case 'description':
      return LL.invoices.itemDescription();
    case 'dueDate':
      return LL.invoices.dueDate();
    case 'email':
      return LL.clients.email();
    case 'invoiceNumber':
      return LL.invoices.invoiceNumber();
    case 'name':
      return LL.clients.clientName();
    case 'phone':
      return LL.clients.phone();
    case 'postalCode':
      return LL.clients.postalCode();
    case 'quantity':
      return LL.invoices.quantity();
    case 'totalPrice':
      return LL.invoices.lineTotal();
    case 'unit':
      return LL.priceList.unit();
    case 'unitPrice':
      return LL.invoices.unitPrice();
    case 'vatNumber':
      return LL.clients.vatNumber();
    case 'vatRate':
      return LL.settings.vatRatePercentLabel();
  }
}

function getStructuredExportRequirementLabel(
  LL: TranslationFunctions,
  issue: Extract<StructuredInvoiceExportIssue, { kind: 'unsupportedRequirement' }>,
): string {
  switch (issue.requirement) {
    case 'buyerReference':
      return LL.invoices.structuredExportRequirementBuyerReference();
    case 'electronicAddressScheme':
      return LL.invoices.structuredExportRequirementElectronicAddress();
    case 'paymentInstructions':
      return LL.invoices.structuredExportRequirementPaymentInstructions();
    case 'sellerContactName':
      return LL.invoices.structuredExportRequirementSellerContactName();
    case 'taxBreakdown':
      return LL.invoices.structuredExportRequirementTaxBreakdown();
    case 'unitCode':
      return LL.invoices.structuredExportRequirementUnitCode({
        line: (issue.lineIndex ?? 0) + 1,
      });
  }
}

function formatStructuredExportIssue(
  LL: TranslationFunctions,
  formatLabel: string,
  issue: StructuredInvoiceExportIssue,
): string {
  if (issue.kind === 'buildingNumberNotInferred') {
    return LL.invoices.structuredExportIssueBuildingNumberNotInferred({
      party:
        issue.party === 'seller'
          ? LL.invoices.structuredExportPartySeller()
          : LL.invoices.structuredExportPartyBuyer(),
    });
  }

  if (issue.kind === 'unsupportedRequirement') {
    return LL.invoices.structuredExportIssueUnsupportedRequirement({
      format: formatLabel,
      requirement: getStructuredExportRequirementLabel(LL, issue),
    });
  }

  const field = getStructuredExportFieldLabel(LL, issue.field);
  if (issue.kind === 'missingField') {
    if (issue.scope === 'seller') {
      return LL.invoices.structuredExportIssueMissingSellerField({ field });
    }
    if (issue.scope === 'buyer') {
      return LL.invoices.structuredExportIssueMissingBuyerField({ field });
    }
    if (issue.scope === 'line') {
      return LL.invoices.structuredExportIssueMissingLineField({
        field,
        line: (issue.lineIndex ?? 0) + 1,
      });
    }
    return LL.invoices.structuredExportIssueMissingInvoiceField({ field });
  }

  if (issue.scope === 'line') {
    return LL.invoices.structuredExportIssueInvalidLineField({
      field,
      line: (issue.lineIndex ?? 0) + 1,
    });
  }
  return LL.invoices.structuredExportIssueInvalidInvoiceField({ field });
}

function getFirstStructuredExportFixTarget(
  issues: StructuredInvoiceExportIssue[],
): StructuredInvoiceExportFixTarget | null {
  return issues.find((issue) => issue.fixTarget)?.fixTarget ?? null;
}

function formatPaymentQrRequirement(
  LL: TranslationFunctions,
  requirement: PaymentQrExportRequirement,
): string {
  switch (requirement) {
    case 'epcCurrency':
      return LL.settings.invoiceQrCurrencyRequiredEpc();
    case 'epcPayloadTooLong':
      return LL.settings.invoiceQrPayloadTooLongEpc();
    case 'epcIban':
    case 'epcSwift':
      return LL.settings.invoiceQrBankRequiredEpc();
    case 'paymentAmount':
      return LL.settings.invoiceQrAmountInvalid();
    case 'spaydAccount':
      return LL.settings.invoiceQrBankRequiredSpayd();
    case 'swissAddress':
      return LL.settings.invoiceQrSellerAddressRequiredSwiss();
    case 'swissCurrency':
      return LL.settings.invoiceQrCurrencyRequiredSwiss();
    case 'swissIban':
      return LL.settings.invoiceQrBankRequiredSwiss();
    case 'swissQrIbanReference':
      return LL.settings.invoiceQrBankRequiredSwissStandardIban();
  }
}

function addDaysToLocalISODate(baseDate: string, days: number): string {
  const normalizedDays = Math.max(0, Math.floor(days));
  const [year, month, day] = baseDate.split('-').map(Number);
  const nextDate = new Date(year, (month || 1) - 1, day || 1);
  nextDate.setDate(nextDate.getDate() + normalizedDays);
  return toLocalISODate(nextDate.getTime());
}

function getInvoiceDueOffsetDays(invoice: InvoiceModel): number {
  if (!invoice.dueAt || !invoice.issuedAt) return 0;
  const diff = invoice.dueAt - invoice.issuedAt;
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

function getPaymentMethodLabel(
  LL: ReturnType<typeof useI18nContext>['LL'],
  value?: string,
): string {
  if (value === 'cash') return LL.invoices.paymentMethodCash();
  if (value === 'card') return LL.invoices.paymentMethodCard();
  if (value === 'card_nfc') return LL.invoices.paymentMethodCard();
  return LL.invoices.paymentMethodBankTransfer();
}

function getPaymentQrTypeLabel(LL: TranslationFunctions, qrType: PaymentQrType): string {
  if (qrType === 'spayd') return LL.settings.invoiceQrTypeSpayd();
  if (qrType === 'epc') return LL.settings.invoiceQrTypeEpc();
  if (qrType === 'swiss') return LL.settings.invoiceQrTypeSwiss();
  return LL.settings.invoiceQrTypeNone();
}

async function buildPaymentQrHtmlEmbedded(
  qrType: PaymentQrType,
  payload: string | null,
  qrLabel: string,
): Promise<string> {
  if (qrType === 'none' || !payload) return '';
  const qrLabelColor = Colors.light.text;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QRCode = require('qrcode');
    // Prefer inline SVG for better compatibility in Expo Print; fallback to PNG data URL.
    try {
      const svg: string = await QRCode.toString(payload, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220,
      });
      const sizedSvg = svg.replace('<svg', '<svg style="width:35mm;height:35mm;display:block;"');
      return `<div><div style="font-size:11px;color:${qrLabelColor};margin-bottom:4px">${qrLabel} (${qrType.toUpperCase()})</div>${sizedSvg}</div>`;
    } catch {
      const dataUrl: string = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220,
      });
      return `<div><div style="font-size:11px;color:${qrLabelColor};margin-bottom:4px">${qrLabel} (${qrType.toUpperCase()})</div><img src="${dataUrl}" style="width:35mm;height:35mm;display:block;" /></div>`;
    }
  } catch {
    return '';
  }
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const listContentStyle = useBottomSafeAreaStyle(styles.listContent);
  const intlLocale = normalizeIntlLocale(locale, 'en');

  const [invoice, setInvoice] = useState<InvoiceModel | null>(null);
  const [client, setClient] = useState<ClientModel | null>(null);
  const [relatedInvoice, setRelatedInvoice] = useState<InvoiceModel | null>(null);
  const [items, setItems] = useState<InvoiceItemModel[]>([]);
  const [exportingTarget, setExportingTarget] = useState<
    'pdf' | 'open_pdf' | 'save_pdf' | 'html' | 'xml' | null
  >(null);
  const [isPaymentQrModalVisible, setIsPaymentQrModalVisible] = useState(false);
  const [structuredExportFormat, setStructuredExportFormat] =
    useState<StructuredExportFormat>('none');
  const [isExportFormatSheetVisible, setIsExportFormatSheetVisible] = useState(false);
  const [pendingExportSheetAction, setPendingExportSheetAction] =
    useState<PendingExportSheetAction>(null);
  const [exportIntegrationsEnabled, setExportIntegrationsEnabled] = useState(false);
  const [invoiceDeletionEnabled, setInvoiceDeletionEnabled] = useState(false);
  const [invoiceExportIntegrations, setInvoiceExportIntegrations] = useState<ExportIntegration[]>(
    [],
  );
  const [lastExportAction, setLastExportAction] = useState<LastInvoiceExportAction | null>(null);
  const exportLocale = useMemo<Locales>(() => {
    return normalizeLocale(client?.exportLanguage, locale);
  }, [client?.exportLanguage, locale]);
  const LLExport = useMemo(() => i18nObject(exportLocale), [exportLocale]);

  useEffect(() => {
    const unsub = observeBetaSettings((settings) => {
      setExportIntegrationsEnabled(settings.exportIntegrationsEnabled);
      setInvoiceDeletionEnabled(settings.invoiceDeletionEnabled);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLastExportAction = async () => {
      const stored = await getConfigValue(LAST_INVOICE_EXPORT_ACTION_KEY);
      if (!isMounted) return;
      setLastExportAction(stored ? (stored as LastInvoiceExportAction) : null);
    };

    void loadLastExportAction();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const loadIntegrations = async () => {
      if (!exportIntegrationsEnabled) {
        setInvoiceExportIntegrations([]);
        return;
      }
      const integrations = await getExportIntegrations('invoice');
      setInvoiceExportIntegrations(integrations);
    };
    void loadIntegrations();
  }, [exportIntegrationsEnabled]);

  useEffect(() => {
    if (!id) return;

    const invoiceSubscription = database
      .get<InvoiceModel>(InvoiceModel.table)
      .findAndObserve(id)
      .subscribe(setInvoice);

    return () => invoiceSubscription.unsubscribe();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const itemsSubscription = database
      .get<InvoiceItemModel>(InvoiceItemModel.table)
      .query(Q.where('invoice_id', id), Q.sortBy('created_at', Q.asc))
      .observeWithColumns([
        'invoice_id',
        'source_kind',
        'source_id',
        'description',
        'quantity',
        'unit',
        'unit_price',
        'total_price',
        'vat_code_id',
        'vat_rate',
        'created_at',
      ])
      .subscribe(setItems);

    return () => itemsSubscription.unsubscribe();
  }, [id]);

  useEffect(() => {
    if (!invoice?.clientId) {
      setClient(null);
      return;
    }

    const clientSubscription = database
      .get<ClientModel>(ClientModel.table)
      .findAndObserve(invoice.clientId)
      .subscribe(setClient);

    return () => clientSubscription.unsubscribe();
  }, [invoice?.clientId]);

  useEffect(() => {
    let isMounted = true;

    const loadRelatedInvoice = async () => {
      if (!invoice) {
        if (isMounted) setRelatedInvoice(null);
        return;
      }
      const linkedInvoice = await getInvoiceCancellationLink(invoice.id);
      if (isMounted) {
        setRelatedInvoice(linkedInvoice);
      }
    };

    void loadRelatedInvoice();

    return () => {
      isMounted = false;
    };
  }, [invoice]);

  useEffect(() => {
    const loadExportFormat = async () => {
      const settings = await getSettings();
      const format = client?.invoiceDefaultExportFormat || settings.invoiceDefaultExportFormat;
      if (
        format === 'none' ||
        format === 'isdoc' ||
        format === 'peppol' ||
        format === 'xrechnung'
      ) {
        setStructuredExportFormat(format);
        return;
      }
      setStructuredExportFormat('none');
    };
    void loadExportFormat();
  }, [client?.invoiceDefaultExportFormat]);

  const runPendingExportSheetAction = useEffectEvent(() => {
    const action = pendingExportSheetAction;
    if (action === null) {
      return;
    }

    if (action === 'pdf') {
      setPendingExportSheetAction(null);
      void handleExportPdf();
      return;
    }
    if (action === 'open_pdf') {
      setPendingExportSheetAction(null);
      if (isPdfOpenEnabled) {
        void handleOpenPdf();
      }
      return;
    }
    if (action === 'html') {
      setPendingExportSheetAction(null);
      if (isInvoiceHtmlExportEnabled) {
        void handleExportHtml();
      }
      return;
    }
    if (action === 'save_pdf') {
      setPendingExportSheetAction(null);
      if (isPdfSaveEnabled) {
        void handleSavePdf();
      }
      return;
    }
    if (action === 'xml_base') {
      setPendingExportSheetAction(null);
      void handleExportCustomXml(null);
      return;
    }
    if (action.startsWith('structured:')) {
      const format = action.slice('structured:'.length) as InvoiceXmlFormat;
      setPendingExportSheetAction(null);
      void handleExportXml(format);
      return;
    }
    if (action.startsWith('integration:')) {
      const integrationId = action.slice('integration:'.length);
      setPendingExportSheetAction(null);
      void handleExportCustomXml(integrationId);
    }
  });

  useEffect(() => {
    if (isExportFormatSheetVisible || pendingExportSheetAction === null) {
      return;
    }

    const timeoutId = setTimeout(() => {
      runPendingExportSheetAction();
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [isExportFormatSheetVisible, pendingExportSheetAction, runPendingExportSheetAction]);

  const seller = useMemo<SellerSnapshot>(() => {
    if (!invoice?.sellerSnapshotJson) return {};
    try {
      return JSON.parse(invoice.sellerSnapshotJson) as SellerSnapshot;
    } catch {
      return {};
    }
  }, [invoice?.sellerSnapshotJson]);
  const buyer = useMemo<BuyerSnapshot>(() => {
    if (invoice?.buyerSnapshotJson) {
      try {
        return JSON.parse(invoice.buyerSnapshotJson) as BuyerSnapshot;
      } catch {
        // Fall back to current client data for legacy invoices without a valid snapshot.
      }
    }

    return {
      name: client?.name,
      companyId: client?.companyId,
      vatNumber: client?.vatNumber,
      email: client?.email,
      phone: client?.phone,
    };
  }, [
    client?.companyId,
    client?.email,
    client?.name,
    client?.phone,
    client?.vatNumber,
    invoice?.buyerSnapshotJson,
  ]);

  const rememberLastExportAction = useEffectEvent(async (action: LastInvoiceExportAction) => {
    setLastExportAction(action);
    try {
      await setConfigValue(LAST_INVOICE_EXPORT_ACTION_KEY, action);
    } catch (error) {
      console.warn('Failed to persist invoice export action', error);
    }
  });

  const persistInvoiceExported = useEffectEvent(async (invoiceId: string) => {
    try {
      await markInvoiceExported(invoiceId);
    } catch (error) {
      console.warn('Failed to persist invoice export timestamp', error);
    }
  });

  const completeSuccessfulExport = (invoiceId: string) => {
    void persistInvoiceExported(invoiceId);
  };

  const openEditInvoiceDraft = () => {
    if (!invoice) return;

    const headerDraft: HeaderDraft = {
      clientId: invoice.clientId,
      buyerMode: invoice.clientId ? 'client' : 'one_off',
      buyerSnapshot: buyer,
      invoiceNumber: invoice.invoiceNumber,
      buyerReference: invoice.buyerReference || '',
      issuedDate: toLocalISODate(invoice.issuedAt),
      taxableDate: invoice.taxableAt ? toLocalISODate(invoice.taxableAt) : undefined,
      dueDate: invoice.dueAt ? toLocalISODate(invoice.dueAt) : toLocalISODate(invoice.issuedAt),
      currency: normalizeCurrencyCode(invoice.currency),
      paymentMethod: invoice.paymentMethod || 'bank_transfer',
    };
    const footerDraft: FooterDraft = {
      headerNote: invoice.headerNote || '',
      footerNote: invoice.footerNote || '',
    };
    const itemsDraft: DraftInvoiceItemInput[] = items.map((item) => ({
      sourceKind: item.sourceKind as DraftInvoiceItemInput['sourceKind'],
      sourceId: item.sourceId,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      vatCodeId: item.vatCodeId,
      vatRate: item.vatRate,
    }));

    router.push({
      pathname: '/invoices/new',
      params: {
        editingInvoiceId: invoice.id,
        headerDraft: JSON.stringify(headerDraft),
        itemsDraft: JSON.stringify(itemsDraft),
        footerDraft: JSON.stringify(footerDraft),
      },
    });
  };

  const openStructuredExportFixTarget = (target: StructuredInvoiceExportFixTarget) => {
    if (target === 'seller') {
      router.push('/settings/business-profile');
      return;
    }
    if (target === 'invoiceDefaults') {
      router.push('/settings/invoice-defaults');
      return;
    }
    if (target === 'buyer') {
      const clientId = client?.id || invoice?.clientId;
      if (clientId) {
        router.push(`/clients/edit/${clientId}`);
        return;
      }
    }

    openEditInvoiceDraft();
  };

  const getPaymentQrLabels = (): PaymentQrPayloadLabels => ({
    receiverFallback: LLExport.invoices.exportReceiverFallback(),
    invoiceReference: LLExport.invoices.exportInvoiceNote({
      invoiceNumber: invoice?.invoiceNumber || '',
    }),
  });

  const showPaymentQrExportWarning = (
    requirement: PaymentQrExportRequirement,
  ): Promise<'cancel' | 'continue' | 'fix'> => {
    const reason = formatPaymentQrRequirement(LLExport, requirement);
    const fixText = isPaymentQrProfileRequirement(requirement)
      ? LLExport.settings.invoiceQrProfileCta()
      : LLExport.settings.invoiceQrEditInvoice();

    return new Promise((resolve) => {
      Alert.alert(
        LLExport.settings.invoiceQrPdfWarningTitle(),
        LLExport.settings.invoiceQrPdfWarningMessage({ reason }),
        [
          {
            text: LLExport.common.cancel(),
            style: 'cancel',
            onPress: () => resolve('cancel'),
          },
          {
            text: LLExport.settings.invoiceQrContinueWithoutQr(),
            onPress: () => resolve('continue'),
          },
          {
            text: fixText,
            onPress: () => resolve('fix'),
          },
        ],
        {
          cancelable: true,
          onDismiss: () => resolve('cancel'),
        },
      );
    });
  };

  const confirmPaymentQrExport = async (): Promise<boolean> => {
    if (!invoice) return false;

    const qrType = normalizePaymentQrType(seller.qrType);
    const paymentQrLabels = getPaymentQrLabels();
    const requirement = getPaymentQrExportRequirement(qrType, seller, {
      invoiceCurrency: invoice.currency,
      totalAmount: invoice.total,
      receiverName: paymentQrLabels.receiverFallback,
      invoiceReference: paymentQrLabels.invoiceReference,
    });
    if (!requirement) return true;

    const decision = await showPaymentQrExportWarning(requirement);
    if (decision === 'continue') return true;
    if (decision === 'fix') {
      if (isPaymentQrProfileRequirement(requirement)) {
        router.push('/settings/business-profile');
      } else {
        handleEditInvoice();
      }
    }
    return false;
  };

  const buildCopyItemsDraft = (
    sourceItems: InvoiceItemModel[],
    timesheetMode: InvoiceCopyTimesheetMode,
  ): DraftInvoiceItemInput[] =>
    sourceItems.flatMap((item) => {
      if (item.sourceKind !== 'timesheet') {
        return [
          {
            sourceKind: item.sourceKind as DraftInvoiceItemInput['sourceKind'],
            sourceId: item.sourceId,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            vatCodeId: item.vatCodeId,
            vatRate: item.vatRate,
          },
        ];
      }

      if (timesheetMode === 'omit') {
        return [];
      }

      return [
        {
          sourceKind: 'manual',
          sourceId: undefined,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          vatCodeId: item.vatCodeId,
          vatRate: item.vatRate,
        },
      ];
    });

  const openCopyInvoiceDraft = async (
    sourceItems: InvoiceItemModel[],
    timesheetMode: InvoiceCopyTimesheetMode,
  ) => {
    if (!invoice) return;

    const today = toLocalISODate(Date.now());
    const nextInvoiceNumber = await getSuggestedInvoiceNumber();
    const dueDate = addDaysToLocalISODate(today, getInvoiceDueOffsetDays(invoice));
    const includeTaxableDate = isInvoiceVatPayer(invoice);
    const headerDraft: HeaderDraft = {
      clientId: invoice.clientId,
      buyerMode: invoice.clientId ? 'client' : 'one_off',
      buyerSnapshot: buyer,
      invoiceNumber: nextInvoiceNumber,
      buyerReference: invoice.buyerReference || '',
      issuedDate: today,
      taxableDate: includeTaxableDate ? today : undefined,
      dueDate,
      currency: normalizeCurrencyCode(invoice.currency),
      paymentMethod: invoice.paymentMethod || 'bank_transfer',
    };
    const footerDraft: FooterDraft = {
      headerNote: invoice.headerNote || '',
      footerNote: invoice.footerNote || '',
    };
    const itemsDraft = buildCopyItemsDraft(sourceItems, timesheetMode);

    router.push({
      pathname: '/invoices/new',
      params: {
        headerDraft: JSON.stringify(headerDraft),
        itemsDraft: JSON.stringify(itemsDraft),
        footerDraft: JSON.stringify(footerDraft),
      },
    });
  };

  const handleCopyInvoice = async () => {
    if (!invoice) return;

    try {
      const sourceItems = await getInvoiceItems(invoice.id);
      const hasTimesheetItems = sourceItems.some((item) => item.sourceKind === 'timesheet');

      if (!hasTimesheetItems) {
        await openCopyInvoiceDraft(sourceItems, 'convert');
        return;
      }

      Alert.alert(
        LL.invoices.copyInvoiceTimesheetTitle(),
        LL.invoices.copyInvoiceTimesheetMessage(),
        [
          {
            text: LL.common.cancel(),
            style: 'cancel',
          },
          {
            text: LL.invoices.copyInvoiceOmitTimesheetItems(),
            onPress: () => {
              void openCopyInvoiceDraft(sourceItems, 'omit');
            },
          },
          {
            text: LL.invoices.copyInvoiceConvertTimesheetItems(),
            onPress: () => {
              void openCopyInvoiceDraft(sourceItems, 'convert');
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(LL.common.error(), getErrorMessage(error, LL.invoices.copyInvoiceError()));
    }
  };

  const handleEditInvoice = () => {
    if (!invoice) return;

    if (!invoice.lastExportedAt) {
      openEditInvoiceDraft();
      return;
    }

    Alert.alert(LL.invoices.editExportedWarningTitle(), LL.invoices.editExportedWarningMessage(), [
      {
        text: LL.common.cancel(),
        style: 'cancel',
      },
      {
        text: LL.common.continueEditing(),
        onPress: openEditInvoiceDraft,
      },
    ]);
  };

  const handleOpenCancelFlow = () => {
    if (!invoice) return;
    router.push({
      pathname: '/invoices/[id]/cancel',
      params: { id: invoice.id },
    });
  };

  const handleOpenDeleteFlow = () => {
    if (!invoice) return;
    router.push({
      pathname: '/invoices/[id]/delete',
      params: { id: invoice.id },
    });
  };

  const buildInvoiceHtmlDocument = async (): Promise<string> => {
    if (!invoice) {
      throw new Error(LLExport.invoices.exportError());
    }

    const settings = await getSettings();
    const logoHtml = await buildPdfLogoHtml(
      {
        logoUri: seller.logoUri || settings.invoiceLogoUri,
        logoBase64: settings.invoiceLogoBase64,
        logoMimeType: settings.invoiceLogoMimeType,
      },
      {
        maxWidth: '5cm',
        maxHeight: null,
      },
    );
    const qrType = normalizePaymentQrType(seller.qrType);
    const paymentQrLabels = getPaymentQrLabels();
    const paymentQrPayload = buildPaymentQrPayload(qrType, invoice, seller, paymentQrLabels);
    const paymentQrHtml = await buildPaymentQrHtmlEmbedded(
      qrType,
      paymentQrPayload,
      LLExport.settings.invoiceQrType(),
    );
    const includeVat =
      !!invoice.taxableAt ||
      items.some((item) => item.vatRate != null && Number(item.vatRate) >= 0);
    const documentTitle = isInvoiceCancellationDocument(invoice)
      ? includeVat
        ? LLExport.invoices.exportCancellationTaxDocumentTitle()
        : LLExport.invoices.exportCancellationDocumentTitle()
      : includeVat
        ? LLExport.invoices.exportTaxDocumentTitle()
        : LLExport.invoices.exportInvoiceTitle();
    const cancellationNoteLines =
      invoice.correctionKind === 'cancellation'
        ? [
            LLExport.invoices.exportCancellationCorrectsInvoice({
              invoiceNumber: relatedInvoice?.invoiceNumber || invoice.correctedInvoiceId || '-',
            }),
            invoice.cancellationReason
              ? LLExport.invoices.exportCancellationReason({
                  reason: invoice.cancellationReason,
                })
              : null,
          ]
        : invoice.status === 'voided_before_delivery'
          ? [
              LLExport.invoices.exportVoidedNotice(),
              invoice.cancellationReason
                ? LLExport.invoices.exportCancellationReason({
                    reason: invoice.cancellationReason,
                  })
                : null,
            ]
          : invoice.status === 'canceled_by_correction'
            ? [
                LLExport.invoices.exportCanceledByCorrection({
                  invoiceNumber: relatedInvoice?.invoiceNumber || '-',
                }),
                invoice.cancellationReason
                  ? LLExport.invoices.exportCancellationReason({
                      reason: invoice.cancellationReason,
                    })
                  : null,
              ]
            : [];
    const effectiveFooterNote = [invoice.footerNote, ...cancellationNoteLines]
      .filter(Boolean)
      .join('\n');
    const watermarkText =
      invoice.status === 'voided_before_delivery'
        ? LLExport.invoices.exportVoidedWatermark()
        : undefined;

    return renderInvoicePdfHtml({
      templateId: 'default',
      locale: exportLocale,
      currency: invoice.currency,
      includeVat,
      watermarkText,
      invoiceNumber: invoice.invoiceNumber,
      buyerReference: invoice.buyerReference,
      issueAt: invoice.issuedAt,
      taxableAt: invoice.taxableAt,
      dueAt: invoice.dueAt,
      subtotal: invoice.subtotal,
      total: invoice.total,
      footerNote: effectiveFooterNote,
      bankAccount: seller.bankAccount,
      iban: seller.iban,
      swift: seller.swift,
      logoHtml,
      paymentQrHtml,
      labels: {
        title: documentTitle,
        taxDocumentTitle: documentTitle,
        invoiceNumber: LLExport.invoices.exportInvoiceNumberLabel(),
        buyerReference: LLExport.invoices.exportBuyerReferenceLabel(),
        issueDate: LLExport.invoices.issueDate(),
        taxableSupplyDate: LLExport.invoices.taxableSupplyDate(),
        dueDate: LLExport.invoices.dueDate(),
        client: LLExport.timeTracking.client(),
        supplier: LLExport.invoices.exportSupplier(),
        buyer: LLExport.invoices.exportBuyer(),
        companyId: LLExport.settings.companyId(),
        vatNumber: LLExport.settings.vatNumber(),
        vat: LLExport.invoices.exportVat(),
        vatPercent: LLExport.invoices.exportVatPercent(),
        taxBase: LLExport.invoices.exportTaxBase(),
        reference: LLExport.invoices.exportReference(),
        account: LLExport.invoices.exportAccount(),
        iban: LLExport.invoices.exportIban(),
        swift: LLExport.invoices.exportSwift(),
        itemDescription: LLExport.invoices.itemDescription(),
        quantity: LLExport.invoices.quantity(),
        unit: LLExport.invoices.exportUnit(),
        unitPrice: LLExport.invoices.unitPrice(),
        subtotal: LLExport.invoices.subtotal(),
        withoutVat: LLExport.invoices.exportWithoutVat(),
        vatAmount: LLExport.invoices.exportVatAmount(),
        withVat: LLExport.invoices.exportWithVat(),
        lineTotal: LLExport.invoices.lineTotal(),
        total: LLExport.invoices.total(),
      },
      items: items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ? getPriceListUnitLabel(LLExport, item.unit) : undefined,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        vatRate: item.vatRate,
      })),
      seller: {
        name: seller.companyName,
        address: seller.address,
        street2: seller.street2,
        city: seller.city,
        postalCode: seller.postalCode,
        country: seller.country,
        companyId: seller.companyId,
        vatNumber: seller.vatNumber,
        registrationNote: seller.registrationNote,
        email: seller.email,
      },
      buyer: {
        name: buyer.name,
        address: buyer.address,
        street2: buyer.street2,
        city: buyer.city,
        postalCode: buyer.postalCode,
        country: buyer.country,
        companyId: buyer.companyId,
        vatNumber: buyer.vatNumber,
        email: buyer.email,
        phone: buyer.phone,
      },
    });
  };

  const getInvoiceExportFileBaseName = () => {
    if (!invoice) {
      throw new Error(LLExport.invoices.exportError());
    }
    const safeNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, '-');
    return `invoice-${safeNumber}`;
  };

  const buildInvoicePdfFile = async (): Promise<InvoicePdfExportResult> => {
    const html = await buildInvoiceHtmlDocument();
    return printHtmlToPdfCacheFile({
      html,
      fileName: `${getInvoiceExportFileBaseName()}.pdf`,
      errorMessage: LLExport.invoices.exportError(),
    });
  };

  const buildInvoiceHtmlFile = async (): Promise<InvoiceHtmlExportResult> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystemLegacy = require('expo-file-system/legacy');

    const cacheDirectory: string | undefined = FileSystemLegacy.cacheDirectory;
    if (!cacheDirectory) {
      throw new Error(LLExport.invoices.exportError());
    }

    const html = await buildInvoiceHtmlDocument();
    const fileName = `${getInvoiceExportFileBaseName()}.html`;
    const targetUri = `${cacheDirectory}${fileName}`;
    await FileSystemLegacy.writeAsStringAsync(targetUri, html, {
      encoding: FileSystemLegacy.EncodingType?.UTF8 ?? 'utf8',
    });

    return { fileName, uri: targetUri };
  };

  const exportInvoicePdf = async (prebuiltPdfFile?: InvoicePdfExportResult) => {
    if (!invoice) return;
    if (!prebuiltPdfFile && !(await confirmPaymentQrExport())) return;

    try {
      setExportingTarget('pdf');
      await rememberLastExportAction('pdf');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');
      const pdfFile = prebuiltPdfFile ?? (await buildInvoicePdfFile());
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(LLExport.common.error(), LLExport.invoices.shareUnavailable());
        return;
      }

      // iOS share sheets can keep the promise unresolved longer than the UI should stay blocked.
      setExportingTarget(null);
      await Sharing.shareAsync(pdfFile.uri, {
        mimeType: 'application/pdf',
        dialogTitle: LLExport.invoices.shareInvoice(),
      });
      completeSuccessfulExport(invoice.id);
    } catch (error) {
      const message = getErrorMessage(error, LLExport.invoices.exportError());
      Alert.alert(LLExport.common.error(), message);
    } finally {
      setExportingTarget(null);
    }
  };

  const handleExportPdf = async () => {
    await exportInvoicePdf();
  };

  const showOpenPdfFallback = (pdfFile: InvoicePdfExportResult) => {
    const fallbackOptions = [
      { text: LL.common.cancel(), style: 'cancel' as const },
      ...(isPdfSaveEnabled
        ? [
            {
              text: LL.invoices.savePdf(),
              onPress: () => {
                void saveInvoicePdf(pdfFile);
              },
            },
          ]
        : []),
      {
        text: LL.invoices.exportPdf(),
        onPress: () => {
          void exportInvoicePdf(pdfFile);
        },
      },
    ];

    Alert.alert(
      LLExport.invoices.openPdfUnavailableTitle(),
      LLExport.invoices.openPdfUnavailableMessage(),
      fallbackOptions,
    );
  };

  const handleOpenPdf = async () => {
    if (!invoice) return;
    if (!(await confirmPaymentQrExport())) return;

    let pdfFile: InvoicePdfExportResult | null = null;
    try {
      setExportingTarget('open_pdf');
      await rememberLastExportAction('open_pdf');
      pdfFile = await buildInvoicePdfFile();
      await openLocalFile(pdfFile.uri);
      completeSuccessfulExport(invoice.id);
    } catch (error) {
      if (pdfFile) {
        showOpenPdfFallback(pdfFile);
      } else {
        const message = getErrorMessage(error, LLExport.invoices.openPdfError());
        Alert.alert(LLExport.common.error(), message);
      }
    } finally {
      setExportingTarget(null);
    }
  };

  const handleExportHtml = async () => {
    if (!invoice || !isInvoiceHtmlExportEnabled) return;

    try {
      setExportingTarget('html');
      await rememberLastExportAction('html');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');
      const htmlFile = await buildInvoiceHtmlFile();
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(LLExport.common.error(), LLExport.invoices.shareUnavailable());
        return;
      }

      // Release the export UI before handing control to the system share sheet.
      setExportingTarget(null);
      await Sharing.shareAsync(htmlFile.uri, {
        mimeType: 'text/html',
        dialogTitle: LLExport.invoices.shareInvoice(),
      });
      completeSuccessfulExport(invoice.id);
    } catch (error) {
      const message = getErrorMessage(error, LLExport.invoices.exportError());
      Alert.alert(LLExport.common.error(), message);
    } finally {
      setExportingTarget(null);
    }
  };

  const saveInvoicePdf = async (prebuiltPdfFile?: InvoicePdfExportResult) => {
    if (!invoice) return;
    if (!prebuiltPdfFile && !(await confirmPaymentQrExport())) return;

    try {
      setExportingTarget('save_pdf');
      await rememberLastExportAction('save_pdf');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      const initialPdfFile = prebuiltPdfFile ?? (isIos ? await buildInvoicePdfFile() : null);
      const pickedDirectory = await FileSystem.Directory.pickDirectoryAsync();
      if (isIos) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const pdfFile = initialPdfFile ?? (await buildInvoicePdfFile());
      const sourceFile = new FileSystem.File(pdfFile.uri);
      const existingEntries = pickedDirectory.list();
      const existingEntry = existingEntries.find(
        (entry: InstanceType<typeof FileSystem.File> | InstanceType<typeof FileSystem.Directory>) =>
          entry.name === pdfFile.fileName,
      );

      let targetFileName = pdfFile.fileName;
      if (existingEntry) {
        if (existingEntry instanceof FileSystem.Directory) {
          throw new Error(LLExport.invoices.savePdfNameConflictFolder());
        }

        const existingNames = new Set(existingEntries.map((entry) => entry.name));
        const copyFileName = buildCopyFileName(pdfFile.fileName, existingNames);
        const selectedFileName = await new Promise<string | null>((resolve) => {
          Alert.alert(
            LLExport.invoices.savePdfExistsTitle(),
            LLExport.invoices.savePdfExistsMessage({ fileName: pdfFile.fileName }),
            [
              {
                text: LL.common.cancel(),
                style: 'cancel',
                onPress: () => resolve(null),
              },
              {
                text: LLExport.invoices.savePdfSaveCopy(),
                onPress: () => resolve(copyFileName),
              },
              {
                text: LLExport.invoices.savePdfReplace(),
                style: 'destructive',
                onPress: () => resolve(pdfFile.fileName),
              },
            ],
            {
              cancelable: true,
              onDismiss: () => resolve(null),
            },
          );
        });

        if (!selectedFileName) {
          return;
        }

        targetFileName = selectedFileName;

        if (targetFileName === pdfFile.fileName) {
          existingEntry.delete();
        }
      }

      const targetFile = pickedDirectory.createFile(targetFileName, 'application/pdf');
      targetFile.write(await sourceFile.bytes());

      Alert.alert(
        LLExport.common.success(),
        LLExport.invoices.savePdfSuccess({ fileName: targetFileName }),
      );
      completeSuccessfulExport(invoice.id);
    } catch (error) {
      const rawMessage = getRawErrorMessage(error);
      if (rawMessage && /cancel(?:ed|led)/i.test(rawMessage)) {
        return;
      }
      Alert.alert(
        LLExport.common.error(),
        getErrorMessage(error, LLExport.invoices.savePdfError()),
      );
    } finally {
      setExportingTarget(null);
    }
  };

  const handleSavePdf = async () => {
    await saveInvoicePdf();
  };

  const getXmlExportFormatLabel = (format: StructuredExportFormat): string => {
    if (format === 'none') return LL.settings.invoiceDefaultExportFormatNone();
    if (format === 'isdoc') return LL.invoices.exportIsdoc();
    if (format === 'peppol') return LL.invoices.exportPeppol();
    return LL.invoices.exportXrechnung();
  };

  const showStructuredExportIssuesWarning = (
    format: InvoiceXmlFormat,
    issues: StructuredInvoiceExportIssue[],
  ): Promise<StructuredExportWarningDecision> => {
    const formatLabel = getXmlExportFormatLabel(format);
    const fixTarget = getFirstStructuredExportFixTarget(issues);
    const issueLines = issues.map(
      (issue) => `- ${formatStructuredExportIssue(LL, formatLabel, issue)}`,
    );

    return new Promise((resolve) => {
      const buttons: AlertButton[] = [
        {
          text: LL.common.cancel(),
          style: 'cancel',
          onPress: () => resolve('cancel'),
        },
        {
          text: LL.invoices.structuredExportWarningContinue(),
          onPress: () => resolve('continue'),
        },
      ];

      if (fixTarget) {
        buttons.push({
          text: LL.invoices.structuredExportWarningFix(),
          onPress: () => resolve('fix'),
        });
      }

      Alert.alert(
        LL.invoices.structuredExportWarningTitle(),
        `${LL.invoices.structuredExportWarningIntro({ format: formatLabel })}\n\n${issueLines.join(
          '\n',
        )}`,
        buttons,
        {
          cancelable: true,
          onDismiss: () => resolve('cancel'),
        },
      );
    });
  };

  const handleExportXml = async (format: InvoiceXmlFormat) => {
    if (!invoice) return;
    try {
      setExportingTarget('xml');
      await rememberLastExportAction(`structured:${format}`);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystemLegacy = require('expo-file-system/legacy');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');

      const cacheDirectory: string | undefined = FileSystemLegacy.cacheDirectory;
      if (!cacheDirectory) {
        Alert.alert(LLExport.common.error(), LLExport.invoices.exportError());
        return;
      }

      const issues = getStructuredInvoiceExportIssues(format, {
        invoice,
        items,
        client,
        seller,
        buyer,
      });
      if (issues.length > 0) {
        const decision = await showStructuredExportIssuesWarning(format, issues);
        if (decision === 'fix') {
          const target = getFirstStructuredExportFixTarget(issues);
          if (target) {
            openStructuredExportFixTarget(target);
          }
          return;
        }
        if (decision !== 'continue') {
          return;
        }
      }

      const xml = buildInvoiceXml(format, { invoice, items, client, seller, buyer });
      const suffix = getInvoiceXmlFileSuffix(format);

      const safeNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, '-');
      const targetUri =
        format === 'isdoc'
          ? `${cacheDirectory}invoice-${safeNumber}.isdoc`
          : `${cacheDirectory}invoice-${safeNumber}-${suffix}.xml`;
      await FileSystemLegacy.writeAsStringAsync(targetUri, xml);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(LLExport.common.error(), LLExport.invoices.shareUnavailable());
        return;
      }

      // Keep the app responsive even if the native share promise resolves late on iOS.
      setExportingTarget(null);
      await Sharing.shareAsync(targetUri, {
        mimeType: 'application/xml',
        dialogTitle: LLExport.invoices.shareInvoice(),
      });
      completeSuccessfulExport(invoice.id);
    } catch (error) {
      const message = getErrorMessage(error, LLExport.invoices.exportError());
      Alert.alert(LLExport.common.error(), message);
    } finally {
      setExportingTarget(null);
    }
  };

  const handleExportCustomXml = async (integrationId: string | null) => {
    if (!invoice) return;

    try {
      setExportingTarget('xml');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystemLegacy = require('expo-file-system/legacy');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');

      const cacheDirectory: string | undefined = FileSystemLegacy.cacheDirectory;
      if (!cacheDirectory) {
        Alert.alert(LLExport.common.error(), LLExport.invoices.exportError());
        return;
      }

      const safeNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, '-');
      const baseXml = buildBaseInvoiceXml({ invoice, items, client, seller, buyer });
      validateBaseExportXml('invoice', baseXml);

      if (integrationId) {
        const integration = invoiceExportIntegrations.find((item) => item.id === integrationId);
        if (!integration) {
          throw new Error('Integration not found');
        }
        await rememberLastExportAction(`integration:${integration.id}`);
        const transformedXml = await transformExportXml('invoice', baseXml, integration.xslt);
        const result = await deliverIntegrationResult(
          integration,
          transformedXml,
          `invoice-${safeNumber}-custom.xml`,
        );
        if (result.outcome === 'copied') {
          Alert.alert(LLExport.common.success(), LLExport.invoices.exportClipboardSuccess());
        } else if (result.outcome === 'sent') {
          Alert.alert(
            LLExport.common.success(),
            LLExport.invoices.exportWebhookSuccess({ status: result.status }),
          );
        }
        completeSuccessfulExport(invoice.id);
        return;
      }

      await rememberLastExportAction('xml_base');
      const targetUri = `${cacheDirectory}invoice-${safeNumber}-invoice.xml`;
      await FileSystemLegacy.writeAsStringAsync(targetUri, baseXml, {
        encoding: FileSystemLegacy.EncodingType?.UTF8 ?? 'utf8',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(LLExport.common.error(), LLExport.invoices.shareUnavailable());
        return;
      }

      // Release the export button before entering the native share sheet flow.
      setExportingTarget(null);
      await Sharing.shareAsync(targetUri, {
        mimeType: 'application/xml',
        dialogTitle: LLExport.invoices.shareInvoice(),
      });
      completeSuccessfulExport(invoice.id);
    } catch (error) {
      const message = isHttpError(error)
        ? LLExport.invoices.exportWebhookError({
            status: error.httpStatus,
          })
        : isNetworkError(error)
          ? LLExport.invoices.exportWebhookNetworkError()
          : getExportIntegrationErrorMessage(
              error,
              LLExport,
              getErrorMessage(error, LLExport.invoices.exportError()),
            );
      Alert.alert(LLExport.common.error(), message);
    } finally {
      setExportingTarget(null);
    }
  };

  const getXmlExportFormatIcon = (format: InvoiceXmlFormat): IconSymbolName => {
    if (format === 'isdoc') return 'doc.richtext.fill';
    if (format === 'peppol') return 'network';
    return 'building.columns.fill';
  };

  const openExportFormatMenu = () => {
    setIsExportFormatSheetVisible(true);
  };

  const queueExportSheetAction = (action: Exclude<PendingExportSheetAction, null>) => {
    setPendingExportSheetAction(action);
    setIsExportFormatSheetVisible(false);
  };

  const recommendedExport = (() => {
    if (!lastExportAction) return null;

    if (lastExportAction === 'pdf') {
      return {
        label: LL.invoices.exportPdf(),
        icon: 'arrow.down.doc.fill' as IconSymbolName,
        onPress: () => void handleExportPdf(),
      };
    }

    if (lastExportAction === 'open_pdf' && isPdfOpenEnabled) {
      return {
        label: LL.invoices.openPdf(),
        icon: 'doc.text.fill' as IconSymbolName,
        onPress: () => void handleOpenPdf(),
      };
    }

    if (lastExportAction === 'html' && isInvoiceHtmlExportEnabled) {
      return {
        label: LL.invoices.exportHtml(),
        icon: 'doc.text' as IconSymbolName,
        onPress: () => void handleExportHtml(),
      };
    }

    if (lastExportAction === 'save_pdf' && isPdfSaveEnabled) {
      return {
        label: LL.invoices.savePdf(),
        icon: 'folder' as IconSymbolName,
        onPress: () => void handleSavePdf(),
      };
    }

    if (lastExportAction === 'xml_base') {
      return {
        label: LLExport.invoices.exportBaseXmlOption(),
        icon: 'doc.richtext' as IconSymbolName,
        onPress: () => void handleExportCustomXml(null),
      };
    }

    if (lastExportAction.startsWith('structured:')) {
      const format = lastExportAction.slice('structured:'.length) as InvoiceXmlFormat;
      if (!['isdoc', 'peppol', 'xrechnung'].includes(format)) return null;
      return {
        label: getXmlExportFormatLabel(format),
        icon: getXmlExportFormatIcon(format),
        onPress: () => void handleExportXml(format),
      };
    }

    if (lastExportAction.startsWith('integration:')) {
      const integrationId = lastExportAction.slice('integration:'.length);
      const integration = invoiceExportIntegrations.find((item) => item.id === integrationId);
      if (!integration) return null;
      return {
        label: integration.name,
        icon: 'doc.richtext' as IconSymbolName,
        onPress: () => void handleExportCustomXml(integration.id),
      };
    }

    return null;
  })();

  const primaryExportAction = recommendedExport
    ? recommendedExport
    : {
        label: LL.invoices.exportAction(),
        icon: 'arrow.down.doc.fill' as IconSymbolName,
        onPress: () => openExportFormatMenu(),
      };
  const statusLabel = invoice ? getInvoiceStatusLabel(invoice, LL) : null;
  const relatedInvoiceLabel = relatedInvoice
    ? invoice?.correctionKind === 'cancellation'
      ? LL.invoices.correctsInvoiceLabel({
          invoiceNumber: relatedInvoice.invoiceNumber,
        })
      : LL.invoices.canceledByInvoiceLabel({
          invoiceNumber: relatedInvoice.invoiceNumber,
        })
    : null;
  const cancellationInfo = invoice
    ? invoice.correctionKind === 'cancellation'
      ? {
          title: isInvoiceVatPayer(invoice)
            ? LL.invoices.exportCancellationTaxDocumentTitle()
            : LL.invoices.statusCancellationDocument(),
          description: LL.invoices.cancellationDocumentInfo(),
          icon: 'doc.fill' as IconSymbolName,
        }
      : invoice.status === 'canceled_by_correction'
        ? {
            title: LL.invoices.statusCanceledByCorrection(),
            description: LL.invoices.canceledByCorrectionInfo(),
            icon: 'xmark.circle.fill' as IconSymbolName,
          }
        : null
    : null;
  const paymentQrType = normalizePaymentQrType(seller.qrType);
  const paymentQrLabels = getPaymentQrLabels();
  const paymentQrRequirement = invoice
    ? getPaymentQrExportRequirement(paymentQrType, seller, {
        invoiceCurrency: invoice.currency,
        totalAmount: invoice.total,
        receiverName: paymentQrLabels.receiverFallback,
        invoiceReference: paymentQrLabels.invoiceReference,
      })
    : null;
  const paymentQrPayload =
    invoice && paymentQrType !== 'none' && !paymentQrRequirement
      ? buildPaymentQrPayload(paymentQrType, invoice, seller, paymentQrLabels)
      : null;
  const paymentQrTypeLabel = getPaymentQrTypeLabel(LL, paymentQrType);
  const paymentQrUnavailableReason =
    paymentQrType !== 'none'
      ? paymentQrRequirement
        ? formatPaymentQrRequirement(LL, paymentQrRequirement)
        : invoice && !paymentQrPayload
          ? LL.invoices.paymentQrBuildFailed()
          : null
      : null;
  const paymentQrFixLabel = paymentQrRequirement
    ? isPaymentQrProfileRequirement(paymentQrRequirement)
      ? LL.settings.invoiceQrProfileCta()
      : LL.settings.invoiceQrEditInvoice()
    : null;

  const handlePaymentQrFix = () => {
    if (!paymentQrRequirement) return;
    setIsPaymentQrModalVisible(false);
    if (isPaymentQrProfileRequirement(paymentQrRequirement)) {
      router.push('/settings/business-profile');
      return;
    }
    handleEditInvoice();
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: invoice?.invoiceNumber || LL.invoices.title(),
          headerRight: () =>
            invoice &&
            ((invoiceDeletionEnabled && canDeleteInvoice(invoice)) ||
              canCancelIssuedInvoice(invoice) ||
              canCopyInvoice(invoice) ||
              canEditIssuedInvoice(invoice)) ? (
              <View style={styles.headerActionGroup}>
                {canCancelIssuedInvoice(invoice) ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.headerActionButton,
                      { opacity: exportingTarget !== null ? 0.45 : pressed ? 0.65 : 1 },
                    ]}
                    onPress={handleOpenCancelFlow}
                    disabled={exportingTarget !== null}
                    accessibilityRole="button"
                    accessibilityLabel={LL.invoices.cancelDocument()}
                    hitSlop={8}
                  >
                    <IconSymbol name="xmark.circle.fill" size={18} color={palette.destructive} />
                  </Pressable>
                ) : null}
                {invoiceDeletionEnabled && canDeleteInvoice(invoice) ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.headerActionButton,
                      { opacity: exportingTarget !== null ? 0.45 : pressed ? 0.65 : 1 },
                    ]}
                    onPress={handleOpenDeleteFlow}
                    disabled={exportingTarget !== null}
                    accessibilityRole="button"
                    accessibilityLabel={LL.invoices.deleteInvoice()}
                    hitSlop={8}
                  >
                    <IconSymbol name="trash.fill" size={18} color={palette.destructive} />
                  </Pressable>
                ) : null}
                {canCopyInvoice(invoice) ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.headerActionButton,
                      { opacity: exportingTarget !== null ? 0.45 : pressed ? 0.65 : 1 },
                    ]}
                    onPress={() => void handleCopyInvoice()}
                    disabled={exportingTarget !== null}
                    accessibilityRole="button"
                    accessibilityLabel={LL.invoices.copyInvoice()}
                    hitSlop={8}
                  >
                    <IconSymbol name="doc.on.doc" size={18} color={palette.tint} />
                  </Pressable>
                ) : null}
                {canEditIssuedInvoice(invoice) ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.headerActionButton,
                      { opacity: exportingTarget !== null ? 0.45 : pressed ? 0.65 : 1 },
                    ]}
                    onPress={handleEditInvoice}
                    disabled={exportingTarget !== null}
                    accessibilityRole="button"
                    accessibilityLabel={LL.common.edit()}
                    hitSlop={8}
                  >
                    <IconSymbol name="pencil" size={18} color={palette.tint} />
                  </Pressable>
                ) : null}
              </View>
            ) : null,
        }}
      />

      {invoice ? (
        <>
          <View style={styles.summaryCard}>
            <ThemedText type="defaultSemiBold">{invoice.invoiceNumber}</ThemedText>
            <ThemedText type="defaultSemiBold">{buyer.name || client?.name || '-'}</ThemedText>
            {statusLabel ? (
              <ThemedText
                style={[styles.metaText, styles.statusText, { color: palette.destructive }]}
              >
                {statusLabel}
              </ThemedText>
            ) : null}
            {invoice.buyerReference ? (
              <ThemedText style={styles.metaText}>
                {LL.invoices.buyerReference()}: {invoice.buyerReference}
              </ThemedText>
            ) : null}
            <ThemedText style={styles.metaText}>
              {LL.invoices.issueDate()}: {new Date(invoice.issuedAt).toLocaleDateString(intlLocale)}
            </ThemedText>
            <ThemedText style={styles.metaText}>
              {LL.invoices.paymentMethod()}: {getPaymentMethodLabel(LL, invoice.paymentMethod)}
            </ThemedText>
            {invoice.taxableAt ? (
              <ThemedText style={styles.metaText}>
                {LL.invoices.taxableSupplyDateShort()}:{' '}
                {new Date(invoice.taxableAt).toLocaleDateString(intlLocale)}
              </ThemedText>
            ) : null}
            {invoice.dueAt ? (
              <ThemedText style={styles.metaText}>
                {LL.invoices.dueDate()}: {new Date(invoice.dueAt).toLocaleDateString(intlLocale)}
              </ThemedText>
            ) : null}
            {invoice.cancellationReason ? (
              <ThemedText style={styles.metaText}>
                {LL.invoices.cancelReasonLabel()}: {invoice.cancellationReason}
              </ThemedText>
            ) : null}
            {relatedInvoice ? (
              <Pressable
                onPress={() => router.push(`/invoices/${relatedInvoice.id}`)}
                accessibilityRole="button"
                accessibilityLabel={relatedInvoiceLabel || undefined}
              >
                <ThemedText
                  style={[styles.metaText, styles.relatedInvoiceText, { color: palette.tint }]}
                >
                  {relatedInvoiceLabel}
                </ThemedText>
              </Pressable>
            ) : null}
            <ThemedText style={styles.totalText}>
              {formatPrice(invoice.total, normalizeCurrencyCode(invoice.currency), intlLocale)}
            </ThemedText>
          </View>
          {cancellationInfo ? (
            <View
              style={[
                styles.cancellationInfoCard,
                {
                  backgroundColor: withOpacity(palette.destructive, 0.08),
                  borderColor: withOpacity(palette.destructive, 0.22),
                },
              ]}
            >
              <View style={styles.cancellationInfoHeader}>
                <IconSymbol name={cancellationInfo.icon} size={16} color={palette.destructive} />
                <ThemedText style={[styles.cancellationInfoTitle, { color: palette.destructive }]}>
                  {cancellationInfo.title}
                </ThemedText>
              </View>
              <ThemedText style={styles.cancellationInfoDescription}>
                {cancellationInfo.description}
              </ThemedText>
              {relatedInvoice ? (
                <Pressable
                  onPress={() => router.push(`/invoices/${relatedInvoice.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={relatedInvoiceLabel || undefined}
                >
                  <ThemedText style={[styles.cancellationInfoLink, { color: palette.tint }]}>
                    {relatedInvoiceLabel}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.exportRow}>
            <View
              style={[
                styles.exportSplit,
                {
                  backgroundColor: palette.cardBackground,
                  borderColor: palette.border,
                  opacity: exportingTarget !== null ? 0.72 : 1,
                },
              ]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.exportSplitPrimary,
                  { opacity: pressed ? 0.72 : 1 },
                ]}
                onPress={primaryExportAction.onPress}
                disabled={exportingTarget !== null}
                accessibilityRole="button"
                accessibilityLabel={primaryExportAction.label}
              >
                <View style={styles.exportFormatContent}>
                  <IconSymbol
                    name={primaryExportAction.icon}
                    size={15}
                    color={palette.timeHighlight}
                  />
                  <ThemedText
                    style={[styles.exportButtonSecondaryText, { color: palette.timeHighlight }]}
                    numberOfLines={1}
                  >
                    {exportingTarget !== null ? LL.common.loading() : primaryExportAction.label}
                  </ThemedText>
                </View>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.exportSplitArrow,
                  { borderLeftColor: palette.border, opacity: pressed ? 0.72 : 1 },
                ]}
                onPress={openExportFormatMenu}
                disabled={exportingTarget !== null}
                accessibilityRole="button"
                accessibilityLabel={LL.invoices.exportFormatSelect()}
              >
                <IconSymbol name="chevron.down" size={11} color={palette.timeHighlight} />
              </Pressable>
            </View>
          </View>
          {paymentQrType !== 'none' ? (
            <Pressable
              style={({ pressed }) => [
                styles.paymentQrCta,
                {
                  backgroundColor: palette.cardBackground,
                  borderColor: palette.border,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
              onPress={() => setIsPaymentQrModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={LL.invoices.paymentQrAction()}
            >
              <View
                style={[
                  styles.paymentQrCtaIcon,
                  { backgroundColor: withOpacity(palette.timeHighlight, 0.12) },
                ]}
              >
                <IconSymbol name="qrcode.viewfinder" size={18} color={palette.timeHighlight} />
              </View>
              <View style={styles.paymentQrCtaText}>
                <ThemedText style={styles.paymentQrCtaTitle} numberOfLines={1}>
                  {LL.invoices.paymentQrAction()}
                </ThemedText>
                <ThemedText
                  style={[styles.paymentQrCtaMeta, { color: palette.textSecondary }]}
                  numberOfLines={1}
                >
                  {paymentQrTypeLabel} -{' '}
                  {formatPrice(invoice.total, normalizeCurrencyCode(invoice.currency), intlLocale)}
                </ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={17} color={palette.textMuted} />
            </Pressable>
          ) : null}
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={listContentStyle}
            renderItem={({ item, index }) => {
              const isLast = index === items.length - 1;
              return (
                <View
                  style={[
                    styles.row,
                    { backgroundColor: palette.cardBackground },
                    index === 0 && styles.rowFirst,
                    isLast && styles.rowLast,
                  ]}
                >
                  <View style={styles.rowMain}>
                    <ThemedText type="defaultSemiBold">{item.description}</ThemedText>
                    <ThemedText style={styles.metaText}>
                      {item.quantity} × {item.unitPrice.toFixed(2)}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.lineTotal, { color: palette.timeHighlight }]}>
                    {item.totalPrice.toFixed(2)}
                  </ThemedText>
                  {!isLast && (
                    <View style={[styles.divider, { backgroundColor: palette.borderStrong }]} />
                  )}
                </View>
              );
            }}
          />
          <OptionSheetModal
            visible={isExportFormatSheetVisible}
            title={LL.invoices.exportFormatSelect()}
            cancelLabel={LL.common.cancel()}
            onClose={() => setIsExportFormatSheetVisible(false)}
            options={(() => {
              const allOptions: InvoiceXmlFormat[] = ['isdoc', 'peppol', 'xrechnung'];
              const options =
                structuredExportFormat === 'none'
                  ? allOptions
                  : allOptions.filter((option) => option !== structuredExportFormat);
              const finalOptions = options.length > 0 ? options : allOptions;
              const pdfOption = {
                key: 'pdf',
                label: LL.invoices.exportPdf(),
                onPress: () => {
                  queueExportSheetAction('pdf');
                },
              };
              const htmlOption = isInvoiceHtmlExportEnabled
                ? [
                    {
                      key: 'html',
                      label: LL.invoices.exportHtml(),
                      onPress: () => {
                        queueExportSheetAction('html');
                      },
                    },
                  ]
                : [];
              const openPdfOption = isPdfOpenEnabled
                ? [
                    {
                      key: 'open-pdf',
                      label: LL.invoices.openPdf(),
                      onPress: () => {
                        queueExportSheetAction('open_pdf');
                      },
                    },
                  ]
                : [];
              const savePdfOption = isPdfSaveEnabled
                ? [
                    {
                      key: 'save-pdf',
                      label: LL.invoices.savePdf(),
                      onPress: () => {
                        queueExportSheetAction('save_pdf');
                      },
                    },
                  ]
                : [];
              const structuredOptions = finalOptions.map((option) => ({
                key: option,
                label: getXmlExportFormatLabel(option),
                onPress: () => {
                  setStructuredExportFormat(option);
                  queueExportSheetAction(`structured:${option}`);
                },
              }));
              const customOptions =
                exportIntegrationsEnabled && invoiceExportIntegrations.length > 0
                  ? [
                      {
                        key: 'custom-base',
                        label: LLExport.invoices.exportBaseXmlOption(),
                        onPress: () => {
                          queueExportSheetAction('xml_base');
                        },
                      },
                      ...invoiceExportIntegrations.map((integration) => ({
                        key: `custom-${integration.id}`,
                        label: `${LLExport.invoices.exportCustomXml()}: ${integration.name}`,
                        onPress: () => {
                          queueExportSheetAction(`integration:${integration.id}`);
                        },
                      })),
                    ]
                  : [];
              return [
                pdfOption,
                ...htmlOption,
                ...openPdfOption,
                ...savePdfOption,
                ...structuredOptions,
                ...customOptions,
              ];
            })()}
          />
          <PaymentQrModal
            visible={isPaymentQrModalVisible}
            payload={paymentQrPayload}
            qrTypeLabel={paymentQrTypeLabel}
            amountLabel={formatPrice(
              invoice.total,
              normalizeCurrencyCode(invoice.currency),
              intlLocale,
            )}
            receiverName={seller.companyName || paymentQrLabels.receiverFallback}
            reference={paymentQrLabels.invoiceReference}
            unavailableReason={paymentQrUnavailableReason}
            fixLabel={paymentQrFixLabel}
            onClose={() => setIsPaymentQrModalVisible(false)}
            onFix={handlePaymentQrFix}
          />
        </>
      ) : (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={styles.metaText}>{LL.common.loading()}</ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  summaryCard: { borderRadius: 10, padding: 12, gap: 2, marginBottom: 10 },
  metaText: { fontSize: 12, opacity: 0.7 },
  statusText: { marginTop: 2, fontWeight: '700', opacity: 1 },
  relatedInvoiceText: { marginTop: 2, fontWeight: '600', opacity: 1 },
  totalText: { marginTop: 4, fontSize: 15, fontWeight: '700' },
  cancellationInfoCard: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  cancellationInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancellationInfoTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  cancellationInfoDescription: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.82,
  },
  cancellationInfoLink: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  exportButtonSecondaryText: { fontSize: 13, fontWeight: '600', flex: 1, minWidth: 0 },
  exportSplit: {
    borderRadius: 12,
    flex: 1,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderWidth: 1,
  },
  exportSplitPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
  },
  exportFormatContent: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exportSplitArrow: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  headerActionButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -6,
  },
  exportRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'stretch' },
  paymentQrCta: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentQrCtaIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentQrCtaText: {
    flex: 1,
    minWidth: 0,
  },
  paymentQrCtaTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  paymentQrCtaMeta: {
    marginTop: 1,
    fontSize: 12,
  },
  listContent: { paddingBottom: 24 },
  row: { paddingHorizontal: 14, paddingVertical: 12, position: 'relative' },
  rowFirst: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  rowLast: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  rowMain: { paddingRight: 90, gap: 2 },
  lineTotal: {
    position: 'absolute',
    right: 14,
    top: 14,
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
