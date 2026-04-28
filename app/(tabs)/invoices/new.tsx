import { CompanyRegistryPickerModal } from '@/components/clients/company-registry-picker-modal';
import {
  loadRegistrySettingsForLookup,
  requestMissingRegistryConfiguration,
} from '@/components/clients/company-registry-lookup';
import { NoClientsRequiredNotice } from '@/components/clients/no-clients-required-notice';
import { getPriceListUnitLabel } from '@/components/price-list/unit-options';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { CrossPlatformDatePicker } from '@/components/ui/cross-platform-date-picker';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OptionSheetModal } from '@/components/ui/option-sheet-modal';
import { SwipeableList } from '@/components/ui/swipeable-list';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Colors } from '@/constants/theme';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useCurrencySettings } from '@/hooks/use-currency-settings';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, InvoiceModel, PriceListItemModel, VatRateModel } from '@/model';
import {
  type CompanyRegistryCompany,
  type CompanyRegistryImportAddress,
  type CompanyRegistryKey,
  CompanyRegistryLookupError,
  getCompanyRegistryService,
  normalizeCompanyRegistryKey,
} from '@/repositories/company-registry';
import { getEffectivePriceDetails } from '@/repositories/client-price-override-repository';
import {
  DraftInvoiceItemInput,
  INVOICE_NUMBER_EXISTS_ERROR,
  INVOICE_TAXABLE_DATE_REQUIRED_ERROR,
  createInvoice,
  getActivePriceListForInvoicing,
  getSuggestedInvoiceNumber,
  getTimesheetCandidates,
  updateIssuedInvoice,
} from '@/repositories/invoice-repository';
import { getSettings } from '@/repositories/settings-repository';
import { getVatRates } from '@/repositories/vat-rate-repository';
import type { BuyerSnapshot, SellerSnapshot } from '@/templates/invoice/xml';
import {
  DEFAULT_CURRENCY_CODE,
  hasMatchingCurrency,
  normalizeCurrencyCode,
} from '@/utils/currency-utils';
import { getErrorMessage } from '@/utils/error-utils';
import { getInvoiceDateValidation } from '@/utils/invoice-date-validation';
import { parseISODate, todayISODate, toLocalISODate } from '@/utils/iso-date';
import {
  type InvoiceBuyerDraft,
  type InvoiceDraftBuyerMode,
  toInvoiceBuyerDraft,
  toInvoiceBuyerSnapshot,
} from '@/utils/invoice-buyer';
import {
  areSellerSnapshotsEqual,
  buildSellerSnapshotFromSettings,
  parseSellerSnapshotJson,
  type SellerSnapshotSettingsSource,
} from '@/utils/invoice-seller-snapshot';
import {
  DEFAULT_INVOICE_DUE_DAYS,
  DEFAULT_INVOICE_PAYMENT_METHOD,
  INVOICE_PAYMENT_METHOD_OPTIONS,
  addDaysToIsoDate,
  normalizeInvoicePaymentMethod,
  resolveInvoiceDueDays,
  resolveInvoicePaymentMethod,
} from '@/utils/invoice-defaults';
import { calculateLineItemTotals, roundCurrency } from '@/utils/money';
import { formatPrice } from '@/utils/price-utils';
import { isIos } from '@/utils/platform';
import { resolveVatRateForDate } from '@/utils/vat-rate-utils';
import { Q } from '@nozbe/watermelondb';
import { useHeaderHeight } from '@react-navigation/elements';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

