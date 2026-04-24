import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getPriceListUnitLabel } from '@/components/price-list/unit-options';
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
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  getErrorMessage,
  getExportIntegrationErrorMessage,
  getRawErrorMessage,
  isHttpError,
  isNetworkError,
} from '@/utils/error-utils';
import { openLocalFile } from '@/utils/open-local-file';
import { buildCopyFileName } from '@/utils/file-name-utils';
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
import { buildPdfLogoHtml } from '@/utils/pdf-logo';
import { formatPrice } from '@/utils/price-utils';
import { isIos } from '@/utils/platform';
import { Q } from '@nozbe/watermelondb';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Pressable, View } from 'react-native';

const LAST_INVOICE_EXPORT_ACTION_KEY = 'invoice_export.last_action';

type LastInvoiceExportAction =
  | 'pdf'
  | 'open_pdf'
  | 'html'
  | 'save_pdf'
  | 'xml_base'
  | `structured:${InvoiceXmlFormat}`
  | `integration:${string}`;

type PaymentQrType = 'none' | 'spayd' | 'epc' | 'swiss';
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
type PaymentQrLabels = {
  receiverFallback: string;
  invoiceReference: string;
};

type InvoicePdfExportResult = {
  fileName: string;
  uri: string;
};

type InvoiceHtmlExportResult = {
  fileName: string;
  uri: string;
};

type InvoiceCopyTimesheetMode = 'convert' | 'omit';

