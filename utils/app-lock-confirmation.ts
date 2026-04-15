import { hasPinHash } from '@/repositories/app-lock-repository';
import { getSettings } from '@/repositories/settings-repository';

export type BiometricState = {
  isAvailable: boolean;
  label: string;
};

export type BiometricLabels = {
  notAvailable: string;
  faceId: string;
  touchId: string;
  biometrics: string;
};

export type AppLockConfirmationState = {
  requiresConfirmation: boolean;
  biometricEnabled: boolean;
  biometricState: BiometricState;
};

export async function getBiometricState(labels: BiometricLabels): Promise<BiometricState> {
  try {
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

export async function authenticateWithBiometric(
  promptMessage: string,
  fallbackLabel: string,
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const localAuth = require('expo-local-authentication');
    if (!localAuth) return false;

    const result = await localAuth.authenticateAsync({
      promptMessage,
      fallbackLabel,
    });

    return !!result.success;
  } catch {
    return false;
  }
}

export async function getAppLockConfirmationState(
  labels: BiometricLabels,
): Promise<AppLockConfirmationState> {
  const [settings, pinExists, biometricState] = await Promise.all([
    getSettings(),
    hasPinHash(),
    getBiometricState(labels),
  ]);

  const requiresConfirmation = !!settings.appLockEnabled && pinExists;
  const biometricEnabled =
    requiresConfirmation && !!settings.appLockBiometricEnabled && biometricState.isAvailable;

  return {
    requiresConfirmation,
    biometricEnabled,
    biometricState,
  };
}
