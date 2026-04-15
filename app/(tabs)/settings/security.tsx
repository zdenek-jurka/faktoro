import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, getSwitchColors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  clearPinHash,
  hasPinHash,
  MIN_APP_LOCK_PIN_LENGTH,
  savePinHash,
  verifyPin,
} from '@/repositories/app-lock-repository';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { normalizeAppLockPinInput } from '@/utils/app-lock-pin';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

type BiometricState = {
  isAvailable: boolean;
  label: string;
};

type BiometricLabels = {
  notAvailable: string;
  faceId: string;
  touchId: string;
  biometrics: string;
};

function formatErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    const message = error.message?.trim();
    if (message) return message;
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') return serialized;
  } catch {
    // ignore serialization failures
  }
  return fallbackMessage;
}

async function getBiometricState(labels: BiometricLabels): Promise<BiometricState> {
  try {
    // Optional dependency fallback.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const localAuth = require('expo-local-authentication');
    if (!localAuth) return { isAvailable: false, label: labels.notAvailable };

    const hasHardware = await localAuth.hasHardwareAsync();
    const isEnrolled = await localAuth.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return { isAvailable: false, label: labels.notAvailable };

    const types = await localAuth.supportedAuthenticationTypesAsync();
    const isFaceId = types.includes(localAuth.AuthenticationType.FACIAL_RECOGNITION);
    const isFingerprint = types.includes(localAuth.AuthenticationType.FINGERPRINT);
    if (isFaceId) return { isAvailable: true, label: labels.faceId };
    if (isFingerprint) return { isAvailable: true, label: labels.touchId };
    return { isAvailable: true, label: labels.biometrics };
  } catch {
    return { isAvailable: false, label: labels.notAvailable };
  }
}

