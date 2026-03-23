import { ThemedView } from '@/components/themed-view';
import { ClientFormData } from '@/components/clients';
import { CompanyRegistryPickerModal } from '@/components/clients/company-registry-picker-modal';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { OptionSheetModal } from '@/components/ui/option-sheet-modal';
import {
  loadRegistrySettingsForLookup,
  requestMissingRegistryConfiguration,
} from '@/components/clients/company-registry-lookup';
import { ClientForm } from '@/components/clients/client-form';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  type CompanyRegistryCompany,
  type CompanyRegistryImportAddress,
  type CompanyRegistryKey,
  CompanyRegistryLookupError,
  getCompanyRegistryService,
  normalizeCompanyRegistryKey,
} from '@/repositories/company-registry';
import { createAddress } from '@/repositories/address-repository';
import { createClient } from '@/repositories/client-repository';
import { getSettings } from '@/repositories/settings-repository';
import { parseInvoiceDueDaysInput } from '@/utils/invoice-defaults';
import { isPlausibleEmail } from '@/utils/email-utils';
import { parseTimerLimitHoursInput, validateTimerLimitOrder } from '@/utils/timer-limit-utils';
import { parseBillingIntervalMinutesInput } from '@/utils/time-utils';
import { AddressType } from '@/db/schema';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

const initialFormData: ClientFormData = {
  name: '',
  exportLanguage: '',
  invoiceQrType: '',
  invoiceDefaultExportFormat: '',
  invoicePaymentMethod: '',
  invoiceDueDays: '',
  vatNumber: '',
  companyId: '',
  isCompany: false,
  isVatPayer: false,
  email: '',
  phone: '',
  notes: '',
  billingIntervalEnabled: false,
  billingIntervalMinutes: '',
  timerLimitMode: 'default',
  timerSoftLimitHours: '',
  timerHardLimitHours: '',
};

type ImportedAddressDraft = {
  type: AddressType;
  street: string;
  city: string;
  postalCode: string;
  country: string;
};

function mapImportAddressType(type?: string): AddressType {
  if (type === 'shipping') return AddressType.SHIPPING;
  if (type === 'other') return AddressType.OTHER;
  return AddressType.BILLING;
}

function toImportedAddressDrafts(
  importAddresses?: CompanyRegistryImportAddress[],
): ImportedAddressDraft[] {
  if (!importAddresses?.length) return [];
  return importAddresses
    .map((address) => ({
      type: mapImportAddressType(address.type),
      street: address.street.trim(),
      city: address.city.trim(),
      postalCode: address.postalCode.trim(),
      country: address.country.trim(),
    }))
    .filter(
      (address) => !!address.street && !!address.city && !!address.postalCode && !!address.country,
    );
}

