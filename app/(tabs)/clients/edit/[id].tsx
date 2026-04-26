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
import { AddressType } from '@/db/schema';
import database from '@/db';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel } from '@/model';
import {
  type CompanyRegistryCompany,
  type CompanyRegistryImportAddress,
  type CompanyRegistryKey,
  CompanyRegistryLookupError,
  getCompanyRegistryService,
  normalizeCompanyRegistryKey,
} from '@/repositories/company-registry';
import {
  createAddress,
  upsertDefaultBillingAddressForClient,
} from '@/repositories/address-repository';
import { deleteClient, updateClient } from '@/repositories/client-repository';
import { getSettings } from '@/repositories/settings-repository';
import { parseInvoiceDueDaysInput } from '@/utils/invoice-defaults';
import { isPlausibleEmail } from '@/utils/email-utils';
import {
  formatTimerLimitHours,
  parseTimerLimitHoursInput,
  validateTimerLimitOrder,
} from '@/utils/timer-limit-utils';
import { parseBillingIntervalMinutesInput } from '@/utils/time-utils';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';

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
  type: 'billing' | 'shipping' | 'other';
  street: string;
  city: string;
  postalCode: string;
  country: string;
};

function toImportedAddressDrafts(
  importAddresses?: CompanyRegistryImportAddress[],
): ImportedAddressDraft[] {
  if (!importAddresses?.length) return [];
  return importAddresses
    .map((address) => ({
      type: address.type || 'billing',
      street: address.street.trim(),
      city: address.city.trim(),
      postalCode: address.postalCode.trim(),
      country: address.country.trim(),
    }))
    .filter(
      (address) => !!address.street && !!address.city && !!address.postalCode && !!address.country,
    );
}

