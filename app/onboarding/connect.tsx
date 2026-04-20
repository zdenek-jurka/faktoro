import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { SyncPayloadEntryModal } from '@/components/sync/sync-payload-entry-modal';
import { isSyncEnabled, isSyncRecoveryPayloadEntryEnabled } from '@/constants/features';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { updateDeviceSyncSettings } from '@/repositories/device-sync-settings-repository';
import { setOnboardingCompleted } from '@/repositories/onboarding-repository';
import { getSettings } from '@/repositories/settings-repository';
import { runOnlineSyncSafely } from '@/repositories/sync-repository';
import { recoverSyncDeviceFromRawInput } from '@/repositories/sync-recovery-repository';
import { isPlausibleEmail } from '@/utils/email-utils';
import { getSyncErrorMessage } from '@/utils/error-utils';
import { showAlert } from '@/utils/platform-alert';
import {
  ADD_DEVICE_PAYLOAD_PEM_BEGIN,
  ADD_DEVICE_PAYLOAD_PEM_END,
  extractRecoveryPayload,
  parseRecoveryPayloadFromRawOrPem,
  parseJsonFromRawOrPem,
} from '@/utils/sync-pairing-utils';
import { QrScannerModal, requestQrCameraPermission } from '@/components/sync/qr-scanner-modal';
import Constants from 'expo-constants';
import { useCameraPermissions } from 'expo-camera';
import { Redirect, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingConnectScreen() {
  if (!isSyncEnabled) {
    return <Redirect href="/onboarding" />;
  }
  return <OnboardingConnectScreenContent />;
}

function OnboardingConnectScreenContent() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();
  const router = useRouter();

  const [payloadInput, setPayloadInput] = useState('');
  const [deviceName, setDeviceName] = useState(
    () => (Constants.deviceName as string | undefined) ?? '',
  );
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [payloadEntryOpen, setPayloadEntryOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const parsedRecoveryPayload = useMemo(
    () => parseRecoveryPayloadFromRawOrPem(extractRecoveryPayload(payloadInput)),
    [payloadInput],
  );
  const shouldShowAddDeviceFields = !parsedRecoveryPayload;

  function parsePayload(raw: string) {
    const candidate = extractRecoveryPayload(raw);
    const parsed = parseJsonFromRawOrPem(
      candidate,
      ADD_DEVICE_PAYLOAD_PEM_BEGIN,
      ADD_DEVICE_PAYLOAD_PEM_END,
    );
    if (!parsed) return null;
    const p = parsed as {
      kind?: string;
      serverUrl?: string;
      instanceId?: string;
      instanceKey?: string | null;
      allowPlaintext?: boolean;
    };
    if (
      p.kind !== 'faktoro_add_device_v1' ||
      typeof p.serverUrl !== 'string' ||
      typeof p.instanceId !== 'string'
    ) {
      return null;
    }
    return {
      serverUrl: p.serverUrl.trim(),
      instanceId: p.instanceId.trim(),
      instanceKey: typeof p.instanceKey === 'string' ? p.instanceKey.trim() : undefined,
      allowPlaintext: typeof p.allowPlaintext === 'boolean' ? p.allowPlaintext : undefined,
    };
  }

  async function handleOpenScanner() {
    if (isSyncRecoveryPayloadEntryEnabled) {
      setPayloadEntryOpen(true);
      return;
    }
    const granted = await requestQrCameraPermission(cameraPermission, requestCameraPermission);
    if (!granted) {
      showAlert(LL.common.error(), LL.settings.syncRecoveryCameraPermissionDenied());
      return;
    }
    setScannerOpen(true);
  }

  async function handleConnect() {
    if (!parsedRecoveryPayload && !isPlausibleEmail(recoveryEmail)) {
      showAlert(LL.common.error(), LL.onboarding.connectEmailRequired());
      return;
    }

    if (parsedRecoveryPayload) {
      setIsConnecting(true);
      try {
        await recoverSyncDeviceFromRawInput(payloadInput);
        await updateDeviceSyncSettings({ syncFeatureEnabled: true });
        try {
          const settings = await getSettings();
          await runOnlineSyncSafely(settings);
        } catch {
          // best-effort on fresh install; recovery can still succeed before first sync
        }
        await setOnboardingCompleted();
        router.replace('/(tabs)/time-tracking');
      } catch (err) {
        showAlert(LL.common.error(), getSyncErrorMessage(err, LL, LL.settings.syncGenericError()));
      } finally {
        setIsConnecting(false);
      }
      return;
    }

    const payload = parsePayload(payloadInput);
    if (!payload) {
      showAlert(LL.common.error(), LL.settings.syncAddDevicePayloadInvalid());
      return;
    }

    setIsConnecting(true);
    try {
      const settings = await getSettings();
      const settingsUpdate: Parameters<typeof updateDeviceSyncSettings>[0] = {};
      if (payload.instanceKey) settingsUpdate.syncInstanceKey = payload.instanceKey;
      if (typeof payload.allowPlaintext === 'boolean') {
        settingsUpdate.syncAllowPlaintext = payload.allowPlaintext;
      }
      if (Object.keys(settingsUpdate).length > 0) {
        await updateDeviceSyncSettings(settingsUpdate, settings);
      }

      router.replace({
        pathname: '/settings/sync-pairing',
        params: {
          addDeviceServerUrl: payload.serverUrl,
          addDeviceInstanceId: payload.instanceId,
          addDeviceRecoveryEmail: recoveryEmail.trim().toLowerCase(),
          addDeviceDeviceName: deviceName.trim(),
          completeOnSuccess: '1',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showAlert(LL.common.error(), msg);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <KeyboardAwareScroll
        style={styles.flex}
        scrollViewStyle={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={20} color={palette.tint} />
            <ThemedText style={[styles.backLabel, { color: palette.tint }]}>
              {LL.onboarding.back()}
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.title}>
            {LL.onboarding.connectTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
            {LL.onboarding.connectSubtitle()}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
          {/* Payload */}
          <View style={styles.field}>
            <View style={styles.fieldLabelRow}>
              <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                {LL.onboarding.connectPayloadLabel()} *
              </ThemedText>
              <Pressable
                style={[styles.scanButton, { backgroundColor: palette.tint }]}
                onPress={handleOpenScanner}
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
              {/* Device name */}
              <View style={styles.field}>
                <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                  {LL.onboarding.connectDeviceNameLabel()}
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: palette.inputBackground,
                      borderColor: palette.inputBorder,
                      color: palette.text,
                    },
                  ]}
                  value={deviceName}
                  onChangeText={setDeviceName}
                  placeholder={LL.onboarding.connectDeviceNameLabel()}
                  placeholderTextColor={palette.placeholder}
                />
              </View>

              {/* Recovery email */}
              <View style={styles.field}>
                <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                  {LL.onboarding.connectEmailLabel()} *
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: palette.inputBackground,
                      borderColor: palette.inputBorder,
                      color: palette.text,
                    },
                  ]}
                  value={recoveryEmail}
                  onChangeText={setRecoveryEmail}
                  placeholder={LL.onboarding.connectEmailPlaceholder()}
                  placeholderTextColor={palette.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </>
          ) : null}
        </View>

        <Pressable
          style={[
            styles.primaryButton,
            {
              backgroundColor:
                payloadInput.trim() && (parsedRecoveryPayload || recoveryEmail.trim())
                  ? palette.tint
                  : palette.buttonNeutralBackground,
            },
          ]}
          onPress={handleConnect}
          disabled={
            isConnecting ||
            !payloadInput.trim() ||
            (!parsedRecoveryPayload && !recoveryEmail.trim())
          }
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={palette.onTint} />
          ) : (
            <ThemedText
              style={[
                styles.primaryButtonText,
                {
                  color:
                    payloadInput.trim() && (parsedRecoveryPayload || recoveryEmail.trim())
                      ? palette.onTint
                      : palette.textMuted,
                },
              ]}
            >
              {LL.onboarding.connectButton()}
            </ThemedText>
          )}
        </Pressable>
      </KeyboardAwareScroll>

      <QrScannerModal
        visible={scannerOpen}
        hint={LL.settings.syncAddDeviceScanHint()}
        cancelLabel={LL.common.cancel()}
        onScanned={(data) => {
          setScannerOpen(false);
          setPayloadInput(data);
        }}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40, gap: 16 },
  header: { gap: 8 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backLabel: { fontSize: 16 },
  title: { fontSize: 28 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  card: { borderRadius: 14, padding: 16, gap: 16 },
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
    fontSize: 16,
  },
  payloadInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 100,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600' },
});
