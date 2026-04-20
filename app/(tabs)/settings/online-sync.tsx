import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { isSyncEnabled } from '@/constants/features';
import { Colors, FontSizes, getSwitchColors, Spacing } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePendingSyncConflictCount } from '@/hooks/use-pending-sync-conflict-count';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  observeDeviceSyncSettings,
  updateDeviceSyncSettings,
  type DeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { Redirect, Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

export default function SettingsOnlineSyncScreen() {
  const [deviceSyncSettings, setDeviceSyncSettings] = useState<DeviceSyncSettings | null>(null);

  useEffect(() => {
    const unsub = observeDeviceSyncSettings(setDeviceSyncSettings);
    return unsub;
  }, []);

  if (!isSyncEnabled || (deviceSyncSettings !== null && !deviceSyncSettings.syncFeatureEnabled)) {
    return <Redirect href="/settings" />;
  }

  return <SettingsOnlineSyncScreenContent deviceSyncSettings={deviceSyncSettings} />;
}

function SettingsOnlineSyncScreenContent({
  deviceSyncSettings,
}: {
  deviceSyncSettings: DeviceSyncSettings | null;
}) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const headerHeight = useHeaderHeight();
  const { LL } = useI18nContext();
  const router = useRouter();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const pendingConflictCount = usePendingSyncConflictCount();
  const conflictBadgeLabel =
    pendingConflictCount > 0
      ? pendingConflictCount > 9
        ? '9+'
        : String(pendingConflictCount)
      : undefined;

  const [isServerReachable, setIsServerReachable] = useState(false);
  const syncIsRegistered = deviceSyncSettings?.syncIsRegistered || false;
  const syncAutoEnabled = deviceSyncSettings?.syncAutoEnabled ?? true;
  const syncServerUrl = deviceSyncSettings?.syncServerUrl || '';

  const normalizedSyncServerUrl = useMemo(
    () => syncServerUrl.trim().replace(/\/+$/, ''),
    [syncServerUrl],
  );

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const run = async () => {
      if (!normalizedSyncServerUrl) {
        if (!disposed) setIsServerReachable(false);
        return;
      }
      try {
        const response = await fetch(`${normalizedSyncServerUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        if (!disposed) setIsServerReachable(response.ok);
      } catch {
        if (!disposed) setIsServerReachable(false);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    void run();
    return () => {
      disposed = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [normalizedSyncServerUrl, syncIsRegistered]);

  const handleAutoSyncToggle = async (value: boolean) => {
    await updateDeviceSyncSettings({ syncAutoEnabled: value });
  };

  type SyncStatus = 'active' | 'paused' | 'unavailable' | 'unconfigured';

  const syncStatus = useMemo<SyncStatus>(() => {
    if (!normalizedSyncServerUrl || !syncIsRegistered) return 'unconfigured';
    if (!isServerReachable) return 'unavailable';
    if (!syncAutoEnabled) return 'paused';
    return 'active';
  }, [normalizedSyncServerUrl, syncIsRegistered, isServerReachable, syncAutoEnabled]);

  const statusConfig = useMemo(() => {
    switch (syncStatus) {
      case 'active':
        return {
          icon: 'checkmark.circle.fill' as const,
          color: palette.success,
          label: LL.settings.syncStatusActive(),
        };
      case 'paused':
        return {
          icon: 'pause.circle.fill' as const,
          color: palette.icon,
          label: LL.settings.syncStatusPaused(),
        };
      case 'unavailable':
        return {
          icon: 'xmark.circle.fill' as const,
          color: palette.destructive,
          label: LL.settings.syncStatusUnavailable(),
        };
      case 'unconfigured':
      default:
        return {
          icon: 'exclamationmark.circle.fill' as const,
          color: palette.icon,
          label: LL.settings.syncStatusNotConfigured(),
        };
    }
  }, [syncStatus, palette, LL]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.syncTitle() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
        >
          {/* Status banner */}
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: palette.cardBackground, borderColor: statusConfig.color },
            ]}
          >
            <IconSymbol name={statusConfig.icon} size={28} color={statusConfig.color} />
            <View style={styles.statusBannerText}>
              <ThemedText
                type="defaultSemiBold"
                style={[styles.statusBannerLabel, { color: statusConfig.color }]}
              >
                {statusConfig.label}
              </ThemedText>
              <ThemedText
                style={[styles.statusBannerDescription, { color: palette.textSecondary }]}
              >
                {syncIsRegistered && normalizedSyncServerUrl
                  ? LL.settings.syncDescriptionConnected({ serverUrl: normalizedSyncServerUrl })
                  : LL.settings.syncDescription()}
              </ThemedText>
            </View>
          </View>

          {/* Status section */}
          <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
            {LL.settings.syncStatusSection()}
          </ThemedText>
          <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
            <View style={styles.statusRow}>
              <ThemedText style={styles.statusRowLabel}>
                {LL.settings.syncDeviceStatusLabel()}
              </ThemedText>
              <View style={styles.statusRowValue}>
                <IconSymbol
                  name={syncIsRegistered ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                  size={14}
                  color={syncIsRegistered ? palette.success : palette.destructive}
                />
                <ThemedText
                  style={[
                    styles.statusRowText,
                    { color: syncIsRegistered ? palette.success : palette.destructive },
                  ]}
                >
                  {syncIsRegistered
                    ? LL.settings.syncStatusRegistered()
                    : LL.settings.syncStatusNotRegistered()}
                </ThemedText>
              </View>
            </View>

            <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />

            <View style={styles.statusRow}>
              <ThemedText style={styles.statusRowLabel}>
                {LL.settings.syncServerStatusLabel()}
              </ThemedText>
              <View style={styles.statusRowValue}>
                <IconSymbol
                  name={isServerReachable ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                  size={14}
                  color={isServerReachable ? palette.success : palette.destructive}
                />
                <ThemedText
                  style={[
                    styles.statusRowText,
                    { color: isServerReachable ? palette.success : palette.destructive },
                  ]}
                >
                  {isServerReachable
                    ? LL.settings.syncStatusAvailable()
                    : LL.settings.syncStatusUnavailable()}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Options section */}
          <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
            {LL.settings.syncOptionsSection()}
          </ThemedText>
          <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
            <View style={styles.switchRow}>
              <View style={styles.switchRowText}>
                <ThemedText type="defaultSemiBold" style={styles.switchRowTitle}>
                  {LL.settings.syncAutoEnabledTitle()}
                </ThemedText>
                <ThemedText style={[styles.switchRowDesc, { color: palette.textSecondary }]}>
                  {LL.settings.syncAutoEnabledDescription()}
                </ThemedText>
              </View>
              <Switch
                value={syncAutoEnabled}
                onValueChange={(v) => void handleAutoSyncToggle(v)}
                {...getSwitchColors(palette)}
              />
            </View>

            <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />

            <Pressable
              style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
              onPress={() => router.push('/settings/sync-pairing')}
              android_ripple={{ color: palette.border }}
              accessibilityRole="button"
            >
              <ThemedText style={styles.navRowLabel}>
                {LL.settings.syncOpenPairingPage()}
              </ThemedText>
              <IconSymbol name="chevron.right" size={16} color={palette.icon} />
            </Pressable>

            <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
            <Pressable
              style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
              onPress={() => router.push('/settings/sync-devices')}
              android_ripple={{ color: palette.border }}
              accessibilityRole="button"
            >
              <ThemedText style={styles.navRowLabel}>
                {LL.settings.syncOpenDevicesPage()}
              </ThemedText>
              <IconSymbol name="chevron.right" size={16} color={palette.icon} />
            </Pressable>
            {syncIsRegistered && (
              <>
                <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                <Pressable
                  style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
                  onPress={() => router.push('/settings/sync-maintenance')}
                  android_ripple={{ color: palette.border }}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.navRowLabel}>
                    {LL.settings.syncOpenMaintenancePage()}
                  </ThemedText>
                  <View style={styles.navRowAccessory}>
                    {conflictBadgeLabel ? (
                      <View style={[styles.navRowBadge, { backgroundColor: palette.destructive }]}>
                        <ThemedText
                          style={[styles.navRowBadgeText, { color: palette.onDestructive }]}
                        >
                          {conflictBadgeLabel}
                        </ThemedText>
                      </View>
                    ) : null}
                    <IconSymbol name="chevron.right" size={16} color={palette.icon} />
                  </View>
                </Pressable>
              </>
            )}
          </View>

          {syncStatus === 'unconfigured' && (
            <Pressable
              style={styles.sourceCodeNote}
              onPress={() =>
                void Linking.openURL('https://github.com/zdenek-jurka/faktoro-sync-server')
              }
            >
              <ThemedText style={[styles.sourceCodeText, { color: palette.textSecondary }]}>
                {LL.settings.syncServerSourceCode()}{' '}
                <ThemedText style={[styles.sourceCodeLink, { color: palette.tint }]}>
                  github.com/zdenek-jurka/faktoro-sync-server
                </ThemedText>
              </ThemedText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: 40, gap: Spacing.xs },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 12,
    borderLeftWidth: 3,
    marginBottom: Spacing.sm,
  },
  statusBannerText: { flex: 1 },
  statusBannerLabel: { fontSize: FontSizes.md, marginBottom: 2 },
  statusBannerDescription: { fontSize: FontSizes.sm },

  sectionHeader: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingHorizontal: 2,
  },

  card: { borderRadius: 12, overflow: 'hidden' },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  statusRowLabel: { fontSize: FontSizes.md },
  statusRowValue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusRowText: { fontSize: FontSizes.sm, fontWeight: '600' },

  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  switchRowText: { flex: 1 },
  switchRowTitle: { fontSize: FontSizes.md, marginBottom: 2 },
  switchRowDesc: { fontSize: FontSizes.sm },

  sourceCodeNote: { paddingHorizontal: 2, paddingTop: Spacing.sm },
  sourceCodeText: { fontSize: FontSizes.xs, lineHeight: 17 },
  sourceCodeLink: { fontSize: FontSizes.xs },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  navRowLabel: { fontSize: FontSizes.md },
  navRowAccessory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navRowBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  navRowBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  pressed: { opacity: 0.72 },
});
