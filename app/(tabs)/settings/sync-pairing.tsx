import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FontSizes, Spacing, getSwitchColors } from '@/constants/theme';
import { isSyncEnabled } from '@/constants/features';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
  updateDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import {
  getSettings,
  prepareAppSettingsForIncomingRemoteSync,
} from '@/repositories/settings-repository';
import { setOnboardingCompleted } from '@/repositories/onboarding-repository';
import { generateInstanceKey, isSecureCryptoAvailable } from '@/repositories/sync-crypto';
import {
  forgetServerRegistration,
  restoreSnapshotBackup,
  runOnlineSyncSafely,
  touchAllSyncData,
} from '@/repositories/sync-repository';
import { fetchWithTimeout, syncDebugLog } from '@/utils/sync-pairing-utils';
import { showAlert, showConfirm } from '@/utils/platform-alert';
import { isPlausibleEmail } from '@/utils/email-utils';
import { isIos } from '@/utils/platform';
import Constants from 'expo-constants';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';

function normalizeRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function SyncPairingScreen() {
  if (!isSyncEnabled) {
    return <Redirect href="/settings" />;
  }
  return <SyncPairingScreenContent />;
}

function SyncPairingScreenContent() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const { LL } = useI18nContext();
  const headerHeight = useHeaderHeight();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const params = useLocalSearchParams<{
    addDeviceServerUrl?: string;
    addDeviceInstanceId?: string;
    addDeviceRecoveryEmail?: string;
    addDeviceDeviceName?: string;
    completeOnSuccess?: string;
  }>();

  const [syncServerUrl, setSyncServerUrl] = useState('');
  const [syncInstanceId, setSyncInstanceId] = useState('');
  const [syncDeviceId, setSyncDeviceId] = useState('');
  const [syncDeviceName, setSyncDeviceName] = useState('');
  const [syncRecoveryEmail, setSyncRecoveryEmail] = useState('');
  const [syncAuthToken, setSyncAuthToken] = useState('');
  const [syncIsRegistered, setSyncIsRegistered] = useState(false);
  const [syncInstanceKey, setSyncInstanceKey] = useState('');
  const [syncAllowPlaintext, setSyncAllowPlaintext] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [showEditInputs, setShowEditInputs] = useState(false);
  const [useRemoteAppSettingsOnFirstSync, setUseRemoteAppSettingsOnFirstSync] =
    useState(isAddDeviceFlow);
  const [initialServerUrl, setInitialServerUrl] = useState('');
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null);
  const addDeviceServerUrl = normalizeRouteParam(params.addDeviceServerUrl);
  const addDeviceInstanceId = normalizeRouteParam(params.addDeviceInstanceId);
  const addDeviceRecoveryEmail = normalizeRouteParam(params.addDeviceRecoveryEmail);
  const addDeviceDeviceName = normalizeRouteParam(params.addDeviceDeviceName);
  const completeOnSuccess = normalizeRouteParam(params.completeOnSuccess) === '1';
  const isAddDeviceFlow = !!addDeviceServerUrl;

  useEffect(() => {
    const load = async () => {
      const appSettings = await getSettings();
      setSettings(appSettings);
      const ds = await getDeviceSyncSettings(appSettings);
      const nextServerUrl = addDeviceServerUrl || ds.syncServerUrl || '';
      const nextInstanceId = addDeviceInstanceId || ds.syncInstanceId || '';
      const nextDeviceName =
        addDeviceDeviceName ||
        ds.syncDeviceName ||
        (Constants.deviceName as string | undefined) ||
        '';
      const nextRecoveryEmail = addDeviceRecoveryEmail || '';

      setSyncServerUrl(nextServerUrl);
      setInitialServerUrl(nextServerUrl);
      setSyncInstanceId(nextInstanceId);
      setSyncDeviceId(ds.syncDeviceId || '');
      setSyncDeviceName(nextDeviceName);
      setSyncAuthToken(ds.syncAuthToken || '');
      setSyncIsRegistered(ds.syncIsRegistered || false);
      setSyncInstanceKey(ds.syncInstanceKey || '');
      setSyncAllowPlaintext(ds.syncAllowPlaintext || false);
      setSyncRecoveryEmail(nextRecoveryEmail);
    };
    void load();

    const unsub = observeDeviceSyncSettings((ds) => {
      setSyncServerUrl(addDeviceServerUrl || ds.syncServerUrl || '');
      setSyncInstanceId(addDeviceInstanceId || ds.syncInstanceId || '');
      setSyncDeviceId(ds.syncDeviceId || '');
      setSyncDeviceName(addDeviceDeviceName || ds.syncDeviceName || '');
      setSyncAuthToken(ds.syncAuthToken || '');
      setSyncIsRegistered(ds.syncIsRegistered || false);
      setSyncInstanceKey(ds.syncInstanceKey || '');
      setSyncAllowPlaintext(ds.syncAllowPlaintext || false);
      if (addDeviceRecoveryEmail) {
        setSyncRecoveryEmail(addDeviceRecoveryEmail);
      }
    });
    return unsub;
  }, [addDeviceDeviceName, addDeviceInstanceId, addDeviceRecoveryEmail, addDeviceServerUrl]);

  // Apply add-device payload passed as route params (from sync-devices screen)
  useEffect(() => {
    if (isAddDeviceFlow) {
      setSyncServerUrl(addDeviceServerUrl);
      setSyncInstanceId(addDeviceInstanceId);
      if (addDeviceRecoveryEmail) setSyncRecoveryEmail(addDeviceRecoveryEmail);
      if (addDeviceDeviceName) setSyncDeviceName(addDeviceDeviceName);
      setShowEditInputs(true);
      setPairingError('');
    }
  }, [
    addDeviceDeviceName,
    addDeviceInstanceId,
    addDeviceRecoveryEmail,
    addDeviceServerUrl,
    isAddDeviceFlow,
  ]);

  const normalizedServerUrl = useMemo(
    () => syncServerUrl.trim().replace(/\/+$/, ''),
    [syncServerUrl],
  );
  const shouldOfferRemoteSettingsAdoption = !syncIsRegistered && isAddDeviceFlow;

  const confirmPlaintextFallback = async (): Promise<boolean> => {
    return showConfirm({
      title: LL.settings.syncInsecureConfirmTitle(),
      message: LL.settings.syncInsecureConfirmMessage(),
      cancelText: LL.common.cancel(),
      confirmText: LL.settings.syncInsecureConfirmContinue(),
      destructive: true,
    });
  };

  const handleSaveConfig = async () => {
    const normalizedInitial = initialServerUrl.trim().replace(/\/+$/, '');

    if (syncIsRegistered && normalizedServerUrl !== normalizedInitial) {
      const confirmed = await showConfirm({
        title: LL.settings.syncSaveUrlChangeConfirmTitle(),
        message: LL.settings.syncSaveUrlChangeConfirmMessage(),
        cancelText: LL.common.cancel(),
        confirmText: LL.settings.syncSaveUrlChangeConfirmContinue(),
        destructive: true,
      });
      if (!confirmed) return;

      const shouldForget = await showConfirm({
        title: LL.settings.syncSaveUrlChangeForgetTitle(),
        message: LL.settings.syncSaveUrlChangeForgetMessage(),
        cancelText: LL.settings.syncSaveUrlChangeForgetSkip(),
        confirmText: LL.settings.syncSaveUrlChangeForgetConfirm(),
        destructive: true,
      });

      if (shouldForget) {
        try {
          const freshSettings = await getSettings();
          await forgetServerRegistration(freshSettings);
        } catch {
          // non-critical — original server may be unreachable
        }
      }

      try {
        await updateDeviceSyncSettings(
          {
            syncServerUrl: normalizedServerUrl || null,
            syncDeviceName: syncDeviceName.trim() || null,
            syncIsRegistered: false,
            syncInstanceId: null,
            syncDeviceId: null,
            syncAuthToken: null,
            syncPairingToken: null,
          },
          settings ?? undefined,
        );
        setInitialServerUrl(normalizedServerUrl);
      } catch {
        showAlert(LL.common.error(), LL.settings.syncGenericError());
      }
      return;
    }

    try {
      await updateDeviceSyncSettings(
        {
          syncServerUrl: normalizedServerUrl || null,
          syncDeviceName: syncDeviceName.trim() || null,
        },
        settings ?? undefined,
      );
      setInitialServerUrl(normalizedServerUrl);
    } catch {
      showAlert(LL.common.error(), LL.settings.syncGenericError());
    }
  };

  const handlePreparePairing = async (overrides?: {
    serverUrl?: string;
    recoveryEmail?: string;
    instanceId?: string;
    deviceName?: string;
    autoSyncAfter?: boolean;
  }) => {
    if (syncingNow) return;

    const effectiveServerUrl =
      overrides?.serverUrl?.trim().replace(/\/+$/, '') || normalizedServerUrl;
    const effectiveRecoveryEmail = ((overrides?.recoveryEmail ?? syncRecoveryEmail) || '')
      .trim()
      .toLowerCase();
    const effectiveDeviceName =
      (overrides?.deviceName ?? syncDeviceName).trim() || 'Faktoro Device';
    const effectiveInstanceId = (overrides?.instanceId ?? syncInstanceId).trim();

    if (!effectiveServerUrl) {
      setPairingError(LL.settings.syncServerUrlRequired());
      showAlert(LL.common.error(), LL.settings.syncServerUrlRequired());
      return;
    }
    if (!isPlausibleEmail(effectiveRecoveryEmail)) {
      setPairingError(LL.settings.syncRecoveryEmailRequired());
      showAlert(LL.common.error(), LL.settings.syncRecoveryEmailRequired());
      return;
    }

    const secureCryptoAvailable = isSecureCryptoAvailable();
    let allowPlaintext = syncAllowPlaintext;

    if (!secureCryptoAvailable && !allowPlaintext) {
      const allow = await confirmPlaintextFallback();
      if (!allow) return;
      allowPlaintext = true;
      setSyncAllowPlaintext(true);
      try {
        await updateDeviceSyncSettings({ syncAllowPlaintext: true }, settings ?? undefined);
      } catch {
        // non-critical
      }
    }

    try {
      setPairingError('');
      setSyncingNow(true);

      syncDebugLog('Calling /api/pairing/init');
      const initResponse = await fetchWithTimeout(`${effectiveServerUrl}/api/pairing/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recovery_email: effectiveRecoveryEmail,
          device_name: effectiveDeviceName,
          instance_id: effectiveInstanceId || null,
        }),
      });
      if (!initResponse.ok) throw new Error(await initResponse.text());
      const initResult = (await initResponse.json()) as {
        instance_id: string;
        device_id: string;
        token: string;
        payload: string;
      };

      syncDebugLog('Calling /api/devices/register-from-scan');
      const registerResponse = await fetchWithTimeout(
        `${effectiveServerUrl}/api/devices/register-from-scan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_code: initResult.payload }),
        },
      );
      if (!registerResponse.ok) throw new Error(await registerResponse.text());
      const registerResult = (await registerResponse.json()) as {
        instance_id: string;
        device_id: string;
        device_name: string;
        recovery_email: string;
        auth_token?: string | null;
      };

      const authToken = registerResult.auth_token?.trim() || '';
      if (!authToken) throw new Error(LL.settings.syncNoAuthToken());

      const instanceKey = secureCryptoAvailable
        ? syncInstanceKey.trim() || generateInstanceKey()
        : '';

      await updateDeviceSyncSettings(
        {
          syncServerUrl: effectiveServerUrl,
          syncInstanceId: registerResult.instance_id,
          syncDeviceId: registerResult.device_id,
          syncDeviceName: registerResult.device_name,
          syncPairingToken: null,
          syncAuthToken: authToken,
          syncIsRegistered: true,
          syncInstanceKey: instanceKey || null,
          syncAllowPlaintext: allowPlaintext || !secureCryptoAvailable,
        },
        settings ?? undefined,
      );

      syncDebugLog('Pairing success', { instance_id: registerResult.instance_id });

      const shouldOfferRestore = Boolean(effectiveInstanceId) || Boolean(overrides?.autoSyncAfter);
      if (shouldOfferRestore) {
        const restoreConfirmed = await showConfirm({
          title: LL.settings.syncRestoreConfirmTitle(),
          message: LL.settings.syncRestoreConfirmMessage(),
          cancelText: LL.common.cancel(),
          confirmText: LL.settings.syncRestoreConfirmAction(),
        });
        if (restoreConfirmed) {
          const freshSettings = await getSettings();
          await restoreSnapshotBackup(freshSettings);
        }
      }

      const shouldAdoptRemoteAppSettings =
        useRemoteAppSettingsOnFirstSync && shouldOfferRemoteSettingsAdoption;

      try {
        if (shouldAdoptRemoteAppSettings) {
          await prepareAppSettingsForIncomingRemoteSync();
        }
        await touchAllSyncData({
          excludeTables: shouldAdoptRemoteAppSettings ? ['app_settings'] : [],
        });
        const freshSettings = await getSettings();
        await runOnlineSyncSafely(freshSettings);
      } catch {
        // non-critical
      }

      if (completeOnSuccess) {
        await setOnboardingCompleted();
      }

      showAlert(LL.common.success(), LL.settings.syncPairingReady());
    } catch (err) {
      syncDebugLog('Pairing failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      const msg =
        err instanceof TypeError || (err instanceof Error && err.name === 'AbortError')
          ? LL.settings.syncServerUnavailable()
          : err instanceof Error
            ? err.message
            : LL.settings.syncGenericError();
      setPairingError(msg);
      showAlert(LL.common.error(), msg);
    } finally {
      setSyncingNow(false);
    }
  };

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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Pairing details — always shown when registered */}
          {syncIsRegistered && (
            <>
              <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                {LL.settings.syncPairingDetails()}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                {[
                  [LL.settings.syncServerUrlLabel(), syncServerUrl],
                  [LL.settings.syncInstanceIdLabel(), syncInstanceId],
                  [LL.settings.syncDeviceIdLabel(), syncDeviceId],
                  [LL.settings.syncDeviceNameLabel(), syncDeviceName],
                  ['Auth token', syncAuthToken ? `${syncAuthToken.slice(0, 8)}…` : '-'],
                ].map(([label, value], idx) => (
                  <React.Fragment key={label}>
                    {idx > 0 && (
                      <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                    )}
                    <View style={styles.detailsRow}>
                      <ThemedText style={[styles.detailsLabel, { color: palette.textSecondary }]}>
                        {label}
                      </ThemedText>
                      <ThemedText style={styles.detailsValue}>{value || '-'}</ThemedText>
                    </View>
                  </React.Fragment>
                ))}
                <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                <Pressable
                  style={({ pressed }) => [styles.editParamsRow, pressed && styles.pressed]}
                  onPress={() => setShowEditInputs((v) => !v)}
                >
                  <ThemedText style={styles.editParamsLabel}>
                    {LL.settings.syncEditParameters()}
                  </ThemedText>
                  <IconSymbol
                    name={showEditInputs ? 'chevron.up' : 'chevron.down'}
                    size={16}
                    color={palette.icon}
                  />
                </Pressable>
              </View>
            </>
          )}

          {/* Pairing inputs — always shown when not registered, expandable when registered */}
          {(!syncIsRegistered || showEditInputs) && (
            <>
              {!syncIsRegistered && (
                <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                  {LL.settings.syncPreparePairing()}
                </ThemedText>
              )}
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                {isAddDeviceFlow && (
                  <View
                    style={[
                      styles.infoBanner,
                      {
                        backgroundColor: palette.surfaceSecondary,
                        borderBottomColor: palette.border,
                      },
                    ]}
                  >
                    <ThemedText style={styles.infoBannerTitle}>
                      {LL.settings.syncAddDeviceBannerTitle()}
                    </ThemedText>
                    <ThemedText style={[styles.infoBannerText, { color: palette.textSecondary }]}>
                      {LL.settings.syncAddDeviceBannerDescription()}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.inputsWrapper}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: isAddDeviceFlow ? palette.textSecondary : palette.text,
                        borderColor: palette.inputBorder,
                        backgroundColor: isAddDeviceFlow
                          ? palette.surfaceSecondary
                          : palette.cardBackground,
                      },
                    ]}
                    placeholder={LL.settings.syncServerUrl()}
                    placeholderTextColor={palette.placeholder}
                    value={syncServerUrl}
                    onChangeText={setSyncServerUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                    editable={!isAddDeviceFlow}
                    selectTextOnFocus={!isAddDeviceFlow}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      { color: palette.text, borderColor: palette.inputBorder },
                    ]}
                    placeholder={LL.settings.syncDeviceName()}
                    placeholderTextColor={palette.placeholder}
                    value={syncDeviceName}
                    onChangeText={setSyncDeviceName}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      { color: palette.text, borderColor: palette.inputBorder },
                    ]}
                    placeholder={LL.settings.syncRecoveryEmail()}
                    placeholderTextColor={palette.placeholder}
                    value={syncRecoveryEmail}
                    onChangeText={setSyncRecoveryEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    autoComplete="email"
                  />
                </View>

                {shouldOfferRemoteSettingsAdoption && (
                  <View
                    style={[
                      styles.optionRow,
                      { borderTopColor: palette.border, backgroundColor: palette.surfaceSecondary },
                    ]}
                  >
                    <View style={styles.optionTextContainer}>
                      <ThemedText style={styles.optionTitle}>
                        {LL.settings.syncUseRemoteAppSettings()}
                      </ThemedText>
                      <ThemedText
                        style={[styles.optionDescription, { color: palette.textSecondary }]}
                      >
                        {LL.settings.syncUseRemoteAppSettingsDescription()}
                      </ThemedText>
                    </View>
                    <Switch
                      value={useRemoteAppSettingsOnFirstSync}
                      onValueChange={setUseRemoteAppSettingsOnFirstSync}
                      {...getSwitchColors(palette)}
                    />
                  </View>
                )}

                {!syncIsRegistered && (
                  <Pressable
                    style={styles.sourceCodeRow}
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

                {!!pairingError && (
                  <ThemedText style={[styles.errorText, { color: palette.destructive }]}>
                    {pairingError}
                  </ThemedText>
                )}
              </View>

              <View style={styles.buttonsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: palette.tint },
                    (pressed || syncingNow) && styles.buttonDisabled,
                  ]}
                  onPress={() => void handleSaveConfig()}
                  disabled={syncingNow}
                >
                  <ThemedText style={[styles.secondaryButtonText, { color: palette.tint }]}>
                    {LL.common.save()}
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: palette.tint },
                    (pressed || syncingNow) && styles.buttonDisabled,
                  ]}
                  onPress={() => void handlePreparePairing()}
                  disabled={syncingNow}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {LL.settings.syncPreparePairing()}
                  </ThemedText>
                </Pressable>
              </View>
            </>
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

  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },

  inputsWrapper: { padding: Spacing.sm, gap: Spacing.xs },
  optionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  optionTextContainer: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  optionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  infoBanner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoBannerTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  infoBannerText: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.md,
  },

  sourceCodeRow: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  sourceCodeText: { fontSize: FontSizes.xs, lineHeight: 17 },
  sourceCodeLink: { fontSize: FontSizes.xs },

  errorText: { fontSize: FontSizes.sm, paddingHorizontal: 14, paddingBottom: 8 },

  buttonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: FontSizes.md, fontWeight: '600' },
  primaryButton: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: FontSizes.md, fontWeight: '600', color: '#fff' },
  buttonDisabled: { opacity: 0.55 },

  actionLabel: { fontSize: FontSizes.md },

  detailsRow: { paddingHorizontal: 14, paddingVertical: 10 },
  detailsLabel: { fontSize: FontSizes.xs, fontWeight: '500' },
  detailsValue: { fontSize: FontSizes.sm, marginTop: 2, opacity: 0.8 },

  editParamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  editParamsLabel: { fontSize: FontSizes.md },

  pressed: { opacity: 0.72 },
});
