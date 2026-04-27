import { useI18nContext } from '@/i18n/i18n-react';
import { Stack } from 'expo-router';

import { DrawerToggleButton } from '@/components/ui/drawer-toggle-button';

export default function ClientsStackLayout() {
  const { LL } = useI18nContext();

  return (
    <Stack screenOptions={{ headerBackTitle: LL.tabs.clients() }}>
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <DrawerToggleButton />,
        }}
      />
      <Stack.Screen name="add" />
      <Stack.Screen name="detail/[id]" />
      <Stack.Screen name="edit/[id]" />
      <Stack.Screen name="address/add" />
      <Stack.Screen name="address/[id]" />
      <Stack.Screen name="timesheets/[id]" />
      <Stack.Screen name="timesheets/detail/[id]" />
      <Stack.Screen name="time-tracking/[id]" />
      <Stack.Screen name="time-entry/[id]/edit" />
      <Stack.Screen name="invoices/[id]" />
      <Stack.Screen name="invoices/detail/[id]" />
    </Stack>
  );
}
