import { EntityPickerField } from '@/components/ui/entity-picker-field';
import {
  CrossPlatformDateTimePicker,
  type CrossPlatformDateTimePickerMode,
} from '@/components/ui/cross-platform-date-picker';
import { AppButton } from '@/components/ui/app-button';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LabeledAutoGrowTextArea } from '@/components/ui/labeled-auto-grow-textarea';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { withOpacity } from '@/constants/theme';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, PriceListItemModel, TimeEntryModel } from '@/model';
import { getEffectivePriceDetails } from '@/repositories/client-price-override-repository';
import { getPriceListItems } from '@/repositories/price-list-repository';
import { getSettings, observeSettings } from '@/repositories/settings-repository';
import {
  deleteTimeEntry,
  TIME_ENTRY_REMOTE_CONTROL_FORBIDDEN,
  updateTimeEntry,
} from '@/repositories/time-entry-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { parseISODate } from '@/utils/iso-date';
import { formatPrice } from '@/utils/price-utils';
import { isIos } from '@/utils/platform';
import {
  formatDurationMinutesInput,
  formatRateInput,
  formatTimeEntryDateInput,
  formatTimeEntryTimeInput,
  parseDateTimeInput,
  parseDurationSecondsInput,
  parseRateInput,
  type TimeEntryRateSource,
} from '@/utils/time-entry-edit-fields';
import { getEffectiveBillingIntervalMinutes, roundTimeByInterval } from '@/utils/time-utils';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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

type Props = {
  entryId?: string;
};

type DateTimePickerField = 'startDate' | 'startTime' | 'endDate' | 'endTime';

type TimeInputValidation =
  | { isValid: true; startAt: number; endAt: number; durationSeconds: number }
  | { isValid: false; message: string };

const DURATION_RANGE_TOLERANCE_SECONDS = 59;

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

function getPausedDurationSeconds(entry?: Pick<TimeEntryModel, 'totalPausedDuration'> | null) {
  const pausedDuration = entry?.totalPausedDuration;
  if (typeof pausedDuration !== 'number' || !Number.isFinite(pausedDuration)) return 0;
  return Math.max(0, Math.round(pausedDuration));
}

function getEntryEndTime(entry: TimeEntryModel): number {
  return (
    entry.endTime ??
    entry.startTime + ((entry.duration ?? 0) + getPausedDurationSeconds(entry)) * 1000
  );
}

function formatDateFieldDisplay(value: string, intlLocale: string): string {
  const timestamp = parseISODate(value);
  if (timestamp == null) return value.trim() || '--';
  return new Date(timestamp).toLocaleDateString(intlLocale);
}

function getDateTimePickerMode(field: DateTimePickerField): CrossPlatformDateTimePickerMode {
  return field === 'startTime' || field === 'endTime' ? 'time' : 'date';
}