type HeaderDraft = {
  clientId: string;
  buyerMode?: InvoiceDraftBuyerMode;
  buyerSnapshot?: BuyerSnapshot;
  invoiceNumber: string;
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

function toLocalISODate(value: number): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function sanitizeText(value?: string): string {
  return (value || '').replaceAll('*', '').replaceAll('\n', ' ').trim();
}

function normalizeIban(iban?: string): string {
  return (iban || '').replace(/\s+/g, '').toUpperCase();
}

function mod97(value: string): number {
  let remainder = 0;
  for (const char of value) {
    const digit = Number(char);
    if (!Number.isFinite(digit)) continue;
    remainder = (remainder * 10 + digit) % 97;
  }
  return remainder;
}

function toIbanNumeric(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .split('')
    .map((char) => String(char.charCodeAt(0) - 55))
    .join('');
}

function convertCzechBankAccountToIban(bankAccount?: string): string | null {
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
  const checkInput = `${bban}${toIbanNumeric('CZ')}00`;
  const checkDigits = String(98 - mod97(checkInput)).padStart(2, '0');
  return `CZ${checkDigits}${bban}`;
}

function resolveSpaydAccount(seller: SellerSnapshot): string | null {
  const iban = normalizeIban(seller.iban);
  if (/^[A-Z]{2}\d{13,32}$/.test(iban)) {
    return iban;
  }

  const converted = convertCzechBankAccountToIban(seller.bankAccount);
  if (converted) return converted;

  const normalizedBankAccount = normalizeIban(seller.bankAccount);
  if (/^[A-Z]{2}\d{13,32}$/.test(normalizedBankAccount)) {
    return normalizedBankAccount;
  }
  return null;
}

function normalizeAmount(value: number): string {
  return value.toFixed(2);
}

function buildSpaydPayload(
  invoice: InvoiceModel,
  seller: SellerSnapshot,
  labels: PaymentQrLabels,
): string | null {
  const account = resolveSpaydAccount(seller);
  if (!account) return null;
  const amount = normalizeAmount(invoice.total);
  const currency = normalizeCurrencyCode(invoice.currency).toUpperCase();
  const variableSymbol = invoice.invoiceNumber.replace(/\D/g, '').slice(0, 10);
  const parts = [
    'SPD*1.0',
    `ACC:${account}`,
    `AM:${amount}`,
    `CC:${currency}`,
    `MSG:${sanitizeText(labels.invoiceReference)}`,
  ];
  if (variableSymbol) {
    parts.push(`X-VS:${variableSymbol}`);
  }
  return parts.join('*');
}

function buildEpcPayload(
  invoice: InvoiceModel,
  seller: SellerSnapshot,
  labels: PaymentQrLabels,
): string | null {
  const iban = normalizeIban(seller.iban);
  if (!iban) return null;
  if (normalizeCurrencyCode(invoice.currency).toUpperCase() !== 'EUR') return null;

  const bic = (seller.swift || '').replace(/\s+/g, '').toUpperCase();
  const name = sanitizeText(seller.companyName || labels.receiverFallback).slice(0, 70);
  const amount = normalizeAmount(invoice.total);
  const reference = sanitizeText(labels.invoiceReference).slice(0, 140);

  return ['BCD', '002', '1', 'SCT', bic, name, iban, `EUR${amount}`, '', '', reference].join('\n');
}

function buildSwissPayload(
  invoice: InvoiceModel,
  seller: SellerSnapshot,
  labels: PaymentQrLabels,
): string | null {
  const iban = normalizeIban(seller.iban);
  if (!iban || (!iban.startsWith('CH') && !iban.startsWith('LI'))) return null;
  const currency = normalizeCurrencyCode(invoice.currency).toUpperCase();
  if (currency !== 'CHF' && currency !== 'EUR') return null;

  const name = sanitizeText(seller.companyName);
  const address = sanitizeText(seller.address);
  const city = sanitizeText(seller.city);
  const postal = sanitizeText(seller.postalCode);
  const country = sanitizeText(seller.country || 'CH').toUpperCase();
  if (!name || !address || !city || !postal || !country) return null;

  const amount = normalizeAmount(invoice.total);
  const message = sanitizeText(labels.invoiceReference).slice(0, 140);

  return [
    'SPC',
    '0200',
    '1',
    iban,
    'K',
    name,
    address,
    `${postal} ${city}`.trim(),
    '',
    '',
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
  ].join('\n');
}

function buildPaymentQrPayload(
  qrType: PaymentQrType,
  invoice: InvoiceModel,
  seller: SellerSnapshot,
  labels: PaymentQrLabels,
): string | null {
  if (qrType === 'spayd') return buildSpaydPayload(invoice, seller, labels);
  if (qrType === 'epc') return buildEpcPayload(invoice, seller, labels);
  if (qrType === 'swiss') return buildSwissPayload(invoice, seller, labels);
  return null;
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
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
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
      .observe()
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
    if (pendingExportSheetAction === 'pdf') {
      setPendingExportSheetAction(null);
      void handleExportPdf();
      return;
    }
    if (pendingExportSheetAction === 'open_pdf') {
      setPendingExportSheetAction(null);
      if (isPdfOpenEnabled) {
        void handleOpenPdf();
      }
      return;
    }
    if (pendingExportSheetAction === 'html') {
      setPendingExportSheetAction(null);
      if (isInvoiceHtmlExportEnabled) {
        void handleExportHtml();
      }
      return;
    }
    if (pendingExportSheetAction === 'save_pdf') {
      setPendingExportSheetAction(null);
      if (isPdfSaveEnabled) {
        void handleSavePdf();
      }
      return;
    }
    if (pendingExportSheetAction === 'xml_base') {
      setPendingExportSheetAction(null);
      void handleExportCustomXml(null);
      return;
    }
    if (pendingExportSheetAction.startsWith('structured:')) {
      const format = pendingExportSheetAction.slice('structured:'.length) as InvoiceXmlFormat;
      setPendingExportSheetAction(null);
      void handleExportXml(format);
      return;
    }
    if (pendingExportSheetAction.startsWith('integration:')) {
      const integrationId = pendingExportSheetAction.slice('integration:'.length);
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
    const qrType = (seller.qrType || 'none') as PaymentQrType;
    const paymentQrLabels: PaymentQrLabels = {
      receiverFallback: LLExport.invoices.exportReceiverFallback(),
      invoiceReference: LLExport.invoices.exportInvoiceNote({
        invoiceNumber: invoice.invoiceNumber,
      }),
    };
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystemLegacy = require('expo-file-system/legacy');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Print = require('expo-print');

    const cacheDirectory: string | undefined = FileSystemLegacy.cacheDirectory;
    if (!cacheDirectory) {
      throw new Error(LLExport.invoices.exportError());
    }

    const html = await buildInvoiceHtmlDocument();

    const pdfResult = await Print.printToFileAsync({ html });
    const fileName = `${getInvoiceExportFileBaseName()}.pdf`;
    const targetUri = `${cacheDirectory}${fileName}`;
    await FileSystemLegacy.deleteAsync(targetUri, { idempotent: true });
    await FileSystemLegacy.copyAsync({
      from: pdfResult.uri,
      to: targetUri,
    });

    return { fileName, uri: targetUri };
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
        targetFileName = await new Promise<string | null>((resolve) => {
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

        if (!targetFileName) {
          return;
        }

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

      const xml = buildInvoiceXml(format, { invoice, items, client, seller, buyer });
      const suffix = getInvoiceXmlFileSuffix(format);

      const safeNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, '-');
      const targetUri = `${cacheDirectory}invoice-${safeNumber}-${suffix}.xml`;
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

  const getXmlExportFormatLabel = (format: StructuredExportFormat): string => {
    if (format === 'none') return LL.settings.invoiceDefaultExportFormatNone();
    if (format === 'isdoc') return LL.invoices.exportIsdoc();
    if (format === 'peppol') return LL.invoices.exportPeppol();
    return LL.invoices.exportXrechnung();
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
                    { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground },
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
