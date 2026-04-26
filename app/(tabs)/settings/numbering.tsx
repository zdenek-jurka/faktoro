import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getSwitchColors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { parsePositiveIntegerInput } from '@/utils/number-input';
import { showConfirm } from '@/utils/platform-alert';
import { isIos } from '@/utils/platform';
import { buildSeriesIdentifier, getSeriesPaddingFromPattern } from '@/utils/series-utils';
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

  const invoiceSeriesPadding = getSeriesPaddingFromPattern({
    pattern: invoiceSeriesPattern,
    fallbackPattern: 'YY####',
  });
  const timesheetSeriesPadding = getSeriesPaddingFromPattern({
    pattern: timesheetSeriesPattern,
    fallbackPattern: 'TS-YY-####',
  });

  const invoicePreviewNumber = buildSeriesPreview({
    pattern: invoiceSeriesPattern,
    nextNumber: invoiceSeriesNextNumber,
    padding: String(invoiceSeriesPadding),
    perDevice: invoiceSeriesPerDevice,
    deviceCode: invoiceSeriesDeviceCode,
    fallbackPattern: 'YY####',
    fallbackPrefix: 'INV',
  });

  const timesheetPreviewNumber = buildSeriesPreview({
    pattern: timesheetSeriesPattern,
    nextNumber: timesheetSeriesNextNumber,
    padding: String(timesheetSeriesPadding),
    perDevice: timesheetSeriesPerDevice,
    deviceCode: timesheetSeriesDeviceCode,
    fallbackPattern: 'TS-YY-####',
    fallbackPrefix: 'TS',
  });

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setInvoiceSeriesPattern(settings.invoiceSeriesPattern || 'YY####');
      const savedInvoiceNextNumber = settings.invoiceSeriesNextNumber || 1;
      setInvoiceSeriesNextNumber(String(savedInvoiceNextNumber));
      setInitialInvoiceSeriesNextNumber(savedInvoiceNextNumber);
      setInvoiceSeriesPerDevice(!!settings.invoiceSeriesPerDevice);
      setInvoiceSeriesDeviceCode(settings.invoiceSeriesDeviceCode || '');

      setTimesheetSeriesPattern(settings.timesheetSeriesPattern || 'TS-YY-####');
      const savedTimesheetNextNumber = settings.timesheetSeriesNextNumber || 1;
      setTimesheetSeriesNextNumber(String(savedTimesheetNextNumber));
      setInitialTimesheetSeriesNextNumber(savedTimesheetNextNumber);
      setTimesheetSeriesPerDevice(!!settings.timesheetSeriesPerDevice);
      setTimesheetSeriesDeviceCode(settings.timesheetSeriesDeviceCode || '');
    };

    void loadSettings();
  }, []);

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

      await updateSettings({
        invoiceSeriesPrefix: null,
        invoiceSeriesPattern: invoiceSeriesPattern.trim() || null,
        invoiceSeriesNextNumber: normalizedInvoiceSeriesNextNumber,
        invoiceSeriesPadding,
        invoiceSeriesPerDevice,
        invoiceSeriesDeviceCode: invoiceSeriesDeviceCode.trim() || null,
        timesheetSeriesPrefix: null,
        timesheetSeriesPattern: timesheetSeriesPattern.trim() || null,
        timesheetSeriesNextNumber: normalizedTimesheetSeriesNextNumber,
        timesheetSeriesPadding,
        timesheetSeriesPerDevice,
        timesheetSeriesDeviceCode: timesheetSeriesDeviceCode.trim() || null,
      });

      setInvoiceSeriesNextNumber(String(normalizedInvoiceSeriesNextNumber));
      setInitialInvoiceSeriesNextNumber(normalizedInvoiceSeriesNextNumber);
      setTimesheetSeriesNextNumber(String(normalizedTimesheetSeriesNextNumber));
      setInitialTimesheetSeriesNextNumber(normalizedTimesheetSeriesNextNumber);

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
              placeholder={LL.settings.invoiceSeriesPattern()}
              placeholderTextColor={placeholder(palette)}
              value={invoiceSeriesPattern}
              onChangeText={setInvoiceSeriesPattern}
              autoCapitalize="characters"
            />
            <ThemedText style={styles.hintText}>
              {LL.settings.invoiceSeriesPatternHelp()}
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
                value={invoiceSeriesPerDevice}
                onValueChange={setInvoiceSeriesPerDevice}
                {...getSwitchColors(palette)}
              />
            </View>
            {invoiceSeriesPerDevice && (
              <TextInput
                style={[styles.input, stylesField(palette)]}
                placeholder={LL.settings.invoiceSeriesDeviceCode()}
                placeholderTextColor={placeholder(palette)}
                value={invoiceSeriesDeviceCode}
                onChangeText={setInvoiceSeriesDeviceCode}
                autoCapitalize="characters"
              />
            )}

            <ThemedText type="subtitle" style={styles.seriesSectionTitle}>
              {LL.settings.timesheetSeriesTitle()}
            </ThemedText>
            <TextInput
              style={[styles.input, stylesField(palette)]}
              placeholder={LL.settings.invoiceSeriesPattern()}
              placeholderTextColor={placeholder(palette)}
              value={timesheetSeriesPattern}
              onChangeText={setTimesheetSeriesPattern}
              autoCapitalize="characters"
            />
            <ThemedText style={styles.hintText}>
              {LL.settings.invoiceSeriesPatternHelp()}
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
                value={timesheetSeriesPerDevice}
                onValueChange={setTimesheetSeriesPerDevice}
                {...getSwitchColors(palette)}
              />
            </View>
            {timesheetSeriesPerDevice && (
              <TextInput
                style={[styles.input, stylesField(palette)]}
                placeholder={LL.settings.invoiceSeriesDeviceCode()}
                placeholderTextColor={placeholder(palette)}
                value={timesheetSeriesDeviceCode}
                onChangeText={setTimesheetSeriesDeviceCode}
                autoCapitalize="characters"
              />
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
