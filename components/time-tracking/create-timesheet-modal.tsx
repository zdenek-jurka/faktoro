import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CrossPlatformDatePicker } from '@/components/ui/cross-platform-date-picker';
import { Colors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { CreateTimesheetInput, TimesheetPreset } from '@/repositories/timesheet-repository';
import { getErrorMessage } from '@/utils/error-utils';
import { isIos } from '@/utils/platform';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  View,
} from 'react-native';

type CreateTimesheetPayload = Omit<CreateTimesheetInput, 'clientId'>;

type CreateTimesheetModalProps = {
  visible: boolean;
  clientName: string;
  onClose: () => void;
  onCreate: (payload: CreateTimesheetPayload) => Promise<void>;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string, endOfDay: boolean): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date.getTime();
}

function getPresetRange(periodType: TimesheetPreset): { from: number; to: number } {
  const now = new Date();
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();

  const currentWeekday = (now.getDay() + 6) % 7;
  const startOfCurrentWeek = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - currentWeekday,
    0,
    0,
    0,
    0,
  );

  switch (periodType) {
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      return { from, to };
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
      return { from, to };
    }
    case 'this_quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const from = new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0).getTime();
      const to = new Date(now.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999).getTime();
      return { from, to };
    }
    case 'last_quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const from = new Date(now.getFullYear(), quarterStartMonth - 3, 1, 0, 0, 0, 0).getTime();
      const to = new Date(now.getFullYear(), quarterStartMonth, 0, 23, 59, 59, 999).getTime();
      return { from, to };
    }
    case 'this_year': {
      const from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
      const to = new Date(now.getFullYear(), 12, 0, 23, 59, 59, 999).getTime();
      return { from, to };
    }
    case 'last_year': {
      const from = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0).getTime();
      const to = new Date(now.getFullYear() - 1, 12, 0, 23, 59, 59, 999).getTime();
      return { from, to };
    }
    case 'this_week': {
      const from = startOfCurrentWeek.getTime();
      const to = new Date(from + 6 * 24 * 60 * 60 * 1000 + 86_399_999).getTime();
      return { from, to };
    }
    case 'last_week': {
      const from = new Date(startOfCurrentWeek.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
      const to = new Date(from + 6 * 24 * 60 * 60 * 1000 + 86_399_999).getTime();
      return { from, to };
    }
    case 'last_7_days': {
      const from = new Date(startOfToday - 6 * 24 * 60 * 60 * 1000).getTime();
      return { from, to: endOfToday };
    }
    default:
      return { from: startOfToday, to: endOfToday };
  }
}

