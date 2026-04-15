import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
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
import { useI18nContext } from '@/i18n/i18n-react';
import { PriceListItemModel, TimeEntryModel, VatCodeModel, VatRateModel } from '@/model';
import {
  DraftInvoiceItemInput,
  TimesheetInvoiceCandidate,
  getActivePriceListForInvoicing,
  getTimesheetCandidates,
} from '@/repositories/invoice-repository';
import { getEffectivePriceDetails } from '@/repositories/client-price-override-repository';
import { getSettings } from '@/repositories/settings-repository';
import {
  linkTimesheetEntryToPriceListItem,
  setTimesheetEntryRate,
} from '@/repositories/time-entry-repository';
import { getVatCodes, getVatRates } from '@/repositories/vat-rate-repository';
import { hasMatchingCurrency, normalizeCurrencyCode } from '@/utils/currency-utils';
import { isIos } from '@/utils/platform';
import { getLocalizedVatCodeName, resolvePreferredVatCodeId } from '@/utils/vat-code-utils';
import { Q } from '@nozbe/watermelondb';
import { useHeaderHeight } from '@react-navigation/elements';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
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

type AddSource = 'timesheet' | 'price_list' | 'manual';
type TimeUnit = 'hour' | 'day' | 'manday';
type MissingTimesheetEntry = {
  id: string;
  label: string;
  durationSeconds: number;
  priceListItemId?: string;
  rate?: number;
};

type Palette = (typeof Colors)['light'];

function parseISODate(value?: string): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  const [year, month, day] = raw.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

function resolveVatRateForDate(rates: VatRateModel[], taxableAt: number): number | null {
  const matching = rates.filter(
    (rate) => rate.validFrom <= taxableAt && (rate.validTo == null || rate.validTo >= taxableAt),
  );
  if (matching.length === 0) return null;
  matching.sort((a, b) => b.validFrom - a.validFrom);
  return matching[0].ratePercent;
}