export default function SettingsSecurityScreen() {
  const colorScheme = useColorScheme();
  const headerHeight = useHeaderHeight();
  const { LL, locale } = useI18nContext();
  const palette = Colors[colorScheme ?? 'light'];
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [hasStoredPin, setHasStoredPin] = useState(false);
  const [appLockPin, setAppLockPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricState, setBiometricState] = useState<BiometricState>(() => ({
    isAvailable: false,
    label: LL.settings.securityBiometricNotAvailableLabel(),
  }));
  const [isAccessCheckLoading, setIsAccessCheckLoading] = useState(true);
  const [isAccessVerified, setIsAccessVerified] = useState(false);
  const [canUseBiometricForAccess, setCanUseBiometricForAccess] = useState(false);
  const [accessPin, setAccessPin] = useState('');
  const [accessError, setAccessError] = useState('');
  const pinInputRef = useRef<TextInput>(null);
  const llSettingsRef = useRef(LL.settings);
  const biometricLabelsRef = useRef<BiometricLabels>({
    notAvailable: LL.settings.securityBiometricNotAvailableLabel(),
    faceId: LL.settings.securityBiometricFaceId(),
    touchId: LL.settings.securityBiometricTouchId(),
    biometrics: LL.settings.securityBiometricGenericLabel(),
  });
  llSettingsRef.current = LL.settings;
  biometricLabelsRef.current = {
    notAvailable: LL.settings.securityBiometricNotAvailableLabel(),
    faceId: LL.settings.securityBiometricFaceId(),
    touchId: LL.settings.securityBiometricTouchId(),
    biometrics: LL.settings.securityBiometricGenericLabel(),
  };

  const authenticateWithBiometric = useCallback(async (): Promise<boolean> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const localAuth = require('expo-local-authentication');
      if (!localAuth) return false;
      const result = await localAuth.authenticateAsync({
        promptMessage: llSettingsRef.current.unlockBiometricPrompt(),
        fallbackLabel: llSettingsRef.current.unlockUsePin(),
      });
      return !!result.success;
    } catch (error) {
      console.error('Error during biometric authentication:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const settings = await getSettings();
        const lockEnabled = !!settings.appLockEnabled;
        const biometricSettingEnabled = !!settings.appLockBiometricEnabled;
        const pinExists = await hasPinHash();
        const state = await getBiometricState(biometricLabelsRef.current);

        if (!isMounted) return;

        setAppLockEnabled(lockEnabled);
        setBiometricEnabled(biometricSettingEnabled);
        setHasStoredPin(pinExists);
        setBiometricState(state);

        if (!pinExists) {
          setAppLockPin('');
          setConfirmPin('');
        }

        const needsEntryVerification = lockEnabled && pinExists;
        const shouldUseBiometricForAccess =
          needsEntryVerification && biometricSettingEnabled && state.isAvailable;
        setCanUseBiometricForAccess(shouldUseBiometricForAccess);

        if (!needsEntryVerification) {
          setIsAccessVerified(true);
          return;
        }

        if (shouldUseBiometricForAccess) {
          const biometricVerified = await authenticateWithBiometric();
          if (!isMounted) return;
          setAccessError('');
          setIsAccessVerified(biometricVerified);
          return;
        }

        setIsAccessVerified(false);
      } finally {
        if (isMounted) {
          setIsAccessCheckLoading(false);
        }
      }
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [authenticateWithBiometric, locale]);

  const handleVerifyAccessByPin = async () => {
    setAccessError('');
    if (!accessPin.trim()) {
      setAccessError(LL.settings.unlockPinRequired());
      return;
    }
    const ok = await verifyPin(accessPin);
    if (!ok) {
      setAccessError(LL.settings.unlockIncorrectPin());
      return;
    }
    setIsAccessVerified(true);
    setAccessPin('');
  };

  const handleVerifyAccessByBiometric = async () => {
    const ok = await authenticateWithBiometric();
    if (!ok) return;
    setAccessError('');
    setIsAccessVerified(true);
    setAccessPin('');
  };

  const handleToggleAppLock = useCallback(
    (nextValue?: boolean) => {
      const resolvedNextValue = nextValue ?? !appLockEnabled;
      setAppLockEnabled(resolvedNextValue);

      if (!resolvedNextValue) {
        setBiometricEnabled(false);
        return;
      }

      if (!hasStoredPin) {
        requestAnimationFrame(() => {
          pinInputRef.current?.focus();
        });
      }
    },
    [appLockEnabled, hasStoredPin],
  );

  const handleSave = async () => {
    const hasEnteredPin = appLockPin.length > 0 || confirmPin.length > 0;

    if (appLockEnabled) {
      if (!hasStoredPin || hasEnteredPin) {
        if (!appLockPin || appLockPin.length < MIN_APP_LOCK_PIN_LENGTH) {
          Alert.alert(LL.common.error(), LL.settings.securityPinMinLength());
          return;
        }
        if (appLockPin !== confirmPin) {
          Alert.alert(LL.common.error(), LL.settings.securityPinMismatch());
          return;
        }
      }
    }

    try {
      if (appLockEnabled) {
        if (!hasStoredPin || hasEnteredPin) {
          await savePinHash(appLockPin);
          setHasStoredPin(true);
          setAppLockPin('');
          setConfirmPin('');
        }
      } else {
        await clearPinHash();
        setHasStoredPin(false);
        setAppLockPin('');
        setConfirmPin('');
      }
      await updateSettings({
        appLockEnabled,
        appLockBiometricEnabled:
          appLockEnabled && biometricState.isAvailable ? biometricEnabled : false,
      });
      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving security settings:', error);
      Alert.alert(
        LL.common.error(),
        `${LL.settings.saveError()}\n\n${formatErrorMessage(error, LL.common.errorUnknown())}`,
      );
    }
  };

  if (isAccessCheckLoading) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: LL.settings.securityTitle() }} />
        <View style={styles.accessStateContainer}>
          <ActivityIndicator size="large" color={palette.text} />
        </View>
      </ThemedView>
    );
  }

  if (!isAccessVerified) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: LL.settings.securityTitle() }} />
        <KeyboardAvoidingView
          style={styles.accessStateContainer}
          behavior={isIos ? 'padding' : undefined}
        >
          <View style={[styles.accessCard, { backgroundColor: palette.cardBackground }]}>
            <ThemedText type="subtitle" style={styles.accessTitle}>
              {LL.settings.unlockTitle()}
            </ThemedText>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.unlockDescription()}
            </ThemedText>

            <TextInput
              style={[styles.input, inputStyle(colorScheme)]}
              placeholder={LL.settings.unlockPinPlaceholder()}
              placeholderTextColor={placeholder(colorScheme)}
              value={accessPin}
              onChangeText={(value) => {
                setAccessPin(normalizeAppLockPinInput(value));
                if (accessError) setAccessError('');
              }}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={10}
            />
            {!!accessError && (
              <ThemedText style={[styles.errorText, { color: palette.destructive }]}>
                {accessError}
              </ThemedText>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: palette.tint },
                pressed && styles.pressed,
              ]}
              onPress={() => void handleVerifyAccessByPin()}
            >
              <ThemedText style={[styles.saveButtonText, { color: palette.onTint }]}>
                {LL.settings.unlockButton()}
              </ThemedText>
            </Pressable>

            {canUseBiometricForAccess && (
              <Pressable
                style={({ pressed }) => [
                  styles.biometricButton,
                  { borderColor: palette.tint },
                  pressed && styles.pressed,
                ]}
                onPress={() => void handleVerifyAccessByBiometric()}
              >
                <ThemedText style={[styles.biometricText, { color: palette.tint }]}>
                  {LL.settings.unlockTryBiometric()}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.securityTitle() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={[styles.section, { backgroundColor: palette.cardBackground }]}>
            <View style={styles.switchRow}>
              <Pressable
                style={styles.switchLabelContainer}
                onPress={() => handleToggleAppLock()}
                accessibilityRole="button"
                accessibilityLabel={LL.settings.securityAppLockTitle()}
              >
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  {LL.settings.securityAppLockTitle()}
                </ThemedText>
                <ThemedText style={styles.sectionDescription}>
                  {LL.settings.securityAppLockDescription()}
                </ThemedText>
              </Pressable>
              <Switch
                value={appLockEnabled}
                onValueChange={handleToggleAppLock}
                {...getSwitchColors(palette)}
              />
            </View>

            {appLockEnabled && (
              <>
                <TextInput
                  ref={pinInputRef}
                  style={[styles.input, inputStyle(colorScheme)]}
                  placeholder={LL.settings.securityPin()}
                  placeholderTextColor={placeholder(colorScheme)}
                  value={appLockPin}
                  onChangeText={(value) => setAppLockPin(normalizeAppLockPinInput(value))}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={10}
                />
                <TextInput
                  style={[styles.input, inputStyle(colorScheme)]}
                  placeholder={LL.settings.securityConfirmPin()}
                  placeholderTextColor={placeholder(colorScheme)}
                  value={confirmPin}
                  onChangeText={(value) => setConfirmPin(normalizeAppLockPinInput(value))}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={10}
                />

                <View style={styles.switchRow}>
                  <View style={styles.switchLabelContainer}>
                    <ThemedText type="defaultSemiBold">
                      {LL.settings.securityBiometricTitle()}
                    </ThemedText>
                    <ThemedText style={styles.sectionDescription}>
                      {biometricState.isAvailable
                        ? LL.settings.securityBiometricAvailable({ type: biometricState.label })
                        : LL.settings.securityBiometricUnavailable()}
                    </ThemedText>
                  </View>
                  <Switch
                    value={biometricEnabled}
                    onValueChange={setBiometricEnabled}
                    disabled={!biometricState.isAvailable}
                    {...getSwitchColors(palette)}
                  />
                </View>
              </>
            )}
          </ThemedView>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: palette.tint },
              pressed && styles.pressed,
            ]}
            onPress={handleSave}
          >
            <ThemedText style={[styles.saveButtonText, { color: palette.onTint }]}>
              {LL.common.save()}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function inputStyle(colorScheme: ReturnType<typeof useColorScheme>) {
  return {
    color: Colors[colorScheme ?? 'light'].text,
    borderColor: Colors[colorScheme ?? 'light'].inputBorder,
    backgroundColor: Colors[colorScheme ?? 'light'].inputBackground,
  };
}

function placeholder(colorScheme: ReturnType<typeof useColorScheme>) {
  return Colors[colorScheme ?? 'light'].placeholder;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  accessStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  accessCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    padding: 16,
  },
  accessTitle: {
    marginBottom: 8,
  },
  scrollView: { flex: 1 },
  content: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: { marginBottom: 12 },
  sectionDescription: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  switchLabelContainer: { flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveButtonText: { fontSize: 16, fontWeight: '600' },
  biometricButton: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  biometricText: {
    fontWeight: '600',
  },
  errorText: {
    marginBottom: 8,
  },
  pressed: { opacity: 0.82 },
});
