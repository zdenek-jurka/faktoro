import {
  loadRegistrySettingsForLookup,
  requestMissingRegistryConfiguration,
} from '@/components/clients/company-registry-lookup';
import { CompanyRegistryPickerModal } from '@/components/clients/company-registry-picker-modal';
import {
  canConvertCzBankAccountToIban,
  isIbanLike,
} from '@/components/settings/invoice-settings-shared';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { OptionSheetModal } from '@/components/ui/option-sheet-modal';
import { Colors, getSwitchColors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  CompanyRegistryLookupError,
  getCompanyRegistryService,
  normalizeCompanyRegistryKey,
  type CompanyRegistryCompany,
  type CompanyRegistryImportAddress,
  type CompanyRegistryKey,
} from '@/repositories/company-registry';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { isPlausibleEmail } from '@/utils/email-utils';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useRouter } from 'expo-router';
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

export default function SettingsBusinessProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { LL } = useI18nContext();
  const headerHeight = useHeaderHeight();
  const contentStyle = useBottomSafeAreaStyle(styles.content);

  const [isVatPayer, setIsVatPayer] = useState(false);
  const [invoiceCompanyName, setInvoiceCompanyName] = useState('');
  const [invoiceAddress, setInvoiceAddress] = useState('');
  const [invoiceStreet2, setInvoiceStreet2] = useState('');
  const [invoiceCity, setInvoiceCity] = useState('');
  const [invoicePostalCode, setInvoicePostalCode] = useState('');
  const [invoiceCountry, setInvoiceCountry] = useState('');
  const [invoiceCompanyId, setInvoiceCompanyId] = useState('');
  const [invoiceVatNumber, setInvoiceVatNumber] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');
  const [invoicePhone, setInvoicePhone] = useState('');
  const [invoiceWebsite, setInvoiceWebsite] = useState('');
  const [invoiceBankAccount, setInvoiceBankAccount] = useState('');
  const [invoiceIban, setInvoiceIban] = useState('');
  const [invoiceSwift, setInvoiceSwift] = useState('');
  const [defaultRegistry, setDefaultRegistry] = useState<CompanyRegistryKey>('none');
  const [isRegistryPickerVisible, setIsRegistryPickerVisible] = useState(false);
  const [pendingLookupCompanyId, setPendingLookupCompanyId] = useState('');
  const [lookupWizardCompany, setLookupWizardCompany] = useState<CompanyRegistryCompany | null>(
    null,
  );
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setIsVatPayer(settings.isVatPayer || false);
      setInvoiceCompanyName(settings.invoiceCompanyName || '');
      setInvoiceAddress(settings.invoiceAddress || '');
      setInvoiceStreet2(settings.invoiceStreet2 || '');
      setInvoiceCity(settings.invoiceCity || '');
      setInvoicePostalCode(settings.invoicePostalCode || '');
      setInvoiceCountry(settings.invoiceCountry || '');
      setInvoiceCompanyId(settings.invoiceCompanyId || '');
      setInvoiceVatNumber(settings.invoiceVatNumber || '');
      setInvoiceEmail(settings.invoiceEmail || '');
      setInvoicePhone(settings.invoicePhone || '');
      setInvoiceWebsite(settings.invoiceWebsite || '');
      setInvoiceBankAccount(settings.invoiceBankAccount || '');
      setInvoiceIban(settings.invoiceIban || '');
      setInvoiceSwift(settings.invoiceSwift || '');
      setDefaultRegistry(normalizeCompanyRegistryKey(settings.defaultCompanyRegistry));
    };

    void loadSettings();
  }, []);

  const pickBillingAddressFromImport = (
    company: CompanyRegistryCompany,
  ): CompanyRegistryImportAddress | null => {
    const candidates =
      company.importAddresses || (company.importAddress ? [company.importAddress] : []);
    if (!candidates.length) return null;

    const billing = candidates.find((address) => address.type === 'billing');
    const selected = billing || candidates[0];
    if (
      !selected?.street?.trim() ||
      !selected.city?.trim() ||
      !selected.postalCode?.trim() ||
      !selected.country?.trim()
    ) {
      return null;
    }
    return selected;
  };

  const applyLookupCompany = (
    company: CompanyRegistryCompany,
    options?: { includeAddress?: boolean },
  ) => {
    setInvoiceCompanyName(company.legalName);
    setInvoiceCompanyId(company.companyId);
    if (company.vatNumber?.trim()) {
      setInvoiceVatNumber(company.vatNumber.trim());
      setIsVatPayer(true);
    }

    if (!options?.includeAddress) return;
    const billingAddress = pickBillingAddressFromImport(company);
    if (!billingAddress) {
      Alert.alert(LL.common.error(), LL.clients.errorCompanyLookupAddressUnavailable());
      return;
    }
    setInvoiceAddress(billingAddress.street.trim());
    setInvoiceCity(billingAddress.city.trim());
    setInvoicePostalCode(billingAddress.postalCode.trim());
    setInvoiceCountry(billingAddress.country.trim());
  };

  const handleLookupByCompanyId = async (companyId: string, registryKey: CompanyRegistryKey) => {
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
      console.error('Error looking up invoice company in selected registry:', error);
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
  };

  const handleLookupByDefaultRegistry = () => {
    const companyId = invoiceCompanyId.trim();
    if (!companyId) {
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
        console.error('Error loading default company registry:', error);
      }

      if (registryToUse === 'none') {
        setPendingLookupCompanyId(companyId);
        setIsRegistryPickerVisible(true);
        return;
      }

      await handleLookupByCompanyId(companyId, registryToUse);
    })();
  };

  const handleSave = async () => {
    if (isVatPayer && !invoiceVatNumber.trim()) {
      Alert.alert(LL.common.error(), LL.settings.vatNumberRequiredForPayer());
      return;
    }
    if (invoiceEmail.trim() && !isPlausibleEmail(invoiceEmail)) {
      Alert.alert(LL.common.error(), LL.common.errorInvalidEmail());
      return;
    }
    if (invoiceIban.trim() && !isIbanLike(invoiceIban)) {
      Alert.alert(LL.common.error(), LL.settings.invoiceQrBankRequiredSwiss());
      return;
    }
    if (invoiceBankAccount.trim() && !canConvertCzBankAccountToIban(invoiceBankAccount)) {
      // Keep the validation soft here; banking details can still be useful for display.
      console.warn('Invoice bank account is not convertible to IBAN');
    }

    try {
      await updateSettings({
        isVatPayer,
        invoiceCompanyName: invoiceCompanyName.trim() || null,
        invoiceAddress: invoiceAddress.trim() || null,
        invoiceStreet2: invoiceStreet2.trim() || null,
        invoiceCity: invoiceCity.trim() || null,
        invoicePostalCode: invoicePostalCode.trim() || null,
        invoiceCountry: invoiceCountry.trim() || null,
        invoiceCompanyId: invoiceCompanyId.trim() || null,
        invoiceVatNumber: invoiceVatNumber.trim() || null,
        invoiceEmail: invoiceEmail.trim() || null,
        invoicePhone: invoicePhone.trim() || null,
        invoiceWebsite: invoiceWebsite.trim() || null,
        invoiceBankAccount: invoiceBankAccount.trim() || null,
        invoiceIban: invoiceIban.trim() || null,
        invoiceSwift: invoiceSwift.trim() || null,
      });

      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving business profile settings:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.businessProfileTitle() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : 'height'}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={isIos ? 'interactive' : 'on-drag'}
        >
          <ThemedView style={[styles.section, sectionCard(colorScheme)]}>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.businessProfileSubtitle()}
            </ThemedText>

            <View style={styles.switchRow}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                {LL.settings.isVatPayer()}
              </ThemedText>
              <Switch
                value={isVatPayer}
                onValueChange={setIsVatPayer}
                {...getSwitchColors(Colors[colorScheme ?? 'light'])}
              />
            </View>

            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.companyName()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceCompanyName}
              onChangeText={setInvoiceCompanyName}
            />
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.address()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceAddress}
              onChangeText={setInvoiceAddress}
            />
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.clients.street2()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceStreet2}
              onChangeText={setInvoiceStreet2}
            />

            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.halfInput, stylesField(colorScheme)]}
                placeholder={LL.settings.city()}
                placeholderTextColor={placeholder(colorScheme)}
                value={invoiceCity}
                onChangeText={setInvoiceCity}
              />
              <TextInput
                style={[styles.input, styles.halfInput, stylesField(colorScheme)]}
                placeholder={LL.settings.postalCode()}
                placeholderTextColor={placeholder(colorScheme)}
                value={invoicePostalCode}
                onChangeText={setInvoicePostalCode}
              />
            </View>

            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.country()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceCountry}
              onChangeText={setInvoiceCountry}
            />

            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.companyId()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceCompanyId}
              onChangeText={setInvoiceCompanyId}
            />
            <Pressable
              style={({ pressed }) => [
                styles.lookupButton,
                {
                  backgroundColor: isLookupLoading
                    ? Colors[colorScheme ?? 'light'].inputBorder
                    : Colors[colorScheme ?? 'light'].tint,
                },
                pressed && styles.pressed,
              ]}
              onPress={handleLookupByDefaultRegistry}
              disabled={isLookupLoading}
            >
              <ThemedText
                style={[styles.lookupButtonText, { color: Colors[colorScheme ?? 'light'].onTint }]}
              >
                {isLookupLoading ? LL.common.loading() : LL.clients.lookupCompanyById()}
              </ThemedText>
            </Pressable>
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.vatNumber() + (isVatPayer ? ' *' : '')}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceVatNumber}
              onChangeText={setInvoiceVatNumber}
            />
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.email()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceEmail}
              onChangeText={setInvoiceEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
            />
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.phone()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoicePhone}
              onChangeText={setInvoicePhone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.website()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceWebsite}
              onChangeText={setInvoiceWebsite}
              keyboardType="url"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.bankAccount()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceBankAccount}
              onChangeText={setInvoiceBankAccount}
            />
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.iban()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceIban}
              onChangeText={setInvoiceIban}
              autoCapitalize="characters"
            />
            <TextInput
              style={[styles.input, stylesField(colorScheme)]}
              placeholder={LL.settings.swift()}
              placeholderTextColor={placeholder(colorScheme)}
              value={invoiceSwift}
              onChangeText={setInvoiceSwift}
              autoCapitalize="characters"
            />
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
                  onPress: () => applyLookupCompany(lookupWizardCompany, { includeAddress: true }),
                },
              ]
            : []
        }
      />
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
  sectionTitle: { marginBottom: 12 },
  sectionDescription: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  lookupButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  lookupButtonText: { fontSize: 15, fontWeight: '600' },
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
