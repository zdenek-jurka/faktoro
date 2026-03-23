import { Stack } from 'expo-router';

import { DrawerToggleButton } from '@/components/ui/drawer-toggle-button';

export default function SettingsStackLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <DrawerToggleButton />,
        }}
      />
      <Stack.Screen name="advanced" />
      <Stack.Screen name="export-integrations" />
      <Stack.Screen name="export-integration-form" />
      <Stack.Screen name="sync-pairing" />
      <Stack.Screen name="sync-devices" />
      <Stack.Screen name="sync-maintenance" />
    </Stack>
  );
}
