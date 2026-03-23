import { RegistrySettingsForm } from '@/components/settings/registry-settings-form';
import { ThemedView } from '@/components/themed-view';
import { useI18nContext } from '@/i18n/i18n-react';
import { Stack } from 'expo-router';
import React from 'react';

export default function CompanyRegistryUkSettingsScreen() {
  const { LL } = useI18nContext();

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: LL.settings.companyRegistryOptionUkCompaniesHouse() }} />
      <RegistrySettingsForm
        registryKey="uk_companies_house"
        fields={[
          {
            key: 'api_key',
            label: LL.settings.companyRegistryApiKeyLabel(),
            help: LL.settings.companyRegistryApiKeyHelp(),
            required: true,
          },
        ]}
      />
    </ThemedView>
  );
}
