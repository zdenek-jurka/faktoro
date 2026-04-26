import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { withOpacity } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { verifyPin } from '@/repositories/app-lock-repository';
import { normalizeAppLockPinInput } from '@/utils/app-lock-pin';
import { authenticateWithBiometric } from '@/utils/app-lock-confirmation';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

export default function InvoiceDeleteAuthScreen() {
  const {
    id,
    biometricEnabled,
    biometricLabel: biometricLabelParam,
  } = useLocalSearchParams<{
    id: string;
    biometricEnabled?: string;
    biometricLabel?: string;
  }>();
  const router = useRouter();
  const { LL, locale } = useI18nContext();
  const palette = usePalette();

  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canUseBiometric = biometricEnabled === '1';
  const [biometricLabel, setBiometricLabel] = useState(
    biometricLabelParam || LL.settings.securityBiometricNotAvailableLabel(),
  );
  const pinInputRef = useRef<TextInput>(null);
  const llSettingsRef = useRef(LL.settings);
  llSettingsRef.current = LL.settings;

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const completeConfirmation = () => {
      router.replace({
        pathname: '/invoices/[id]/delete',
        params: { id, authConfirmed: '1' },
      });
    };

    const startConfirmation = async () => {
      try {
        if (canUseBiometric) {
          const success = await authenticateWithBiometric(
            llSettingsRef.current.unlockBiometricPrompt(),
            llSettingsRef.current.unlockUsePin(),
          );
          if (!isMounted) return;
          if (success) {
            completeConfirmation();
            return;
          }
        }
      } finally {
        if (isMounted) {
          setIsCheckingAccess(false);
          requestAnimationFrame(() => {
            pinInputRef.current?.focus();
          });
        }
      }
    };

    void startConfirmation();

    return () => {
      isMounted = false;
    };
  }, [canUseBiometric, id, locale, router]);

  useEffect(() => {
    setBiometricLabel(
      biometricLabelParam || llSettingsRef.current.securityBiometricNotAvailableLabel(),
    );
  }, [biometricLabelParam, locale]);

  const handleConfirmWithPin = async () => {
    if (!id || isSubmitting) return;

    setPinError('');
    if (!pin.trim()) {
      setPinError(LL.invoices.deletePinRequired());
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await verifyPin(pin);
      if (!ok) {
        setPinError(LL.invoices.deletePinInvalid());
        return;
      }

      router.replace({
        pathname: '/invoices/[id]/delete',
        params: { id, authConfirmed: '1' },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryBiometric = async () => {
    if (!id || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const success = await authenticateWithBiometric(
        LL.settings.unlockBiometricPrompt(),
        LL.settings.unlockUsePin(),
      );
      if (!success) return;

      router.replace({
        pathname: '/invoices/[id]/delete',
        params: { id, authConfirmed: '1' },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: palette.backgroundSubtle }]}>
      <Stack.Screen options={{ title: LL.invoices.deleteAppLockTitle() }} />

      <View
        pointerEvents="none"
        style={[styles.glowPrimary, { backgroundColor: withOpacity(palette.timeHighlight, 0.18) }]}
      />
      <View
        pointerEvents="none"
        style={[styles.glowSecondary, { backgroundColor: withOpacity(palette.success, 0.12) }]}
      />

      <KeyboardAwareScroll
        contentContainerStyle={styles.content}
        enableAndroidKeyboardBottomPadding
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: withOpacity(palette.cardBackgroundElevated, 0.97),
              borderColor: withOpacity(palette.borderStrong, 0.72),
            },
          ]}
        >
          <View
            style={[
              styles.iconShell,
              { backgroundColor: withOpacity(palette.timeHighlight, 0.12) },
            ]}
          >
            <IconSymbol name="lock.fill" size={34} color={palette.timeHighlight} />
          </View>

          <ThemedText style={[styles.eyebrowText, { color: palette.timeHighlight }]}>
            Faktoro
          </ThemedText>
          <ThemedText type="title" style={styles.titleText}>
            {LL.invoices.deleteAppLockTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitleText, { color: palette.textSecondary }]}>
            {LL.invoices.deleteAppLockDescription()}
          </ThemedText>

          {isCheckingAccess ? (
            <View style={styles.loadingSection}>
              <ActivityIndicator color={palette.timeHighlight} />
              <ThemedText style={[styles.loadingText, { color: palette.textSecondary }]}>
                {LL.common.loading()}
              </ThemedText>
            </View>
          ) : (
            <>
              <TextInput
                ref={pinInputRef}
                style={[
                  styles.pinInput,
                  {
                    color: palette.text,
                    borderColor: pinError ? palette.destructive : palette.inputBorder,
                    backgroundColor: palette.inputBackground,
                  },
                ]}
                placeholder={LL.settings.unlockPinPlaceholder()}
                placeholderTextColor={palette.placeholder}
                value={pin}
                onChangeText={(value) => {
                  setPin(normalizeAppLockPinInput(value));
                  if (pinError) setPinError('');
                }}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={10}
                textAlign="center"
                editable={!isSubmitting}
              />

              {!!pinError && (
                <ThemedText style={[styles.errorText, { color: palette.destructive }]}>
                  {pinError}
                </ThemedText>
              )}

              <View style={styles.buttons}>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: palette.timeHighlight },
                    (isSubmitting || pressed) && styles.buttonPressed,
                  ]}
                  onPress={() => void handleConfirmWithPin()}
                  disabled={isSubmitting}
                >
                  <ThemedText style={[styles.primaryButtonText, { color: palette.onHighlight }]}>
                    {LL.invoices.deleteAppLockConfirmAction()}
                  </ThemedText>
                </Pressable>

                {canUseBiometric ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      {
                        backgroundColor: palette.buttonNeutralBackground,
                        borderColor: palette.borderStrong,
                      },
                      (isSubmitting || pressed) && styles.buttonPressed,
                    ]}
                    onPress={() => void handleRetryBiometric()}
                    disabled={isSubmitting}
                  >
                    <ThemedText style={[styles.secondaryButtonText, { color: palette.text }]}>
                      {LL.settings.unlockTryBiometric()} ({biometricLabel})
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </View>
      </KeyboardAwareScroll>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  glowPrimary: {
    position: 'absolute',
    top: 56,
    right: -56,
    width: 220,
    height: 220,
    borderRadius: 999,
  },
  glowSecondary: {
    position: 'absolute',
    bottom: 48,
    left: -72,
    width: 240,
    height: 240,
    borderRadius: 999,
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 16,
  },
  iconShell: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  eyebrowText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  titleText: { textAlign: 'center' },
  subtitleText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  loadingSection: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { fontSize: 14 },
  pinInput: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
  },
  buttons: { gap: 10 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonPressed: { opacity: 0.72 },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