export default function AddClientScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { LL } = useI18nContext();
  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [defaultRegistry, setDefaultRegistry] = useState<CompanyRegistryKey>('none');
  const [importedAddressDrafts, setImportedAddressDrafts] = useState<ImportedAddressDraft[]>([]);
  const [isRegistryPickerVisible, setIsRegistryPickerVisible] = useState(false);
  const [pendingLookupCompanyId, setPendingLookupCompanyId] = useState('');
  const [lookupWizardCompany, setLookupWizardCompany] = useState<CompanyRegistryCompany | null>(
    null,
  );

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setDefaultRegistry(normalizeCompanyRegistryKey(settings.defaultCompanyRegistry));
    };
    void loadSettings();
  }, []);

  const applyLookupCompany = (
    company: CompanyRegistryCompany,
    options?: { includeAddress?: boolean },
  ) => {
    const hasVatNumber = !!company.vatNumber?.trim();
    setFormData((prev) => ({
      ...prev,
      isCompany: true,
      isVatPayer: hasVatNumber || prev.isVatPayer,
      name: company.legalName,
      companyId: company.companyId,
      vatNumber: company.vatNumber || prev.vatNumber,
    }));

    if (!options?.includeAddress) {
      setImportedAddressDrafts([]);
      return;
    }

    const addressDrafts = toImportedAddressDrafts(
      company.importAddresses || (company.importAddress ? [company.importAddress] : undefined),
    );
    if (addressDrafts.length === 0) {
      Alert.alert(LL.common.error(), LL.clients.errorCompanyLookupAddressUnavailable());
      setImportedAddressDrafts([]);
      return;
    }
    setImportedAddressDrafts(addressDrafts);
  };

  const askLookupImportMode = (company: CompanyRegistryCompany) => {
    setLookupWizardCompany(company);
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
      askLookupImportMode(company);
    } catch (error) {
      console.error('Error looking up company in selected registry:', error);
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
        if (error.code === 'unknown') {
          Alert.alert(LL.common.error(), LL.clients.errorCompanyLookupFailed());
          return;
        }
      }

      Alert.alert(LL.common.error(), LL.clients.errorCompanyLookupFailed());
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleLookupByDefaultRegistry = (companyId: string) => {
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
        console.error('Error loading default company registry:', error);
      }

      if (registryToUse === 'none') {
        setPendingLookupCompanyId(normalizedCompanyId);
        setIsRegistryPickerVisible(true);
        return;
      }

      await handleLookupByCompanyId(normalizedCompanyId, registryToUse);
    })();
  };

  const handleLookupWithRegistryPicker = (companyId: string) => {
    const normalizedCompanyId = companyId.trim();
    if (!normalizedCompanyId) {
      Alert.alert(LL.common.error(), LL.clients.errorCompanyIdRequiredForLookup());
      return;
    }
    setPendingLookupCompanyId(normalizedCompanyId);
    setIsRegistryPickerVisible(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      Alert.alert(LL.common.error(), LL.clients.errorClientNameRequired());
      return;
    }

    if (formData.isVatPayer && !formData.vatNumber.trim()) {
      Alert.alert(LL.common.error(), LL.clients.errorVatNumberRequiredForPayer());
      return;
    }

    const billingIntervalMinutes = formData.billingIntervalEnabled
      ? parseBillingIntervalMinutesInput(formData.billingIntervalMinutes)
      : undefined;

    if (formData.billingIntervalEnabled && !billingIntervalMinutes) {
      Alert.alert(LL.common.error(), LL.common.errorBillingIntervalMinimum());
      return;
    }

    const invoiceDueDays = parseInvoiceDueDaysInput(formData.invoiceDueDays);
    if (formData.invoiceDueDays.trim() && invoiceDueDays === undefined) {
      Alert.alert(LL.common.error(), LL.common.errorInvoiceDueDaysInvalid());
      return;
    }
    const timerSoftLimitMinutes =
      formData.timerLimitMode === 'custom'
        ? parseTimerLimitHoursInput(formData.timerSoftLimitHours)
        : undefined;
    const timerHardLimitMinutes =
      formData.timerLimitMode === 'custom'
        ? parseTimerLimitHoursInput(formData.timerHardLimitHours)
        : undefined;
    if (
      formData.timerLimitMode === 'custom' &&
      formData.timerSoftLimitHours.trim() &&
      timerSoftLimitMinutes === undefined
    ) {
      Alert.alert(LL.common.error(), LL.settings.timerLimitHoursInvalid());
      return;
    }
    if (
      formData.timerLimitMode === 'custom' &&
      formData.timerHardLimitHours.trim() &&
      timerHardLimitMinutes === undefined
    ) {
      Alert.alert(LL.common.error(), LL.settings.timerLimitHoursInvalid());
      return;
    }
    if (
      formData.timerLimitMode === 'custom' &&
      timerSoftLimitMinutes === undefined &&
      timerHardLimitMinutes === undefined
    ) {
      Alert.alert(LL.common.error(), LL.settings.timerLimitAtLeastOneRequired());
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
    if (formData.email.trim() && !isPlausibleEmail(formData.email)) {
      Alert.alert(LL.common.error(), LL.common.errorInvalidEmail());
      return;
    }

    try {
      const createdClientId = await createClient({
        name: formData.name.trim(),
        exportLanguage: formData.exportLanguage.trim() || undefined,
        invoiceQrType: formData.invoiceQrType.trim() || undefined,
        invoiceDefaultExportFormat: formData.invoiceDefaultExportFormat.trim() || undefined,
        invoicePaymentMethod: formData.invoicePaymentMethod.trim() || undefined,
        invoiceDueDays,
        isCompany: formData.isCompany,
        isVatPayer: formData.isVatPayer,
        companyId: formData.isCompany ? formData.companyId.trim() || undefined : undefined,
        vatNumber:
          formData.isCompany || formData.isVatPayer
            ? formData.vatNumber.trim() || undefined
            : undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        billingIntervalEnabled: formData.billingIntervalEnabled,
        billingIntervalMinutes: billingIntervalMinutes,
        timerLimitMode: formData.timerLimitMode as 'default' | 'custom' | 'disabled',
        timerSoftLimitMinutes,
        timerHardLimitMinutes,
      });

      if (importedAddressDrafts.length > 0 && formData.isCompany) {
        try {
          let hasDefaultAddress = false;
          for (const address of importedAddressDrafts) {
            const shouldBeDefault = !hasDefaultAddress && address.type === AddressType.BILLING;
            await createAddress({
              clientId: createdClientId,
              type: address.type,
              street: address.street,
              city: address.city,
              postalCode: address.postalCode,
              country: address.country,
              isDefault: shouldBeDefault,
            });
            if (shouldBeDefault) hasDefaultAddress = true;
          }
        } catch (error) {
          console.error('Error importing billing address from registry:', error);
          Alert.alert(LL.common.error(), LL.clients.errorCreateAddress());
        }
      }

      router.back();
    } catch (error) {
      Alert.alert(LL.common.error(), LL.clients.errorCreateClient());
      console.error('Error creating client:', error);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.clients.addNew(),
          headerBackTitle: LL.clients.title(),
          headerStyle: {
            backgroundColor: Colors[colorScheme ?? 'light'].background,
          },
          headerTintColor: Colors[colorScheme ?? 'light'].text,
        }}
      />
      <KeyboardAwareScroll contentContainerStyle={styles.content}>
        <ClientForm
          formData={formData}
          onFormDataChange={setFormData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onLookupByCompanyId={handleLookupByDefaultRegistry}
          onLookupRegistryPicker={handleLookupWithRegistryPicker}
          isLookupLoading={isLookupLoading}
          isEditMode={false}
          isScreen={true}
        />
      </KeyboardAwareScroll>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
    flexGrow: 1,
  },
});
