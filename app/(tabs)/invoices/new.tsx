import { NoClientsRequiredNotice } from '@/components/clients/no-clients-required-notice';
import { getPriceListUnitLabel } from '@/components/price-list/unit-options';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CrossPlatformDatePicker } from '@/components/ui/cross-platform-date-picker';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCurrencySettings } from '@/hooks/use-currency-settings';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, InvoiceModel, PriceListItemModel } from '@/model';
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
import {
  DEFAULT_CURRENCY_CODE,
  hasMatchingCurrency,
  normalizeCurrencyCode,
} from '@/utils/currency-utils';
import { getErrorMessage } from '@/utils/error-utils';
import {
  DEFAULT_INVOICE_DUE_DAYS,
  DEFAULT_INVOICE_PAYMENT_METHOD,
  INVOICE_PAYMENT_METHOD_OPTIONS,
  addDaysToIsoDate,
  normalizeInvoicePaymentMethod,
  resolveInvoiceDueDays,
  resolveInvoicePaymentMethod,
} from '@/utils/invoice-defaults';
import { formatPrice } from '@/utils/price-utils';
import { isIos } from '@/utils/platform';
import { Q } from '@nozbe/watermelondb';
import { useHeaderHeight } from '@react-navigation/elements';
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
  invoiceNumber: string;
  invoiceNumberManuallyEdited?: boolean;
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

function toLocalISODate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayISODate(): string {
  return toLocalISODate(new Date());
}

function parseISODate(value?: string): number | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return undefined;
  const [year, month, day] = raw.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    return undefined;
  }
  return date.getTime();
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function isIssuedDateBeyondTaxableWindow(
  issuedDateValue?: string,
  taxableDateValue?: string,
): boolean {
  const issuedAt = parseISODate(issuedDateValue);
  const taxableAt = parseISODate(taxableDateValue);
  if (issuedAt == null || taxableAt == null) return false;
  const maxIssuedAt = taxableAt + 15 * 24 * 60 * 60 * 1000;
  return issuedAt > maxIssuedAt;
}

function isDueDateInPast(dueDateValue?: string): boolean {
  const dueAt = parseISODate(dueDateValue);
  const todayAt = parseISODate(todayISODate());
  if (dueAt == null || todayAt == null) return false;
  return dueAt < todayAt;
}

