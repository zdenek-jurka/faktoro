import { Stack } from 'expo-router';

import { DrawerToggleButton } from '@/components/ui/drawer-toggle-button';
import { useI18nContext } from '@/i18n/i18n-react';

export default function InvoicesStackLayout() {
  const { LL } = useI18nContext();

  return (
    <Stack screenOptions={{ headerBackTitle: LL.invoices.title() }}>
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <DrawerToggleButton />,
        }}
      />
      <Stack.Screen name="new" options={{ title: LL.invoices.draftTitle() }} />
      <Stack.Screen
        name="new-item"
        options={{
          title: LL.invoices.addItem(),
          headerBackTitle: LL.invoices.draftTitle(),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: LL.invoices.title() }} />
      <Stack.Screen name="[id]/cancel" options={{ title: LL.invoices.cancelScreenTitle() }} />
      <Stack.Screen name="[id]/delete" options={{ title: LL.invoices.deleteScreenTitle() }} />
      <Stack.Screen name="[id]/delete-auth" options={{ title: LL.invoices.deleteAppLockTitle() }} />
    </Stack>
  );
}