function formatVatRatePercent(ratePercent: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Number.isInteger(ratePercent) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(ratePercent);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

function getEntryQuantityByUnit(seconds: number, unit: string): number {
  if (unit === 'day') return seconds / 86400;
  if (unit === 'manday') return seconds / 28800;
  return seconds / 3600;
}

function convertHourlyRateByUnit(hourlyRate: number, unit: string): number {
  if (unit === 'day') return hourlyRate * 24;
  if (unit === 'manday') return hourlyRate * 8;
  return hourlyRate;
}

function convertUnitRateToHourly(unitRate: number, unit: string): number {
  if (unit === 'day') return unitRate / 24;
  if (unit === 'manday') return unitRate / 8;
  return unitRate;
}

export default function InvoiceNewItemScreen() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const { LL } = useI18nContext();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const params = useLocalSearchParams<{
    editingInvoiceId?: string;
    source?: string;
    headerDraft?: string;
    itemsDraft?: string;
    footerDraft?: string;
    preselectedTimesheetId?: string;
  }>();
  const editingInvoiceId =
    typeof params.editingInvoiceId === 'string' ? params.editingInvoiceId : undefined;

  const headerDraft = useMemo<HeaderDraft | null>(() => {
    if (!params.headerDraft || typeof params.headerDraft !== 'string') return null;
    try {
      return JSON.parse(params.headerDraft) as HeaderDraft;
    } catch {
      return null;
    }
  }, [params.headerDraft]);

  const baseItems = useMemo<DraftInvoiceItemInput[]>(() => {
    if (!params.itemsDraft || typeof params.itemsDraft !== 'string') return [];
    try {
      return JSON.parse(params.itemsDraft) as DraftInvoiceItemInput[];
    } catch {
      return [];
    }
  }, [params.itemsDraft]);
  const footerDraft = useMemo<FooterDraft | null>(() => {
    if (!params.footerDraft || typeof params.footerDraft !== 'string') return null;
    try {
      return JSON.parse(params.footerDraft) as FooterDraft;
    } catch {
      return null;
    }
  }, [params.footerDraft]);
  const usedTimesheetEntryIdsByTimesheet = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of baseItems) {
      if (item.sourceKind !== 'timesheet') continue;
      if (!item.sourceId || !item.sourceEntryId) continue;
      const set = map.get(item.sourceId) || new Set<string>();
      set.add(item.sourceEntryId);
      map.set(item.sourceId, set);
    }
    return map;
  }, [baseItems]);

  const initialSource: AddSource = params.preselectedTimesheetId
    ? 'timesheet'
    : params.source === 'timesheet' || params.source === 'price_list' || params.source === 'manual'
      ? params.source
      : 'manual';

  const [source, setSource] = useState<AddSource>(initialSource);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [timesheets, setTimesheets] = useState<TimesheetInvoiceCandidate[]>([]);
  const [priceListItems, setPriceListItems] = useState<PriceListItemModel[]>([]);
  const [vatCodes, setVatCodes] = useState<VatCodeModel[]>([]);
  const [vatRates, setVatRates] = useState<VatRateModel[]>([]);
  const [isVatPayer, setIsVatPayer] = useState(false);
  const [defaultInvoiceVatCodeId, setDefaultInvoiceVatCodeId] = useState('');
  const [missingTimesheetEntries, setMissingTimesheetEntries] = useState<MissingTimesheetEntry[]>(
    [],
  );
  const [missingEntryPriceItemById, setMissingEntryPriceItemById] = useState<
    Record<string, string>
  >({});
  const [missingEntryManualRateById, setMissingEntryManualRateById] = useState<
    Record<string, string>
  >({});
  const [missingEntryUnitById, setMissingEntryUnitById] = useState<Record<string, TimeUnit>>({});
  const [missingEntryVatCodeById, setMissingEntryVatCodeById] = useState<Record<string, string>>(
    {},
  );
  const [missingEntryPricingSourceById, setMissingEntryPricingSourceById] = useState<
    Record<string, 'price_list' | 'manual'>
  >({});

  const [timesheetId, setTimesheetId] = useState('');
  const [priceItemId, setPriceItemId] = useState('');
  const [priceItemQty, setPriceItemQty] = useState('1');
  const [manualDescription, setManualDescription] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualUnitPrice, setManualUnitPrice] = useState('');
  const [manualUnit, setManualUnit] = useState('');
  const [manualVatCodeId, setManualVatCodeId] = useState('');
  const invoiceCurrency = normalizeCurrencyCode(headerDraft?.currency);
  const compatiblePriceListItems = useMemo(
    () =>
      priceListItems.filter((item) =>
        hasMatchingCurrency(item.defaultPriceCurrency, invoiceCurrency, invoiceCurrency),
      ),
    [invoiceCurrency, priceListItems],
  );

  const selectedTimesheet = timesheets.find((entry) => entry.id === timesheetId);
  const selectedPriceItem = compatiblePriceListItems.find((entry) => entry.id === priceItemId);
  const selectedManualVatCode = vatCodes.find((entry) => entry.id === manualVatCodeId);
  const effectiveTaxableAt =
    parseISODate(headerDraft?.taxableDate) || parseISODate(headerDraft?.issuedDate) || Date.now();
  const displayVatCodes = useMemo(
    () =>
      [...vatCodes].sort((a, b) =>
        getLocalizedVatCodeName(a.name, LL).localeCompare(getLocalizedVatCodeName(b.name, LL)),
      ),
    [LL, vatCodes],
  );
  const resolvedVatRateByCodeId = useMemo(() => {
    const ratesByCodeId = new Map<string, VatRateModel[]>();

    for (const rate of vatRates) {
      if (!rate.vatCodeId) continue;
      const current = ratesByCodeId.get(rate.vatCodeId) || [];
      current.push(rate);
      ratesByCodeId.set(rate.vatCodeId, current);
    }

    const resolved = new Map<string, number | null>();
    for (const vatCode of displayVatCodes) {
      const ratesForCode = ratesByCodeId.get(vatCode.id) || [];
      resolved.set(vatCode.id, resolveVatRateForDate(ratesForCode, effectiveTaxableAt));
    }

    return resolved;
  }, [displayVatCodes, effectiveTaxableAt, vatRates]);
  const vatCodeDisplayLabelById = useMemo(() => {
    const labels = new Map<string, string>();

    for (const vatCode of displayVatCodes) {
      const baseLabel = getLocalizedVatCodeName(vatCode.name, LL);
      const resolvedRate = resolvedVatRateByCodeId.get(vatCode.id);
      const label =
        resolvedRate == null ? baseLabel : `${formatVatRatePercent(resolvedRate)} % - ${baseLabel}`;
      labels.set(vatCode.id, label);
    }

    return labels;
  }, [LL, displayVatCodes, resolvedVatRateByCodeId]);
  const selectedTimesheetNeedsPricing = missingTimesheetEntries.length > 0;

  useEffect(() => {
    setSourcesLoaded(false);

    const load = async () => {
      try {
        const [allTimesheets, allPriceItems, settings] = await Promise.all([
          headerDraft?.clientId
            ? getTimesheetCandidates(headerDraft.clientId)
            : Promise.resolve([]),
          getActivePriceListForInvoicing(),
          getSettings(),
        ]);
        setTimesheets(allTimesheets);
        setPriceListItems(allPriceItems);
        if (allTimesheets.length > 0) {
          const requestedTimesheetId =
            typeof params.preselectedTimesheetId === 'string'
              ? params.preselectedTimesheetId
              : undefined;
          const requestedExists = requestedTimesheetId
            ? allTimesheets.some((sheet) => sheet.id === requestedTimesheetId)
            : false;
          setTimesheetId((current) => {
            if (current) return current;
            if (requestedExists && requestedTimesheetId) return requestedTimesheetId;
            return allTimesheets[0].id;
          });
        } else {
          setTimesheetId('');
        }
        if (allPriceItems.length > 0) setPriceItemId((current) => current || allPriceItems[0].id);

        const vatPayer = !!settings.isVatPayer;
        setIsVatPayer(vatPayer);
        if (!vatPayer) {
          setVatCodes([]);
          setVatRates([]);
          setDefaultInvoiceVatCodeId('');
          setManualVatCodeId('');
          return;
        }

        const [allVatCodes, allVatRates] = await Promise.all([
          getVatCodes().fetch(),
          getVatRates().fetch(),
        ]);
        setVatCodes(allVatCodes);
        setVatRates(allVatRates);
        const resolvedDefaultInvoiceVatCodeId = resolvePreferredVatCodeId(
          allVatCodes,
          settings.defaultInvoiceVatCodeId,
        );
        setDefaultInvoiceVatCodeId(resolvedDefaultInvoiceVatCodeId);
        if (allVatCodes.length > 0) {
          setManualVatCodeId((current) => current || resolvedDefaultInvoiceVatCodeId);
        }
      } catch (error) {
        console.error('Failed to load invoice item sources', error);
      } finally {
        setSourcesLoaded(true);
      }
    };

    void load();
  }, [headerDraft?.clientId, params.preselectedTimesheetId]);

  useEffect(() => {
    if (!timesheetId) {
      setMissingTimesheetEntries([]);
      setMissingEntryPriceItemById({});
      setMissingEntryManualRateById({});
      setMissingEntryUnitById({});
      setMissingEntryVatCodeById({});
      setMissingEntryPricingSourceById({});
      return;
    }

    const loadMissingEntries = async () => {
      try {
        const entries = await database
          .get<TimeEntryModel>(TimeEntryModel.table)
          .query(Q.where('timesheet_id', timesheetId))
          .fetch();

        const usedEntryIds = usedTimesheetEntryIdsByTimesheet.get(timesheetId) || new Set<string>();
        const timesheetRows = entries
          .filter((entry) => !usedEntryIds.has(entry.id))
          .map((entry) => ({
            id: entry.id,
            label: entry.description?.trim() || '-',
            durationSeconds: entry.timesheetDuration ?? entry.duration ?? 0,
            priceListItemId: entry.priceListItemId,
            rate: entry.rate,
          }));
        setMissingTimesheetEntries(timesheetRows);
        setMissingEntryPriceItemById((current) => {
          const next: Record<string, string> = {};
          for (const entry of timesheetRows) {
            const currentValue =
              current[entry.id] &&
              compatiblePriceListItems.some((item) => item.id === current[entry.id])
                ? current[entry.id]
                : '';
            const linkedValue =
              entry.priceListItemId &&
              compatiblePriceListItems.some((item) => item.id === entry.priceListItemId)
                ? entry.priceListItemId
                : '';
            next[entry.id] = currentValue || linkedValue || compatiblePriceListItems[0]?.id || '';
          }
          return next;
        });
        setMissingEntryManualRateById((current) => {
          const next: Record<string, string> = {};
          for (const entry of timesheetRows) {
            next[entry.id] =
              current[entry.id] ||
              (entry.rate != null && Number.isFinite(entry.rate) ? String(entry.rate) : '');
          }
          return next;
        });
        setMissingEntryUnitById((current) => {
          const next: Record<string, TimeUnit> = {};
          for (const entry of timesheetRows) {
            next[entry.id] = current[entry.id] || 'hour';
          }
          return next;
        });
        setMissingEntryVatCodeById((current) => {
          const next: Record<string, string> = {};
          for (const entry of timesheetRows) {
            next[entry.id] = current[entry.id] || defaultInvoiceVatCodeId || vatCodes[0]?.id || '';
          }
          return next;
        });
        setMissingEntryPricingSourceById((current) => {
          const next: Record<string, 'price_list' | 'manual'> = {};
          for (const entry of timesheetRows) {
            const hasCompatibleLinkedItem =
              !!entry.priceListItemId &&
              compatiblePriceListItems.some((item) => item.id === entry.priceListItemId);
            next[entry.id] =
              current[entry.id] || (hasCompatibleLinkedItem ? 'price_list' : 'manual');
          }
          return next;
        });
      } catch (error) {
        console.error('Failed to load missing timesheet entry pricing', error);
        setMissingTimesheetEntries([]);
      }
    };

    void loadMissingEntries();
  }, [
    timesheetId,
    compatiblePriceListItems,
    defaultInvoiceVatCodeId,
    usedTimesheetEntryIdsByTimesheet,
    vatCodes,
  ]);

  useEffect(() => {
    if (!sourcesLoaded) return;
    if (source === 'timesheet' && timesheets.length === 0) setSource('manual');
    if (source === 'price_list' && compatiblePriceListItems.length === 0) setSource('manual');
  }, [source, timesheets.length, compatiblePriceListItems.length, sourcesLoaded]);

  useEffect(() => {
    if (compatiblePriceListItems.length === 0) {
      setPriceItemId('');
      return;
    }

    setPriceItemId((current) =>
      compatiblePriceListItems.some((item) => item.id === current)
        ? current
        : compatiblePriceListItems[0].id,
    );
  }, [compatiblePriceListItems]);

  if (!headerDraft) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: LL.invoices.addItem() }} />
        <View style={styles.centered}>
          <ThemedText>{LL.invoices.errorInvalidDraft()}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const returnToItems = () => {
    router.replace({
      pathname: '/invoices/new',
      params: {
        ...(editingInvoiceId ? { editingInvoiceId } : {}),
        headerDraft: JSON.stringify(headerDraft),
        itemsDraft: JSON.stringify(baseItems),
        ...(footerDraft ? { footerDraft: JSON.stringify(footerDraft) } : {}),
      },
    });
  };

  const goBackWithItems = (newItems: DraftInvoiceItemInput[]) => {
    router.replace({
      pathname: '/invoices/new',
      params: {
        ...(editingInvoiceId ? { editingInvoiceId } : {}),
        headerDraft: JSON.stringify(headerDraft),
        itemsDraft: JSON.stringify([...baseItems, ...newItems]),
        ...(footerDraft ? { footerDraft: JSON.stringify(footerDraft) } : {}),
      },
    });
  };

  const addTimesheetItem = async () => {
    const sheet = timesheets.find((entry) => entry.id === timesheetId);
    if (!sheet) {
      Alert.alert(LL.common.error(), LL.invoices.errorNoItems());
      return;
    }

    const entries = await database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('timesheet_id', sheet.id))
      .fetch();
    if (entries.length === 0) {
      Alert.alert(LL.common.error(), LL.invoices.errorNoItems());
      return;
    }

    if (selectedTimesheetNeedsPricing) {
      const taxableAt =
        parseISODate(headerDraft.taxableDate) || parseISODate(headerDraft.issuedDate) || Date.now();
      const invoiceCurrency = normalizeCurrencyCode(headerDraft.currency);
      const priceListOps: {
        entryId: string;
        priceListItemId: string;
        rate: number;
        rateCurrency: string;
      }[] = [];
      const manualRateOps: {
        entryId: string;
        rate: number;
        rateCurrency: string;
        clearPriceListItemId: true;
      }[] = [];

      for (const missingEntry of missingTimesheetEntries) {
        const source = missingEntryPricingSourceById[missingEntry.id] || 'manual';
        if (source === 'price_list') {
          const selectedPriceListItemId = missingEntryPriceItemById[missingEntry.id];
          if (!selectedPriceListItemId) {
            Alert.alert(LL.common.error(), LL.invoices.errorSelectPriceListItem());
            return;
          }
          const item = compatiblePriceListItems.find(
            (entry) => entry.id === selectedPriceListItemId,
          );
          if (!item) {
            Alert.alert(LL.common.error(), LL.invoices.errorSelectPriceListItem());
            return;
          }
          const itemCurrency = normalizeCurrencyCode(item.defaultPriceCurrency, invoiceCurrency);
          if (!hasMatchingCurrency(itemCurrency, invoiceCurrency, invoiceCurrency)) {
            Alert.alert(
              LL.common.error(),
              LL.invoices.errorItemCurrencyMismatch({
                item: item.name,
                itemCurrency,
                invoiceCurrency,
              }),
            );
            return;
          }
          let effectiveRate = { price: item.defaultPrice, currency: itemCurrency };
          try {
            effectiveRate = await getEffectivePriceDetails(headerDraft.clientId, item.id);
          } catch {
            effectiveRate = { price: item.defaultPrice, currency: itemCurrency };
          }
          const hourlyRate = convertUnitRateToHourly(effectiveRate.price, item.unit || 'hour');
          priceListOps.push({
            entryId: missingEntry.id,
            priceListItemId: item.id,
            rate: hourlyRate,
            rateCurrency: normalizeCurrencyCode(effectiveRate.currency, invoiceCurrency),
          });
          continue;
        }

        const rawRate = missingEntryManualRateById[missingEntry.id];
        const parsedRate = Number.parseFloat(rawRate);
        if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
          Alert.alert(LL.common.error(), LL.invoices.errorInvalidUnitPrice());
          return;
        }
        if (isVatPayer) {
          const vatCodeId = missingEntryVatCodeById[missingEntry.id];
          if (!vatCodeId) {
            Alert.alert(LL.common.error(), LL.invoices.errorVatCodeRequired());
            return;
          }
          const ratesForCode = vatRates.filter((rate) => rate.vatCodeId === vatCodeId);
          const resolvedVatRate = resolveVatRateForDate(ratesForCode, taxableAt);
          if (resolvedVatRate == null) {
            Alert.alert(LL.common.error(), LL.invoices.errorVatRateNotFoundForDate());
            return;
          }
        }
        const selectedUnit = missingEntryUnitById[missingEntry.id] || 'hour';
        const hourlyRate = convertUnitRateToHourly(parsedRate, selectedUnit);
        manualRateOps.push({
          entryId: missingEntry.id,
          rate: hourlyRate,
          rateCurrency: invoiceCurrency,
          clearPriceListItemId: true,
        });
      }

      for (const op of priceListOps) {
        await linkTimesheetEntryToPriceListItem(op);
      }
      for (const op of manualRateOps) {
        await setTimesheetEntryRate(op);
      }
    }

    const refreshedEntries = await database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('timesheet_id', sheet.id))
      .fetch();
    const targetEntryIds = new Set(missingTimesheetEntries.map((entry) => entry.id));
    const scopedEntries = refreshedEntries.filter((entry) => targetEntryIds.has(entry.id));
    const linkedPriceItemIds = Array.from(
      new Set(
        scopedEntries
          .map((entry) => entry.priceListItemId)
          .filter((value): value is string => !!value),
      ),
    );
    const linkedPriceItems = linkedPriceItemIds.length
      ? await database
          .get<PriceListItemModel>(PriceListItemModel.table)
          .query(Q.where('id', Q.oneOf(linkedPriceItemIds)))
          .fetch()
      : [];
    const linkedPriceItemsById = new Map(linkedPriceItems.map((item) => [item.id, item]));

    const taxableAt =
      parseISODate(headerDraft.taxableDate) || parseISODate(headerDraft.issuedDate) || Date.now();
    const draftItems: DraftInvoiceItemInput[] = [];

    for (const entry of scopedEntries) {
      const durationSeconds = entry.timesheetDuration ?? entry.duration ?? 0;
      if (durationSeconds <= 0) continue;
      const durationHours = durationSeconds / 3600;
      const hourlyRate = entry.rate ?? 0;
      const totalPrice = durationHours * hourlyRate;
      if (!Number.isFinite(totalPrice) || totalPrice <= 0) continue;

      const linkedItem = entry.priceListItemId
        ? linkedPriceItemsById.get(entry.priceListItemId)
        : undefined;
      const entryCurrency = normalizeCurrencyCode(
        entry.rateCurrency,
        linkedItem?.defaultPriceCurrency || headerDraft.currency,
      );
      if (!hasMatchingCurrency(entryCurrency, headerDraft.currency, headerDraft.currency)) {
        Alert.alert(
          LL.common.error(),
          LL.invoices.errorEntryCurrencyMismatch({
            currency: entryCurrency,
            invoiceCurrency: normalizeCurrencyCode(headerDraft.currency),
          }),
        );
        return;
      }
      const manualUnit = missingEntryUnitById[entry.id] || 'hour';
      const unit = linkedItem?.unit || manualUnit;
      const quantity = Number(getEntryQuantityByUnit(durationSeconds, unit).toFixed(3));
      const unitPrice = Number(convertHourlyRateByUnit(hourlyRate, unit).toFixed(2));

      const vatCodeId = linkedItem?.vatCodeId || missingEntryVatCodeById[entry.id] || undefined;
      let vatRate: number | undefined;
      if (isVatPayer && vatCodeId) {
        const ratesForCode = vatRates.filter((rate) => rate.vatCodeId === vatCodeId);
        const resolvedVatRate = resolveVatRateForDate(ratesForCode, taxableAt);
        if (resolvedVatRate != null) vatRate = resolvedVatRate;
      }

      draftItems.push({
        sourceKind: 'timesheet',
        sourceId: sheet.id,
        sourceEntryId: entry.id,
        description: entry.description?.trim() || `${LL.timesheets.title()}: ${sheet.label}`,
        quantity,
        unit,
        unitPrice,
        totalPrice: Number(totalPrice.toFixed(2)),
        vatCodeId,
        vatRate,
      });
    }

    if (draftItems.length === 0) {
      Alert.alert(LL.common.error(), LL.invoices.errorNoItems());
      return;
    }

    goBackWithItems(draftItems);
  };

  const addPriceListItem = () => {
    const item = compatiblePriceListItems.find((entry) => entry.id === priceItemId);
    if (!item) {
      Alert.alert(LL.common.error(), LL.invoices.errorSelectPriceListItem());
      return;
    }

    const quantity = Number.parseFloat(priceItemQty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert(LL.common.error(), LL.invoices.errorInvalidQuantity());
      return;
    }
    const itemCurrency = normalizeCurrencyCode(item.defaultPriceCurrency, headerDraft?.currency);
    const invoiceCurrency = normalizeCurrencyCode(headerDraft?.currency);
    if (!hasMatchingCurrency(itemCurrency, invoiceCurrency, invoiceCurrency)) {
      Alert.alert(
        LL.common.error(),
        LL.invoices.errorItemCurrencyMismatch({
          item: item.name,
          itemCurrency,
          invoiceCurrency,
        }),
      );
      return;
    }

    goBackWithItems([
      {
        sourceKind: 'price_list',
        sourceId: item.id,
        description: item.name,
        quantity,
        unit: item.unit,
        unitPrice: item.defaultPrice,
        totalPrice: quantity * item.defaultPrice,
        vatCodeId: item.vatCodeId,
      },
    ]);
  };

  const addManualItem = () => {
    const description = manualDescription.trim();
    if (!description) {
      Alert.alert(LL.common.error(), LL.invoices.errorRequiredItemDescription());
      return;
    }

    const quantity = Number.parseFloat(manualQty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert(LL.common.error(), LL.invoices.errorInvalidQuantity());
      return;
    }

    const unitPrice = Number.parseFloat(manualUnitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      Alert.alert(LL.common.error(), LL.invoices.errorInvalidUnitPrice());
      return;
    }

    let vatRate: number | undefined;
    if (isVatPayer) {
      if (!manualVatCodeId) {
        Alert.alert(LL.common.error(), LL.invoices.errorVatCodeRequired());
        return;
      }
      const ratesForCode = vatRates.filter((rate) => rate.vatCodeId === manualVatCodeId);
      const resolvedVatRate = resolveVatRateForDate(ratesForCode, effectiveTaxableAt);
      if (resolvedVatRate == null) {
        Alert.alert(LL.common.error(), LL.invoices.errorVatRateNotFoundForDate());
        return;
      }
      vatRate = resolvedVatRate;
    }

    goBackWithItems([
      {
        sourceKind: 'manual',
        description,
        quantity,
        unit: manualUnit.trim() || undefined,
        unitPrice,
        totalPrice: quantity * unitPrice,
        vatCodeId: manualVatCodeId || undefined,
        vatRate,
      },
    ]);
  };

  const sourceOptions = [
    ...(timesheets.length > 0
      ? [{ key: 'timesheet' as const, label: LL.invoices.addFromTimesheets() }]
      : []),
    ...(priceListItems.length > 0
      ? [{ key: 'price_list' as const, label: LL.invoices.addFromPriceList() }]
      : []),
    { key: 'manual' as const, label: LL.invoices.addManualItemSection() },
  ];
  const sourceSelectedIndex = Math.max(
    0,
    sourceOptions.findIndex((option) => option.key === source),
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.invoices.addItem() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={isIos ? 'interactive' : 'on-drag'}
        >
          <SegmentedControl
            style={styles.segmented}
            values={sourceOptions.map((option) => option.label)}
            selectedIndex={sourceSelectedIndex}
            onChange={(event) => {
              const selected = sourceOptions[event.nativeEvent.selectedSegmentIndex];
              if (selected) setSource(selected.key);
            }}
          />

          {source === 'timesheet' && (
            <View>
              <Select value={timesheetId} onValueChange={setTimesheetId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedTimesheet
                        ? `${selectedTimesheet.label} (${formatDuration(selectedTimesheet.durationSeconds)})`
                        : LL.invoices.addFromTimesheets()
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{LL.invoices.addFromTimesheets()}</SelectLabel>
                    {timesheets.map((sheet) => (
                      <SelectItem
                        key={sheet.id}
                        value={sheet.id}
                        label={`${sheet.label} (${formatDuration(sheet.durationSeconds)})`}
                      >
                        {`${sheet.label} (${formatDuration(sheet.durationSeconds)})`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              {selectedTimesheetNeedsPricing && (
                <View style={styles.timesheetPricingWrap}>
                  <View style={styles.missingEntriesList}>
                    {missingTimesheetEntries.map((entry) => {
                      const pricingOptions = [
                        ...(compatiblePriceListItems.length > 0
                          ? [{ key: 'price_list' as const, label: LL.invoices.addFromPriceList() }]
                          : []),
                        { key: 'manual' as const, label: LL.invoices.addManualItemSection() },
                      ];
                      const currentPricingSource =
                        missingEntryPricingSourceById[entry.id] ||
                        (compatiblePriceListItems.length > 0 ? 'price_list' : 'manual');
                      const selectedPricingIndex = Math.max(
                        0,
                        pricingOptions.findIndex((option) => option.key === currentPricingSource),
                      );

                      return (
                        <View
                          key={entry.id}
                          style={[styles.missingEntryCard, { borderColor: palette.borderStrong }]}
                        >
                          <ThemedText type="defaultSemiBold">{entry.label}</ThemedText>
                          <ThemedText style={styles.missingEntryMeta}>
                            {formatDuration(entry.durationSeconds)}
                          </ThemedText>
                          <SegmentedControl
                            style={styles.segmented}
                            values={pricingOptions.map((option) => option.label)}
                            selectedIndex={selectedPricingIndex}
                            onChange={(event) => {
                              const selected =
                                pricingOptions[event.nativeEvent.selectedSegmentIndex];
                              if (!selected) return;
                              setMissingEntryPricingSourceById((current) => ({
                                ...current,
                                [entry.id]: selected.key,
                              }));
                            }}
                          />

                          {currentPricingSource === 'price_list' ? (
                            <EntityPickerField
                              value={missingEntryPriceItemById[entry.id] || ''}
                              onValueChange={(value) =>
                                setMissingEntryPriceItemById((current) => ({
                                  ...current,
                                  [entry.id]: value,
                                }))
                              }
                              title={LL.priceList.title()}
                              placeholder={LL.invoices.selectPriceListItem()}
                              searchPlaceholder={LL.priceList.searchPlaceholder()}
                              emptyText={LL.invoices.noCompatiblePriceListItems({
                                currency: invoiceCurrency,
                              })}
                              emptySearchText={LL.invoices.noCompatiblePriceListItems({
                                currency: invoiceCurrency,
                              })}
                              options={compatiblePriceListItems.map((item) => ({
                                value: item.id,
                                label: item.name,
                              }))}
                            />
                          ) : (
                            <>
                              <ThemedText style={styles.label}>{LL.priceList.unit()}</ThemedText>
                              <Select
                                value={missingEntryUnitById[entry.id] || 'hour'}
                                onValueChange={(value) =>
                                  setMissingEntryUnitById((current) => ({
                                    ...current,
                                    [entry.id]: value as TimeUnit,
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={LL.priceList.units.hour()} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    <SelectLabel>{LL.priceList.unit()}</SelectLabel>
                                    <SelectItem value="hour" label={LL.priceList.units.hour()}>
                                      {LL.priceList.units.hour()}
                                    </SelectItem>
                                    <SelectItem value="day" label={LL.priceList.units.day()}>
                                      {LL.priceList.units.day()}
                                    </SelectItem>
                                    <SelectItem value="manday" label={LL.priceList.units.manday()}>
                                      {LL.priceList.units.manday()}
                                    </SelectItem>
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              <TextInput
                                style={[styles.input, stylesField(palette)]}
                                value={missingEntryManualRateById[entry.id] || ''}
                                onChangeText={(value) =>
                                  setMissingEntryManualRateById((current) => ({
                                    ...current,
                                    [entry.id]: value,
                                  }))
                                }
                                placeholder={LL.invoices.unitPrice()}
                                placeholderTextColor={placeholder(palette)}
                                keyboardType="decimal-pad"
                              />
                              {isVatPayer && (
                                <>
                                  <ThemedText style={styles.label}>
                                    {LL.invoices.vatCode()}
                                  </ThemedText>
                                  <Select
                                    value={missingEntryVatCodeById[entry.id] || ''}
                                    onValueChange={(value) =>
                                      setMissingEntryVatCodeById((current) => ({
                                        ...current,
                                        [entry.id]: value,
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue
                                        placeholder={
                                          vatCodeDisplayLabelById.get(
                                            missingEntryVatCodeById[entry.id] || '',
                                          ) || LL.invoices.selectVatCode()
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        <SelectLabel>{LL.invoices.vatCode()}</SelectLabel>
                                        {displayVatCodes.map((vatCode) => (
                                          <SelectItem
                                            key={vatCode.id}
                                            value={vatCode.id}
                                            label={
                                              vatCodeDisplayLabelById.get(vatCode.id) ||
                                              getLocalizedVatCodeName(vatCode.name, LL)
                                            }
                                          >
                                            {vatCodeDisplayLabelById.get(vatCode.id) ||
                                              getLocalizedVatCodeName(vatCode.name, LL)}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                </>
                              )}
                            </>
                          )}
                        </View>
                      );
                    })}
                    {isVatPayer && vatCodes.length === 0 && (
                      <ThemedText style={styles.vatHelperText}>
                        {LL.priceList.noVatCodes()}
                      </ThemedText>
                    )}
                  </View>
                </View>
              )}
              <Pressable
                style={[styles.actionButton, { backgroundColor: palette.tint }]}
                onPress={addTimesheetItem}
              >
                <ThemedText style={[styles.actionButtonText, { color: palette.onTint }]}>
                  {LL.invoices.addItem()}
                </ThemedText>
              </Pressable>
            </View>
          )}

          {source === 'price_list' && (
            <View>
              <EntityPickerField
                value={priceItemId}
                onValueChange={setPriceItemId}
                title={LL.priceList.title()}
                placeholder={selectedPriceItem?.name || LL.invoices.selectPriceListItem()}
                searchPlaceholder={LL.priceList.searchPlaceholder()}
                emptyText={LL.invoices.noCompatiblePriceListItems({ currency: invoiceCurrency })}
                emptySearchText={LL.invoices.noCompatiblePriceListItems({
                  currency: invoiceCurrency,
                })}
                options={compatiblePriceListItems.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />

              <TextInput
                style={[styles.input, stylesField(palette)]}
                value={priceItemQty}
                onChangeText={setPriceItemQty}
                placeholder={LL.invoices.quantity()}
                placeholderTextColor={placeholder(palette)}
                keyboardType="decimal-pad"
              />

              <Pressable
                style={[styles.actionButton, { backgroundColor: palette.tint }]}
                onPress={addPriceListItem}
              >
                <ThemedText style={[styles.actionButtonText, { color: palette.onTint }]}>
                  {LL.invoices.addItem()}
                </ThemedText>
              </Pressable>
            </View>
          )}

          {source === 'manual' && (
            <View>
              <ThemedText style={styles.label}>{LL.invoices.itemDescription()}</ThemedText>
              <TextInput
                style={[styles.input, styles.labeledInput, stylesField(palette)]}
                value={manualDescription}
                onChangeText={setManualDescription}
                placeholder={LL.invoices.itemDescription()}
                placeholderTextColor={placeholder(palette)}
              />

              <View style={styles.inlineFieldRow}>
                <View style={styles.inlineFieldPrimary}>
                  <ThemedText style={styles.label}>{LL.invoices.quantity()}</ThemedText>
                  <TextInput
                    style={[styles.input, styles.labeledInput, stylesField(palette)]}
                    value={manualQty}
                    onChangeText={setManualQty}
                    placeholder={LL.invoices.quantity()}
                    placeholderTextColor={placeholder(palette)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.inlineFieldSecondary}>
                  <ThemedText style={styles.label}>{LL.priceList.unit()}</ThemedText>
                  <TextInput
                    style={[styles.input, styles.labeledInput, stylesField(palette)]}
                    value={manualUnit}
                    onChangeText={setManualUnit}
                    placeholder={LL.priceList.unit()}
                    placeholderTextColor={placeholder(palette)}
                  />
                </View>
              </View>

              <ThemedText style={styles.label}>{LL.invoices.unitPrice()}</ThemedText>
              <TextInput
                style={[styles.input, styles.labeledInput, stylesField(palette)]}
                value={manualUnitPrice}
                onChangeText={setManualUnitPrice}
                placeholder={LL.invoices.unitPrice()}
                placeholderTextColor={placeholder(palette)}
                keyboardType="decimal-pad"
              />

              {isVatPayer && (
                <>
                  <ThemedText style={styles.label}>{LL.invoices.vatCode()}</ThemedText>
                  <Select value={manualVatCodeId} onValueChange={setManualVatCodeId}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          selectedManualVatCode
                            ? vatCodeDisplayLabelById.get(selectedManualVatCode.id) ||
                              getLocalizedVatCodeName(selectedManualVatCode.name, LL)
                            : LL.invoices.selectVatCode()
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>{LL.invoices.vatCode()}</SelectLabel>
                        {displayVatCodes.map((vatCode) => (
                          <SelectItem
                            key={vatCode.id}
                            value={vatCode.id}
                            label={
                              vatCodeDisplayLabelById.get(vatCode.id) ||
                              getLocalizedVatCodeName(vatCode.name, LL)
                            }
                          >
                            {vatCodeDisplayLabelById.get(vatCode.id) ||
                              getLocalizedVatCodeName(vatCode.name, LL)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {vatCodes.length === 0 && (
                    <ThemedText style={styles.vatHelperText}>
                      {LL.priceList.noVatCodes()}
                    </ThemedText>
                  )}
                </>
              )}

              <Pressable
                style={[styles.actionButton, { backgroundColor: palette.tint }]}
                onPress={addManualItem}
              >
                <ThemedText style={[styles.actionButtonText, { color: palette.onTint }]}>
                  {LL.invoices.addItem()}
                </ThemedText>
              </Pressable>
            </View>
          )}

          <Pressable style={styles.cancelButton} onPress={returnToItems}>
            <ThemedText style={styles.cancelButtonText}>{LL.common.cancel()}</ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function stylesField(palette: Palette) {
  return {
    color: palette.text,
    borderColor: palette.inputBorder,
    backgroundColor: palette.inputBackground,
  };
}

function placeholder(palette: Palette) {
  return palette.placeholder;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segmented: { marginBottom: 12 },
  label: { fontSize: 13, opacity: 0.7, marginBottom: 4 },
  inlineFieldRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  inlineFieldPrimary: {
    flex: 1.15,
  },
  inlineFieldSecondary: {
    flex: 0.85,
  },
  timesheetPricingWrap: {
    marginTop: 10,
    marginBottom: 4,
  },
  missingEntriesList: {
    gap: 10,
  },
  missingEntryCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  missingEntryMeta: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 10,
    fontSize: 16,
  },
  labeledInput: {
    marginTop: 0,
  },
  vatHelperText: { fontSize: 12, opacity: 0.7, marginTop: -4, marginBottom: 10 },
  actionButton: {
    marginTop: 12,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: 14,
    opacity: 0.8,
    fontWeight: '600',
  },
});
