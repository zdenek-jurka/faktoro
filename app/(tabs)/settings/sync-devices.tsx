import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SyncPayloadEntryModal } from '@/components/sync/sync-payload-entry-modal';
import { QrScannerModal } from '@/components/sync/qr-scanner-modal';
import { BorderRadius, BorderWidth, Colors, FontSizes, Spacing } from '@/constants/theme';
import { isSyncEnabled, isSyncRecoveryPayloadEntryEnabled } from '@/constants/features';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
  updateDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { getSettings } from '@/repositories/settings-repository';
import {
  encodePayloadPem,
  extractRecoveryPayload,
  fetchWithTimeout,
  parseRecoveryPayloadFromRawOrPem,
  parseJsonFromRawOrPem,
  syncDebugLog,
  ADD_DEVICE_PAYLOAD_PEM_BEGIN,
  ADD_DEVICE_PAYLOAD_PEM_END,
} from '@/utils/sync-pairing-utils';
import { getSyncErrorMessage } from '@/utils/error-utils';
import { buildSyncAuthHeaders } from '@/utils/sync-auth';
import { recoverSyncDeviceFromRawInput } from '@/repositories/sync-recovery-repository';
import { stopRunningEntriesByDevice } from '@/repositories/time-entry-repository';
import { showAlert, showConfirm } from '@/utils/platform-alert';
import { isPlausibleEmail } from '@/utils/email-utils';
import { isIos } from '@/utils/platform';
import { Image } from 'expo-image';
import { useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { Redirect, Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';

type ManagedDevice = {
  device_id: string;
  device_name: string;
  recovery_email: string;
  is_registered: boolean;
  is_current: boolean;
  last_seen_at: string | null;
};

export default function SyncDevicesScreen() {
  if (!isSyncEnabled) {
    return <Redirect href="/settings" />;
  }
  return <SyncDevicesScreenContent />;
}

function SyncDevicesScreenContent() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const { LL } = useI18nContext();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const [syncServerUrl, setSyncServerUrl] = useState('');
  const [syncInstanceId, setSyncInstanceId] = useState('');
  const [syncDeviceId, setSyncDeviceId] = useState('');
  const [syncAuthToken, setSyncAuthToken] = useState('');
  const [syncIsRegistered, setSyncIsRegistered] = useState(false);
  const [syncInstanceKey, setSyncInstanceKey] = useState('');
  const [syncAllowPlaintext, setSyncAllowPlaintext] = useState(false);

  const [managedDevices, setManagedDevices] = useState<ManagedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [addDeviceQrUrl, setAddDeviceQrUrl] = useState('');
  const [payloadInput, setPayloadInput] = useState('');
  const [newDeviceName, setNewDeviceName] = useState(
    () => (Constants.deviceName as string | undefined) ?? '',
  );
  const [newRecoveryEmail, setNewRecoveryEmail] = useState('');
  const [isApplyingPayload, setIsApplyingPayload] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [payloadEntryOpen, setPayloadEntryOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null);
  const parsedRecoveryPayload = useMemo(
    () => parseRecoveryPayloadFromRawOrPem(extractRecoveryPayload(payloadInput)),
    [payloadInput],
  );
  const shouldShowAddDeviceFields = !parsedRecoveryPayload;

  const normalizedServerUrl = useMemo(
    () => syncServerUrl.trim().replace(/\/+$/, ''),
    [syncServerUrl],
  );
  const qrSize = useMemo(() => {
    const maxWidth = windowWidth * 0.9;
    const maxHeight = windowHeight * 0.9;
    return Math.max(200, Math.min(maxWidth, maxHeight, 420));
  }, [windowHeight, windowWidth]);

  useEffect(() => {
    const load = async () => {
      const appSettings = await getSettings();
      setSettings(appSettings);
      const ds = await getDeviceSyncSettings(appSettings);
      setSyncServerUrl(ds.syncServerUrl || '');
      setSyncInstanceId(ds.syncInstanceId || '');
      setSyncDeviceId(ds.syncDeviceId || '');
      setSyncAuthToken(ds.syncAuthToken || '');
      setSyncIsRegistered(ds.syncIsRegistered || false);
      setSyncInstanceKey(ds.syncInstanceKey || '');
      setSyncAllowPlaintext(ds.syncAllowPlaintext || false);
    };
    void load();

    const unsub = observeDeviceSyncSettings((ds) => {
      setSyncServerUrl(ds.syncServerUrl || '');
      setSyncInstanceId(ds.syncInstanceId || '');
      setSyncDeviceId(ds.syncDeviceId || '');
      setSyncAuthToken(ds.syncAuthToken || '');
      setSyncIsRegistered(ds.syncIsRegistered || false);
      setSyncInstanceKey(ds.syncInstanceKey || '');
      setSyncAllowPlaintext(ds.syncAllowPlaintext || false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!syncIsRegistered || !normalizedServerUrl || !syncDeviceId || !syncAuthToken) {
        setManagedDevices([]);
        return;
      }
      setDevicesLoading(true);
      try {
        const response = await fetchWithTimeout(`${normalizedServerUrl}/api/devices`, {
          method: 'GET',
          headers: buildSyncAuthHeaders(syncAuthToken, syncDeviceId),
        });
        if (!response.ok) throw new Error(await response.text());
        const result = (await response.json()) as { devices: ManagedDevice[] };
        setManagedDevices(result.devices || []);
      } catch (err) {
        syncDebugLog('Load devices failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setDevicesLoading(false);
      }
    };
    void load();
  }, [syncIsRegistered, normalizedServerUrl, syncDeviceId, syncAuthToken]);

  const handleRefreshDevices = async () => {
    if (!syncIsRegistered || !normalizedServerUrl || !syncDeviceId || !syncAuthToken) return;
    setDevicesLoading(true);
    try {
      const response = await fetchWithTimeout(`${normalizedServerUrl}/api/devices`, {
        method: 'GET',
        headers: buildSyncAuthHeaders(syncAuthToken, syncDeviceId),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as { devices: ManagedDevice[] };
      setManagedDevices(result.devices || []);
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleRemoveDevice = async (targetDeviceId: string) => {
    const confirmed = await showConfirm({
      title: LL.settings.syncDevicesRemoveConfirmTitle(),
      message: LL.settings.syncDevicesRemoveConfirmMessage(),
      cancelText: LL.common.cancel(),
      confirmText: LL.settings.syncDevicesRemove(),
      destructive: true,
    });
    if (!confirmed) return;

    setDevicesLoading(true);
    try {
      const response = await fetchWithTimeout(`${normalizedServerUrl}/api/devices/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: syncDeviceId,
          auth_token: syncAuthToken,
          target_device_id: targetDeviceId,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await stopRunningEntriesByDevice(targetDeviceId);
      await handleRefreshDevices();
      showAlert(LL.common.success(), LL.settings.syncDevicesRemoveSuccess());
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleGenerateAddDevicePayload = () => {
    if (!normalizedServerUrl || !syncInstanceId.trim()) {
      showAlert(LL.common.error(), LL.settings.syncAddDeviceMissingConfig());
      return;
    }
    const payloadJson = JSON.stringify({
      kind: 'faktoro_add_device_v1',
      serverUrl: normalizedServerUrl,
      instanceId: syncInstanceId.trim(),
      instanceKey: syncInstanceKey.trim() || null,
      allowPlaintext: syncAllowPlaintext,
    });
    const payload = encodePayloadPem(
      payloadJson,
      ADD_DEVICE_PAYLOAD_PEM_BEGIN,
      ADD_DEVICE_PAYLOAD_PEM_END,
    );
    setAddDeviceQrUrl(`${normalizedServerUrl}/api/pair/qr?payload=${encodeURIComponent(payload)}`);
    syncDebugLog('Add device payload generated', { payloadLength: payload.length });
  };

  const applyAddDevicePayload = (raw: string) => {
    const parsed = parseJsonFromRawOrPem(
      raw,
      ADD_DEVICE_PAYLOAD_PEM_BEGIN,
      ADD_DEVICE_PAYLOAD_PEM_END,
    );
    if (!parsed) {
      showAlert(LL.common.error(), LL.settings.syncAddDevicePayloadInvalid());
      return null;
    }
    const p = parsed as {
      kind?: string;
      serverUrl?: string;
      instanceId?: string;
      recoveryEmail?: string | null;
      deviceName?: string | null;
      instanceKey?: string | null;
      allowPlaintext?: boolean;
    };
    if (
      p.kind !== 'faktoro_add_device_v1' ||
      typeof p.serverUrl !== 'string' ||
      typeof p.instanceId !== 'string'
    ) {
      showAlert(LL.common.error(), LL.settings.syncAddDevicePayloadInvalid());
      return null;
    }
    return {
      serverUrl: p.serverUrl.trim(),
      instanceId: p.instanceId.trim(),
      recoveryEmail:
        typeof p.recoveryEmail === 'string' ? p.recoveryEmail.trim().toLowerCase() : undefined,
      deviceName: typeof p.deviceName === 'string' ? p.deviceName.trim() : undefined,
      instanceKey: typeof p.instanceKey === 'string' ? p.instanceKey.trim() : undefined,
      allowPlaintext: typeof p.allowPlaintext === 'boolean' ? p.allowPlaintext : undefined,
    };
  };

  const handleApplyAndPair = async (rawInput: string) => {
    const candidate = extractRecoveryPayload(rawInput);
    if (parseRecoveryPayloadFromRawOrPem(candidate)) {
      try {
        setIsApplyingPayload(true);
        await recoverSyncDeviceFromRawInput(candidate, settings ?? undefined);
        await updateDeviceSyncSettings({ syncFeatureEnabled: true }, settings ?? undefined);
        showAlert(LL.common.success(), LL.settings.syncRecoverySuccess());
        router.replace('/settings/online-sync');
      } catch (err) {
        showAlert(LL.common.error(), getSyncErrorMessage(err, LL, LL.settings.syncGenericError()));
      } finally {
        setIsApplyingPayload(false);
      }
      return;
    }

    if (!isPlausibleEmail(newRecoveryEmail)) {
      showAlert(LL.common.error(), LL.settings.syncRecoveryEmailRequired());
      return;
    }

    const payload = applyAddDevicePayload(candidate);
    if (!payload) return;

    const payloadServerUrl = payload.serverUrl.trim().replace(/\/+$/, '');
    const payloadInstanceId = payload.instanceId.trim();
    const currentServerUrl = normalizedServerUrl;
    const currentInstanceId = syncInstanceId.trim();
    const isDifferentInstance =
      syncIsRegistered &&
      (!!currentServerUrl || !!currentInstanceId) &&
      (payloadServerUrl !== currentServerUrl || payloadInstanceId !== currentInstanceId);

    if (isDifferentInstance) {
      const confirmed = await showConfirm({
        title: LL.settings.syncAddDeviceDifferentInstanceConfirmTitle(),
        message: LL.settings.syncAddDeviceDifferentInstanceConfirmMessage(),
        cancelText: LL.common.cancel(),
        confirmText: LL.settings.syncAddDeviceDifferentInstanceConfirmContinue(),
        destructive: true,
      });
      if (!confirmed) return;
    }

    const settingsUpdate: Parameters<typeof updateDeviceSyncSettings>[0] = {};
    if (payload.instanceKey) {
      settingsUpdate.syncInstanceKey = payload.instanceKey;
    }
    if (typeof payload.allowPlaintext === 'boolean') {
      settingsUpdate.syncAllowPlaintext = payload.allowPlaintext;
    }
    if (Object.keys(settingsUpdate).length > 0) {
      await updateDeviceSyncSettings(settingsUpdate, settings ?? undefined);
    }

    try {
      setIsApplyingPayload(true);
      router.push({
        pathname: '/settings/sync-pairing',
        params: {
          addDeviceServerUrl: payload.serverUrl,
          addDeviceInstanceId: payload.instanceId,
          addDeviceRecoveryEmail: newRecoveryEmail.trim().toLowerCase(),
          addDeviceDeviceName: newDeviceName.trim(),
        },
      });
    } finally {
      setIsApplyingPayload(false);
    }
  };

  const handleOpenScanner = async () => {
    if (isSyncRecoveryPayloadEntryEnabled) {
      setPayloadEntryOpen(true);
      return;
    }
    const granted = cameraPermission?.granted ? true : (await requestCameraPermission()).granted;
    if (!granted) {
      showAlert(LL.common.error(), LL.settings.syncRecoveryCameraPermissionDenied());
      return;
    }
    setScannerOpen(true);
  };

  const handleScanned = async (data: string) => {
    setScannerOpen(false);
    setPayloadInput(data);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.syncDevicesPageTitle() }} />
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
          {/* Add device section (only when registered — generate QR for new device) */}
          {syncIsRegistered && (
            <>
              <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                {LL.settings.syncAddDeviceTitle()}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                <View style={styles.infoBlock}>
                  <ThemedText style={styles.infoTitle}>
                    {LL.settings.syncAddDeviceFlowTitle()}
                  </ThemedText>
                  <ThemedText style={[styles.infoText, { color: palette.textSecondary }]}>
                    {LL.settings.syncAddDeviceHostFlowDescription()}
                  </ThemedText>
                </View>
                <ThemedText style={[styles.cardDesc, { color: palette.textSecondary }]}>
                  {LL.settings.syncAddDeviceDescription()}
                </ThemedText>
                {!!addDeviceQrUrl && (
                  <View style={styles.qrContainer}>
                    <Image
                      source={{ uri: addDeviceQrUrl }}
                      style={[
                        styles.qrImage,
                        {
                          width: qrSize,
                          height: qrSize,
                          maxWidth: '90%',
                          maxHeight: '90%',
                          backgroundColor: palette.qrCodeBackground,
                        },
                      ]}
                      contentFit="contain"
                    />
                  </View>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: palette.tint },
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleGenerateAddDevicePayload}
              >
                <ThemedText style={styles.primaryButtonText}>
                  {LL.settings.syncAddDeviceGenerate()}
                </ThemedText>
              </Pressable>
            </>
          )}

          {/* Accept add-device payload (when not registered) */}
          {!syncIsRegistered && (
            <>
              <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                {LL.settings.syncConnectToServerTitle()}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                <View style={styles.infoBlock}>
                  <ThemedText style={styles.infoTitle}>
                    {LL.settings.syncAddDeviceFlowTitle()}
                  </ThemedText>
                  <ThemedText style={[styles.infoText, { color: palette.textSecondary }]}>
                    {LL.settings.syncAddDeviceJoinFlowDescription()}
                  </ThemedText>
                </View>
                <View style={styles.inputsWrapper}>
                  <View style={styles.field}>
                    <View style={styles.fieldLabelRow}>
                      <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                        {LL.onboarding.connectPayloadLabel()} *
                      </ThemedText>
                      <Pressable
                        style={[styles.scanButton, { backgroundColor: palette.tint }]}
                        onPress={() => void handleOpenScanner()}
                        hitSlop={8}
                      >
                        <IconSymbol name="qrcode.viewfinder" size={16} color={palette.onTint} />
                        <ThemedText style={[styles.scanButtonText, { color: palette.onTint }]}>
                          {LL.onboarding.connectScanQr()}
                        </ThemedText>
                      </Pressable>
                    </View>
                    <TextInput
                      style={[
                        styles.payloadInput,
                        {
                          backgroundColor: palette.inputBackground,
                          borderColor: palette.inputBorder,
                          color: palette.text,
                        },
                      ]}
                      value={payloadInput}
                      onChangeText={setPayloadInput}
                      placeholder={LL.onboarding.connectPayloadPlaceholder()}
                      placeholderTextColor={palette.placeholder}
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  {shouldShowAddDeviceFields ? (
                    <>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: palette.inputBackground,
                            color: palette.text,
                            borderColor: palette.inputBorder,
                          },
                        ]}
                        placeholder={LL.settings.syncDeviceName()}
                        placeholderTextColor={palette.placeholder}
                        value={newDeviceName}
                        onChangeText={setNewDeviceName}
                      />
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: palette.inputBackground,
                            color: palette.text,
                            borderColor: palette.inputBorder,
                          },
                        ]}
                        placeholder={LL.settings.syncRecoveryEmail()}
                        placeholderTextColor={palette.placeholder}
                        value={newRecoveryEmail}
                        onChangeText={setNewRecoveryEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        textContentType="emailAddress"
                        autoComplete="email"
                      />
                      <ThemedText style={[styles.helperText, { color: palette.textSecondary }]}>
                        {LL.settings.syncAddDeviceRecoveryEmailHint()}
                      </ThemedText>
                    </>
                  ) : null}
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor:
                      payloadInput.trim() && (parsedRecoveryPayload || newRecoveryEmail.trim())
                        ? palette.tint
                        : palette.buttonNeutralBackground,
                  },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => void handleApplyAndPair(payloadInput)}
                disabled={
                  isApplyingPayload ||
                  !payloadInput.trim() ||
                  (!parsedRecoveryPayload && !newRecoveryEmail.trim())
                }
              >
                {isApplyingPayload ? (
                  <ActivityIndicator size="small" color={palette.onTint} />
                ) : (
                  <ThemedText
                    style={[
                      styles.primaryButtonText,
                      {
                        color:
                          payloadInput.trim() && (parsedRecoveryPayload || newRecoveryEmail.trim())
                            ? palette.onTint
                            : palette.textMuted,
                      },
                    ]}
                  >
                    {LL.onboarding.connectButton()}
                  </ThemedText>
                )}
              </Pressable>
            </>
          )}

          {/* Device list */}
          <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
            {LL.settings.syncDevicesTitle()}
          </ThemedText>
          <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
            {syncIsRegistered ? (
              <>
                <Pressable
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                  onPress={() => void handleRefreshDevices()}
                  disabled={devicesLoading}
                >
                  <ThemedText style={styles.actionLabel}>
                    {LL.settings.syncDevicesRefresh()}
                  </ThemedText>
                </Pressable>
                {managedDevices.map((device, idx) => (
                  <View key={device.device_id}>
                    {idx > 0 && (
                      <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                    )}
                    <View style={styles.deviceRow}>
                      <View style={styles.deviceMeta}>
                        <ThemedText style={styles.deviceTitle}>
                          {device.device_name || device.device_id}
                          {device.is_current ? ` (${LL.settings.syncDevicesCurrent()})` : ''}
                        </ThemedText>
                        <ThemedText style={[styles.deviceDetail, { color: palette.textSecondary }]}>
                          {device.device_id}
                        </ThemedText>
                        {!!device.recovery_email && (
                          <ThemedText
                            style={[styles.deviceDetail, { color: palette.textSecondary }]}
                          >
                            {device.recovery_email}
                          </ThemedText>
                        )}
                      </View>
                      {!device.is_current && (
                        <Pressable
                          style={[styles.removeButton, { borderColor: palette.destructive }]}
                          onPress={() => void handleRemoveDevice(device.device_id)}
                          disabled={devicesLoading}
                        >
                          <ThemedText
                            style={[styles.removeButtonText, { color: palette.destructive }]}
                          >
                            {LL.settings.syncDevicesRemove()}
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
                {managedDevices.length === 0 && !devicesLoading && (
                  <View style={styles.emptyRow}>
                    <ThemedText style={[styles.emptyText, { color: palette.textSecondary }]}>
                      {LL.settings.syncDevicesDescription()}
                    </ThemedText>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyRow}>
                <ThemedText style={[styles.emptyText, { color: palette.textSecondary }]}>
                  {LL.settings.syncStatusNotRegistered()}
                </ThemedText>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <QrScannerModal
        visible={scannerOpen}
        hint={LL.settings.syncAddDeviceScanHint()}
        cancelLabel={LL.common.cancel()}
        onScanned={(data) => void handleScanned(data)}
        onClose={() => setScannerOpen(false)}
      />
      <SyncPayloadEntryModal
        visible={payloadEntryOpen}
        title={LL.onboarding.connectPayloadLabel()}
        placeholder={LL.onboarding.connectPayloadPlaceholder()}
        value={payloadInput}
        onChangeText={setPayloadInput}
        onClose={() => setPayloadEntryOpen(false)}
        onSave={() => setPayloadEntryOpen(false)}
      />
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

  cardDesc: {
    fontSize: FontSizes.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    lineHeight: 18,
  },

  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },

  actionRow: {
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  actionLabel: { fontSize: FontSizes.md },

  inputsWrapper: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.sm, gap: Spacing.xs },
  infoBlock: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 6,
  },
  infoTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  infoText: {
    fontSize: FontSizes.sm,
    lineHeight: 19,
  },
  field: { gap: 6 },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: { fontSize: 13 },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scanButtonText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.md,
  },
  payloadInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.sm,
    minHeight: 100,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  helperText: {
    fontSize: FontSizes.xs,
    lineHeight: 16,
    paddingHorizontal: 2,
  },
  qrContainer: { alignItems: 'center', paddingVertical: Spacing.md },
  qrImage: { borderRadius: BorderRadius.lg },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  deviceMeta: { flex: 1, gap: 2 },
  deviceTitle: { fontSize: FontSizes.md, fontWeight: '600' },
  deviceDetail: { fontSize: FontSizes.xs },

  removeButton: {
    borderWidth: BorderWidth.thin,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeButtonText: { fontSize: FontSizes.xs, fontWeight: '600' },

  emptyRow: { paddingHorizontal: 14, paddingVertical: 14 },
  emptyText: { fontSize: FontSizes.sm },

  primaryButton: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: FontSizes.md, fontWeight: '600', color: '#fff' },
  buttonPressed: { opacity: 0.72 },

  pressed: { opacity: 0.72 },
});
