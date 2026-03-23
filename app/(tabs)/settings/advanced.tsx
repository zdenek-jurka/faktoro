import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isSyncEnabled } from '@/constants/features';
import { Colors, getSwitchColors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  observeDeviceSyncSettings,
  updateDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { observeBetaSettings, updateBetaSettings } from '@/repositories/beta-settings-repository';
import { isIos } from '@/utils/platform';
import { Redirect, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

export default function SettingsAdvancedScreen() {
  if (!isSyncEnabled) {
    return <Redirect href="/settings" />;
  }

  return <SettingsAdvancedScreenContent />;
}

function SettingsAdvancedScreenContent() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const { LL } = useI18nContext();
  const contentStyle = useBottomSafeAreaStyle(styles.content);

  const [syncFeatureEnabled, setSyncFeatureEnabled] = useState(false);
  const [timerWidgetsEnabled, setTimerWidgetsEnabled] = useState(true);
  const [exportIntegrationsEnabled, setExportIntegrationsEnabled] = useState(false);

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
});
