import { isAndroid, isIos } from '@/utils/platform';

// Sync is available in this build.
const SYNC_AVAILABLE = true;
const INVOICE_HTML_EXPORT_AVAILABLE = false;
const PDF_SAVE_AVAILABLE_ON = (process.env.EXPO_PUBLIC_PDF_SAVE_AVAILABLE_ON || 'android').trim();
const PDF_OPEN_AVAILABLE_ON = (process.env.EXPO_PUBLIC_PDF_OPEN_AVAILABLE_ON || 'android').trim();
const DANGEROUS_APP_DATA_RESET_FLAG = (
  process.env.EXPO_PUBLIC_DANGEROUS_APP_DATA_RESET_AVAILABLE || ''
).trim();
const DANGEROUS_APP_DATA_RESET_AVAILABLE =
  DANGEROUS_APP_DATA_RESET_FLAG === '1' || DANGEROUS_APP_DATA_RESET_FLAG.toLowerCase() === 'true';
const RAW_ERROR_MESSAGES_FLAG = (process.env.EXPO_PUBLIC_SHOW_RAW_ERROR_MESSAGES || '').trim();
const RAW_ERROR_MESSAGES_ENABLED =
  RAW_ERROR_MESSAGES_FLAG === '1' || RAW_ERROR_MESSAGES_FLAG.toLowerCase() === 'true';
const SYNC_RECOVERY_PAYLOAD_ENTRY_FLAG = (
  process.env.EXPO_PUBLIC_SYNC_RECOVERY_PAYLOAD || ''
).trim();
const SYNC_RECOVERY_PAYLOAD_ENTRY_ENABLED =
  SYNC_RECOVERY_PAYLOAD_ENTRY_FLAG === '1' ||
  SYNC_RECOVERY_PAYLOAD_ENTRY_FLAG.toLowerCase() === 'true';

// Temporary investigation flags so we can isolate sync-related regressions
// without losing access to sync settings and manual sync flows.
const FORCE_DISABLE_SYNC = false;
const FORCE_DISABLE_AUTO_SYNC = false;
const FORCE_DISABLE_AUTO_SYNC_EVENTS = false;
const FORCE_DISABLE_AUTO_SYNC_LOCAL_DB_TRIGGER = false;
const FORCE_DISABLE_AUTO_SYNC_RUN = false;
const FORCE_DISABLE_SYNC_PUSH = false;
const FORCE_DISABLE_SYNC_PULL = false;
const FORCE_DISABLE_SYNC_SYNCHRONIZE = false;
const FORCE_DISABLE_DANGEROUS_SYNC_RESET = false;
const FORCE_DISABLE_DANGEROUS_APP_DATA_RESET = false;

function isPlatformFeatureEnabled(availability: string): boolean {
  const normalized = availability.toLowerCase();
  if (normalized === 'ios') return isIos;
  if (normalized === 'android') return isAndroid;
  if (normalized === 'both') return isIos || isAndroid;
  return false;
}

export const isSyncEnabled = SYNC_AVAILABLE && !FORCE_DISABLE_SYNC;

export const isAutoSyncEnabled = isSyncEnabled && !FORCE_DISABLE_AUTO_SYNC;
export const isAutoSyncEventsEnabled = isAutoSyncEnabled && !FORCE_DISABLE_AUTO_SYNC_EVENTS;
export const isAutoSyncLocalDbTriggerEnabled =
  isAutoSyncEnabled && !FORCE_DISABLE_AUTO_SYNC_LOCAL_DB_TRIGGER;
export const isAutoSyncRunEnabled = isAutoSyncEnabled && !FORCE_DISABLE_AUTO_SYNC_RUN;
export const isSyncPushEnabled = isSyncEnabled && !FORCE_DISABLE_SYNC_PUSH;
export const isSyncPullEnabled = isSyncEnabled && !FORCE_DISABLE_SYNC_PULL;
export const isSyncSynchronizeEnabled = isSyncEnabled && !FORCE_DISABLE_SYNC_SYNCHRONIZE;
export const isDangerousSyncResetEnabled = isSyncEnabled && !FORCE_DISABLE_DANGEROUS_SYNC_RESET;
export const isDangerousAppDataResetEnabled =
  DANGEROUS_APP_DATA_RESET_AVAILABLE && !FORCE_DISABLE_DANGEROUS_APP_DATA_RESET;
export const isInvoiceHtmlExportEnabled = INVOICE_HTML_EXPORT_AVAILABLE;
export const isPdfSaveEnabled = isPlatformFeatureEnabled(PDF_SAVE_AVAILABLE_ON);
export const isPdfOpenEnabled = isPlatformFeatureEnabled(PDF_OPEN_AVAILABLE_ON);
export const isRawErrorMessagesEnabled = RAW_ERROR_MESSAGES_ENABLED;
export const isSyncRecoveryPayloadEntryEnabled = SYNC_RECOVERY_PAYLOAD_ENTRY_ENABLED;
