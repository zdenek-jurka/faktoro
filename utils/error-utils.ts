import { isRawErrorMessagesEnabled } from '@/constants/features';
import type { TranslationFunctions } from '@/i18n/i18n-types';

export function isHttpError(error: unknown): error is Error & { httpStatus: number } {
  return error instanceof Error && 'httpStatus' in error;
}

export function isNetworkError(error: unknown): error is Error & { networkError: true } {
  return error instanceof Error && 'networkError' in error;
}

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  const rawMessage = getRawErrorMessage(error);
  if (isRawErrorMessagesEnabled && rawMessage) {
    return rawMessage;
  }
  return fallbackMessage;
}

export function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return '';
}

export function getOfflineBackupErrorMessage(
  error: unknown,
  LL: TranslationFunctions,
  fallbackMessage: string,
): string {
  const message = getRawErrorMessage(error);
  if (!message) return fallbackMessage;

  if (message === 'Backup password is required.') {
    return LL.settings.offlineBackupRestorePasswordRequired();
  }
  if (message === 'This backup uses compression that is not supported on this device.') {
    return LL.settings.offlineBackupCompressionUnsupported();
  }
  if (message === 'Backup storage is unavailable on this device.') {
    return LL.settings.offlineBackupStorageUnavailable();
  }
  if (message === 'Unable to decrypt backup. Check the password and try again.') {
    return LL.settings.offlineBackupDecryptError();
  }
  if (
    message === 'Invalid backup file format.' ||
    message === 'Unsupported backup file version.' ||
    message === 'Backup file is missing creation metadata.' ||
    message === 'Backup file is missing encryption metadata.' ||
    message === 'Compressed backup payload is invalid.' ||
    message === 'Backup file payload is missing.' ||
    message === 'Backup file encryption payload is invalid.' ||
    message === 'Backup payload is invalid.'
  ) {
    return LL.settings.offlineBackupInvalidFile();
  }

  return isRawErrorMessagesEnabled ? message : fallbackMessage;
}

export function getExportIntegrationErrorMessage(
  error: unknown,
  LL: TranslationFunctions,
  fallbackMessage: string,
): string {
  const message = getRawErrorMessage(error);
  if (!message) return fallbackMessage;

  if (
    message === 'expo-secure-store is not installed.' ||
    message === 'Clipboard module missing setStringAsync' ||
    /ExpoClipboard|native module/i.test(message)
  ) {
    return LL.settings.exportIntegrationPlatformUnavailable();
  }
  if (message === 'Missing cache directory' || message === 'Sharing unavailable') {
    return LL.settings.exportIntegrationShareUnavailable();
  }
  if (message === 'Integration not found') {
    return LL.settings.exportIntegrationNotFound();
  }
  if (message === 'Request timed out.') {
    return LL.settings.exportIntegrationRequestTimedOut();
  }
  if (message === 'Network request failed.') {
    return LL.settings.exportIntegrationNetworkError();
  }
  if (
    message === 'XSLT stylesheet is empty.' ||
    message === 'XSLT stylesheet must use xsl:stylesheet or xsl:transform as the root.' ||
    message === 'XSLT transformation returned an empty result.' ||
    /^XSLT stylesheet:/i.test(message) ||
    /^Generated XML:/i.test(message) ||
    /^Exported XML:/i.test(message)
  ) {
    return LL.settings.exportIntegrationXsltInvalid();
  }
  if (/:\s*invalid URL$/i.test(message)) {
    return LL.settings.exportIntegrationInvalidUrl();
  }
  if (/:\s*HTTPS is required$/i.test(message)) {
    return LL.settings.exportIntegrationHttpsRequired();
  }

  return isRawErrorMessagesEnabled ? message : fallbackMessage;
}

export function getSyncErrorMessage(
  error: unknown,
  LL: TranslationFunctions,
  fallbackMessage: string,
): string {
  if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
    return LL.settings.syncServerUnavailable();
  }

  const message = getRawErrorMessage(error);
  if (!message) return fallbackMessage;

  if (message === 'Sync server URL is missing') {
    return LL.settings.syncServerUrlRequired();
  }
  if (message === 'Sync instance ID is missing') {
    return LL.settings.syncInstanceIdRequired();
  }
  if (message === 'Sync device ID is missing') {
    return LL.settings.syncDeviceIdRequired();
  }
  if (message === 'Sync auth token is missing (device not registered)') {
    return LL.settings.syncNoAuthToken();
  }
  if (
    message === 'Secure Crypto API is unavailable on this platform' ||
    message === 'Secure crypto random source is unavailable on this platform' ||
    message === 'Secure Crypto API is unavailable. Enable insecure plaintext fallback to continue.'
  ) {
    return LL.settings.syncCryptoUnavailable();
  }

  return isRawErrorMessagesEnabled ? message : fallbackMessage;
}
