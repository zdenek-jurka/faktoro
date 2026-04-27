import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { isSyncEnabled } from '@/constants/features';
import { FontSizes, Shadows, Spacing, withOpacity } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { useSyncRuntimeStatus } from '@/utils/sync-runtime-status';
import { isIos } from '@/utils/platform';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = isIos ? 49 : 56;
const TOP_LEVEL_TAB_PATHS = new Set([
  '/',
  '/time-tracking',
  '/timesheets',
  '/invoices',
  '/clients',
  '/settings',
  '/price-list',
  '/reports',
]);

type ChipConfig = {
  label: string;
  icon: IconSymbolName;
  color: string;
  spinning?: boolean;
  prominent?: boolean;
};

type Props = {
  visible?: boolean;
};

export function SyncStatusTabOverlay({ visible = true }: Props) {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const syncStatus = useSyncRuntimeStatus();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const topLevelPath = normalizedPath.replace(/\/index$/, '') || '/';
  const shouldRender =
    isSyncEnabled &&
    visible &&
    syncStatus.indicatorEnabled &&
    syncStatus.isRegistered &&
    !keyboardVisible &&
    TOP_LEVEL_TAB_PATHS.has(topLevelPath);

  const chip = useMemo<ChipConfig>(() => {
    if (!syncStatus.autoEnabled) {
      return {
        label: LL.settings.syncRuntimePaused(),
        icon: 'pause.circle.fill',
        color: palette.icon,
      };
    }

    if (syncStatus.serverReachable === false || !syncStatus.isConfigured) {
      return {
        label: LL.settings.syncRuntimeOffline(),
        icon: 'xmark.circle.fill',
        color: palette.destructive,
        prominent: true,
      };
    }

    if (syncStatus.serverReachable === null) {
      return {
        label: LL.settings.syncRuntimeChecking(),
        icon: 'arrow.triangle.2.circlepath',
        color: palette.icon,
      };
    }

    if (syncStatus.syncRunning) {
      return {
        label: LL.settings.syncRuntimeSyncing(),
        icon: 'arrow.triangle.2.circlepath',
        color: palette.tint,
        spinning: true,
        prominent: true,
      };
    }

    if (syncStatus.pendingLocalChanges) {
      return {
        label: LL.settings.syncRuntimePending(),
        icon: 'exclamationmark.circle.fill',
        color: palette.timerPause,
        prominent: true,
      };
    }

    if (syncStatus.transportMode === 'ws') {
      return {
        label: LL.settings.syncRuntimeLive(),
        icon: 'checkmark.circle.fill',
        color: palette.success,
      };
    }

    return {
      label: LL.settings.syncRuntimeInterval(),
      icon: 'arrow.triangle.2.circlepath',
      color: palette.tint,
    };
  }, [LL.settings, palette, syncStatus]);

  if (!shouldRender) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { bottom: insets.bottom + TAB_BAR_HEIGHT + Spacing.sm }]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.chip,
          chip.prominent && styles.chipProminent,
          {
            backgroundColor: palette.cardBackground,
            borderColor: withOpacity(chip.color, chip.prominent ? 0.38 : 0.24),
            opacity: pressed ? 0.78 : 1,
            ...(isIos ? Shadows.sm : {}),
          },
        ]}
        onPress={() => router.push('/settings/online-sync')}
        accessibilityRole="button"
        accessibilityLabel={LL.settings.syncRuntimeOpenDetails()}
      >
        {chip.spinning ? (
          <ActivityIndicator size="small" color={chip.color} />
        ) : (
          <IconSymbol name={chip.icon} size={15} color={chip.color} />
        )}
        <ThemedText style={[styles.label, { color: chip.color }]} numberOfLines={1}>
          {chip.label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    zIndex: 20,
  },
  chip: {
    minHeight: 30,
    maxWidth: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 1,
  },
  chipProminent: {
    paddingHorizontal: 13,
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
});
