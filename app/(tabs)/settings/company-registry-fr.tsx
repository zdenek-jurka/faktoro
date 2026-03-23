import { RegistrySettingsForm } from '@/components/settings/registry-settings-form';
import { ThemedView } from '@/components/themed-view';
import { useI18nContext } from '@/i18n/i18n-react';
import { Stack } from 'expo-router';
import React from 'react';

export default function CompanyRegistryFrSettingsScreen() {
  const { LL } = useI18nContext();

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: LL.settings.companyRegistryOptionFrInsee() }} />
      <RegistrySettingsForm
        registryKey="fr_insee"
        fields={[
          {
            key: 'api_token',
            label: LL.settings.companyRegistryApiTokenLabel(),
            help: LL.settings.companyRegistryApiTokenHelp(),
            required: true,
          },
        ]}
      />
    </ThemedView>
  );
}
