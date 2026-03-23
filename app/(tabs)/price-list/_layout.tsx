import { Stack } from 'expo-router';

import { DrawerToggleButton } from '@/components/ui/drawer-toggle-button';
import { useI18nContext } from '@/i18n/i18n-react';

export default function PriceListStackLayout() {
  const { LL } = useI18nContext();

  return (
    <Stack screenOptions={{ headerBackTitle: LL.tabs.priceList() }}>
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <DrawerToggleButton />,
        }}
      />
      <Stack.Screen name="new" />
      <Stack.Screen name="item/[id]" />
      <Stack.Screen name="item/[id]/edit" />
    </Stack>
  );
}
