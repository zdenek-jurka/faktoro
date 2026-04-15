import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isDangerousAppDataResetEnabled, isSyncEnabled } from '@/constants/features';
import { Colors, getSwitchColors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  observeDeviceSyncSettings,
  updateDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { observeBetaSettings, updateBetaSettings } from '@/repositories/beta-settings-repository';
import { dangerouslyResetAllLocalAppData } from '@/repositories/dangerous-local-data-reset-repository';
import { getErrorMessage } from '@/utils/error-utils';
import { showAlert, showConfirm } from '@/utils/platform-alert';
import { isIos } from '@/utils/platform';
import { Redirect, Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

export default function SettingsAdvancedScreen() {
  if (!isSyncEnabled) {
    return <Redirect href="/settings" />;
  }

  return <SettingsAdvancedScreenContent />;
}

function SettingsAdvancedScreenContent() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const { LL } = useI18nContext();
  const contentStyle = useBottomSafeAreaStyle(styles.content);

  const [syncFeatureEnabled, setSyncFeatureEnabled] = useState(false);
  const [timerWidgetsEnabled, setTimerWidgetsEnabled] = useState(true);
  const [exportIntegrationsEnabled, setExportIntegrationsEnabled] = useState(false);
  const [resettingLocalData, setResettingLocalData] = useState(false);

  useEffect(() => {
    const unsub = observeDeviceSyncSettings((settings) => {
      setSyncFeatureEnabled(settings.syncFeatureEnabled);
      setTimerWidgetsEnabled(settings.timerWidgetsEnabled !== false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = observeBetaSettings((settings) => {
      setExportIntegrationsEnabled(settings.exportIntegrationsEnabled);
    });
    return unsub;
  }, []);

  const handleToggleSync = async (value: boolean) => {
    setSyncFeatureEnabled(value);
    await updateDeviceSyncSettings({ syncFeatureEnabled: value });
  };

  const handleToggleExportIntegrations = async (value: boolean) => {
    setExportIntegrationsEnabled(value);
    await updateBetaSettings({ exportIntegrationsEnabled: value });
  };

  const handleToggleTimerWidgets = async (value: boolean) => {
    setTimerWidgetsEnabled(value);
    await updateDeviceSyncSettings({ timerWidgetsEnabled: value });
  };

  const handleDangerousResetAppData = async () => {
    const confirmed = await showConfirm({
      title: LL.settings.advancedDangerousResetDataConfirmTitle(),
      message: LL.settings.advancedDangerousResetDataConfirmMessage(),
      cancelText: LL.common.cancel(),
      confirmText: LL.settings.advancedDangerousResetDataConfirmContinue(),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      setResettingLocalData(true);
      await dangerouslyResetAllLocalAppData();
      router.replace('/onboarding');
    } catch (error) {
      const message = getErrorMessage(error, LL.common.errorUnknown());
      showAlert(LL.common.error(), message);
    } finally {
      setResettingLocalData(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.advancedTitle() }} />

      <ScrollView contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
                {LL.settings.advancedSyncFeatureTitle()}
              </ThemedText>
              <ThemedText style={[styles.rowDescription, { color: palette.textSecondary }]}>
                {LL.settings.advancedSyncFeatureDescription()}
              </ThemedText>
            </View>
            <Switch
              value={syncFeatureEnabled}
              onValueChange={(value) => void handleToggleSync(value)}
              {...getSwitchColors(palette)}
            />
          </View>
          {isIos ? (
            <>
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
                    {LL.settings.advancedTimerWidgetsTitle()}
                  </ThemedText>
                  <ThemedText style={[styles.rowDescription, { color: palette.textSecondary }]}>
                    {LL.settings.advancedTimerWidgetsDescription()}
                  </ThemedText>
                </View>
                <Switch
                  value={timerWidgetsEnabled}
                  onValueChange={(value) => void handleToggleTimerWidgets(value)}
                  {...getSwitchColors(palette)}
                />
              </View>
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
            </>
          ) : null}
          <View style={styles.row}>
            <View style={styles.rowText}>
              <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
                {LL.settings.advancedExportIntegrationsTitle()}
              </ThemedText>
              <ThemedText style={[styles.rowDescription, { color: palette.textSecondary }]}>
                {LL.settings.advancedExportIntegrationsDescription()}
              </ThemedText>
            </View>
            <Switch
              value={exportIntegrationsEnabled}
              onValueChange={(value) => void handleToggleExportIntegrations(value)}
              {...getSwitchColors(palette)}
            />
          </View>
        </View>

        {isDangerousAppDataResetEnabled ? (
          <View
            style={[styles.card, styles.dangerCard, { backgroundColor: palette.cardBackground }]}
          >
            <View style={styles.dangerHeader}>
              <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
                {LL.settings.advancedDangerousResetDataTitle()}
              </ThemedText>
              <ThemedText style={[styles.rowDescription, { color: palette.textSecondary }]}>
                {LL.settings.advancedDangerousResetDataDescription()}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => void handleDangerousResetAppData()}
              disabled={resettingLocalData}
              style={({ pressed }) => [
                styles.dangerButton,
                {
                  borderColor: palette.destructive,
                  backgroundColor: pressed ? `${palette.destructive}18` : 'transparent',
                  opacity: resettingLocalData ? 0.65 : 1,
                },
              ]}
            >
              <ThemedText style={[styles.dangerButtonLabel, { color: palette.destructive }]}>
                {resettingLocalData
                  ? LL.common.loading()
                  : LL.settings.advancedDangerousResetDataAction()}
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, marginBottom: 4 },
  rowDescription: { fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth },
  dangerCard: {
    marginTop: 16,
    padding: 14,
    gap: 14,
  },
  dangerHeader: { gap: 4 },
  dangerButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
