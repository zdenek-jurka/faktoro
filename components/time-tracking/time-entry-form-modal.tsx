import { LabeledAutoGrowTextArea } from '@/components/ui/labeled-auto-grow-textarea';
import { NoClientsRequiredNotice } from '@/components/clients/no-clients-required-notice';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, PriceListItemModel } from '@/model';
import { getEffectivePriceDetails } from '@/repositories/client-price-override-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import type { ClientAddReturnTarget } from '@/utils/client-add-navigation';
import { formatPrice } from '@/utils/price-utils';
import { isIos } from '@/utils/platform';
import {
  parseDurationSecondsInput,
  type TimeEntryRateSource,
} from '@/utils/time-entry-edit-fields';
import { getEffectiveBillingIntervalMinutes, roundTimeByInterval } from '@/utils/time-utils';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  View,
} from 'react-native';

type TimeEntryFormMode = 'create' | 'edit';

type TimeEntryFormModalProps = {
  visible: boolean;
  mode: TimeEntryFormMode;
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  clients: ClientModel[];
  selectedClientId?: string;
  onClientChange?: (clientId: string) => void;
  fixedClientName?: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  priceListItems: PriceListItemModel[];
  selectedPriceListItemId: string;
  onPriceListItemChange: (priceListItemId: string) => void;
  entryIsRunning?: boolean;
  startDate?: string;
  onStartDateChange?: (value: string) => void;
  startTime?: string;
  onStartTimeChange?: (value: string) => void;
  endDate?: string;
  onEndDateChange?: (value: string) => void;
  endTime?: string;
  onEndTimeChange?: (value: string) => void;
  durationMinutes?: string;
  onDurationMinutesChange?: (value: string) => void;
  rateSource?: TimeEntryRateSource;
  onRateSourceChange?: (value: TimeEntryRateSource) => void;
  manualRate?: string;
  onManualRateChange?: (value: string) => void;
  manualRateCurrency?: string;
  onManualRateCurrencyChange?: (value: string) => void;
  defaultBillingInterval?: number | null;
  detailsExpanded?: boolean;
  onDetailsExpandedChange?: (expanded: boolean) => void;
  addClientReturnTo?: ClientAddReturnTarget;
  addClientReturnToId?: string;
  disableSubmit?: boolean;
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

function formatDateSummary(dateValue: string, intlLocale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  if (!match) return dateValue;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(intlLocale);
}

export function TimeEntryFormModal({
  visible,
  mode,
  title,
  submitLabel,
  onClose,
  onSubmit,
  clients,
  selectedClientId,
  onClientChange,
  fixedClientName,
  description,
  onDescriptionChange,
  priceListItems,
  selectedPriceListItemId,
  onPriceListItemChange,
  entryIsRunning = false,
  startDate = '',
  onStartDateChange,
  startTime = '',
  onStartTimeChange,
  endDate = '',
  onEndDateChange,
  endTime = '',
  onEndTimeChange,
  durationMinutes = '',
  onDurationMinutesChange,
  rateSource = 'price_list',
  onRateSourceChange,
  manualRate = '',
  onManualRateChange,
  manualRateCurrency,
  onManualRateCurrencyChange,
  defaultBillingInterval,
  detailsExpanded,
  onDetailsExpandedChange,
  addClientReturnTo,
  addClientReturnToId,
  disableSubmit = false,
}: TimeEntryFormModalProps) {
  const colorScheme = useColorScheme();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const modalContentStyle = useBottomSafeAreaStyle(styles.modalContent);
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const intlLocale = normalizeIntlLocale(locale, 'en');

  const getUnitLabel = (unit: string) => {
    if (unit === 'hour') return LL.priceList.units.hour();
    if (unit === 'piece') return LL.priceList.units.piece();
    if (unit === 'project') return LL.priceList.units.project();
    if (unit === 'day') return LL.priceList.units.day();
    if (unit === 'custom') return LL.priceList.units.custom();
    return unit;
  };

  const showClientField = mode === 'create' || !!fixedClientName;
  const [effectiveRate, setEffectiveRate] = useState<{ price: number; currency: string } | null>(
    null,
  );
  const [isRateLoading, setIsRateLoading] = useState(false);

  const selectedPriceListItem = useMemo(
    () => priceListItems.find((item) => item.id === selectedPriceListItemId),
    [priceListItems, selectedPriceListItemId],
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId),
    [clients, selectedClientId],
  );
  const selectedClientName = selectedClient?.name?.trim() || '';
  const showAdvancedEditFields = mode === 'edit' && !entryIsRunning;
  const showManualRateFields =
    showAdvancedEditFields && rateSource === 'manual' && onManualRateChange;
  const [internalDetailsExpanded, setInternalDetailsExpanded] = useState(false);
  const isDetailsExpanded = detailsExpanded ?? internalDetailsExpanded;
  const rateSourceOptions = useMemo(
    () => [LL.timeTracking.rateSourcePriceList(), LL.timeTracking.rateSourceManual()],
    [LL.timeTracking],
  );
  const durationSeconds = useMemo(
    () => parseDurationSecondsInput(durationMinutes),
    [durationMinutes],
  );
  const billingIntervalMinutes = useMemo(
    () => getEffectiveBillingIntervalMinutes(selectedClient, defaultBillingInterval),
    [defaultBillingInterval, selectedClient],
  );
  const summaryDurationSeconds = useMemo(() => {
    if (durationSeconds == null) return null;
    return roundTimeByInterval(durationSeconds, selectedClient, defaultBillingInterval);
  }, [defaultBillingInterval, durationSeconds, selectedClient]);
  const timeAndBillingSummary = useMemo(() => {
    const parts: string[] = [];
    const hasCompleteRange = startDate && startTime && endDate && endTime;

    if (hasCompleteRange) {
      if (startDate === endDate) {
        parts.push(`${formatDateSummary(startDate, intlLocale)}, ${startTime}-${endTime}`);
      } else {
        parts.push(
          `${formatDateSummary(startDate, intlLocale)} ${startTime} - ${formatDateSummary(
            endDate,
            intlLocale,
          )} ${endTime}`,
        );
      }
    }

    if (summaryDurationSeconds != null) {
      parts.push(
        `${billingIntervalMinutes ? LL.timeTracking.billableTime() : LL.timeTracking.actualTime()}: ${formatDuration(
          summaryDurationSeconds,
        )}`,
      );
    }

    return parts.length > 0 ? parts.join(' · ') : LL.timeTracking.timeAndBillingHint();
  }, [
    LL.timeTracking,
    billingIntervalMinutes,
    endDate,
    endTime,
    intlLocale,
    startDate,
    startTime,
    summaryDurationSeconds,
  ]);
  const billingRoundingInfo = useMemo(() => {
    if (!showAdvancedEditFields) return null;

    if (!billingIntervalMinutes || summaryDurationSeconds == null) return null;

    return LL.timeTracking.billingRoundingInfo({
      duration: formatDuration(summaryDurationSeconds),
      interval: billingIntervalMinutes,
    });
  }, [LL.timeTracking, billingIntervalMinutes, showAdvancedEditFields, summaryDurationSeconds]);
  const setDetailsExpanded = (expanded: boolean) => {
    if (detailsExpanded === undefined) {
      setInternalDetailsExpanded(expanded);
    }
    onDetailsExpandedChange?.(expanded);
  };

  useEffect(() => {
    if (!visible && detailsExpanded === undefined) {
      setInternalDetailsExpanded(false);
    }
  }, [detailsExpanded, visible]);

  useEffect(() => {
    let isMounted = true;

    const loadRate = async () => {
      if (!selectedClientId || !selectedPriceListItemId) {
        if (isMounted) {
          setEffectiveRate(null);
          setIsRateLoading(false);
        }
        return;
      }

      setIsRateLoading(true);
      try {
        const rate = await getEffectivePriceDetails(selectedClientId, selectedPriceListItemId);
        if (isMounted) setEffectiveRate(rate);
      } catch {
        if (isMounted) setEffectiveRate(null);
      } finally {
        if (isMounted) setIsRateLoading(false);
      }
    };

    loadRate();
    return () => {
      isMounted = false;
    };
  }, [selectedClientId, selectedPriceListItemId]);

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalOverlay, { backgroundColor: palette.overlayBackdrop }]}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? 24 : 0}
        enabled={isIos}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <ThemedView style={modalContentStyle}>
          <ScrollView
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {title}
            </ThemedText>

            {showClientField && (
              <>
                <ThemedText style={styles.label}>{LL.timeTracking.client()}</ThemedText>
                {fixedClientName ? (
                  <ThemedView
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
                    <ThemedText
                      style={[styles.clientDisplayText, { color: palette.timeHighlight }]}
                    >
                      {fixedClientName}
                    </ThemedText>
                  </ThemedView>
                ) : clients.length === 0 ? (
                  <NoClientsRequiredNotice
                    message={LL.timeTracking.addClientFirst()}
                    returnTo={addClientReturnTo}
                    returnToId={addClientReturnToId}
                    style={styles.notice}
                  />
                ) : (
                  <EntityPickerField
                    value={selectedClientId ?? ''}
                    onValueChange={(value) => onClientChange?.(value)}
                    title={LL.timeTracking.client()}
                    placeholder={selectedClientName || LL.clients.selectClient()}
                    searchPlaceholder={LL.clients.searchPlaceholder()}
                    emptyText={LL.clients.noClients()}
                    emptySearchText={LL.clients.noClientsSearch()}
                    options={clients.map((client) => ({
                      value: client.id,
                      label: client.name,
                    }))}
                  />
                )}
              </>
            )}

            <LabeledAutoGrowTextArea
              label={LL.timeTracking.activity()}
              value={description}
              onChangeText={onDescriptionChange}
              placeholder={LL.timeTracking.activityPlaceholder()}
            />

            {priceListItems.length > 0 && (
              <>
                <ThemedText style={styles.label}>{LL.timeTracking.priceListItem()}</ThemedText>
                <EntityPickerField
                  value={selectedPriceListItemId}
                  onValueChange={onPriceListItemChange}
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
                {!!selectedPriceListItemId && selectedPriceListItem && (
                  <ThemedText style={styles.effectiveRateText}>
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
              </>
            )}

            {showAdvancedEditFields && (
              <View style={styles.disclosureSection}>
                <Pressable
                  style={({ pressed }) => [
                    styles.disclosureHeader,
                    isDetailsExpanded && styles.disclosureHeaderExpanded,
                    {
                      backgroundColor: palette.cardBackground,
                      borderColor: palette.border,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                  onPress={() => setDetailsExpanded(!isDetailsExpanded)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isDetailsExpanded }}
                >
                  <View style={styles.disclosureText}>
                    <ThemedText style={styles.disclosureTitle}>
                      {LL.timeTracking.timeAndBilling()}
                    </ThemedText>
                    <ThemedText
                      style={[styles.disclosureSubtitle, { color: palette.textSecondary }]}
                      numberOfLines={2}
                    >
                      {timeAndBillingSummary}
                    </ThemedText>
                  </View>
                  <IconSymbol
                    name={isDetailsExpanded ? 'chevron.up' : 'chevron.down'}
                    size={22}
                    color={palette.textMuted}
                  />
                </Pressable>

                {isDetailsExpanded && (
                  <View
                    style={[
                      styles.disclosureContent,
                      { backgroundColor: palette.cardBackground, borderColor: palette.border },
                    ]}
                  >
                    <View style={styles.inputRow}>
                      <View style={styles.inputColumn}>
                        <ThemedText style={styles.label}>{LL.timeTracking.startDate()}</ThemedText>
                        <TextInput
                          style={[styles.input, stylesField(palette)]}
                          value={startDate}
                          onChangeText={onStartDateChange}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={palette.placeholder}
                          autoCapitalize="none"
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                      <View style={styles.inputColumn}>
                        <ThemedText style={styles.label}>{LL.timeTracking.startTime()}</ThemedText>
                        <TextInput
                          style={[styles.input, stylesField(palette)]}
                          value={startTime}
                          onChangeText={onStartTimeChange}
                          placeholder="HH:mm"
                          placeholderTextColor={palette.placeholder}
                          autoCapitalize="none"
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                    </View>
                    <View style={styles.inputRow}>
                      <View style={styles.inputColumn}>
                        <ThemedText style={styles.label}>{LL.timeTracking.endDate()}</ThemedText>
                        <TextInput
                          style={[styles.input, stylesField(palette)]}
                          value={endDate}
                          onChangeText={onEndDateChange}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={palette.placeholder}
                          autoCapitalize="none"
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                      <View style={styles.inputColumn}>
                        <ThemedText style={styles.label}>{LL.timeTracking.endTime()}</ThemedText>
                        <TextInput
                          style={[styles.input, stylesField(palette)]}
                          value={endTime}
                          onChangeText={onEndTimeChange}
                          placeholder="HH:mm"
                          placeholderTextColor={palette.placeholder}
                          autoCapitalize="none"
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                    </View>
                    <ThemedText style={styles.label}>
                      {LL.timeTracking.durationMinutes()}
                    </ThemedText>
                    <TextInput
                      style={[styles.input, stylesField(palette)]}
                      value={durationMinutes}
                      onChangeText={onDurationMinutesChange}
                      placeholder="60"
                      placeholderTextColor={palette.placeholder}
                      keyboardType="decimal-pad"
                    />
                    {billingRoundingInfo ? (
                      <View
                        style={[
                          styles.roundingInfo,
                          { backgroundColor: palette.infoBadgeBackground },
                        ]}
                      >
                        <ThemedText
                          style={[styles.roundingInfoText, { color: palette.infoBadgeText }]}
                        >
                          {billingRoundingInfo}
                        </ThemedText>
                      </View>
                    ) : null}

                    <View style={styles.sectionDivider} />
                    <ThemedText style={styles.sectionTitle}>
                      {LL.timeTracking.rateDetails()}
                    </ThemedText>
                    <SegmentedControl
                      style={styles.segmented}
                      values={rateSourceOptions}
                      selectedIndex={rateSource === 'manual' ? 1 : 0}
                      onChange={(event) => {
                        onRateSourceChange?.(
                          event.nativeEvent.selectedSegmentIndex === 1 ? 'manual' : 'price_list',
                        );
                      }}
                    />
                    {showManualRateFields ? (
                      <View style={styles.inputRow}>
                        <View style={styles.inputColumn}>
                          <ThemedText style={styles.label}>
                            {LL.timeTracking.manualRate()}
                          </ThemedText>
                          <TextInput
                            style={[styles.input, stylesField(palette)]}
                            value={manualRate}
                            onChangeText={onManualRateChange}
                            placeholder="0"
                            placeholderTextColor={palette.placeholder}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.currencyColumn}>
                          <ThemedText style={styles.label}>
                            {LL.timeTracking.rateCurrency()}
                          </ThemedText>
                          <TextInput
                            style={[styles.input, stylesField(palette)]}
                            value={manualRateCurrency ?? defaultInvoiceCurrency}
                            onChangeText={onManualRateCurrencyChange}
                            placeholder={defaultInvoiceCurrency}
                            placeholderTextColor={palette.placeholder}
                            autoCapitalize="characters"
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.modalButtons}>
            <Pressable
              style={[
                styles.button,
                styles.cancelButton,
                { backgroundColor: palette.buttonNeutralBackground },
              ]}
              onPress={onClose}
            >
              <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
                {LL.common.cancel()}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                styles.confirmButton,
                {
                  backgroundColor: disableSubmit ? palette.borderStrong : palette.tint,
                },
              ]}
              onPress={onSubmit}
              disabled={disableSubmit}
            >
              <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
                {submitLabel}
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '92%',
    maxWidth: 460,
    maxHeight: '88%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  notice: {
    marginTop: 4,
    marginBottom: 4,
  },
  clientDisplay: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  clientDisplayText: {
    fontSize: 16,
    fontWeight: '600',
  },
  effectiveRateText: {
    marginTop: 2,
    fontSize: 12,
    opacity: 0.7,
  },
  disclosureSection: {
    marginTop: 18,
  },
  disclosureHeader: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  disclosureHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  disclosureText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  disclosureTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  disclosureSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  disclosureContent: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 14,
  },
  sectionDivider: {
    height: 1,
    marginTop: 18,
    marginBottom: 14,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.72,
    marginBottom: 2,
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
  segmented: {
    marginTop: 10,
    marginBottom: 4,
  },
  roundingInfo: {
    marginTop: 10,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  roundingInfoText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  confirmButton: {
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