export function CreateTimesheetModal({
  visible,
  clientName,
  onClose,
  onCreate,
}: CreateTimesheetModalProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const modalContentStyle = useBottomSafeAreaStyle(styles.modalContent);

  const [periodType, setPeriodType] = useState<TimesheetPreset>('this_month');
  const [label, setLabel] = useState('');
  const [dateFrom, setDateFrom] = useState(formatDateInput(new Date()));
  const [dateTo, setDateTo] = useState(formatDateInput(new Date()));
  const [activeDateField, setActiveDateField] = useState<'from' | 'to' | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const periodOptions = useMemo(
    () => [
      { value: 'all' as const, label: LL.timesheets.periodAll() },
      { value: 'this_month' as const, label: LL.timesheets.periodThisMonth() },
      { value: 'last_month' as const, label: LL.timesheets.periodLastMonth() },
      { value: 'this_quarter' as const, label: LL.timesheets.periodThisQuarter() },
      { value: 'last_quarter' as const, label: LL.timesheets.periodLastQuarter() },
      { value: 'this_year' as const, label: LL.timesheets.periodThisYear() },
      { value: 'last_year' as const, label: LL.timesheets.periodLastYear() },
      { value: 'this_week' as const, label: LL.timesheets.periodThisWeek() },
      { value: 'last_week' as const, label: LL.timesheets.periodLastWeek() },
      { value: 'last_7_days' as const, label: LL.timesheets.periodLast7Days() },
      { value: 'custom' as const, label: LL.timesheets.periodCustom() },
    ],
    [LL.timesheets],
  );
  const selectedPeriodLabel =
    periodOptions.find((option) => option.value === periodType)?.label ||
    LL.timesheets.periodType();

  const formatDisplayDate = (value: string): string => {
    const timestamp = parseDateInput(value, false);
    if (timestamp == null) {
      return value.trim() || '--';
    }
    return new Date(timestamp).toLocaleDateString(intlLocale);
  };

  const resolveRange = (): { from: number; to: number } | null => {
    if (periodType === 'all') {
      return { from: 0, to: Date.now() };
    }

    if (periodType !== 'custom') {
      return getPresetRange(periodType);
    }

    const from = parseDateInput(dateFrom.trim(), false);
    const to = parseDateInput(dateTo.trim(), true);

    if (!from || !to) {
      Alert.alert(LL.common.error(), LL.timesheets.errorInvalidDate());
      return null;
    }

    if (from > to) {
      Alert.alert(LL.common.error(), LL.timesheets.errorInvalidRange());
      return null;
    }

    return { from, to };
  };

  const openDatePicker = (field: 'from' | 'to') => {
    const currentValue = field === 'from' ? dateFrom : dateTo;
    const timestamp = parseDateInput(currentValue, false) ?? Date.now();
    setPickerDate(new Date(timestamp));
    setActiveDateField(field);
  };

  const closeDatePicker = () => {
    setActiveDateField(null);
  };

  const applyDate = (field: 'from' | 'to', selectedDate: Date) => {
    const nextValue = formatDateInput(selectedDate);
    if (field === 'from') {
      setDateFrom(nextValue);
      return;
    }
    setDateTo(nextValue);
  };

  const handleSubmit = async () => {
    const range = resolveRange();
    if (!range) return;

    try {
      setIsSubmitting(true);
      await onCreate({
        periodType,
        periodFrom: range.from,
        periodTo: range.to,
        label: label.trim() || undefined,
      });
      setLabel('');
      onClose();
    } catch (error) {
      Alert.alert(LL.common.error(), getErrorMessage(error, LL.timesheets.errorCreate()));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalOverlay, { backgroundColor: palette.overlayBackdrop }]}
        behavior={isIos ? 'padding' : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <ThemedView style={modalContentStyle}>
          <ScrollView
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {LL.timesheets.createForClient({ client: clientName })}
            </ThemedText>

            <ThemedText style={styles.label}>{LL.timesheets.periodType()}</ThemedText>
            <Select
              value={periodType}
              onValueChange={(value) => setPeriodType(value as TimesheetPreset)}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedPeriodLabel} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{LL.timesheets.periodType()}</SelectLabel>
                  {periodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} label={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {periodType === 'custom' && (
              <View style={styles.customRangeRow}>
                <View style={styles.dateField}>
                  <ThemedText style={styles.label}>{LL.timesheets.dateFrom()}</ThemedText>
                  <Pressable
                    style={[
                      styles.input,
                      {
                        borderColor: palette.inputBorder,
                        backgroundColor: palette.inputBackground,
                      },
                    ]}
                    onPress={() => openDatePicker('from')}
                    android_ripple={{ color: palette.border }}
                    accessibilityRole="button"
                    accessibilityLabel={LL.timesheets.dateFrom()}
                  >
                    <ThemedText style={[styles.dateButtonText, { color: palette.text }]}>
                      {formatDisplayDate(dateFrom)}
                    </ThemedText>
                  </Pressable>
                </View>
                <View style={styles.dateField}>
                  <ThemedText style={styles.label}>{LL.timesheets.dateTo()}</ThemedText>
                  <Pressable
                    style={[
                      styles.input,
                      {
                        borderColor: palette.inputBorder,
                        backgroundColor: palette.inputBackground,
                      },
                    ]}
                    onPress={() => openDatePicker('to')}
                    android_ripple={{ color: palette.border }}
                    accessibilityRole="button"
                    accessibilityLabel={LL.timesheets.dateTo()}
                  >
                    <ThemedText style={[styles.dateButtonText, { color: palette.text }]}>
                      {formatDisplayDate(dateTo)}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            )}

            <ThemedText style={styles.label}>{LL.timesheets.labelOptional()}</ThemedText>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder={LL.timesheets.labelPlaceholder()}
              autoCapitalize="sentences"
              style={[
                styles.input,
                {
                  borderColor: palette.inputBorder,
                  backgroundColor: palette.inputBackground,
                  color: palette.text,
                },
              ]}
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[
                  styles.button,
                  styles.cancelButton,
                  { backgroundColor: palette.buttonNeutralBackground },
                ]}
                onPress={onClose}
                android_ripple={{ color: palette.border }}
                accessibilityRole="button"
                accessibilityLabel={LL.common.cancel()}
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
                    backgroundColor: isSubmitting ? palette.borderStrong : palette.tint,
                  },
                ]}
                onPress={() => void handleSubmit()}
                disabled={isSubmitting}
                android_ripple={{ color: palette.border }}
                accessibilityRole="button"
                accessibilityLabel={LL.timesheets.createButton()}
              >
                <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
                  {LL.timesheets.createButton()}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
        <CrossPlatformDatePicker
          visible={!!activeDateField}
          value={pickerDate}
          title={activeDateField === 'from' ? LL.timesheets.dateFrom() : LL.timesheets.dateTo()}
          cancelLabel={LL.common.cancel()}
          confirmLabel={LL.common.save()}
          onCancel={closeDatePicker}
          onValueChange={setPickerDate}
          onConfirm={(selectedDate) => {
            if (!activeDateField) return;
            applyDate(activeDateField, selectedDate);
            closeDatePicker();
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '84%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 8,
  },
  modalTitle: {
    marginBottom: 8,
  },
  modalBodyContent: {
    paddingBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  customRangeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  dateButtonText: {
    fontSize: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
