import { RegistrySettingsForm } from '@/components/settings/registry-settings-form';
import { ThemedView } from '@/components/themed-view';
import { useI18nContext } from '@/i18n/i18n-react';
import { Stack } from 'expo-router';
import React from 'react';

export default function CompanyRegistryCustomSettingsScreen() {
  const { LL } = useI18nContext();
  const responseExample = `{
  "companyId": "00006947",
  "legalName": "Ministerstvo financí",
  "vatNumber": "CZ00006947",
  "importAddresses": [
    {
      "type": "billing",
      "street": "Letenská 525/15",
      "city": "Praha 1",
      "postalCode": "11800",
      "country": "CZ"
    }
  ]
}`;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: LL.settings.companyRegistryOptionCustomConnector() }} />
      <RegistrySettingsForm
        registryKey="custom_connector"
        fields={[
          {
            key: 'url',
            label: LL.settings.companyRegistryConnectorUrlLabel(),
            help: LL.settings.companyRegistryConnectorUrlHelp(),
            placeholder: 'https://example.com/company/{companyId}',
            required: true,
          },
          {
            key: 'header_key',
            label: LL.settings.companyRegistryConnectorHeaderKeyLabel(),
            help: LL.settings.companyRegistryConnectorHeaderHelp(),
            placeholder: 'x-api-key',
          },
          {
            key: 'header_value',
            label: LL.settings.companyRegistryConnectorHeaderValueLabel(),
            help: LL.settings.companyRegistryConnectorHeaderHelp(),
            placeholder: 'secret-token',
          },
        ]}
        infoSection={{
          title: LL.settings.companyRegistryCustomResponseTitle(),
          description: LL.settings.companyRegistryCustomResponseDescription(),
          example: responseExample,
          docHint: LL.settings.companyRegistryCustomResponseDocHint(),
        }}
      />
    </ThemedView>
  );
}