export default function EditClientScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const { LL } = useI18nContext();
  const routerRef = useRef(router);
  const llRef = useRef(LL);
  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const [loading, setLoading] = useState(true);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [defaultRegistry, setDefaultRegistry] = useState<CompanyRegistryKey>('none');
  const [isRegistryPickerVisible, setIsRegistryPickerVisible] = useState(false);
  const [pendingLookupCompanyId, setPendingLookupCompanyId] = useState('');
  const [lookupWizardCompany, setLookupWizardCompany] = useState<CompanyRegistryCompany | null>(
    null,
  );

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    llRef.current = LL;
  }, [LL]);

  useEffect(() => {
    let isCancelled = false;

    const run = async () => {
      setLoading(true);
      if (!id) {
        Alert.alert(llRef.current.common.error(), llRef.current.clients.errorClientIdMissing());
        routerRef.current.back();
        return;
      }

      try {
        const clients = database.get<ClientModel>(ClientModel.table);
        const client = await clients.find(id);

        if (isCancelled) {
          return;
        }

        setFormData({
          name: client.name,
          exportLanguage: client.exportLanguage || '',
          invoiceQrType: client.invoiceQrType || '',
          invoiceDefaultExportFormat: client.invoiceDefaultExportFormat || '',
          invoicePaymentMethod: client.invoicePaymentMethod || '',
          invoiceDueDays: client.invoiceDueDays?.toString() || '',
          isCompany: client.isCompany,
          isVatPayer: client.isVatPayer || false,
          companyId: client.companyId || '',
          vatNumber: client.vatNumber || '',
          email: client.email || '',
          phone: client.phone || '',
          notes: client.notes || '',
          billingIntervalEnabled: client.billingIntervalEnabled || false,
          billingIntervalMinutes: client.billingIntervalMinutes?.toString() || '',
          timerLimitMode: client.timerLimitMode || 'default',
          timerSoftLimitHours: formatTimerLimitHours(client.timerSoftLimitMinutes),
          timerHardLimitHours: formatTimerLimitHours(client.timerHardLimitMinutes),
        });
        setLoading(false);
      } catch (error) {
        if (isCancelled) {
          return;
        }
        Alert.alert(llRef.current.common.error(), llRef.current.clients.errorLoadClient());
        console.error('Error loading client:', error);
        routerRef.current.back();
      }
    };

    void run();
    return () => {
      isCancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setDefaultRegistry(normalizeCompanyRegistryKey(settings.defaultCompanyRegistry));
    };
    void loadSettings();
  }, []);

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      Alert.alert(LL.common.error(), LL.clients.errorClientNameRequired());
      return;
    }

    if (formData.isVatPayer && !formData.vatNumber.trim()) {
      Alert.alert(LL.common.error(), LL.clients.errorVatNumberRequiredForPayer());
      return;
    }

    if (!id) {
      Alert.alert(LL.common.error(), LL.clients.errorClientIdMissing());
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
      await updateClient({
        id,
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

      router.back();
    } catch (error) {
      Alert.alert(LL.common.error(), LL.clients.errorUpdateClient());
      console.error('Error updating client:', error);
    }
  };

  const applyLookupCompany = async (
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

    if (!options?.includeAddress || !id) {
      return;
    }

    const addressDrafts = toImportedAddressDrafts(
      company.importAddresses || (company.importAddress ? [company.importAddress] : undefined),
    );
    if (addressDrafts.length === 0) {
      Alert.alert(LL.common.error(), LL.clients.errorCompanyLookupAddressUnavailable());
      return;
    }

    try {
      const billingAddress = addressDrafts.find((address) => address.type === 'billing');
      if (!billingAddress) {
        Alert.alert(LL.common.error(), LL.clients.errorCompanyLookupAddressUnavailable());
        return;
      }

      await upsertDefaultBillingAddressForClient({
        clientId: id,
        street: billingAddress.street,
        city: billingAddress.city,
        postalCode: billingAddress.postalCode,
        country: billingAddress.country,
      });

      const secondaryAddresses = addressDrafts.filter((address) => address.type !== 'billing');
      for (const secondaryAddress of secondaryAddresses) {
        await createAddress({
          clientId: id,
          type:
            secondaryAddress.type === 'shipping'
              ? AddressType.SHIPPING
              : secondaryAddress.type === 'other'
                ? AddressType.OTHER
                : AddressType.BILLING,
          street: secondaryAddress.street,
          city: secondaryAddress.city,
          postalCode: secondaryAddress.postalCode,
          country: secondaryAddress.country,
          isDefault: false,
        });
      }
    } catch (error) {
      console.error('Error importing billing address from registry:', error);
      Alert.alert(LL.common.error(), LL.clients.errorCreateAddress());
    }
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

  const handleCancel = () => {
    router.back();
  };

  const handleDelete = () => {
    if (!id) {
      Alert.alert(LL.common.error(), LL.clients.errorClientIdMissing());
      return;
    }

    Alert.alert(LL.clients.deleteConfirm(), LL.clients.deleteMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await deleteClient(id);
            if (result.status === 'archived') {
              Alert.alert(
                LL.common.success(),
                LL.clients.archivedInsteadOfDelete({
                  timeEntries: String(result.dependencyCounts.timeEntries),
                  invoices: String(result.dependencyCounts.invoices),
                  timesheets: String(result.dependencyCounts.timesheets),
                }),
              );
            }
            router.replace('/(tabs)/clients');
          } catch (error) {
            console.error('Error deleting client:', error);
            Alert.alert(LL.common.error(), LL.clients.errorDeleteClient());
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen
          options={{
            title: LL.clients.editClient(),
            headerStyle: {
              backgroundColor: palette.background,
            },
            headerTintColor: palette.text,
          }}
        />
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.tint} />
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.clients.editClient(),
          headerStyle: {
            backgroundColor: palette.background,
          },
          headerTintColor: palette.text,
        }}
      />
      <KeyboardAwareScroll contentContainerStyle={styles.content}>
        <ClientForm
          formData={formData}
          onFormDataChange={setFormData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onLookupByCompanyId={handleLookupByDefaultRegistry}
          onLookupRegistryPicker={handleLookupWithRegistryPicker}
          isLookupLoading={isLookupLoading}
          isEditMode={true}
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
                  onPress: () => {
                    void applyLookupCompany(lookupWizardCompany);
                  },
                },
                {
                  key: 'with_address',
                  label: LL.clients.lookupWizardWithAddress(),
                  onPress: () => {
                    void applyLookupCompany(lookupWizardCompany, { includeAddress: true });
                  },
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
    paddingBottom: 32,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