type HeaderDraft = {
  clientId: string;
  buyerMode?: InvoiceDraftBuyerMode;
  buyerSnapshot?: BuyerSnapshot;
  invoiceNumber: string;
  invoiceNumberManuallyEdited?: boolean;
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

type DraftListItem = DraftInvoiceItemInput & {
  localId: string;
};

type BuyerDraftField = keyof InvoiceBuyerDraft;

type ClientChangeReview = {
  manualCount: number;
  priceListCount: number;
  priceChangedCount: number;
  priceListNeedsReviewCount: number;
  timesheetCount: number;
  priceChangeLines: string[];
  nextItemsKeepingTimesheets: DraftListItem[];
  nextItemsRemovingTimesheets: DraftListItem[];
};

type Palette = (typeof Colors)['light'];

function withLocalIds(items: DraftInvoiceItemInput[], startAt = 1): DraftListItem[] {
  return items.map((item, index) => ({
    ...item,
    localId: `draft-${Date.now()}-${startAt + index}`,
  }));
}

function parseOptionalISODate(value?: string): number | undefined {
  return parseISODate(value) ?? undefined;
}

function getPaymentMethodLabel(LL: ReturnType<typeof useI18nContext>['LL'], value: string): string {
  switch (value) {
    case 'cash':
      return LL.invoices.paymentMethodCash();
    case 'card':
      return LL.invoices.paymentMethodCard();
    case 'card_nfc':
      return LL.invoices.paymentMethodCardNfc();
    case 'bank_transfer':
    default:
      return LL.invoices.paymentMethodBankTransfer();
  }
}

function pickRegistryImportAddress(
  company: CompanyRegistryCompany,
): CompanyRegistryImportAddress | null {
  const importAddresses =
    company.importAddresses || (company.importAddress ? [company.importAddress] : []);
  if (!importAddresses.length) return null;

  return (
    importAddresses.find((address) => address.type === 'billing') ||
    importAddresses.find((address) => !!address.street?.trim()) ||
    null
  );
}

export default function InvoiceDraftScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const currencies = useCurrencySettings();
  const params = useLocalSearchParams<{
    editingInvoiceId?: string;
    headerDraft?: string;
    itemsDraft?: string;
    footerDraft?: string;
    preselectedTimesheetId?: string;
    autoOpenTimesheetImport?: string;
  }>();
  const editingInvoiceId =
    typeof params.editingInvoiceId === 'string' ? params.editingInvoiceId : undefined;
  const isEditingInvoice = !!editingInvoiceId;

  const restoredHeaderDraft = useMemo(() => {
    if (!params.headerDraft || typeof params.headerDraft !== 'string') return null;
    try {
      return JSON.parse(params.headerDraft) as HeaderDraft;
    } catch {
      return null;
    }
  }, [params.headerDraft]);

  const restoredItemsDraft = useMemo<DraftInvoiceItemInput[]>(() => {
    if (!params.itemsDraft || typeof params.itemsDraft !== 'string') return [];
    try {
      return JSON.parse(params.itemsDraft) as DraftInvoiceItemInput[];
    } catch {
      return [];
    }
  }, [params.itemsDraft]);

  const restoredFooterDraft = useMemo(() => {
    if (!params.footerDraft || typeof params.footerDraft !== 'string') return null;
    try {
      return JSON.parse(params.footerDraft) as FooterDraft;
    } catch {
      return null;
    }
  }, [params.footerDraft]);

  const [clients, setClients] = useState<ClientModel[]>([]);
  const [clientId, setClientId] = useState('');
  const [buyerMode, setBuyerMode] = useState<InvoiceDraftBuyerMode>('client');
  const [buyerDraft, setBuyerDraft] = useState<InvoiceBuyerDraft>(() => toInvoiceBuyerDraft());
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isInvoiceNumberManuallyEdited, setIsInvoiceNumberManuallyEdited] =
    useState(isEditingInvoice);
  const [buyerReference, setBuyerReference] = useState('');
  const [issuedDate, setIssuedDate] = useState(todayISODate());
  const [taxableDate, setTaxableDate] = useState(todayISODate());
  const [dueDate, setDueDate] = useState(todayISODate());
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY_CODE);
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_INVOICE_PAYMENT_METHOD);
  const [settingsDefaultPaymentMethod, setSettingsDefaultPaymentMethod] = useState(
    DEFAULT_INVOICE_PAYMENT_METHOD,
  );
  const [settingsDefaultDueDays, setSettingsDefaultDueDays] = useState(DEFAULT_INVOICE_DUE_DAYS);
  const [defaultRegistry, setDefaultRegistry] = useState<CompanyRegistryKey>('none');
  const [headerNote, setHeaderNote] = useState('');
  const [footerNote, setFooterNote] = useState('');
  const [isVatPayer, setIsVatPayer] = useState(false);
  const [vatRates, setVatRates] = useState<VatRateModel[]>([]);
  const [canUseTimesheets, setCanUseTimesheets] = useState(false);
  const [canUsePriceList, setCanUsePriceList] = useState(false);
  const [isReviewingClientChange, setIsReviewingClientChange] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isRegistryPickerVisible, setIsRegistryPickerVisible] = useState(false);
  const [pendingLookupCompanyId, setPendingLookupCompanyId] = useState('');
  const [lookupWizardCompany, setLookupWizardCompany] = useState<CompanyRegistryCompany | null>(
    null,
  );
  const [invoiceNumberExists, setInvoiceNumberExists] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'issued' | 'taxable' | 'due' | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [items, setItems] = useState<DraftListItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshSellerSnapshot, setRefreshSellerSnapshot] = useState(false);
  const [sellerSnapshotSettings, setSellerSnapshotSettings] =
    useState<SellerSnapshotSettingsSource | null>(null);
  const [storedSellerSnapshot, setStoredSellerSnapshot] = useState<SellerSnapshot | null>(null);
  const [isStoredSellerSnapshotLoaded, setIsStoredSellerSnapshotLoaded] =
    useState(!isEditingInvoice);

  const localIdRef = useRef(1);
  const didAutoOpenImport = useRef(false);
  const clientChangeReviewRequestRef = useRef(0);
  const invoiceNumberCheckRequestRef = useRef(0);
  const dueDateTouchedRef = useRef(!!restoredHeaderDraft?.dueDate);
  const paymentMethodTouchedRef = useRef(!!restoredHeaderDraft?.paymentMethod);

  useEffect(() => {
    const subscription = database
      .get<ClientModel>(ClientModel.table)
      .query(Q.where('is_archived', false), Q.sortBy('name', Q.asc))
      .observeWithColumns([
        'name',
        'company_id',
        'vat_number',
        'invoice_payment_method',
        'invoice_due_days',
        'invoice_qr_type',
        'is_archived',
      ])
      .subscribe(setClients);

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!restoredHeaderDraft) return;
    setClientId(restoredHeaderDraft.clientId || '');
    setBuyerMode(
      restoredHeaderDraft.buyerMode ||
        (restoredHeaderDraft.clientId
          ? 'client'
          : restoredHeaderDraft.buyerSnapshot
            ? 'one_off'
            : 'client'),
    );
    setBuyerDraft(toInvoiceBuyerDraft(restoredHeaderDraft.buyerSnapshot));
    setInvoiceNumber(restoredHeaderDraft.invoiceNumber || '');
    setIsInvoiceNumberManuallyEdited(
      isEditingInvoice || !!restoredHeaderDraft.invoiceNumberManuallyEdited,
    );
    setBuyerReference(restoredHeaderDraft.buyerReference || '');
    setIssuedDate(restoredHeaderDraft.issuedDate || todayISODate());
    setTaxableDate(restoredHeaderDraft.taxableDate || todayISODate());
    setDueDate(restoredHeaderDraft.dueDate || todayISODate());
    setCurrency(normalizeCurrencyCode(restoredHeaderDraft.currency));
    setPaymentMethod(normalizeInvoicePaymentMethod(restoredHeaderDraft.paymentMethod));
    dueDateTouchedRef.current = !!restoredHeaderDraft.dueDate;
    paymentMethodTouchedRef.current = !!restoredHeaderDraft.paymentMethod;
  }, [isEditingInvoice, restoredHeaderDraft]);

  useEffect(() => {
    const withIds = withLocalIds(restoredItemsDraft, localIdRef.current);
    localIdRef.current += withIds.length;
    setItems(withIds);
  }, [restoredItemsDraft]);

  useEffect(() => {
    if (!restoredFooterDraft) return;
    setHeaderNote(restoredFooterDraft.headerNote || '');
    setFooterNote(restoredFooterDraft.footerNote || '');
  }, [restoredFooterDraft]);

  useEffect(() => {
    let isActive = true;

    const loadStoredSellerSnapshot = async () => {
      setRefreshSellerSnapshot(false);

      if (!editingInvoiceId) {
        setStoredSellerSnapshot(null);
        setIsStoredSellerSnapshotLoaded(true);
        return;
      }

      setIsStoredSellerSnapshotLoaded(false);

      try {
        const invoice = await database.get<InvoiceModel>(InvoiceModel.table).find(editingInvoiceId);
        if (!isActive) return;
        setStoredSellerSnapshot(parseSellerSnapshotJson(invoice.sellerSnapshotJson));
      } catch {
        if (!isActive) return;
        setStoredSellerSnapshot(null);
      } finally {
        if (isActive) {
          setIsStoredSellerSnapshotLoaded(true);
        }
      }
    };

    void loadStoredSellerSnapshot();

    return () => {
      isActive = false;
    };
  }, [editingInvoiceId]);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setSellerSnapshotSettings(settings);
      setIsVatPayer(!!settings.isVatPayer);
      if (settings.isVatPayer) {
        const rates = await getVatRates().fetch();
        setVatRates(rates);
      } else {
        setVatRates([]);
      }
      setSettingsDefaultPaymentMethod(
        normalizeInvoicePaymentMethod(settings.defaultInvoicePaymentMethod),
      );
      setSettingsDefaultDueDays(settings.defaultInvoiceDueDays ?? DEFAULT_INVOICE_DUE_DAYS);
      setDefaultRegistry(normalizeCompanyRegistryKey(settings.defaultCompanyRegistry));
      if (!restoredHeaderDraft?.currency) {
        setCurrency(normalizeCurrencyCode(settings.defaultInvoiceCurrency));
      }
    };
    void loadSettings();
  }, [restoredHeaderDraft?.currency]);

  useEffect(() => {
    const loadSuggestedNumber = async () => {
      if (invoiceNumber.trim()) return;
      const suggested = await getSuggestedInvoiceNumber();
      setInvoiceNumber(suggested);
      setIsInvoiceNumberManuallyEdited(false);
    };
    void loadSuggestedNumber();
  }, [invoiceNumber]);

  useEffect(() => {
    const normalizedInvoiceNumber = invoiceNumber.trim();
    if (!normalizedInvoiceNumber) {
      setInvoiceNumberExists(false);
      return;
    }

    const requestId = invoiceNumberCheckRequestRef.current + 1;
    invoiceNumberCheckRequestRef.current = requestId;

    const checkInvoiceNumber = async () => {
      const existing = await database
        .get<InvoiceModel>(InvoiceModel.table)
        .query(Q.where('invoice_number', normalizedInvoiceNumber), Q.take(1))
        .fetch();
      if (invoiceNumberCheckRequestRef.current !== requestId) return;
      const duplicateExists = existing.some((entry) => entry.id !== editingInvoiceId);
      setInvoiceNumberExists(duplicateExists);
    };

    void checkInvoiceNumber();
  }, [editingInvoiceId, invoiceNumber]);

  const effectiveClientId = buyerMode === 'client' ? clientId : '';
  const normalizedBuyerSnapshot = useMemo(() => toInvoiceBuyerSnapshot(buyerDraft), [buyerDraft]);
  const hasBuyerName = !!normalizedBuyerSnapshot.name;

  useEffect(() => {
    const loadSources = async () => {
      const [timesheets, priceItems] = await Promise.all([
        effectiveClientId ? getTimesheetCandidates(effectiveClientId) : Promise.resolve([]),
        getActivePriceListForInvoicing(),
      ]);
      setCanUseTimesheets(timesheets.length > 0);
      setCanUsePriceList(priceItems.length > 0);
    };

    void loadSources();
  }, [effectiveClientId]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === effectiveClientId) ?? null,
    [clients, effectiveClientId],
  );
  const selectedClientName = selectedClient?.name?.trim();
  const hasClients = clients.length > 0;
  const currentSellerSnapshot = useMemo(
    () =>
      sellerSnapshotSettings
        ? buildSellerSnapshotFromSettings(sellerSnapshotSettings, selectedClient)
        : null,
    [selectedClient, sellerSnapshotSettings],
  );
  const hasSellerSnapshotChanges = useMemo(
    () =>
      isEditingInvoice &&
      isStoredSellerSnapshotLoaded &&
      currentSellerSnapshot != null &&
      !areSellerSnapshotsEqual(storedSellerSnapshot, currentSellerSnapshot),
    [currentSellerSnapshot, isEditingInvoice, isStoredSellerSnapshotLoaded, storedSellerSnapshot],
  );
  const shouldShowSellerSnapshotRefresh =
    isEditingInvoice && (refreshSellerSnapshot || hasSellerSnapshotChanges);

  useEffect(() => {
    if (!paymentMethodTouchedRef.current) {
      setPaymentMethod(
        resolveInvoicePaymentMethod(selectedClient, {
          defaultInvoicePaymentMethod: settingsDefaultPaymentMethod,
        }),
      );
    }

    if (!dueDateTouchedRef.current) {
      setDueDate(
        addDaysToIsoDate(
          issuedDate,
          resolveInvoiceDueDays(selectedClient, {
            defaultInvoiceDueDays: settingsDefaultDueDays,
          }),
        ),
      );
    }
  }, [issuedDate, selectedClient, settingsDefaultDueDays, settingsDefaultPaymentMethod]);

  const headerDraft: HeaderDraft = useMemo(
    () => ({
      clientId: effectiveClientId,
      buyerMode,
      buyerSnapshot: buyerMode === 'one_off' ? normalizedBuyerSnapshot : undefined,
      invoiceNumber: invoiceNumber.trim(),
      invoiceNumberManuallyEdited: isInvoiceNumberManuallyEdited,
      buyerReference: buyerReference.trim() || undefined,
      issuedDate: issuedDate.trim(),
      taxableDate: isVatPayer ? taxableDate.trim() : undefined,
      dueDate: dueDate.trim(),
      currency: normalizeCurrencyCode(currency),
      paymentMethod: normalizeInvoicePaymentMethod(paymentMethod),
    }),
    [
      buyerMode,
      buyerReference,
      currency,
      dueDate,
      effectiveClientId,
      invoiceNumber,
      isInvoiceNumberManuallyEdited,
      isVatPayer,
      normalizedBuyerSnapshot,
      issuedDate,
      paymentMethod,
      taxableDate,
    ],
  );

  const footerDraft: FooterDraft = useMemo(
    () => ({
      headerNote,
      footerNote,
    }),
    [footerNote, headerNote],
  );

  const effectiveTaxableAt = useMemo(
    () =>
      parseISODate(headerDraft.taxableDate) ?? parseISODate(headerDraft.issuedDate) ?? Date.now(),
    [headerDraft.issuedDate, headerDraft.taxableDate],
  );
  const resolvedDraftVatRateByCodeId = useMemo(() => {
    const vatCodeIds = Array.from(
      new Set(items.map((item) => item.vatCodeId).filter((value): value is string => !!value)),
    );
    const resolved = new Map<string, number | undefined>();

    for (const vatCodeId of vatCodeIds) {
      const ratesForCode = vatRates.filter((rate) => rate.vatCodeId === vatCodeId);
      resolved.set(vatCodeId, resolveVatRateForDate(ratesForCode, effectiveTaxableAt) ?? undefined);
    }

    return resolved;
  }, [effectiveTaxableAt, items, vatRates]);

  const totals = useMemo(
    () =>
      calculateLineItemTotals(
        items.map(({ localId: _localId, ...item }) => ({
          ...(item as DraftInvoiceItemInput),
          vatRate:
            item.vatRate ??
            (item.vatCodeId ? resolvedDraftVatRateByCodeId.get(item.vatCodeId) : undefined),
        })),
        isVatPayer,
      ),
    [isVatPayer, items, resolvedDraftVatRateByCodeId],
  );
  const dateValidation = useMemo(
    () =>
      getInvoiceDateValidation({
        issuedDate: headerDraft.issuedDate,
        taxableDate: headerDraft.taxableDate,
        dueDate: headerDraft.dueDate,
        isVatPayer,
      }),
    [headerDraft.dueDate, headerDraft.issuedDate, headerDraft.taxableDate, isVatPayer],
  );
  const showIssuedDateTaxableWarning = dateValidation.issuedAfterTaxableWindow;
  const showDueDateBeforeIssueWarning = dateValidation.dueDateBeforeIssue;
  const showDueDatePastWarning = dateValidation.dueDatePast;

  const canCreate =
    !!invoiceNumber.trim() &&
    items.length > 0 &&
    (buyerMode === 'client' ? !!effectiveClientId.trim() : hasBuyerName);
  const normalizedInvoiceCurrency = normalizeCurrencyCode(headerDraft.currency);
  const buyerModeOptions = useMemo(
    () => [LL.invoices.buyerModeSavedClient(), LL.invoices.buyerModeOneOff()],
    [LL.invoices],
  );
  const buyerModeSelectedIndex = buyerMode === 'one_off' ? 1 : 0;

  const buildClientChangeReview = useCallback(
    async (nextClientId: string): Promise<ClientChangeReview> => {
      const review: ClientChangeReview = {
        manualCount: 0,
        priceListCount: 0,
        priceChangedCount: 0,
        priceListNeedsReviewCount: 0,
        timesheetCount: 0,
        priceChangeLines: [],
        nextItemsKeepingTimesheets: [],
        nextItemsRemovingTimesheets: [],
      };

      const priceListSourceIds = Array.from(
        new Set(
          items
            .filter((item) => item.sourceKind === 'price_list')
            .map((item) => item.sourceId)
            .filter((value): value is string => !!value),
        ),
      );

      const priceListItems = priceListSourceIds.length
        ? await database
            .get<PriceListItemModel>(PriceListItemModel.table)
            .query(Q.where('id', Q.oneOf(priceListSourceIds)))
            .fetch()
        : [];
      const priceListItemsById = new Map(priceListItems.map((item) => [item.id, item]));

      for (const item of items) {
        if (item.sourceKind === 'manual') {
          review.manualCount += 1;
          review.nextItemsKeepingTimesheets.push(item);
          review.nextItemsRemovingTimesheets.push(item);
          continue;
        }

        if (item.sourceKind === 'timesheet') {
          review.timesheetCount += 1;
          review.nextItemsKeepingTimesheets.push(item);
          continue;
        }

        review.priceListCount += 1;

        if (!item.sourceId) {
          review.priceListNeedsReviewCount += 1;
          review.nextItemsKeepingTimesheets.push(item);
          review.nextItemsRemovingTimesheets.push(item);
          continue;
        }

        const priceListItem = priceListItemsById.get(item.sourceId);
        if (!priceListItem) {
          review.priceListNeedsReviewCount += 1;
          review.nextItemsKeepingTimesheets.push(item);
          review.nextItemsRemovingTimesheets.push(item);
          continue;
        }

        try {
          const effectivePrice = await getEffectivePriceDetails(nextClientId, priceListItem.id);
          const effectiveCurrency = normalizeCurrencyCode(
            effectivePrice.currency,
            normalizedInvoiceCurrency,
          );

          if (!hasMatchingCurrency(effectiveCurrency, normalizedInvoiceCurrency)) {
            review.priceListNeedsReviewCount += 1;
            review.nextItemsKeepingTimesheets.push(item);
            review.nextItemsRemovingTimesheets.push(item);
            continue;
          }

          const nextUnitPrice = roundCurrency(effectivePrice.price);
          const nextTotalPrice = roundCurrency(item.quantity * nextUnitPrice);
          const nextItem: DraftListItem = {
            ...item,
            unit: priceListItem.unit || item.unit,
            unitPrice: nextUnitPrice,
            totalPrice: nextTotalPrice,
            vatCodeId: priceListItem.vatCodeId || item.vatCodeId,
          };

          if (nextUnitPrice !== item.unitPrice || nextTotalPrice !== item.totalPrice) {
            review.priceChangedCount += 1;
            review.priceChangeLines.push(
              LL.invoices.changeClientReviewPriceChangeLine({
                item: item.description,
                from: formatPrice(item.unitPrice, normalizedInvoiceCurrency, locale),
                to: formatPrice(nextUnitPrice, normalizedInvoiceCurrency, locale),
              }),
            );
          }

          review.nextItemsKeepingTimesheets.push(nextItem);
          review.nextItemsRemovingTimesheets.push(nextItem);
        } catch {
          review.priceListNeedsReviewCount += 1;
          review.nextItemsKeepingTimesheets.push(item);
          review.nextItemsRemovingTimesheets.push(item);
        }
      }

      return review;
    },
    [LL.invoices, items, locale, normalizedInvoiceCurrency],
  );

  const applyClientChange = useCallback((nextClientId: string, nextItems: DraftListItem[]) => {
    dueDateTouchedRef.current = false;
    paymentMethodTouchedRef.current = false;
    setItems(nextItems);
    setClientId(nextClientId);
  }, []);

  const finishClientChangeReview = useCallback((requestId: number) => {
    if (clientChangeReviewRequestRef.current !== requestId) return;
    setIsReviewingClientChange(false);
  }, []);

  const buildClientChangeReviewMessage = useCallback(
    (review: ClientChangeReview) => {
      const lines: string[] = [];

      if (review.manualCount > 0) {
        lines.push(LL.invoices.changeClientReviewManualItems({ count: review.manualCount }));
      }

      if (review.priceChangedCount > 0) {
        lines.push(
          LL.invoices.changeClientReviewPriceListUpdated({ count: review.priceChangedCount }),
        );
      }

      const unchangedPriceListCount =
        review.priceListCount - review.priceChangedCount - review.priceListNeedsReviewCount;
      if (unchangedPriceListCount > 0) {
        lines.push(
          LL.invoices.changeClientReviewPriceListUnchanged({ count: unchangedPriceListCount }),
        );
      }

      if (review.priceListNeedsReviewCount > 0) {
        lines.push(
          LL.invoices.changeClientReviewPriceListNeedsReview({
            count: review.priceListNeedsReviewCount,
          }),
        );
      }

      if (review.timesheetCount > 0) {
        lines.push(LL.invoices.changeClientReviewTimesheetItems({ count: review.timesheetCount }));
      }

      const previewLines = review.priceChangeLines.slice(0, 3);
      if (previewLines.length > 0) {
        lines.push('', ...previewLines);
        if (review.priceChangeLines.length > previewLines.length) {
          lines.push(
            LL.invoices.changeClientReviewMoreChanges({
              count: review.priceChangeLines.length - previewLines.length,
            }),
          );
        }
      }

      return lines.join('\n');
    },
    [LL.invoices],
  );

  const reviewRequiresConfirmation = useCallback((review: ClientChangeReview) => {
    return (
      review.timesheetCount > 0 ||
      review.priceChangedCount > 0 ||
      review.priceListNeedsReviewCount > 0
    );
  }, []);

  const openDatePicker = (field: 'issued' | 'taxable' | 'due') => {
    const currentValue =
      field === 'issued' ? issuedDate : field === 'taxable' ? taxableDate : dueDate;
    const timestamp = parseISODate(currentValue) ?? parseISODate(todayISODate());
    if (timestamp == null) return;
    const nextDate = new Date(timestamp);
    setPickerDate(nextDate);
    setActiveDateField(field);
  };

  const closeDatePicker = () => {
    setActiveDateField(null);
  };

  const applyDateToField = (field: 'issued' | 'taxable' | 'due', selectedDate: Date) => {
    const nextValue = toLocalISODate(selectedDate);
    if (field === 'issued') setIssuedDate(nextValue);
    if (field === 'taxable') setTaxableDate(nextValue);
    if (field === 'due') {
      dueDateTouchedRef.current = true;
      setDueDate(nextValue);
    }
  };

  const confirmDatePicker = (selectedDate: Date = pickerDate) => {
    if (!activeDateField) return;
    applyDateToField(activeDateField, selectedDate);
    closeDatePicker();
  };

  const formatDisplayDate = (value: string): string => {
    const timestamp = parseISODate(value);
    if (timestamp == null) {
      return value.trim() || '--';
    }
    return new Date(timestamp).toLocaleDateString(intlLocale);
  };

  const handleClientChange = (nextClientId: string) => {
    if (nextClientId === clientId) return;
    if (isReviewingClientChange) return;
    if (items.length === 0) {
      applyClientChange(nextClientId, []);
      return;
    }

    const nextClient = clients.find((client) => client.id === nextClientId) ?? null;
    const requestId = clientChangeReviewRequestRef.current + 1;
    clientChangeReviewRequestRef.current = requestId;
    setIsReviewingClientChange(true);

    void buildClientChangeReview(nextClientId)
      .then((review) => {
        if (clientChangeReviewRequestRef.current !== requestId) return;

        if (!reviewRequiresConfirmation(review)) {
          applyClientChange(nextClientId, review.nextItemsKeepingTimesheets);
          finishClientChangeReview(requestId);
          return;
        }

        const message = buildClientChangeReviewMessage(review);
        const title = nextClient?.name
          ? LL.invoices.changeClientReviewTitle({ client: nextClient.name })
          : LL.invoices.changeClientClearsItemsTitle();

        if (review.timesheetCount > 0) {
          Alert.alert(
            title,
            message,
            [
              {
                text: LL.common.cancel(),
                style: 'cancel',
                onPress: () => finishClientChangeReview(requestId),
              },
              {
                text: LL.invoices.changeClientReviewRemoveTimesheet(),
                style: 'destructive',
                onPress: () => {
                  applyClientChange(nextClientId, review.nextItemsRemovingTimesheets);
                  finishClientChangeReview(requestId);
                },
              },
              {
                text: LL.invoices.changeClientReviewKeepTimesheet(),
                onPress: () => {
                  applyClientChange(nextClientId, review.nextItemsKeepingTimesheets);
                  finishClientChangeReview(requestId);
                },
              },
            ],
            {
              cancelable: true,
              onDismiss: () => finishClientChangeReview(requestId),
            },
          );
          return;
        }

        Alert.alert(
          title,
          message,
          [
            {
              text: LL.common.cancel(),
              style: 'cancel',
              onPress: () => finishClientChangeReview(requestId),
            },
            {
              text: LL.invoices.changeClientReviewApply(),
              onPress: () => {
                applyClientChange(nextClientId, review.nextItemsKeepingTimesheets);
                finishClientChangeReview(requestId);
              },
            },
          ],
          {
            cancelable: true,
            onDismiss: () => finishClientChangeReview(requestId),
          },
        );
      })
      .catch((error) => {
        if (clientChangeReviewRequestRef.current !== requestId) return;
        finishClientChangeReview(requestId);
        Alert.alert(LL.common.error(), getErrorMessage(error, LL.common.errorUnknown()));
      });
  };

  const handleCurrencyChange = (nextCurrency: string) => {
    if (nextCurrency === currency) return;

    const manualItemCount = items.filter((item) => item.sourceKind === 'manual').length;
    if (manualItemCount === 0) {
      setCurrency(nextCurrency);
      return;
    }

    Alert.alert(
      LL.invoices.changeCurrencyManualItemsTitle(),
      LL.invoices.changeCurrencyManualItemsMessage({
        count: manualItemCount,
        from: normalizeCurrencyCode(currency),
        to: normalizeCurrencyCode(nextCurrency),
      }),
      [
        { text: LL.common.cancel(), style: 'cancel' },
        {
          text: LL.invoices.changeCurrencyManualItemsContinue(),
          onPress: () => setCurrency(nextCurrency),
        },
      ],
    );
  };

  const updateBuyerDraftField = useCallback((field: BuyerDraftField, value: string) => {
    setBuyerDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);
  const applyLookupCompany = useCallback(
    (company: CompanyRegistryCompany, options?: { includeAddress?: boolean }) => {
      setBuyerDraft((current) => {
        const nextDraft: InvoiceBuyerDraft = {
          ...current,
          name: company.legalName || current.name,
          companyId: company.companyId || current.companyId,
          vatNumber: company.vatNumber || current.vatNumber,
        };

        if (!options?.includeAddress) {
          return nextDraft;
        }

        const importAddress = pickRegistryImportAddress(company);
        if (!importAddress) {
          Alert.alert(LL.common.error(), LL.clients.errorCompanyLookupAddressUnavailable());
          return nextDraft;
        }

        return {
          ...nextDraft,
          address: importAddress.street || current.address,
          city: importAddress.city || current.city,
          postalCode: importAddress.postalCode || current.postalCode,
          country: importAddress.country || company.countryCode || current.country,
        };
      });
    },
    [LL.common, LL.clients],
  );
  const handleLookupByCompanyId = useCallback(
    async (companyId: string, registryKey: CompanyRegistryKey) => {
      const normalizedCompanyId = companyId.trim();
      if (!normalizedCompanyId) {
        Alert.alert(LL.common.error(), LL.clients.errorCompanyIdRequiredForLookup());
        return;
      }

      setIsLookupLoading(true);
      try {
        const registrySettings = await loadRegistrySettingsForLookup(registryKey);
        const selectedRegistryService = getCompanyRegistryService(registryKey, registrySettings);
        if (!selectedRegistryService) {
          Alert.alert(LL.common.error(), LL.clients.errorCompanyRegistryNotSelected());
          return;
        }

        const company = await selectedRegistryService.lookupCompanyById(normalizedCompanyId);
        setLookupWizardCompany(company);
      } catch (error) {
        console.error('Error looking up company for one-off buyer:', error);
        if (error instanceof CompanyRegistryLookupError) {
          if (error.code === 'invalid_company_id') {
            Alert.alert(LL.common.error(), LL.clients.errorInvalidCompanyIdForLookup());
            return;
          }
          if (error.code === 'company_not_found') {
            Alert.alert(LL.common.error(), LL.clients.errorCompanyNotFoundInRegistry());
            return;
          }
          if (error.code === 'service_unavailable') {
            Alert.alert(LL.common.error(), LL.clients.errorCompanyRegistryUnavailable());
            return;
          }
          if (error.code === 'configuration_required') {
            requestMissingRegistryConfiguration(
              LL,
              registryKey,
              (route) => router.push(route),
              error.message,
            );
            return;
          }
        }

        Alert.alert(LL.common.error(), LL.clients.errorCompanyLookupFailed());
      } finally {
        setIsLookupLoading(false);
      }
    },
    [LL, router],
  );
  const handleLookupByDefaultRegistry = useCallback(
    (companyId: string) => {
      const normalizedCompanyId = companyId.trim();
      if (!normalizedCompanyId) {
        Alert.alert(LL.common.error(), LL.clients.errorCompanyIdRequiredForLookup());
        return;
      }

      void (async () => {
        let registryToUse = defaultRegistry;
        try {
          const settings = await getSettings();
          registryToUse = normalizeCompanyRegistryKey(settings.defaultCompanyRegistry);
          setDefaultRegistry(registryToUse);
        } catch (error) {
          console.error('Error loading default company registry for one-off buyer:', error);
        }

        if (registryToUse === 'none') {
          setPendingLookupCompanyId(normalizedCompanyId);
          setIsRegistryPickerVisible(true);
          return;
        }

        await handleLookupByCompanyId(normalizedCompanyId, registryToUse);
      })();
    },
    [LL.common, LL.clients, defaultRegistry, handleLookupByCompanyId],
  );
  const handleLookupWithRegistryPicker = useCallback(
    (companyId: string) => {
      const normalizedCompanyId = companyId.trim();
      if (!normalizedCompanyId) {
        Alert.alert(LL.common.error(), LL.clients.errorCompanyIdRequiredForLookup());
        return;
      }

      setPendingLookupCompanyId(normalizedCompanyId);
      setIsRegistryPickerVisible(true);
    },
    [LL.common, LL.clients],
  );

  const openAddScreen = useCallback(
    (source: 'timesheet' | 'price_list' | 'manual') => {
      router.push({
        pathname: '/invoices/new-item',
        params: {
          ...(editingInvoiceId ? { editingInvoiceId } : {}),
          source,
          headerDraft: JSON.stringify(headerDraft),
          itemsDraft: JSON.stringify(items.map(({ localId: _localId, ...item }) => item)),
          footerDraft: JSON.stringify(footerDraft),
          ...(source === 'timesheet' && params.preselectedTimesheetId
            ? { preselectedTimesheetId: params.preselectedTimesheetId }
            : {}),
        },
      });
    },
    [editingInvoiceId, footerDraft, headerDraft, items, params.preselectedTimesheetId, router],
  );

  useEffect(() => {
    if (didAutoOpenImport.current) return;
    if (params.autoOpenTimesheetImport !== '1' || !params.preselectedTimesheetId) return;
    if (!headerDraft.clientId || !headerDraft.invoiceNumber) return;

    didAutoOpenImport.current = true;
    openAddScreen('timesheet');
  }, [
    headerDraft.clientId,
    headerDraft.invoiceNumber,
    openAddScreen,
    params.autoOpenTimesheetImport,
    params.preselectedTimesheetId,
  ]);

  const removeItem = (item: DraftListItem) => {
    setItems((current) => current.filter((entry) => entry.localId !== item.localId));
  };

  const handleBackWithoutChanges = () => {
    if (!editingInvoiceId) return;
    router.replace(`/invoices/${editingInvoiceId}`);
  };

  const confirmRefreshSellerSnapshot = () => {
    Alert.alert(
      LL.invoices.refreshSellerSnapshotConfirmTitle(),
      LL.invoices.refreshSellerSnapshotConfirmMessage(),
      [
        {
          text: LL.common.cancel(),
          style: 'cancel',
        },
        {
          text: LL.invoices.refreshSellerSnapshotConfirmAction(),
          onPress: () => setRefreshSellerSnapshot(true),
        },
      ],
    );
  };

  const handleInvoiceNumberChange = (value: string) => {
    setInvoiceNumber(value);
    setIsInvoiceNumberManuallyEdited(true);
  };

  const promptUseSuggestedInvoiceNumber = useCallback(
    async (currentInvoiceNumber: string, manuallyEdited: boolean): Promise<string | null> => {
      const suggestedInvoiceNumber = await getSuggestedInvoiceNumber();
      if (
        !suggestedInvoiceNumber.trim() ||
        suggestedInvoiceNumber === currentInvoiceNumber.trim()
      ) {
        return null;
      }

      return new Promise<string | null>((resolve) => {
        Alert.alert(
          LL.invoices.invoiceNumberConflictTitle(),
          manuallyEdited
            ? LL.invoices.invoiceNumberConflictManualMessage({
                current: currentInvoiceNumber,
                suggested: suggestedInvoiceNumber,
              })
            : LL.invoices.invoiceNumberConflictAutoMessage({
                current: currentInvoiceNumber,
                suggested: suggestedInvoiceNumber,
              }),
          [
            {
              text: LL.common.cancel(),
              style: 'cancel',
              onPress: () => resolve(null),
            },
            {
              text: LL.invoices.invoiceNumberConflictUseSuggested({
                suggested: suggestedInvoiceNumber,
              }),
              onPress: () => resolve(suggestedInvoiceNumber),
            },
          ],
          {
            cancelable: true,
            onDismiss: () => resolve(null),
          },
        );
      });
    },
    [LL.common, LL.invoices],
  );

  const buildInvoiceInput = useCallback(
    (invoiceNumberOverride?: string) => ({
      clientId: headerDraft.clientId,
      buyerSnapshot: buyerMode === 'one_off' ? normalizedBuyerSnapshot : undefined,
      invoiceNumber: invoiceNumberOverride ?? headerDraft.invoiceNumber,
      buyerReference: headerDraft.buyerReference,
      issuedAt: parseISODate(headerDraft.issuedDate) ?? Date.now(),
      taxableAt: parseOptionalISODate(headerDraft.taxableDate),
      dueAt: parseOptionalISODate(headerDraft.dueDate),
      currency: headerDraft.currency,
      paymentMethod: headerDraft.paymentMethod,
      headerNote: headerNote.trim() || undefined,
      footerNote: footerNote.trim() || undefined,
      items: items.map(({ localId: _localId, ...item }) => item as DraftInvoiceItemInput),
    }),
    [buyerMode, footerNote, headerDraft, headerNote, items, normalizedBuyerSnapshot],
  );

  const createInvoiceWithConflictResolution =
    useCallback(async (): Promise<InvoiceModel | null> => {
      let nextInvoiceNumber = headerDraft.invoiceNumber;
      let manuallyEdited = isInvoiceNumberManuallyEdited;

      while (true) {
        try {
          return await createInvoice(buildInvoiceInput(nextInvoiceNumber));
        } catch (error) {
          if (!(error instanceof Error) || error.message !== INVOICE_NUMBER_EXISTS_ERROR) {
            throw error;
          }

          const suggestedInvoiceNumber = await promptUseSuggestedInvoiceNumber(
            nextInvoiceNumber,
            manuallyEdited,
          );
          if (!suggestedInvoiceNumber) {
            return null;
          }

          nextInvoiceNumber = suggestedInvoiceNumber;
          manuallyEdited = false;
          setInvoiceNumber(suggestedInvoiceNumber);
          setIsInvoiceNumberManuallyEdited(false);
        }
      }
    }, [
      buildInvoiceInput,
      headerDraft.invoiceNumber,
      isInvoiceNumberManuallyEdited,
      promptUseSuggestedInvoiceNumber,
    ]);

  const handleCreate = async () => {
    const hasBuyer = headerDraft.clientId || normalizedBuyerSnapshot.name;
    if (!hasBuyer || !headerDraft.invoiceNumber.trim()) {
      Alert.alert(LL.common.error(), LL.invoices.errorHeaderRequired());
      return;
    }
    if (
      dateValidation.invalidIssuedDate ||
      dateValidation.invalidDueDate ||
      dateValidation.invalidTaxableDate
    ) {
      Alert.alert(LL.common.error(), LL.invoices.errorInvalidDateFormat());
      return;
    }
    if (dateValidation.taxableDateRequired) {
      Alert.alert(LL.common.error(), LL.invoices.errorTaxableDateRequired());
      return;
    }
    if (items.length === 0) {
      Alert.alert(LL.common.error(), LL.invoices.errorNoItems());
      return;
    }

    try {
      setIsSaving(true);
      const invoice = editingInvoiceId
        ? await updateIssuedInvoice({
            id: editingInvoiceId,
            refreshSellerSnapshot,
            ...buildInvoiceInput(),
          })
        : await createInvoiceWithConflictResolution();

      if (!invoice) {
        return;
      }

      if (editingInvoiceId) {
        router.replace(`/invoices/${invoice.id}`);
      } else {
        router.dismissAll();
        router.push(`/invoices/${invoice.id}`);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message === INVOICE_TAXABLE_DATE_REQUIRED_ERROR
          ? LL.invoices.errorTaxableDateRequired()
          : error instanceof Error && error.message === INVOICE_NUMBER_EXISTS_ERROR
            ? LL.invoices.errorInvoiceNumberExists()
            : getErrorMessage(
                error,
                editingInvoiceId ? LL.invoices.errorUpdate() : LL.invoices.errorCreate(),
              );
      Alert.alert(LL.common.error(), message);
    } finally {
      setIsSaving(false);
    }
  };

  const getSourceLabel = (sourceKind: DraftInvoiceItemInput['sourceKind']) => {
    if (sourceKind === 'timesheet') return LL.invoices.addFromTimesheets();
    if (sourceKind === 'price_list') return LL.invoices.addFromPriceList();
    return LL.invoices.addManualItemSection();
  };

  const getItemUnitLabel = (unit?: string) => {
    const normalizedUnit = unit?.trim() || '';
    if (!normalizedUnit) return '';
    return getPriceListUnitLabel(LL, normalizedUnit);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isEditingInvoice ? LL.invoices.editDraftTitle() : LL.invoices.draftTitle(),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
          {!hasClients && buyerMode === 'client' && (
            <NoClientsRequiredNotice
              message={LL.timeTracking.addClientFirst()}
              returnTo="invoiceNew"
              style={styles.notice}
            />
          )}

          <ThemedView style={[styles.sectionCard, stylesField(palette)]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.invoices.draftDetailsSection()}
            </ThemedText>

            <ThemedText style={styles.label}>{LL.invoices.exportBuyer()}</ThemedText>
            <SegmentedControl
              style={styles.segmented}
              values={buyerModeOptions}
              selectedIndex={buyerModeSelectedIndex}
              onChange={(event) => {
                const nextBuyerMode =
                  event.nativeEvent.selectedSegmentIndex === 1 ? 'one_off' : 'client';
                setBuyerMode(nextBuyerMode);
              }}
            />

            {buyerMode === 'client' ? (
              <>
                <ThemedText style={styles.label}>{LL.timeTracking.client()}</ThemedText>
                <EntityPickerField
                  value={clientId}
                  onValueChange={handleClientChange}
                  title={LL.timeTracking.client()}
                  placeholder={selectedClientName || LL.clients.selectClient()}
                  searchPlaceholder={LL.clients.searchPlaceholder()}
                  emptyText={LL.clients.noClients()}
                  emptySearchText={LL.clients.noClientsSearch()}
                  disabled={isReviewingClientChange}
                  options={clients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  }))}
                />
                {isReviewingClientChange ? (
                  <View style={styles.inlineLoadingRow}>
                    <ActivityIndicator size="small" color={palette.tint} />
                    <ThemedText
                      style={[styles.inlineLoadingText, { color: palette.textSecondary }]}
                    >
                      {LL.common.loading()}
                    </ThemedText>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <ThemedText style={styles.label}>{LL.clients.clientName()}</ThemedText>
                <TextInput
                  style={[styles.input, stylesField(palette)]}
                  value={buyerDraft.name}
                  onChangeText={(value) => updateBuyerDraftField('name', value)}
                  placeholder={LL.clients.clientName()}
                  placeholderTextColor={placeholder(palette)}
                />

                <ThemedText style={styles.label}>{LL.clients.companyIdLabel()}</ThemedText>
                <TextInput
                  style={[styles.input, stylesField(palette)]}
                  value={buyerDraft.companyId}
                  onChangeText={(value) => updateBuyerDraftField('companyId', value)}
                  placeholder={LL.clients.companyIdLabel()}
                  placeholderTextColor={placeholder(palette)}
                />
                <View
                  style={[
                    styles.lookupSplitButton,
                    {
                      borderColor: palette.tint,
                      opacity: isLookupLoading ? 0.7 : 1,
                    },
                  ]}
                >
                  <Pressable
                    style={styles.lookupPrimaryButton}
                    onPress={() => handleLookupByDefaultRegistry(buyerDraft.companyId)}
                    disabled={isLookupLoading || isSaving}
                  >
                    {isLookupLoading ? (
                      <ActivityIndicator size="small" color={palette.tint} />
                    ) : (
                      <ThemedText style={[styles.lookupButtonText, { color: palette.tint }]}>
                        {LL.clients.lookupCompanyById()}
                      </ThemedText>
                    )}
                  </Pressable>
                  <Pressable
                    style={[
                      styles.lookupArrowButton,
                      {
                        borderLeftColor: palette.tint,
                      },
                    ]}
                    onPress={() => handleLookupWithRegistryPicker(buyerDraft.companyId)}
                    disabled={isLookupLoading || isSaving}
                    accessibilityRole="button"
                    accessibilityLabel={LL.clients.lookupCompanyById()}
                  >
                    <IconSymbol name="chevron.down" size={16} color={palette.tint} />
                  </Pressable>
                </View>

                <ThemedText style={styles.label}>{LL.clients.vatNumberLabel()}</ThemedText>
                <TextInput
                  style={[styles.input, stylesField(palette)]}
                  value={buyerDraft.vatNumber}
                  onChangeText={(value) => updateBuyerDraftField('vatNumber', value)}
                  placeholder={LL.clients.vatNumberLabel()}
                  placeholderTextColor={placeholder(palette)}
                />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldColumn}>
                    <ThemedText style={styles.label}>{LL.clients.emailLabel()}</ThemedText>
                    <TextInput
                      style={[styles.input, stylesField(palette)]}
                      value={buyerDraft.email}
                      onChangeText={(value) => updateBuyerDraftField('email', value)}
                      placeholder={LL.clients.emailLabel()}
                      placeholderTextColor={placeholder(palette)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={styles.fieldColumn}>
                    <ThemedText style={styles.label}>{LL.clients.phoneLabel()}</ThemedText>
                    <TextInput
                      style={[styles.input, stylesField(palette)]}
                      value={buyerDraft.phone}
                      onChangeText={(value) => updateBuyerDraftField('phone', value)}
                      placeholder={LL.clients.phoneLabel()}
                      placeholderTextColor={placeholder(palette)}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                <ThemedText style={styles.label}>{LL.clients.street()}</ThemedText>
                <TextInput
                  style={[styles.input, stylesField(palette)]}
                  value={buyerDraft.address}
                  onChangeText={(value) => updateBuyerDraftField('address', value)}
                  placeholder={LL.clients.street()}
                  placeholderTextColor={placeholder(palette)}
                />

                <ThemedText style={styles.label}>{LL.clients.street2()}</ThemedText>
                <TextInput
                  style={[styles.input, stylesField(palette)]}
                  value={buyerDraft.street2}
                  onChangeText={(value) => updateBuyerDraftField('street2', value)}
                  placeholder={LL.clients.street2()}
                  placeholderTextColor={placeholder(palette)}
                />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldColumn}>
                    <ThemedText style={styles.label}>{LL.clients.city()}</ThemedText>
                    <TextInput
                      style={[styles.input, stylesField(palette)]}
                      value={buyerDraft.city}
                      onChangeText={(value) => updateBuyerDraftField('city', value)}
                      placeholder={LL.clients.city()}
                      placeholderTextColor={placeholder(palette)}
                    />
                  </View>
                  <View style={styles.fieldColumn}>
                    <ThemedText style={styles.label}>{LL.clients.postalCode()}</ThemedText>
                    <TextInput
                      style={[styles.input, stylesField(palette)]}
                      value={buyerDraft.postalCode}
                      onChangeText={(value) => updateBuyerDraftField('postalCode', value)}
                      placeholder={LL.clients.postalCode()}
                      placeholderTextColor={placeholder(palette)}
                    />
                  </View>
                </View>

                <ThemedText style={styles.label}>{LL.clients.country()}</ThemedText>
                <TextInput
                  style={[styles.input, stylesField(palette)]}
                  value={buyerDraft.country}
                  onChangeText={(value) => updateBuyerDraftField('country', value)}
                  placeholder={LL.clients.country()}
                  placeholderTextColor={placeholder(palette)}
                />
              </>
            )}

            <ThemedText style={styles.label}>{LL.invoices.invoiceNumber()}</ThemedText>
            <TextInput
              style={[styles.input, stylesField(palette)]}
              value={invoiceNumber}
              onChangeText={handleInvoiceNumberChange}
              placeholder={LL.invoices.invoiceNumberPlaceholder()}
              placeholderTextColor={placeholder(palette)}
            />
            {invoiceNumberExists ? (
              <View
                style={[
                  styles.warningCard,
                  {
                    borderColor: palette.destructive,
                    backgroundColor: palette.cardBackground,
                  },
                ]}
              >
                <ThemedText style={[styles.warningText, { color: palette.textSecondary }]}>
                  {LL.invoices.invoiceNumberExistsWarning()}
                </ThemedText>
              </View>
            ) : null}

            <ThemedText style={styles.label}>{LL.invoices.buyerReference()}</ThemedText>
            <TextInput
              style={[styles.input, stylesField(palette)]}
              value={buyerReference}
              onChangeText={setBuyerReference}
              placeholder={LL.invoices.buyerReferencePlaceholder()}
              placeholderTextColor={placeholder(palette)}
            />

            <View style={styles.fieldRow}>
              <View style={styles.fieldColumn}>
                <ThemedText style={styles.label}>{LL.invoices.issueDate()}</ThemedText>
                <Pressable
                  style={[styles.input, stylesField(palette)]}
                  onPress={() => openDatePicker('issued')}
                >
                  <ThemedText>{formatDisplayDate(issuedDate)}</ThemedText>
                </Pressable>
              </View>
              <View style={styles.fieldColumn}>
                <ThemedText style={styles.label}>{LL.invoices.dueDate()}</ThemedText>
                <Pressable
                  style={[styles.input, stylesField(palette)]}
                  onPress={() => openDatePicker('due')}
                >
                  <ThemedText>{formatDisplayDate(dueDate)}</ThemedText>
                </Pressable>
                {showDueDateBeforeIssueWarning ? (
                  <View
                    style={[
                      styles.warningCard,
                      {
                        borderColor: palette.destructive,
                        backgroundColor: palette.cardBackground,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.warningText, { color: palette.textSecondary }]}>
                      {LL.invoices.dueDateBeforeIssueWarning()}
                    </ThemedText>
                  </View>
                ) : showDueDatePastWarning ? (
                  <View
                    style={[
                      styles.warningCard,
                      {
                        borderColor: palette.destructive,
                        backgroundColor: palette.cardBackground,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.warningText, { color: palette.textSecondary }]}>
                      {LL.invoices.dueDatePastWarning()}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            </View>

            {isVatPayer && (
              <>
                <ThemedText style={styles.label}>{LL.invoices.taxableSupplyDate()} *</ThemedText>
                <Pressable
                  style={[styles.input, stylesField(palette)]}
                  onPress={() => openDatePicker('taxable')}
                >
                  <ThemedText>{formatDisplayDate(taxableDate)}</ThemedText>
                </Pressable>
                {showIssuedDateTaxableWarning ? (
                  <View
                    style={[
                      styles.warningCard,
                      {
                        borderColor: palette.destructive,
                        backgroundColor: palette.cardBackground,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.warningText, { color: palette.textSecondary }]}>
                      {LL.invoices.issuedDateVatWindowWarning()}
                    </ThemedText>
                  </View>
                ) : null}
              </>
            )}

            <View style={styles.fieldRow}>
              <View style={styles.fieldColumn}>
                <ThemedText style={styles.label}>{LL.invoices.currency()}</ThemedText>
                <Select value={currency} onValueChange={handleCurrencyChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={currency} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{LL.invoices.currency()}</SelectLabel>
                      {currencies.map((currencyOption) => (
                        <SelectItem
                          key={currencyOption.id}
                          value={currencyOption.code}
                          label={currencyOption.code}
                        >
                          {currencyOption.code}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>
              <View style={styles.fieldColumn}>
                <ThemedText style={styles.label}>{LL.invoices.paymentMethod()}</ThemedText>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => {
                    paymentMethodTouchedRef.current = true;
                    setPaymentMethod(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={getPaymentMethodLabel(LL, paymentMethod)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{LL.invoices.paymentMethod()}</SelectLabel>
                      {INVOICE_PAYMENT_METHOD_OPTIONS.map((option) => (
                        <SelectItem
                          key={option}
                          value={option}
                          label={getPaymentMethodLabel(LL, option)}
                        >
                          {getPaymentMethodLabel(LL, option)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>
            </View>
          </ThemedView>

          <ThemedView style={[styles.sectionCard, stylesField(palette)]}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                {LL.invoices.selectedItems()}
              </ThemedText>
            </View>

            <View style={styles.itemActionRow}>
              {canUseTimesheets && (
                <Pressable
                  style={[styles.secondaryAction, { borderColor: palette.border }]}
                  onPress={() => openAddScreen('timesheet')}
                >
                  <ThemedText style={styles.secondaryActionText}>
                    {LL.invoices.addFromTimesheets()}
                  </ThemedText>
                </Pressable>
              )}
              {canUsePriceList && (
                <Pressable
                  style={[styles.secondaryAction, { borderColor: palette.border }]}
                  onPress={() => openAddScreen('price_list')}
                >
                  <ThemedText style={styles.secondaryActionText}>
                    {LL.invoices.addFromPriceList()}
                  </ThemedText>
                </Pressable>
              )}
              <Pressable
                style={[styles.secondaryAction, { borderColor: palette.border }]}
                onPress={() => openAddScreen('manual')}
              >
                <ThemedText style={styles.secondaryActionText}>
                  {LL.invoices.addManualItemSection()}
                </ThemedText>
              </Pressable>
            </View>

            <SwipeableList
              iconName="doc.richtext.fill"
              title={LL.invoices.selectedItems()}
              items={items}
              onDelete={removeItem}
              keyExtractor={(item) => item.localId}
              emptyText={LL.invoices.errorNoItems()}
              showAddButton={false}
              swipeHintKey="invoices.draft-items"
              renderItem={(item) => {
                const itemUnitLabel = getItemUnitLabel(item.unit);

                return (
                  <View style={styles.itemRow}>
                    <View style={styles.itemHeaderRow}>
                      <ThemedText type="defaultSemiBold" style={styles.itemDescription}>
                        {item.description}
                      </ThemedText>
                      <View style={[styles.sourceBadge, { borderColor: palette.borderStrong }]}>
                        <ThemedText style={styles.sourceBadgeText}>
                          {getSourceLabel(item.sourceKind)}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.selectionMeta}>
                      {item.quantity}
                      {itemUnitLabel ? ` ${itemUnitLabel}` : ''} × {item.unitPrice.toFixed(2)} ={' '}
                      {formatPrice(item.totalPrice, headerDraft.currency, locale)}
                    </ThemedText>
                  </View>
                );
              }}
            />
          </ThemedView>

          <ThemedView style={[styles.sectionCard, stylesField(palette)]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.invoices.draftNotesSection()}
            </ThemedText>

            <TextInput
              style={[styles.input, stylesField(palette), styles.multiline]}
              value={headerNote}
              onChangeText={setHeaderNote}
              placeholder={LL.invoices.headerNote()}
              placeholderTextColor={placeholder(palette)}
              multiline
            />

            <TextInput
              style={[styles.input, stylesField(palette), styles.multiline]}
              value={footerNote}
              onChangeText={setFooterNote}
              placeholder={LL.invoices.footerNote()}
              placeholderTextColor={placeholder(palette)}
              multiline
            />
          </ThemedView>

          <ThemedView style={[styles.sectionCard, stylesField(palette)]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.invoices.draftSummarySection()}
            </ThemedText>
            <View style={styles.summaryRow}>
              <ThemedText>{LL.invoices.subtotal()}</ThemedText>
              <ThemedText type="defaultSemiBold">
                {formatPrice(totals.subtotal, headerDraft.currency, locale)}
              </ThemedText>
            </View>
            {isVatPayer ? (
              <View style={styles.summaryRow}>
                <ThemedText>{LL.invoices.exportVat()}</ThemedText>
                <ThemedText type="defaultSemiBold">
                  {formatPrice(totals.vatTotal, headerDraft.currency, locale)}
                </ThemedText>
              </View>
            ) : null}
            <View style={[styles.summaryRow, styles.summaryRowStrong]}>
              <ThemedText type="defaultSemiBold">{LL.invoices.total()}</ThemedText>
              <ThemedText type="defaultSemiBold">
                {formatPrice(totals.total, headerDraft.currency, locale)}
              </ThemedText>
            </View>
          </ThemedView>

          <View style={styles.footerActions}>
            <AppButton
              label={
                isSaving
                  ? LL.common.loading()
                  : isEditingInvoice
                    ? LL.invoices.updateInvoice()
                    : LL.invoices.createInvoice()
              }
              onPress={handleCreate}
              disabled={!canCreate || isSaving}
              loading={isSaving}
            />

            {isEditingInvoice ? (
              <AppButton
                label={LL.invoices.backWithoutChanges()}
                onPress={handleBackWithoutChanges}
                disabled={isSaving}
                variant="secondary"
              />
            ) : null}

            {shouldShowSellerSnapshotRefresh ? (
              <View
                style={[
                  styles.sellerSnapshotCard,
                  {
                    borderColor: refreshSellerSnapshot ? palette.success : palette.border,
                    backgroundColor: palette.cardBackground,
                  },
                ]}
              >
                <View style={styles.sellerSnapshotText}>
                  <ThemedText style={styles.sellerSnapshotTitle}>
                    {LL.invoices.sellerSnapshotNoticeTitle()}
                  </ThemedText>
                  <ThemedText
                    style={[styles.sellerSnapshotDescription, { color: palette.textSecondary }]}
                  >
                    {refreshSellerSnapshot
                      ? LL.invoices.sellerSnapshotRefreshPending()
                      : LL.invoices.sellerSnapshotNoticeDescription()}
                  </ThemedText>
                </View>
                <Pressable
                  style={[
                    styles.sellerSnapshotButton,
                    {
                      borderColor: refreshSellerSnapshot ? palette.success : palette.tint,
                      backgroundColor: refreshSellerSnapshot
                        ? palette.buttonNeutralBackground
                        : palette.cardBackground,
                      opacity: refreshSellerSnapshot || isSaving ? 0.72 : 1,
                    },
                  ]}
                  onPress={confirmRefreshSellerSnapshot}
                  disabled={refreshSellerSnapshot || isSaving}
                  accessibilityRole="button"
                  accessibilityLabel={
                    refreshSellerSnapshot
                      ? LL.invoices.sellerSnapshotRefreshPendingShort()
                      : LL.invoices.refreshSellerSnapshotAction()
                  }
                >
                  <IconSymbol
                    name={
                      refreshSellerSnapshot
                        ? 'checkmark.circle.fill'
                        : 'arrow.triangle.2.circlepath'
                    }
                    size={16}
                    color={refreshSellerSnapshot ? palette.success : palette.tint}
                  />
                  <ThemedText
                    style={[
                      styles.sellerSnapshotButtonText,
                      { color: refreshSellerSnapshot ? palette.success : palette.tint },
                    ]}
                  >
                    {refreshSellerSnapshot
                      ? LL.invoices.sellerSnapshotRefreshPendingShort()
                      : LL.invoices.refreshSellerSnapshotAction()}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>

          <CrossPlatformDatePicker
            visible={activeDateField !== null}
            value={pickerDate}
            title={
              activeDateField === 'due'
                ? LL.invoices.dueDate()
                : activeDateField === 'taxable'
                  ? LL.invoices.taxableSupplyDate()
                  : LL.invoices.issueDate()
            }
            cancelLabel={LL.common.cancel()}
            confirmLabel={LL.common.save()}
            onCancel={closeDatePicker}
            onConfirm={confirmDatePicker}
            onValueChange={setPickerDate}
          />
          <CompanyRegistryPickerModal
            visible={isRegistryPickerVisible}
            LL={LL}
            onClose={() => setIsRegistryPickerVisible(false)}
            onSelect={(registryKey) => {
              setIsRegistryPickerVisible(false);
              if (!pendingLookupCompanyId) return;
              void handleLookupByCompanyId(pendingLookupCompanyId, registryKey);
            }}
          />
          <OptionSheetModal
            visible={!!lookupWizardCompany}
            title={LL.clients.lookupWizardTitle()}
            message={LL.clients.lookupWizardMessage()}
            cancelLabel={LL.common.cancel()}
            onClose={() => setLookupWizardCompany(null)}
            options={
              lookupWizardCompany
                ? [
                    {
                      key: 'basic',
                      label: LL.clients.lookupWizardBasic(),
                      onPress: () => applyLookupCompany(lookupWizardCompany),
                    },
                    {
                      key: 'with_address',
                      label: LL.clients.lookupWizardWithAddress(),
                      onPress: () =>
                        applyLookupCompany(lookupWizardCompany, { includeAddress: true }),
                    },
                  ]
                : []
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function stylesField(palette: Palette) {
  return {
    color: palette.text,
    borderColor: palette.inputBorder,
    backgroundColor: palette.cardBackground,
  };
}

function placeholder(palette: Palette) {
  return palette.placeholder;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  notice: { marginBottom: 4 },
  segmented: {
    marginBottom: 4,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
  },
  sellerSnapshotCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  sellerSnapshotText: {
    gap: 3,
  },
  sellerSnapshotTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  sellerSnapshotDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  sellerSnapshotButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sellerSnapshotButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    opacity: 0.7,
  },
  inlineLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  inlineLoadingText: {
    fontSize: 13,
  },
  warningCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldColumn: {
    flex: 1,
    gap: 8,
  },
  lookupSplitButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  lookupButtonText: {
    fontWeight: '600',
  },
  lookupPrimaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
  },
  lookupArrowButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    paddingHorizontal: 0,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  itemActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryAction: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemRow: { gap: 2 },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemDescription: {
    flex: 1,
  },
  sourceBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.85,
  },
  selectionMeta: {
    fontSize: 12,
    opacity: 0.7,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryRowStrong: {
    paddingTop: 6,
  },
  footerActions: {
    gap: 10,
    alignItems: 'stretch',
  },
});
