import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { isSyncEnabled } from '@/constants/features';
import { Colors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePendingSyncConflictCount } from '@/hooks/use-pending-sync-conflict-count';
import { useI18nContext } from '@/i18n/i18n-react';
import { observeDeviceSyncSettings } from '@/repositories/device-sync-settings-repository';
import { observeBetaSettings } from '@/repositories/beta-settings-repository';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

type SettingsRoute =
  | '/settings/language'
  | '/settings/security'
  | '/settings/business-profile'
  | '/settings/invoice-defaults'
  | '/settings/currencies'
  | '/settings/branding'
  | '/settings/numbering'
  | '/settings/vat'
  | '/settings/offline-backup'
  | '/settings/online-sync'
  | '/settings/sync-devices'
  | '/settings/sync-maintenance'
  | '/settings/advanced'
  | '/settings/company-registries'
  | '/settings/export-integrations';

type SettingsItem = {
  href: SettingsRoute;
  title: string;
  subtitle: string;
  badgeLabel?: string;
};

type SettingsSection = {
  title: string;
  items: SettingsItem[];
};

function SettingsRow({ item, onPress }: { item: SettingsItem; onPress: () => void }) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.cardBackground },
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
      android_ripple={{ color: palette.border }}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.rowContent}>
        <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
          {item.title}
        </ThemedText>
        <ThemedText style={styles.rowSubtitle}>{item.subtitle}</ThemedText>
      </View>
      <View style={styles.rowAccessory}>
        {item.badgeLabel ? (
          <View style={[styles.rowBadge, { backgroundColor: palette.destructive }]}>
            <ThemedText style={[styles.rowBadgeText, { color: palette.onDestructive }]}>
              {item.badgeLabel}
            </ThemedText>
          </View>
        ) : null}
        <IconSymbol name="chevron.right" size={20} color={palette.icon} />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { LL } = useI18nContext();
  const router = useRouter();
  const listContentStyle = useBottomSafeAreaStyle(styles.listContent);
  const [syncFeatureEnabled, setSyncFeatureEnabled] = useState(false);
  const [exportIntegrationsEnabled, setExportIntegrationsEnabled] = useState(false);
  const pendingConflictCount = usePendingSyncConflictCount();
  const conflictBadgeLabel =
    pendingConflictCount > 0
      ? pendingConflictCount > 9
        ? '9+'
        : String(pendingConflictCount)
      : undefined;

  useEffect(() => {
    if (!isSyncEnabled) return;
    const unsub = observeDeviceSyncSettings((s) => setSyncFeatureEnabled(s.syncFeatureEnabled));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = observeBetaSettings((s) =>
      setExportIntegrationsEnabled(s.exportIntegrationsEnabled),
    );
    return unsub;
  }, []);

  const sections: SettingsSection[] = [
    {
      title: LL.settings.applicationSectionTitle(),
      items: [
        {
          href: '/settings/language',
          title: LL.settings.languageTitle(),
          subtitle: LL.settings.languageSubtitle(),
        },
        {
          href: '/settings/security',
          title: LL.settings.securityTitle(),
          subtitle: LL.settings.securitySubtitle(),
        },
      ],
    },
    {
      title: LL.settings.billingSectionTitle(),
      items: [
        {
          href: '/settings/business-profile',
          title: LL.settings.businessProfileTitle(),
          subtitle: LL.settings.businessProfileSubtitle(),
        },
        {
          href: '/settings/invoice-defaults',
          title: LL.settings.invoiceDefaultsTitle(),
          subtitle: LL.settings.invoiceDefaultsSubtitle(),
        },
        {
          href: '/settings/currencies',
          title: LL.settings.currenciesTitle(),
          subtitle: LL.settings.currenciesSubtitle(),
        },
        {
          href: '/settings/branding',
          title: LL.settings.brandingTitle(),
          subtitle: LL.settings.brandingSubtitle(),
        },
        {
          href: '/settings/numbering',
          title: LL.settings.numberingTitle(),
          subtitle: LL.settings.numberingSubtitle(),
        },
        {
          href: '/settings/vat',
          title: LL.settings.vatTitle(),
          subtitle: LL.settings.vatSubtitle(),
        },
      ],
    },
    {
      title: LL.settings.dataSectionTitle(),
      items: [
        {
          href: '/settings/offline-backup',
          title: LL.settings.offlineBackupTitle(),
          subtitle: LL.settings.offlineBackupSubtitle(),
        },
        ...(isSyncEnabled && syncFeatureEnabled
          ? [
              {
                href: '/settings/online-sync' as const,
                title: LL.settings.syncTitle(),
                subtitle: LL.settings.onlineSyncTitle(),
                badgeLabel: conflictBadgeLabel,
              },
            ]
          : []),
      ],
    },
    {
      title: LL.settings.integrationsSectionTitle(),
      items: [
        {
          href: '/settings/company-registries',
          title: LL.settings.companyRegistrySettingsTitle(),
          subtitle: LL.settings.companyRegistrySettingsSubtitle(),
        },
        ...(exportIntegrationsEnabled
          ? [
              {
                href: '/settings/export-integrations' as const,
                title: LL.settings.exportIntegrationsTitle(),
                subtitle: LL.settings.exportIntegrationsSubtitle(),
              },
            ]
          : []),
      ],
    },
    ...(isSyncEnabled
      ? [
          {
            title: LL.settings.advancedSectionTitle(),
            items: [
              {
                href: '/settings/advanced' as const,
                title: LL.settings.advancedTitle(),
                subtitle: LL.settings.advancedSubtitle(),
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.title() }} />

      <ScrollView contentContainerStyle={listContentStyle} showsVerticalScrollIndicator={false}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              {section.title}
            </ThemedText>
            <View style={styles.sectionItems}>
              {section.items.map((item) => (
                <SettingsRow key={item.href} item={item} onPress={() => router.push(item.href)} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 18,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    letterSpacing: 0.3,
    opacity: 0.65,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  sectionItems: {
    gap: 10,
  },
  row: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowContent: {
    flex: 1,
    gap: 4,
  },
  rowAccessory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rowBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rowTitle: {
    fontSize: 17,
  },
  rowSubtitle: {
    fontSize: 13,
    opacity: 0.65,
  },
});