export function TimeEntryEditScreenContent({ entryId }: Props) {
  const router = useRouter();
  const palette = usePalette();
  const colorScheme = useColorScheme();
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const contentStyle = useBottomSafeAreaStyle(styles.content);

  const [entry, setEntry] = useState<TimeEntryModel | null>(null);
  const [client, setClient] = useState<ClientModel | null>(null);
  const [priceListItems, setPriceListItems] = useState<PriceListItemModel[]>([]);
  const [defaultBillingInterval, setDefaultBillingInterval] = useState<number | undefined>();
  const [effectiveRate, setEffectiveRate] = useState<{ price: number; currency: string } | null>(
    null,
  );
  const [isRateLoading, setIsRateLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [initializedEntryId, setInitializedEntryId] = useState<string | null>(null);
  const [clientLoadFailed, setClientLoadFailed] = useState(false);

  const [description, setDescription] = useState('');
  const [priceListItemId, setPriceListItemId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [rateSource, setRateSource] = useState<TimeEntryRateSource>('price_list');
  const [manualRate, setManualRate] = useState('');
  const [manualRateCurrency, setManualRateCurrency] = useState(defaultInvoiceCurrency);
  const [activeDateTimeField, setActiveDateTimeField] = useState<DateTimePickerField | null>(null);
  const [dateTimePickerValue, setDateTimePickerValue] = useState(() => new Date());

  useEffect(() => {
    if (!entryId) return;

    const subscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .findAndObserve(entryId)
      .subscribe(setEntry);

    return () => subscription.unsubscribe();
  }, [entryId]);

  useEffect(() => {
    if (!entry?.clientId) {
      setClient(null);
      setClientLoadFailed(false);
      return;
    }

    setClientLoadFailed(false);
    const subscription = database
      .get<ClientModel>(ClientModel.table)
      .findAndObserve(entry.clientId)
      .subscribe({
        next: setClient,
        error: (error) => {
          console.error('Error loading time entry client:', error);
          setClient(null);
          setClientLoadFailed(true);
        },
      });

    return () => subscription.unsubscribe();
  }, [entry?.clientId]);

  useEffect(() => {
    const subscription = getPriceListItems(false)
      .observeWithColumns(['name', 'default_price', 'default_price_currency', 'unit', 'is_active'])
      .subscribe(setPriceListItems);
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setDefaultBillingInterval(settings.defaultBillingInterval);
    };
    void loadSettings();

    return observeSettings(
      (settings) => setDefaultBillingInterval(settings?.defaultBillingInterval),
      ['default_billing_interval'],
    );
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRate = async () => {
      if (!client?.id || !priceListItemId) {
        if (isMounted) {
          setEffectiveRate(null);
          setIsRateLoading(false);
        }
        return;
      }

      setIsRateLoading(true);
      try {
        const rate = await getEffectivePriceDetails(client.id, priceListItemId);
        if (isMounted) setEffectiveRate(rate);
      } catch {
        if (isMounted) setEffectiveRate(null);
      } finally {
        if (isMounted) setIsRateLoading(false);
      }
    };

    void loadRate();
    return () => {
      isMounted = false;
    };
  }, [client?.id, priceListItemId]);

  useEffect(() => {
    if (!entry || initializedEntryId === entry.id) return;

    const entryEndTime = getEntryEndTime(entry);
    setDescription(entry.description ?? '');
    setPriceListItemId(entry.priceListItemId || '');
    setStartDate(formatTimeEntryDateInput(entry.startTime));
    setStartTime(formatTimeEntryTimeInput(entry.startTime));
    setEndDate(formatTimeEntryDateInput(entryEndTime));
    setEndTime(formatTimeEntryTimeInput(entryEndTime));
    setDurationMinutes(formatDurationMinutesInput(entry.duration));
    setRateSource(entry.priceListItemId ? 'price_list' : 'manual');
    setManualRate(formatRateInput(entry.rate));
    setManualRateCurrency(normalizeCurrencyCode(entry.rateCurrency, defaultInvoiceCurrency));
    setInitializedEntryId(entry.id);
  }, [defaultInvoiceCurrency, entry, initializedEntryId]);

  const selectedPriceListItem = useMemo(
    () => priceListItems.find((item) => item.id === priceListItemId),
    [priceListItemId, priceListItems],
  );

  const rateSourceOptions = useMemo(
    () => [LL.timeTracking.rateSourcePriceList(), LL.timeTracking.rateSourceManual()],
    [LL.timeTracking],
  );

  const durationSeconds = useMemo(
    () => parseDurationSecondsInput(durationMinutes),
    [durationMinutes],
  );
  const billingIntervalMinutes = useMemo(
    () => getEffectiveBillingIntervalMinutes(client ?? undefined, defaultBillingInterval),
    [client, defaultBillingInterval],
  );
  const roundedDurationSeconds = useMemo(() => {
    if (durationSeconds == null) return null;
    return roundTimeByInterval(durationSeconds, client ?? undefined, defaultBillingInterval);
  }, [client, defaultBillingInterval, durationSeconds]);
  const billingRoundingInfo =
    billingIntervalMinutes && roundedDurationSeconds != null
      ? LL.timeTracking.billingRoundingInfo({
          duration: formatDuration(roundedDurationSeconds),
          interval: billingIntervalMinutes,
        })
      : null;
  const pausedDurationSeconds = getPausedDurationSeconds(entry);
  const hasPausedDuration = pausedDurationSeconds > 0;
  const timeInputValidation = useMemo<TimeInputValidation>(() => {
    if (!entry || entry.isRunning) {
      return { isValid: true, startAt: 0, endAt: 0, durationSeconds: 0 };
    }

    const startAt = parseDateTimeInput(startDate, startTime);
    const endAt = parseDateTimeInput(endDate, endTime);
    const parsedDurationSeconds = parseDurationSecondsInput(durationMinutes);

    if (startAt == null || endAt == null) {
      return { isValid: false, message: LL.timeTracking.errorInvalidTimeInput() };
    }

    const rangeSeconds = Math.round((endAt - startAt) / 1000);
    const workDurationFromRangeSeconds = rangeSeconds - pausedDurationSeconds;
    if (endAt <= startAt || parsedDurationSeconds == null || workDurationFromRangeSeconds <= 0) {
      return { isValid: false, message: LL.timeTracking.errorInvalidDuration() };
    }

    const durationMismatchSeconds = parsedDurationSeconds - workDurationFromRangeSeconds;
    if (Math.abs(durationMismatchSeconds) > DURATION_RANGE_TOLERANCE_SECONDS) {
      return {
        isValid: false,
        message:
          durationMismatchSeconds > 0
            ? LL.timeTracking.errorPausedDurationExceedsRange()
            : LL.timeTracking.errorInvalidDuration(),
      };
    }

    return {
      isValid: true,
      startAt,
      endAt,
      durationSeconds: parsedDurationSeconds,
    };
  }, [
    LL.timeTracking,
    durationMinutes,
    endDate,
    endTime,
    entry,
    pausedDurationSeconds,
    startDate,
    startTime,
  ]);
  const timeValidationError = timeInputValidation.isValid ? null : timeInputValidation.message;

  const syncDurationFromRange = (
    nextStartDate: string,
    nextStartTime: string,
    nextEndDate: string,
    nextEndTime: string,
  ) => {
    const startAt = parseDateTimeInput(nextStartDate, nextStartTime);
    const endAt = parseDateTimeInput(nextEndDate, nextEndTime);
    if (startAt == null || endAt == null || endAt <= startAt) return;
    const rangeSeconds = Math.round((endAt - startAt) / 1000);
    const workDurationSeconds = rangeSeconds - pausedDurationSeconds;
    if (workDurationSeconds <= 0) return;
    setDurationMinutes(formatDurationMinutesInput(workDurationSeconds));
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    syncDurationFromRange(value, startTime, endDate, endTime);
  };

  const handleStartTimeChange = (value: string) => {
    setStartTime(value);
    syncDurationFromRange(startDate, value, endDate, endTime);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    syncDurationFromRange(startDate, startTime, value, endTime);
  };

  const handleEndTimeChange = (value: string) => {
    setEndTime(value);
    syncDurationFromRange(startDate, startTime, endDate, value);
  };

  const handleDurationMinutesChange = (value: string) => {
    setDurationMinutes(value);
    const startAt = parseDateTimeInput(startDate, startTime);
    const nextDurationSeconds = parseDurationSecondsInput(value);
    if (startAt == null || nextDurationSeconds == null) return;

    const nextEndAt = startAt + (nextDurationSeconds + pausedDurationSeconds) * 1000;
    setEndDate(formatTimeEntryDateInput(nextEndAt));
    setEndTime(formatTimeEntryTimeInput(nextEndAt));
  };

  const getPickerTimestamp = (field: DateTimePickerField): number => {
    const isStartField = field === 'startDate' || field === 'startTime';
    const timestamp = parseDateTimeInput(
      isStartField ? startDate : endDate,
      isStartField ? startTime : endTime,
    );
    if (timestamp != null) return timestamp;
    if (isStartField) return entry?.startTime ?? Date.now();
    return entry ? getEntryEndTime(entry) : Date.now();
  };

  const openDateTimePicker = (field: DateTimePickerField) => {
    setDateTimePickerValue(new Date(getPickerTimestamp(field)));
    setActiveDateTimeField(field);
  };

  const closeDateTimePicker = () => {
    setActiveDateTimeField(null);
  };

  const applyDateTimeField = (field: DateTimePickerField, selectedDate: Date) => {
    const timestamp = selectedDate.getTime();
    if (field === 'startDate') {
      handleStartDateChange(formatTimeEntryDateInput(timestamp));
      return;
    }
    if (field === 'startTime') {
      handleStartTimeChange(formatTimeEntryTimeInput(timestamp));
      return;
    }
    if (field === 'endDate') {
      handleEndDateChange(formatTimeEntryDateInput(timestamp));
      return;
    }
    handleEndTimeChange(formatTimeEntryTimeInput(timestamp));
  };

  const confirmDateTimePicker = (selectedDate: Date) => {
    if (!activeDateTimeField) return;
    applyDateTimeField(activeDateTimeField, selectedDate);
    closeDateTimePicker();
  };

  const getDateTimePickerTitle = (field: DateTimePickerField | null): string => {
    if (field === 'startDate') return LL.timeTracking.startDate();
    if (field === 'startTime') return LL.timeTracking.startTime();
    if (field === 'endDate') return LL.timeTracking.endDate();
    if (field === 'endTime') return LL.timeTracking.endTime();
    return LL.timeTracking.timeDetails();
  };

  const getUnitLabel = (unit: string) => {
    if (unit === 'hour') return LL.priceList.units.hour();
    if (unit === 'piece') return LL.priceList.units.piece();
    if (unit === 'project') return LL.priceList.units.project();
    if (unit === 'day') return LL.priceList.units.day();
    if (unit === 'custom') return LL.priceList.units.custom();
    return unit;
  };

  const getErrorMessage = (fallback: string, error: unknown) => {
    if (error instanceof Error && error.message === TIME_ENTRY_REMOTE_CONTROL_FORBIDDEN) {
      return LL.timeTracking.errorControlOtherDevice();
    }
    return fallback;
  };

  const deleteCurrentEntry = async () => {
    if (!entry) return;

    try {
      setIsDeleting(true);
      await deleteTimeEntry(entry.id);
      router.back();
    } catch (error) {
      console.error('Error deleting entry:', error);
      Alert.alert(LL.common.error(), getErrorMessage(LL.timeTracking.errorDeleteEntry(), error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteEntry = () => {
    if (!entry || isSaving || isDeleting) return;

    Alert.alert(LL.timeTracking.deleteEntry(), LL.timeTracking.deleteMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: () => void deleteCurrentEntry(),
      },
    ]);
  };

  const handleSave = async () => {
    if (!entry) return;

    try {
      setIsSaving(true);
      let rate: number | null = null;
      let rateCurrency: string | null = null;
      let timePatch: { startTime?: number; endTime?: number; duration?: number } = {};

      if (!entry.isRunning) {
        if (!timeInputValidation.isValid) {
          Alert.alert(LL.common.error(), timeInputValidation.message);
          return;
        }

        timePatch = {
          startTime: timeInputValidation.startAt,
          endTime: timeInputValidation.endAt,
          duration: timeInputValidation.durationSeconds,
        };
      }

      if (rateSource === 'manual') {
        const parsedRate = parseRateInput(manualRate);
        if (manualRate.trim() && parsedRate == null) {
          Alert.alert(LL.common.error(), LL.timeTracking.errorInvalidRate());
          return;
        }
        rate = parsedRate;
        rateCurrency =
          parsedRate == null
            ? null
            : normalizeCurrencyCode(manualRateCurrency, defaultInvoiceCurrency);
      } else if (priceListItemId) {
        const effectiveRate = await getEffectivePriceDetails(entry.clientId, priceListItemId);
        rate = effectiveRate.price;
        rateCurrency = effectiveRate.currency;
      }

      await updateTimeEntry({
        id: entry.id,
        description: description.trim() || undefined,
        ...timePatch,
        priceListItemId: priceListItemId || null,
        rate,
        rateCurrency,
      });

      router.back();
    } catch (error) {
      console.error('Error updating entry:', error);
      Alert.alert(LL.common.error(), getErrorMessage(LL.timeTracking.errorUpdateEntry(), error));
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = !entry || (!client && !clientLoadFailed);
  const showTimeFields = !!entry && !entry.isRunning;
  const showManualRateFields = rateSource === 'manual';
  const isSubmitting = isSaving || isDeleting;
  const canSave = !isSubmitting && !timeValidationError;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.timeTracking.editTimer(),
          headerRight: () =>
            entry ? (
              <HeaderActions>
                <Pressable
                  style={({ pressed }) => [
                    styles.headerActionButton,
                    { opacity: isSubmitting ? 0.45 : pressed ? 0.65 : 1 },
                  ]}
                  onPress={handleDeleteEntry}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel={LL.timeTracking.deleteEntry()}
                  hitSlop={8}
                >
                  <IconSymbol name="trash.fill" size={18} color={palette.destructive} />
                </Pressable>
              </HeaderActions>
            ) : null,
        }}
      />
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.tint} />
        </View>
      ) : !client ? (
        <View style={styles.unavailableContainer}>
          <ThemedText style={styles.unavailableTitle}>{LL.clients.errorLoadClient()}</ThemedText>
          <ThemedText style={[styles.unavailableText, { color: palette.textSecondary }]}>
            {LL.clients.errorClientIdMissing()}
          </ThemedText>
          <AppButton
            label={LL.timeTracking.backWithoutChanges()}
            onPress={() => router.back()}
            variant="secondary"
          />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.container} behavior={isIos ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={contentStyle}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={isIos ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.clientDisplay,
                {
                  borderColor: palette.timeHighlight,
                  backgroundColor:
                    colorScheme === 'dark'
                      ? withOpacity(palette.timeHighlight, 0.2)
                      : withOpacity(palette.timeHighlight, 0.1),
                },
              ]}
            >
              <ThemedText style={[styles.clientDisplayText, { color: palette.timeHighlight }]}>
                {client.name}
              </ThemedText>
            </View>

            <LabeledAutoGrowTextArea
              label={LL.timeTracking.activity()}
              value={description}
              onChangeText={setDescription}
              placeholder={LL.timeTracking.activityPlaceholder()}
            />

            {priceListItems.length > 0 && (
              <View style={styles.fieldGroup}>
                <ThemedText style={styles.label}>{LL.timeTracking.priceListItem()}</ThemedText>
                <EntityPickerField
                  value={priceListItemId}
                  onValueChange={setPriceListItemId}
                  title={LL.timeTracking.priceListItem()}
                  placeholder={selectedPriceListItem?.name || LL.timeTracking.priceListItem()}
                  searchPlaceholder={LL.priceList.searchPlaceholder()}
                  emptyText={LL.priceList.noItems()}
                  emptySearchText={LL.priceList.noItemsSearch()}
                  noneOption={{
                    value: '',
                    label: LL.timeTracking.noPriceListLink(),
                  }}
                  options={priceListItems.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                />
                {!!priceListItemId && selectedPriceListItem && (
                  <ThemedText style={[styles.hintText, { color: palette.textSecondary }]}>
                    {isRateLoading
                      ? '...'
                      : `${formatPrice(
                          effectiveRate?.price ?? selectedPriceListItem.defaultPrice,
                          effectiveRate?.currency ||
                            normalizeCurrencyCode(
                              selectedPriceListItem.defaultPriceCurrency,
                              defaultInvoiceCurrency,
                            ),
                          intlLocale,
                        )} / ${getUnitLabel(selectedPriceListItem.unit)}`}
                  </ThemedText>
                )}
              </View>
            )}

            {showTimeFields && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>{LL.timeTracking.timeDetails()}</ThemedText>
                <View style={styles.inputRow}>
                  <View style={styles.inputColumn}>
                    <ThemedText style={styles.label}>{LL.timeTracking.startDate()}</ThemedText>
                    <Pressable
                      style={[
                        styles.pickerField,
                        {
                          backgroundColor: palette.inputBackground,
                          borderColor: palette.inputBorder,
                        },
                      ]}
                      onPress={() => openDateTimePicker('startDate')}
                      accessibilityRole="button"
                      accessibilityLabel={LL.timeTracking.startDate()}
                    >
                      <ThemedText style={[styles.pickerFieldText, { color: palette.text }]}>
                        {formatDateFieldDisplay(startDate, intlLocale)}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <View style={styles.inputColumn}>
                    <ThemedText style={styles.label}>{LL.timeTracking.startTime()}</ThemedText>
                    <Pressable
                      style={[
                        styles.pickerField,
                        {
                          backgroundColor: palette.inputBackground,
                          borderColor: palette.inputBorder,
                        },
                      ]}
                      onPress={() => openDateTimePicker('startTime')}
                      accessibilityRole="button"
                      accessibilityLabel={LL.timeTracking.startTime()}
                    >
                      <ThemedText style={[styles.pickerFieldText, { color: palette.text }]}>
                        {startTime || '--'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.inputRow}>
                  <View style={styles.inputColumn}>
                    <ThemedText style={styles.label}>{LL.timeTracking.endDate()}</ThemedText>
                    <Pressable
                      style={[
                        styles.pickerField,
                        {
                          backgroundColor: palette.inputBackground,
                          borderColor: palette.inputBorder,
                        },
                      ]}
                      onPress={() => openDateTimePicker('endDate')}
                      accessibilityRole="button"
                      accessibilityLabel={LL.timeTracking.endDate()}
                    >
                      <ThemedText style={[styles.pickerFieldText, { color: palette.text }]}>
                        {formatDateFieldDisplay(endDate, intlLocale)}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <View style={styles.inputColumn}>
                    <ThemedText style={styles.label}>{LL.timeTracking.endTime()}</ThemedText>
                    <Pressable
                      style={[
                        styles.pickerField,
                        {
                          backgroundColor: palette.inputBackground,
                          borderColor: palette.inputBorder,
                        },
                      ]}
                      onPress={() => openDateTimePicker('endTime')}
                      accessibilityRole="button"
                      accessibilityLabel={LL.timeTracking.endTime()}
                    >
                      <ThemedText style={[styles.pickerFieldText, { color: palette.text }]}>
                        {endTime || '--'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
                {hasPausedDuration ? (
                  <View
                    style={[styles.pausedInfo, { backgroundColor: palette.infoBadgeBackground }]}
                  >
                    <View style={styles.pausedInfoRow}>
                      <ThemedText
                        style={[styles.pausedInfoLabel, { color: palette.infoBadgeText }]}
                      >
                        {LL.timeTracking.pausedDuration()}
                      </ThemedText>
                      <ThemedText
                        style={[styles.pausedInfoValue, { color: palette.infoBadgeText }]}
                      >
                        {formatDuration(pausedDurationSeconds)}
                      </ThemedText>
                    </View>
                    <ThemedText style={[styles.pausedInfoHint, { color: palette.infoBadgeText }]}>
                      {LL.timeTracking.workDurationExcludesPausesHint()}
                    </ThemedText>
                  </View>
                ) : null}
                {timeValidationError ? (
                  <View
                    style={[
                      styles.validationError,
                      {
                        backgroundColor: withOpacity(palette.destructive, 0.12),
                        borderColor: withOpacity(palette.destructive, 0.35),
                      },
                    ]}
                  >
                    <ThemedText
                      style={[styles.validationErrorText, { color: palette.destructive }]}
                    >
                      {timeValidationError}
                    </ThemedText>
                  </View>
                ) : null}
                <ThemedText style={styles.label}>
                  {LL.timeTracking.workDurationMinutes()}
                </ThemedText>
                <TextInput
                  style={[styles.input, stylesField(palette)]}
                  value={durationMinutes}
                  onChangeText={handleDurationMinutesChange}
                  placeholder="60"
                  placeholderTextColor={palette.placeholder}
                  keyboardType="decimal-pad"
                />
                {billingRoundingInfo ? (
                  <View
                    style={[styles.roundingInfo, { backgroundColor: palette.infoBadgeBackground }]}
                  >
                    <ThemedText style={[styles.roundingInfoText, { color: palette.infoBadgeText }]}>
                      {billingRoundingInfo}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            )}

            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>{LL.timeTracking.rateDetails()}</ThemedText>
              <SegmentedControl
                style={styles.segmented}
                values={rateSourceOptions}
                selectedIndex={rateSource === 'manual' ? 1 : 0}
                onChange={(event) => {
                  setRateSource(
                    event.nativeEvent.selectedSegmentIndex === 1 ? 'manual' : 'price_list',
                  );
                }}
              />
              {showManualRateFields ? (
                <View style={styles.inputRow}>
                  <View style={styles.inputColumn}>
                    <ThemedText style={styles.label}>{LL.timeTracking.manualRate()}</ThemedText>
                    <TextInput
                      style={[styles.input, stylesField(palette)]}
                      value={manualRate}
                      onChangeText={setManualRate}
                      placeholder="0"
                      placeholderTextColor={palette.placeholder}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.currencyColumn}>
                    <ThemedText style={styles.label}>{LL.timeTracking.rateCurrency()}</ThemedText>
                    <TextInput
                      style={[styles.input, stylesField(palette)]}
                      value={manualRateCurrency}
                      onChangeText={setManualRateCurrency}
                      placeholder={defaultInvoiceCurrency}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.footerActions}>
              <AppButton
                label={isSaving ? LL.common.loading() : LL.common.save()}
                onPress={handleSave}
                disabled={!canSave}
                loading={isSaving}
              />

              <AppButton
                label={LL.timeTracking.backWithoutChanges()}
                onPress={() => router.back()}
                disabled={isSubmitting}
                variant="secondary"
              />
            </View>
            <CrossPlatformDateTimePicker
              visible={activeDateTimeField !== null}
              value={dateTimePickerValue}
              mode={activeDateTimeField ? getDateTimePickerMode(activeDateTimeField) : 'date'}
              title={getDateTimePickerTitle(activeDateTimeField)}
              cancelLabel={LL.common.cancel()}
              confirmLabel={LL.common.save()}
              onCancel={closeDateTimePicker}
              onValueChange={setDateTimePickerValue}
              onConfirm={confirmDateTimePicker}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </ThemedView>
  );
}

function stylesField(palette: ReturnType<typeof usePalette>) {
  return {
    backgroundColor: palette.inputBackground,
    borderColor: palette.inputBorder,
    color: palette.text,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableContainer: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  unavailableTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  unavailableText: {
    fontSize: 14,
    textAlign: 'center',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  clientDisplay: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  clientDisplayText: {
    fontSize: 16,
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 8,
  },
  headerActionButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    paddingTop: 4,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.72,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputColumn: {
    flex: 1,
  },
  currencyColumn: {
    width: 104,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  pickerField: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  pickerFieldText: {
    fontSize: 16,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 16,
  },
  roundingInfo: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  roundingInfoText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  pausedInfo: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  pausedInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pausedInfoLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  pausedInfoValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pausedInfoHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  validationError: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  validationErrorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  segmented: {
    marginBottom: 4,
  },
  footerActions: {
    gap: 10,
    alignItems: 'stretch',
    paddingTop: 8,
  },
});
