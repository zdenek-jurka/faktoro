import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { isSyncEnabled } from '@/constants/features';
import { getSwitchColors, withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
  type DeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import {
  resolveDocumentSeriesCounter,
  setDocumentSeriesCounterNextNumber,
  setLocalSeriesDeviceCode,
} from '@/repositories/document-numbering-repository';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { parsePositiveIntegerInput } from '@/utils/number-input';
import { showConfirm } from '@/utils/platform-alert';
import { isIos } from '@/utils/platform';
import {
  buildSeriesIdentifier,
  getSeriesPaddingFromPattern,
  hasSeriesDeviceToken,
} from '@/utils/series-utils';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

const INVOICE_SERIES_FALLBACK_PATTERN = '{YY}####';
const TIMESHEET_SERIES_FALLBACK_PATTERN = 'TS-{YY}-####';
const SERIES_PATTERN_EXAMPLE = '{YY}1####';
const SERIES_DEVICE_PATTERN_EXAMPLE = '{YY}{DEV}####';
const SERIES_DEVICE_TOKEN = '{DEV}';
const SERIES_TOKEN_LIST = '{YYYY}, {YY}, {MM}, {DD}, {DEV}';

function buildSeriesPreview({
  pattern,
  nextNumber,
  padding,
  perDevice,
  deviceCode,
  fallbackPattern,
  fallbackPrefix,
}: {
  pattern: string;
  nextNumber: string;
  padding: string;
  perDevice: boolean;
  deviceCode: string;
  fallbackPattern: string;
  fallbackPrefix: string;
}): string {
  return buildSeriesIdentifier({
    pattern,
    fallbackPattern,
    nextNumber,
    padding,
    perDevice,
    deviceCode,
    fallbackPrefix,
  });
}

export default function SettingsNumberingScreen() {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const headerHeight = useHeaderHeight();
  const contentStyle = useBottomSafeAreaStyle(styles.content);

  const [invoiceSeriesPattern, setInvoiceSeriesPattern] = useState('');
  const [invoiceSeriesNextNumber, setInvoiceSeriesNextNumber] = useState('');
  const [initialInvoiceSeriesNextNumber, setInitialInvoiceSeriesNextNumber] = useState(1);
  const [invoiceSeriesPerDevice, setInvoiceSeriesPerDevice] = useState(false);
  const [invoiceSeriesDeviceCode, setInvoiceSeriesDeviceCode] = useState('');

  const [timesheetSeriesPattern, setTimesheetSeriesPattern] = useState('');
  const [timesheetSeriesNextNumber, setTimesheetSeriesNextNumber] = useState('');
  const [initialTimesheetSeriesNextNumber, setInitialTimesheetSeriesNextNumber] = useState(1);
  const [timesheetSeriesPerDevice, setTimesheetSeriesPerDevice] = useState(false);
  const [timesheetSeriesDeviceCode, setTimesheetSeriesDeviceCode] = useState('');
  const [deviceSyncSettings, setDeviceSyncSettings] = useState<DeviceSyncSettings | null>(null);

  const invoiceSeriesPadding = getSeriesPaddingFromPattern({
    pattern: invoiceSeriesPattern,
    fallbackPattern: INVOICE_SERIES_FALLBACK_PATTERN,
  });
  const timesheetSeriesPadding = getSeriesPaddingFromPattern({
    pattern: timesheetSeriesPattern,
    fallbackPattern: TIMESHEET_SERIES_FALLBACK_PATTERN,
  });
  const invoiceSeriesHasDeviceToken = hasSeriesDeviceToken({
    pattern: invoiceSeriesPattern,
    fallbackPattern: INVOICE_SERIES_FALLBACK_PATTERN,
  });
  const timesheetSeriesHasDeviceToken = hasSeriesDeviceToken({
    pattern: timesheetSeriesPattern,
    fallbackPattern: TIMESHEET_SERIES_FALLBACK_PATTERN,
  });
  const resolvedInvoiceSeriesPerDevice = invoiceSeriesPerDevice || invoiceSeriesHasDeviceToken;
  const resolvedTimesheetSeriesPerDevice =
    timesheetSeriesPerDevice || timesheetSeriesHasDeviceToken;

  const invoicePreviewNumber = buildSeriesPreview({
    pattern: invoiceSeriesPattern,
    nextNumber: invoiceSeriesNextNumber,
    padding: String(invoiceSeriesPadding),
    perDevice: resolvedInvoiceSeriesPerDevice,
    deviceCode: invoiceSeriesDeviceCode,
    fallbackPattern: INVOICE_SERIES_FALLBACK_PATTERN,
    fallbackPrefix: 'INV',
  });

  const timesheetPreviewNumber = buildSeriesPreview({
    pattern: timesheetSeriesPattern,
    nextNumber: timesheetSeriesNextNumber,
    padding: String(timesheetSeriesPadding),
    perDevice: resolvedTimesheetSeriesPerDevice,
    deviceCode: timesheetSeriesDeviceCode,
    fallbackPattern: TIMESHEET_SERIES_FALLBACK_PATTERN,
    fallbackPrefix: 'TS',
  });
  const invoiceSeriesUsesDeviceToken =
    resolvedInvoiceSeriesPerDevice && invoiceSeriesHasDeviceToken;
  const timesheetSeriesUsesDeviceToken =
    resolvedTimesheetSeriesPerDevice && timesheetSeriesHasDeviceToken;
  const showInvoicePerDeviceMissingTokenWarning =
    resolvedInvoiceSeriesPerDevice && !invoiceSeriesUsesDeviceToken;
  const showTimesheetPerDeviceMissingTokenWarning =
    resolvedTimesheetSeriesPerDevice && !timesheetSeriesUsesDeviceToken;
  const showInvoiceDeviceTokenWarning =
    isSyncEnabled && !!deviceSyncSettings?.syncFeatureEnabled && !resolvedInvoiceSeriesPerDevice;

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      const deviceSettings = await getDeviceSyncSettings(settings);
      const invoiceCounter = await resolveDocumentSeriesCounter({
        kind: 'invoice',
        perDevice: settings.invoiceSeriesPerDevice,
        sharedDeviceCode: settings.invoiceSeriesDeviceCode,
        syncDeviceName: deviceSettings.syncDeviceName,
        syncDeviceId: deviceSettings.syncDeviceId,
        sharedNextNumber: settings.invoiceSeriesNextNumber,
      });
      const timesheetCounter = await resolveDocumentSeriesCounter({
        kind: 'timesheet',
        perDevice: settings.timesheetSeriesPerDevice,
        sharedDeviceCode: settings.timesheetSeriesDeviceCode,
        syncDeviceName: deviceSettings.syncDeviceName,
        syncDeviceId: deviceSettings.syncDeviceId,
        sharedNextNumber: settings.timesheetSeriesNextNumber,
      });

      setInvoiceSeriesPattern(settings.invoiceSeriesPattern || INVOICE_SERIES_FALLBACK_PATTERN);
      const savedInvoiceNextNumber = invoiceCounter.nextNumber;
      setInvoiceSeriesNextNumber(String(savedInvoiceNextNumber));
      setInitialInvoiceSeriesNextNumber(savedInvoiceNextNumber);
      setInvoiceSeriesPerDevice(!!settings.invoiceSeriesPerDevice);
      setInvoiceSeriesDeviceCode(invoiceCounter.deviceCode);

      setTimesheetSeriesPattern(
        settings.timesheetSeriesPattern || TIMESHEET_SERIES_FALLBACK_PATTERN,
      );
      const savedTimesheetNextNumber = timesheetCounter.nextNumber;
      setTimesheetSeriesNextNumber(String(savedTimesheetNextNumber));
      setInitialTimesheetSeriesNextNumber(savedTimesheetNextNumber);
      setTimesheetSeriesPerDevice(!!settings.timesheetSeriesPerDevice);
      setTimesheetSeriesDeviceCode(timesheetCounter.deviceCode);
    };

    void loadSettings();
  }, []);

  useEffect(() => observeDeviceSyncSettings(setDeviceSyncSettings), []);

  useEffect(() => {
    if (invoiceSeriesHasDeviceToken && !invoiceSeriesPerDevice) {
      setInvoiceSeriesPerDevice(true);
    }
  }, [invoiceSeriesHasDeviceToken, invoiceSeriesPerDevice]);

  useEffect(() => {
    if (timesheetSeriesHasDeviceToken && !timesheetSeriesPerDevice) {
      setTimesheetSeriesPerDevice(true);
    }
  }, [timesheetSeriesHasDeviceToken, timesheetSeriesPerDevice]);

  const handleSave = async () => {
    try {
      const normalizedInvoiceSeriesNextNumber = parsePositiveIntegerInput(invoiceSeriesNextNumber);
      const normalizedTimesheetSeriesNextNumber =
        parsePositiveIntegerInput(timesheetSeriesNextNumber);

      if (
        !Number.isFinite(normalizedInvoiceSeriesNextNumber) ||
        !Number.isFinite(normalizedTimesheetSeriesNextNumber)
      ) {
        Alert.alert(LL.common.error(), LL.settings.saveError());
        return;
      }

      if (invoiceSeriesHasDeviceToken && !invoiceSeriesDeviceCode.trim()) {
        Alert.alert(
          LL.common.error(),
          LL.settings.seriesDeviceCodeRequired({ deviceToken: SERIES_DEVICE_TOKEN }),
        );
        return;
      }

      if (timesheetSeriesHasDeviceToken && !timesheetSeriesDeviceCode.trim()) {
        Alert.alert(
          LL.common.error(),
          LL.settings.seriesDeviceCodeRequired({ deviceToken: SERIES_DEVICE_TOKEN }),
        );
        return;
      }

      if (normalizedInvoiceSeriesNextNumber !== initialInvoiceSeriesNextNumber) {
        const confirmed = await showConfirm({
          title: LL.settings.seriesNextNumberChangeConfirmTitle(),
          message: LL.settings.seriesNextNumberChangeConfirmMessage(),
          confirmText: LL.settings.seriesNextNumberChangeConfirmContinue(),
          cancelText: LL.common.cancel(),
        });
        if (!confirmed) {
          setInvoiceSeriesNextNumber(String(initialInvoiceSeriesNextNumber));
          return;
        }
      }

      if (normalizedTimesheetSeriesNextNumber !== initialTimesheetSeriesNextNumber) {
        const confirmed = await showConfirm({
          title: LL.settings.seriesNextNumberChangeConfirmTitle(),
          message: LL.settings.seriesNextNumberChangeConfirmMessage(),
          confirmText: LL.settings.seriesNextNumberChangeConfirmContinue(),
          cancelText: LL.common.cancel(),
        });
        if (!confirmed) {
          setTimesheetSeriesNextNumber(String(initialTimesheetSeriesNextNumber));
          return;
        }
      }

      const settings = await getSettings();
      const deviceSettings = await getDeviceSyncSettings(settings);

      await updateSettings({
        invoiceSeriesPrefix: null,
        invoiceSeriesPattern: invoiceSeriesPattern.trim() || null,
        invoiceSeriesNextNumber: resolvedInvoiceSeriesPerDevice
          ? undefined
          : normalizedInvoiceSeriesNextNumber,
        invoiceSeriesPadding,
        invoiceSeriesPerDevice: resolvedInvoiceSeriesPerDevice,
        invoiceSeriesDeviceCode: null,
        timesheetSeriesPrefix: null,
        timesheetSeriesPattern: timesheetSeriesPattern.trim() || null,
        timesheetSeriesNextNumber: resolvedTimesheetSeriesPerDevice
          ? undefined
          : normalizedTimesheetSeriesNextNumber,
        timesheetSeriesPadding,
        timesheetSeriesPerDevice: resolvedTimesheetSeriesPerDevice,
        timesheetSeriesDeviceCode: null,
      });

      await Promise.all([
        setLocalSeriesDeviceCode('invoice', invoiceSeriesDeviceCode),
        setLocalSeriesDeviceCode('timesheet', timesheetSeriesDeviceCode),
      ]);

      if (resolvedInvoiceSeriesPerDevice) {
        const invoiceCounter = await resolveDocumentSeriesCounter({
          kind: 'invoice',
          perDevice: true,
          sharedDeviceCode: null,
          syncDeviceName: deviceSettings.syncDeviceName,
          syncDeviceId: deviceSettings.syncDeviceId,
          sharedNextNumber: settings.invoiceSeriesNextNumber,
        });
        await setDocumentSeriesCounterNextNumber(invoiceCounter, normalizedInvoiceSeriesNextNumber);
      }

      if (resolvedTimesheetSeriesPerDevice) {
        const timesheetCounter = await resolveDocumentSeriesCounter({
          kind: 'timesheet',
          perDevice: true,
          sharedDeviceCode: null,
          syncDeviceName: deviceSettings.syncDeviceName,
          syncDeviceId: deviceSettings.syncDeviceId,
          sharedNextNumber: settings.timesheetSeriesNextNumber,
        });
        await setDocumentSeriesCounterNextNumber(
          timesheetCounter,
          normalizedTimesheetSeriesNextNumber,
        );
      }

      setInvoiceSeriesNextNumber(String(normalizedInvoiceSeriesNextNumber));
      setInitialInvoiceSeriesNextNumber(normalizedInvoiceSeriesNextNumber);
      setTimesheetSeriesNextNumber(String(normalizedTimesheetSeriesNextNumber));
      setInitialTimesheetSeriesNextNumber(normalizedTimesheetSeriesNextNumber);
      setInvoiceSeriesPerDevice(resolvedInvoiceSeriesPerDevice);
      setTimesheetSeriesPerDevice(resolvedTimesheetSeriesPerDevice);

      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving numbering settings:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.numberingTitle() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={[styles.section, sectionCard(palette)]}>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.numberingSubtitle()}
            </ThemedText>

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.settings.invoiceSeriesTitle()}
            </ThemedText>
            <TextInput
              style={[styles.input, stylesField(palette)]}
              placeholder={LL.settings.invoiceSeriesPattern({ example: SERIES_PATTERN_EXAMPLE })}
              placeholderTextColor={placeholder(palette)}
              value={invoiceSeriesPattern}
              onChangeText={setInvoiceSeriesPattern}
              autoCapitalize="characters"
            />
            <ThemedText style={styles.hintText}>
              {LL.settings.invoiceSeriesPatternHelp({
                tokens: SERIES_TOKEN_LIST,
                example: SERIES_PATTERN_EXAMPLE,
              })}
            </ThemedText>
            <ThemedView style={[styles.previewBox, sectionCard(palette)]}>
              <ThemedText style={styles.previewLabel}>
                {LL.settings.invoiceSeriesPreviewLabel()}
              </ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.previewValue}>
                {invoicePreviewNumber}
              </ThemedText>
            </ThemedView>
            <TextInput
              style={[styles.input, stylesField(palette)]}
              placeholder={LL.settings.invoiceSeriesNextNumber()}
              placeholderTextColor={placeholder(palette)}
              value={invoiceSeriesNextNumber}
              onChangeText={setInvoiceSeriesNextNumber}
              keyboardType="number-pad"
            />
            <View style={styles.switchRow}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                {LL.settings.invoiceSeriesPerDevice()}
              </ThemedText>
              <Switch
                value={resolvedInvoiceSeriesPerDevice}
                onValueChange={setInvoiceSeriesPerDevice}
                {...getSwitchColors(palette)}
              />
            </View>
            {resolvedInvoiceSeriesPerDevice && (
              <TextInput
                style={[styles.input, stylesField(palette)]}
                placeholder={LL.settings.invoiceSeriesDeviceCode()}
                placeholderTextColor={placeholder(palette)}
                value={invoiceSeriesDeviceCode}
                onChangeText={setInvoiceSeriesDeviceCode}
                autoCapitalize="characters"
              />
            )}
            {showInvoicePerDeviceMissingTokenWarning && (
              <View
                style={[
                  styles.warningBox,
                  {
                    borderColor: withOpacity(palette.timerPause, 0.85),
                    backgroundColor: withOpacity(palette.timerPause, 0.12),
                  },
                ]}
              >
                <IconSymbol
                  name="exclamationmark.triangle.fill"
                  size={18}
                  color={palette.timerPause}
                />
                <ThemedText style={[styles.warningText, { color: palette.text }]}>
                  {LL.settings.seriesPerDeviceMissingTokenWarning({
                    deviceToken: SERIES_DEVICE_TOKEN,
                  })}
                </ThemedText>
              </View>
            )}
            {!showInvoicePerDeviceMissingTokenWarning && showInvoiceDeviceTokenWarning && (
              <View
                style={[
                  styles.warningBox,
                  {
                    borderColor: withOpacity(palette.timerPause, 0.85),
                    backgroundColor: withOpacity(palette.timerPause, 0.12),
                  },
                ]}
              >
                <IconSymbol
                  name="exclamationmark.triangle.fill"
                  size={18}
                  color={palette.timerPause}
                />
                <ThemedText style={[styles.warningText, { color: palette.text }]}>
                  {LL.settings.invoiceSeriesDeviceTokenWarning({
                    deviceToken: SERIES_DEVICE_TOKEN,
                    example: SERIES_DEVICE_PATTERN_EXAMPLE,
                  })}
                </ThemedText>
              </View>
            )}

            <ThemedText type="subtitle" style={styles.seriesSectionTitle}>
              {LL.settings.timesheetSeriesTitle()}
            </ThemedText>
            <TextInput
              style={[styles.input, stylesField(palette)]}
              placeholder={LL.settings.invoiceSeriesPattern({ example: SERIES_PATTERN_EXAMPLE })}
              placeholderTextColor={placeholder(palette)}
              value={timesheetSeriesPattern}
              onChangeText={setTimesheetSeriesPattern}
              autoCapitalize="characters"
            />
            <ThemedText style={styles.hintText}>
              {LL.settings.invoiceSeriesPatternHelp({
                tokens: SERIES_TOKEN_LIST,
                example: SERIES_PATTERN_EXAMPLE,
              })}
            </ThemedText>
            <ThemedView style={[styles.previewBox, sectionCard(palette)]}>
              <ThemedText style={styles.previewLabel}>
                {LL.settings.invoiceSeriesPreviewLabel()}
              </ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.previewValue}>
                {timesheetPreviewNumber}
              </ThemedText>
            </ThemedView>
            <TextInput
              style={[styles.input, stylesField(palette)]}
              placeholder={LL.settings.invoiceSeriesNextNumber()}
              placeholderTextColor={placeholder(palette)}
              value={timesheetSeriesNextNumber}
              onChangeText={setTimesheetSeriesNextNumber}
              keyboardType="number-pad"
            />
            <View style={styles.switchRow}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                {LL.settings.invoiceSeriesPerDevice()}
              </ThemedText>
              <Switch
                value={resolvedTimesheetSeriesPerDevice}
                onValueChange={setTimesheetSeriesPerDevice}
                {...getSwitchColors(palette)}
              />
            </View>
            {resolvedTimesheetSeriesPerDevice && (
              <TextInput
                style={[styles.input, stylesField(palette)]}
                placeholder={LL.settings.invoiceSeriesDeviceCode()}
                placeholderTextColor={placeholder(palette)}
                value={timesheetSeriesDeviceCode}
                onChangeText={setTimesheetSeriesDeviceCode}
                autoCapitalize="characters"
              />
            )}
            {showTimesheetPerDeviceMissingTokenWarning && (
              <View
                style={[
                  styles.warningBox,
                  {
                    borderColor: withOpacity(palette.timerPause, 0.85),
                    backgroundColor: withOpacity(palette.timerPause, 0.12),
                  },
                ]}
              >
                <IconSymbol
                  name="exclamationmark.triangle.fill"
                  size={18}
                  color={palette.timerPause}
                />
                <ThemedText style={[styles.warningText, { color: palette.text }]}>
                  {LL.settings.seriesPerDeviceMissingTokenWarning({
                    deviceToken: SERIES_DEVICE_TOKEN,
                  })}
                </ThemedText>
              </View>
            )}
          </ThemedView>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: palette.tint },
              pressed && styles.pressed,
            ]}
            onPress={handleSave}
          >
            <ThemedText style={[styles.saveButtonText, { color: palette.onTint }]}>
              {LL.common.save()}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function stylesField(palette: ReturnType<typeof usePalette>) {
  return {
    color: palette.text,
    borderColor: palette.inputBorder,
    backgroundColor: palette.inputBackground,
  };
}

function sectionCard(palette: ReturnType<typeof usePalette>) {
  return {
    backgroundColor: palette.cardBackground,
  };
}

function placeholder(palette: ReturnType<typeof usePalette>) {
  return palette.placeholder;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: { marginBottom: 12 },
  sectionDescription: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  seriesSectionTitle: { marginTop: 8, marginBottom: 12 },
  hintText: { fontSize: 13, opacity: 0.65, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  previewBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  previewLabel: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveButtonText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.82 },
});
