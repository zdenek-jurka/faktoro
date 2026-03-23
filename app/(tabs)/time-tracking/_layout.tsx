import { Stack } from 'expo-router';

import { DrawerToggleButton } from '@/components/ui/drawer-toggle-button';
import { useI18nContext } from '@/i18n/i18n-react';

export default function TimeTrackingStackLayout() {
  const { LL } = useI18nContext();

  return (
    <Stack screenOptions={{ headerBackTitle: LL.tabs.time() }}>
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <DrawerToggleButton />,
        }}
      />
      <Stack.Screen
        name="client/[id]"
        options={{
          title: LL.timeTracking.clientDetail(),
          headerBackTitle: LL.tabs.time(),
        }}
      />
    </Stack>
  );
}
