// Sync is available in this build.
const SYNC_AVAILABLE = true;
const DANGEROUS_APP_DATA_RESET_AVAILABLE = false;
const INVOICE_HTML_EXPORT_AVAILABLE = false;

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
