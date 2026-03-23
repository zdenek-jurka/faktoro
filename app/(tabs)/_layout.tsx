import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { ParamListBase } from '@react-navigation/native';
import { Tabs, useNavigation } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePendingSyncConflictCount } from '@/hooks/use-pending-sync-conflict-count';
import { useI18nContext } from '@/i18n/i18n-react';
import { getMoreSectionTitle } from '@/i18n/locale-options';
import { isIos } from '@/utils/platform';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { LL, locale } = useI18nContext();
  const drawerNavigation = useNavigation<DrawerNavigationProp<ParamListBase>>('/');
  const moreTitle = getMoreSectionTitle(locale);
  const pendingConflictCount = usePendingSyncConflictCount();
  const moreBadge =
    pendingConflictCount > 0 ? (pendingConflictCount > 9 ? '9+' : pendingConflictCount) : undefined;

  return (
    <Tabs
      initialRouteName="time-tracking"
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="time-tracking"
        options={{
          title: LL.tabs.time(),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="timesheets"
        options={{
          title: LL.timesheets.title(),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="doc.text.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: LL.invoices.title(),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="doc.richtext.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: LL.tabs.clients(),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.3.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            drawerNavigation.openDrawer();
          },
        }}
        options={{
          href: isIos ? undefined : null,
          title: moreTitle,
          tabBarBadge: isIos ? moreBadge : undefined,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="ellipsis.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="price-list"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