function calculateTotals(items: DraftInvoiceItemInput[], includeVat: boolean) {
  const subtotal = roundCurrency(items.reduce((sum, item) => sum + item.totalPrice, 0));
  const vatTotal = includeVat
    ? roundCurrency(
        items.reduce((sum, item) => sum + item.totalPrice * ((item.vatRate ?? 0) / 100), 0),
      )
    : 0;
  return {
    subtotal,
    vatTotal,
    total: roundCurrency(subtotal + vatTotal),
  };
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

export default function InvoiceDraftScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
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
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isInvoiceNumberManuallyEdited, setIsInvoiceNumberManuallyEdited] =
    useState(isEditingInvoice);
  const [issuedDate, setIssuedDate] = useState(todayISODate());
  const [taxableDate, setTaxableDate] = useState(todayISODate());
  const [dueDate, setDueDate] = useState(todayISODate());
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY_CODE);
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_INVOICE_PAYMENT_METHOD);
  const [settingsDefaultPaymentMethod, setSettingsDefaultPaymentMethod] = useState(
    DEFAULT_INVOICE_PAYMENT_METHOD,
  );
  const [settingsDefaultDueDays, setSettingsDefaultDueDays] = useState(DEFAULT_INVOICE_DUE_DAYS);
  const [headerNote, setHeaderNote] = useState('');
  const [footerNote, setFooterNote] = useState('');
  const [isVatPayer, setIsVatPayer] = useState(false);
  const [canUseTimesheets, setCanUseTimesheets] = useState(false);
  const [canUsePriceList, setCanUsePriceList] = useState(false);
  const [isReviewingClientChange, setIsReviewingClientChange] = useState(false);
  const [invoiceNumberExists, setInvoiceNumberExists] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'issued' | 'taxable' | 'due' | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [items, setItems] = useState<DraftListItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

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
      .observe()
      .subscribe(setClients);

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!restoredHeaderDraft) return;
    setClientId(restoredHeaderDraft.clientId || '');
    setInvoiceNumber(restoredHeaderDraft.invoiceNumber || '');
    setIsInvoiceNumberManuallyEdited(
      isEditingInvoice || !!restoredHeaderDraft.invoiceNumberManuallyEdited,
    );
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
    const loadSettings = async () => {
      const settings = await getSettings();
      setIsVatPayer(!!settings.isVatPayer);
      setSettingsDefaultPaymentMethod(
        normalizeInvoicePaymentMethod(settings.defaultInvoicePaymentMethod),
      );
      setSettingsDefaultDueDays(settings.defaultInvoiceDueDays ?? DEFAULT_INVOICE_DUE_DAYS);
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

  useEffect(() => {
    if (!clientId) {
      setCanUseTimesheets(false);
      setCanUsePriceList(false);
      return;
    }

    const loadSources = async () => {
      const [timesheets, priceItems] = await Promise.all([
        getTimesheetCandidates(clientId),
        getActivePriceListForInvoicing(),
      ]);
      setCanUseTimesheets(timesheets.length > 0);
      setCanUsePriceList(priceItems.length > 0);
    };

    void loadSources();
  }, [clientId]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clientId, clients],
  );
  const selectedClientName = selectedClient?.name?.trim();
  const hasClients = clients.length > 0;

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
      clientId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceNumberManuallyEdited: isInvoiceNumberManuallyEdited,
      issuedDate: issuedDate.trim(),
      taxableDate: isVatPayer ? taxableDate.trim() : undefined,
      dueDate: dueDate.trim(),
      currency: normalizeCurrencyCode(currency),
      paymentMethod: normalizeInvoicePaymentMethod(paymentMethod),
    }),
    [
      clientId,
      currency,
      dueDate,
      invoiceNumber,
      isInvoiceNumberManuallyEdited,
      isVatPayer,
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

  const totals = useMemo(
    () =>
      calculateTotals(
        items.map(({ localId: _localId, ...item }) => item as DraftInvoiceItemInput),
        isVatPayer,
      ),
    [isVatPayer, items],
  );
  const showIssuedDateTaxableWarning = useMemo(
    () =>
      isVatPayer &&
      isIssuedDateBeyondTaxableWindow(headerDraft.issuedDate, headerDraft.taxableDate),
    [headerDraft.issuedDate, headerDraft.taxableDate, isVatPayer],
  );
  const showDueDatePastWarning = useMemo(
    () => isDueDateInPast(headerDraft.dueDate),
    [headerDraft.dueDate],
  );

  const canCreate = hasClients && !!clientId.trim() && !!invoiceNumber.trim() && items.length > 0;
  const normalizedInvoiceCurrency = normalizeCurrencyCode(headerDraft.currency);

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
      invoiceNumber: invoiceNumberOverride ?? headerDraft.invoiceNumber,
      issuedAt: parseISODate(headerDraft.issuedDate) || Date.now(),
      taxableAt: parseISODate(headerDraft.taxableDate),
      dueAt: parseISODate(headerDraft.dueDate),
      currency: headerDraft.currency,
      paymentMethod: headerDraft.paymentMethod,
      headerNote: headerNote.trim() || undefined,
      footerNote: footerNote.trim() || undefined,
      items: items.map(({ localId: _localId, ...item }) => item as DraftInvoiceItemInput),
    }),
    [footerNote, headerDraft, headerNote, items],
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
    if (!headerDraft.clientId || !headerDraft.invoiceNumber.trim()) {
      Alert.alert(LL.common.error(), LL.invoices.errorHeaderRequired());
      return;
    }
    if (!parseISODate(headerDraft.issuedDate) || !parseISODate(headerDraft.dueDate)) {
      Alert.alert(LL.common.error(), LL.invoices.errorInvalidDateFormat());
      return;
    }
    if (isVatPayer && !parseISODate(headerDraft.taxableDate)) {
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

  const getItemUnitLabel = (unit: string) => {
    const normalizedUnit = unit.trim();
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
          {!hasClients && (
            <NoClientsRequiredNotice
              message={LL.timeTracking.addClientFirst()}
              style={styles.notice}
            />
          )}

          <ThemedView style={[styles.sectionCard, stylesField(palette)]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.invoices.draftDetailsSection()}
            </ThemedText>

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
                <ThemedText style={[styles.inlineLoadingText, { color: palette.textSecondary }]}>
                  {LL.common.loading()}
                </ThemedText>
              </View>
            ) : null}

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
                {showDueDatePastWarning ? (
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
            <Pressable
              style={[
                styles.primaryButton,
                {
                  backgroundColor: canCreate ? palette.tint : palette.border,
                },
              ]}
              onPress={handleCreate}
              disabled={!canCreate || isSaving}
            >
              <ThemedText
                style={[
                  styles.primaryButtonText,
                  {
                    color: canCreate ? palette.onTint : palette.icon,
                  },
                ]}
              >
                {isSaving
                  ? LL.common.loading()
                  : isEditingInvoice
                    ? LL.invoices.updateInvoice()
                    : LL.invoices.createInvoice()}
              </ThemedText>
            </Pressable>

            {isEditingInvoice ? (
              <Pressable
                style={[
                  styles.secondaryFooterButton,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.cardBackground,
                    opacity: isSaving ? 0.6 : 1,
                  },
                ]}
                onPress={handleBackWithoutChanges}
                disabled={isSaving}
              >
                <ThemedText style={[styles.secondaryFooterButtonText, { color: palette.text }]}>
                  {LL.invoices.backWithoutChanges()}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          <CrossPlatformDatePicker
            visible={activeDateField !== null}
            value={pickerDate}
            title={LL.invoices.issueDate()}
            cancelLabel={LL.common.cancel()}
            confirmLabel={LL.common.save()}
            onCancel={closeDatePicker}
            onConfirm={confirmDatePicker}
            onValueChange={setPickerDate}
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
  secondaryFooterButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryFooterButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    minHeight: 50,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
