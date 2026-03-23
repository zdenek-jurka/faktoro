import { Stack } from 'expo-router';

import { DrawerToggleButton } from '@/components/ui/drawer-toggle-button';
import { useI18nContext } from '@/i18n/i18n-react';

export default function TimesheetsStackLayout() {
  const { LL } = useI18nContext();

  return (
    <Stack screenOptions={{ headerBackTitle: LL.timesheets.title() }}>
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <DrawerToggleButton />,
        }}
      />
    </Stack>
  );
}
