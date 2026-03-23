import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  canConvertCzBankAccountToIban,
  isIbanLike,
} from '@/components/settings/invoice-settings-shared';
import { Colors, getSwitchColors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCurrencySettings } from '@/hooks/use-currency-settings';
import { useI18nContext } from '@/i18n/i18n-react';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/utils/currency-utils';
import {
  DEFAULT_INVOICE_DUE_DAYS,
  INVOICE_PAYMENT_METHOD_OPTIONS,
  normalizeInvoicePaymentMethod,
  parseInvoiceDueDaysInput,
} from '@/utils/invoice-defaults';
import { isIos } from '@/utils/platform';
import {
  DEFAULT_TIMER_HARD_LIMIT_MINUTES,
  DEFAULT_TIMER_SOFT_LIMIT_MINUTES,
  formatTimerLimitHours,
  parseTimerLimitHoursInput,
  validateTimerLimitOrder,
} from '@/utils/timer-limit-utils';
import { parseBillingIntervalMinutesInput } from '@/utils/time-utils';
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

export default function SettingsInvoiceDefaultsScreen() {
  const colorScheme = useColorScheme();
  const { LL } = useI18nContext();
  const headerHeight = useHeaderHeight();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const currencies = useCurrencySettings();

  const [defaultInvoiceCurrency, setDefaultInvoiceCurrency] = useState(DEFAULT_CURRENCY_CODE);
  const [defaultInvoicePaymentMethod, setDefaultInvoicePaymentMethod] = useState(
    normalizeInvoicePaymentMethod(undefined),
  );
  const [defaultInvoiceDueDays, setDefaultInvoiceDueDays] = useState(
    String(DEFAULT_INVOICE_DUE_DAYS),
  );
  const [invoiceQrType, setInvoiceQrType] = useState('none');
  const [invoiceDefaultExportFormat, setInvoiceDefaultExportFormat] = useState('none');
  const [useBillingInterval, setUseBillingInterval] = useState(false);
  const [defaultBillingInterval, setDefaultBillingInterval] = useState('15');
  const [timerSoftLimitEnabled, setTimerSoftLimitEnabled] = useState(true);
  const [timerSoftLimitHours, setTimerSoftLimitHours] = useState(
    formatTimerLimitHours(DEFAULT_TIMER_SOFT_LIMIT_MINUTES),
  );
  const [timerHardLimitEnabled, setTimerHardLimitEnabled] = useState(true);
  const [timerHardLimitHours, setTimerHardLimitHours] = useState(
    formatTimerLimitHours(DEFAULT_TIMER_HARD_LIMIT_MINUTES),
  );
  const [invoiceBankAccount, setInvoiceBankAccount] = useState('');
  const [invoiceIban, setInvoiceIban] = useState('');
  const [invoiceSwift, setInvoiceSwift] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setDefaultInvoiceCurrency(normalizeCurrencyCode(settings.defaultInvoiceCurrency));
      setDefaultInvoicePaymentMethod(
        normalizeInvoicePaymentMethod(settings.defaultInvoicePaymentMethod),
      );
      setDefaultInvoiceDueDays(String(settings.defaultInvoiceDueDays ?? DEFAULT_INVOICE_DUE_DAYS));
      setInvoiceQrType(settings.invoiceQrType || 'none');
      const savedFormat = settings.invoiceDefaultExportFormat;
      setInvoiceDefaultExportFormat(
        savedFormat === 'none' ||
          savedFormat === 'isdoc' ||
          savedFormat === 'peppol' ||
          savedFormat === 'xrechnung'
          ? savedFormat
          : 'none',
      );
      const interval = settings.defaultBillingInterval;
      setUseBillingInterval(interval !== undefined && interval !== null);
      setDefaultBillingInterval(interval?.toString() || '15');
      setTimerSoftLimitEnabled(settings.timerSoftLimitEnabled !== false);
      setTimerSoftLimitHours(
        formatTimerLimitHours(settings.timerSoftLimitMinutes ?? DEFAULT_TIMER_SOFT_LIMIT_MINUTES),
      );
      setTimerHardLimitEnabled(settings.timerHardLimitEnabled !== false);
      setTimerHardLimitHours(
        formatTimerLimitHours(settings.timerHardLimitMinutes ?? DEFAULT_TIMER_HARD_LIMIT_MINUTES),
      );
      setInvoiceBankAccount(settings.invoiceBankAccount || '');
      setInvoiceIban(settings.invoiceIban || '');
      setInvoiceSwift(settings.invoiceSwift || '');
    };

    void loadSettings();
  }, []);

  const handleSave = async () => {
    const billingInterval = useBillingInterval
      ? parseBillingIntervalMinutesInput(defaultBillingInterval)
      : undefined;

    if (useBillingInterval && !billingInterval) {
      Alert.alert(LL.common.error(), LL.common.errorBillingIntervalMinimum());
      return;
    }
    const invoiceDueDays = parseInvoiceDueDaysInput(defaultInvoiceDueDays);
    if (invoiceDueDays === undefined) {
      Alert.alert(LL.common.error(), LL.common.errorInvoiceDueDaysInvalid());
      return;
    }
    if (invoiceQrType === 'spayd' && !invoiceIban.trim() && !invoiceBankAccount.trim()) {
      Alert.alert(LL.common.error(), LL.settings.invoiceQrBankRequiredSpayd());
      return;
    }
    if (invoiceQrType === 'spayd') {
      const ibanValid = isIbanLike(invoiceIban.trim());
      const bankAccountConvertible = canConvertCzBankAccountToIban(invoiceBankAccount.trim());
      if (!ibanValid && !bankAccountConvertible) {
        Alert.alert(LL.common.error(), LL.settings.invoiceQrBankRequiredSpayd());
        return;
      }
    }
    if (invoiceQrType === 'epc' && (!invoiceIban.trim() || !invoiceSwift.trim())) {
      Alert.alert(LL.common.error(), LL.settings.invoiceQrBankRequiredEpc());
      return;
    }
    if (invoiceQrType === 'swiss' && !invoiceIban.trim()) {
      Alert.alert(LL.common.error(), LL.settings.invoiceQrBankRequiredSwiss());
      return;
    }
    const timerSoftLimitMinutes = timerSoftLimitEnabled
      ? parseTimerLimitHoursInput(timerSoftLimitHours)
      : undefined;
    const timerHardLimitMinutes = timerHardLimitEnabled
      ? parseTimerLimitHoursInput(timerHardLimitHours)
      : undefined;
    if (timerSoftLimitEnabled && timerSoftLimitMinutes === undefined) {
      Alert.alert(LL.common.error(), LL.settings.timerLimitHoursInvalid());
      return;
    }
    if (timerHardLimitEnabled && timerHardLimitMinutes === undefined) {
      Alert.alert(LL.common.error(), LL.settings.timerLimitHoursInvalid());
      return;
    }
    if (
      !validateTimerLimitOrder({
        softLimitMinutes: timerSoftLimitMinutes,
        hardLimitMinutes: timerHardLimitMinutes,
      })
    ) {
      Alert.alert(LL.common.error(), LL.settings.timerLimitOrderInvalid());
      return;
    }

    try {
      await updateSettings({
        defaultInvoiceCurrency: normalizeCurrencyCode(defaultInvoiceCurrency),
        defaultInvoicePaymentMethod: normalizeInvoicePaymentMethod(defaultInvoicePaymentMethod),
        defaultInvoiceDueDays: invoiceDueDays,
        invoiceQrType: invoiceQrType || null,
        invoiceDefaultExportFormat: invoiceDefaultExportFormat || null,
        defaultBillingInterval: useBillingInterval ? billingInterval : null,
        timerSoftLimitEnabled,
        timerSoftLimitMinutes: timerSoftLimitEnabled ? timerSoftLimitMinutes : null,
        timerHardLimitEnabled,
        timerHardLimitMinutes: timerHardLimitEnabled ? timerHardLimitMinutes : null,
      });

      setDefaultInvoiceCurrency(normalizeCurrencyCode(defaultInvoiceCurrency));
      setDefaultInvoicePaymentMethod(normalizeInvoicePaymentMethod(defaultInvoicePaymentMethod));
      setDefaultInvoiceDueDays(String(invoiceDueDays));
      setTimerSoftLimitHours(formatTimerLimitHours(timerSoftLimitMinutes));
      setTimerHardLimitHours(formatTimerLimitHours(timerHardLimitMinutes));
      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving invoice defaults:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    }
  };

  const getInvoiceQrTypeLabel = (value: string) => {
    if (value === 'spayd') return LL.settings.invoiceQrTypeSpayd();
    if (value === 'epc') return LL.settings.invoiceQrTypeEpc();
    if (value === 'swiss') return LL.settings.invoiceQrTypeSwiss();
    return LL.settings.invoiceQrTypeNone();
  };

  const getInvoiceXmlFormatLabel = (value: string) => {
    if (value === 'isdoc') return LL.invoices.exportIsdoc();
    if (value === 'peppol') return LL.invoices.exportPeppol();
    if (value === 'xrechnung') return LL.invoices.exportXrechnung();
    return LL.settings.invoiceDefaultExportFormatNone();
  };

  const getPaymentMethodLabel = (value: string) => {
    switch (normalizeInvoicePaymentMethod(value)) {
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
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.invoiceDefaultsTitle() }} />
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
          <ThemedView style={[styles.section, sectionCard(colorScheme)]}>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.invoiceDefaultsSubtitle()}
            </ThemedText>

            <ThemedText style={styles.label}>{LL.settings.defaultInvoiceCurrency()}</ThemedText>
            <ThemedText style={styles.hintText}>
              {LL.settings.defaultInvoiceCurrencyHelp()}
            </ThemedText>
            <Select value={defaultInvoiceCurrency} onValueChange={setDefaultInvoiceCurrency}>
              <SelectTrigger>
                <SelectValue placeholder={defaultInvoiceCurrency} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{LL.settings.defaultInvoiceCurrency()}</SelectLabel>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.id} value={currency.code} label={currency.code}>
                      {currency.code}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <ThemedText style={styles.label}>
              {LL.settings.defaultInvoicePaymentMethod()}
            </ThemedText>
            <ThemedText style={styles.hintText}>
              {LL.settings.defaultInvoicePaymentMethodHelp()}
            </ThemedText>
            <Select
              value={defaultInvoicePaymentMethod}
              onValueChange={setDefaultInvoicePaymentMethod}
            >
              <SelectTrigger>
                <SelectValue placeholder={getPaymentMethodLabel(defaultInvoicePaymentMethod)} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{LL.settings.defaultInvoicePaymentMethod()}</SelectLabel>
                  {INVOICE_PAYMENT_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} label={getPaymentMethodLabel(option)}>
                      {getPaymentMethodLabel(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <ThemedText style={styles.label}>{LL.settings.defaultInvoiceDueDays()}</ThemedText>
            <ThemedText style={styles.hintText}>
              {LL.settings.defaultInvoiceDueDaysHelp()}
            </ThemedText>
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={String(DEFAULT_INVOICE_DUE_DAYS)}
              placeholderTextColor={placeholder(colorScheme)}
              value={defaultInvoiceDueDays}
              onChangeText={setDefaultInvoiceDueDays}
              keyboardType="numeric"
            />

            <View style={styles.switchRow}>
              <View style={styles.switchLabelContainer}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  {LL.settings.defaultBillingInterval()}
                </ThemedText>
                <ThemedText style={styles.sectionDescriptionCompact}>
                  {LL.settings.defaultBillingIntervalDesc()}
                </ThemedText>
              </View>
              <Switch
                value={useBillingInterval}
                onValueChange={setUseBillingInterval}
                {...getSwitchColors(Colors[colorScheme ?? 'light'])}
              />
            </View>
            {useBillingInterval && (
              <TextInput
                style={[styles.input, stylesField(colorScheme)]}
                placeholder="15"
                placeholderTextColor={placeholder(colorScheme)}
                value={defaultBillingInterval}
                onChangeText={setDefaultBillingInterval}
                keyboardType="numeric"
              />
            )}

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.settings.timerLimitsTitle()}
            </ThemedText>
            <ThemedText style={styles.sectionDescriptionCompact}>
              {LL.settings.timerLimitsDescription()}
            </ThemedText>

            <View style={styles.switchRow}>
              <View style={styles.switchLabelContainer}>
                <ThemedText style={styles.label}>{LL.settings.timerSoftLimitHours()}</ThemedText>
                <ThemedText style={styles.hintText}>
                  {LL.settings.timerSoftLimitHoursHelp()}
                </ThemedText>
              </View>
              <Switch
                value={timerSoftLimitEnabled}
                onValueChange={setTimerSoftLimitEnabled}
                {...getSwitchColors(Colors[colorScheme ?? 'light'])}
              />
            </View>
            {timerSoftLimitEnabled && (
              <TextInput
                style={[styles.input, stylesField(colorScheme)]}
                placeholder={LL.settings.timerSoftLimitHoursPlaceholder()}
                placeholderTextColor={placeholder(colorScheme)}
                value={timerSoftLimitHours}
                onChangeText={setTimerSoftLimitHours}
                autoCorrect={false}
                autoCapitalize="none"
              />
            )}

            <View style={styles.switchRow}>
              <View style={styles.switchLabelContainer}>
                <ThemedText style={styles.label}>{LL.settings.timerHardLimitHours()}</ThemedText>
                <ThemedText style={styles.hintText}>
                  {LL.settings.timerHardLimitHoursHelp()}
                </ThemedText>
              </View>
              <Switch
                value={timerHardLimitEnabled}
                onValueChange={setTimerHardLimitEnabled}
                {...getSwitchColors(Colors[colorScheme ?? 'light'])}
              />
            </View>
            {timerHardLimitEnabled && (
              <TextInput
                style={[styles.input, stylesField(colorScheme)]}
                placeholder={LL.settings.timerHardLimitHoursPlaceholder()}
                placeholderTextColor={placeholder(colorScheme)}
                value={timerHardLimitHours}
                onChangeText={setTimerHardLimitHours}
                autoCorrect={false}
                autoCapitalize="none"
              />
            )}

            <ThemedText style={styles.label}>{LL.settings.invoiceQrType()}</ThemedText>
            <Select value={invoiceQrType} onValueChange={setInvoiceQrType}>
              <SelectTrigger>
                <SelectValue placeholder={getInvoiceQrTypeLabel(invoiceQrType)} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{LL.settings.invoiceQrType()}</SelectLabel>
                  <SelectItem value="none" label={LL.settings.invoiceQrTypeNone()}>
                    {LL.settings.invoiceQrTypeNone()}
                  </SelectItem>
                  <SelectItem value="spayd" label={LL.settings.invoiceQrTypeSpayd()}>
                    {LL.settings.invoiceQrTypeSpayd()}
                  </SelectItem>
                  <SelectItem value="epc" label={LL.settings.invoiceQrTypeEpc()}>
                    {LL.settings.invoiceQrTypeEpc()}
                  </SelectItem>
                  <SelectItem value="swiss" label={LL.settings.invoiceQrTypeSwiss()}>
                    {LL.settings.invoiceQrTypeSwiss()}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <ThemedText style={styles.label}>{LL.settings.invoiceDefaultExportFormat()}</ThemedText>
            <Select
              value={invoiceDefaultExportFormat}
              onValueChange={setInvoiceDefaultExportFormat}
            >
              <SelectTrigger>
                <SelectValue placeholder={getInvoiceXmlFormatLabel(invoiceDefaultExportFormat)} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{LL.settings.invoiceDefaultExportFormat()}</SelectLabel>
                  <SelectItem value="none" label={LL.settings.invoiceDefaultExportFormatNone()}>
                    {LL.settings.invoiceDefaultExportFormatNone()}
                  </SelectItem>
                  <SelectItem value="isdoc" label={LL.invoices.exportIsdoc()}>
                    {LL.invoices.exportIsdoc()}
                  </SelectItem>
                  <SelectItem value="peppol" label={LL.invoices.exportPeppol()}>
                    {LL.invoices.exportPeppol()}
                  </SelectItem>
                  <SelectItem value="xrechnung" label={LL.invoices.exportXrechnung()}>
                    {LL.invoices.exportXrechnung()}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </ThemedView>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: Colors[colorScheme ?? 'light'].tint },
              pressed && styles.pressed,
            ]}
            onPress={handleSave}
          >
            <ThemedText
              style={[styles.saveButtonText, { color: Colors[colorScheme ?? 'light'].onTint }]}
            >
              {LL.common.save()}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function stylesField(colorScheme: ReturnType<typeof useColorScheme>) {
  return {
    color: Colors[colorScheme ?? 'light'].text,
    borderColor: Colors[colorScheme ?? 'light'].inputBorder,
    backgroundColor: Colors[colorScheme ?? 'light'].inputBackground,
  };
}

function sectionCard(colorScheme: ReturnType<typeof useColorScheme>) {
  return {
    backgroundColor: Colors[colorScheme ?? 'light'].cardBackground,
  };
}

function placeholder(colorScheme: ReturnType<typeof useColorScheme>) {
  return Colors[colorScheme ?? 'light'].placeholder;
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
  sectionTitle: { marginBottom: 8 },
  sectionDescription: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  sectionDescriptionCompact: { fontSize: 14, opacity: 0.7 },
  label: { marginTop: 8, marginBottom: 8, fontWeight: '600' },
  hintText: { fontSize: 13, opacity: 0.65, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  switchLabelContainer: { flex: 1 },
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
