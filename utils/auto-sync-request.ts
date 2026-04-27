export type AutoSyncRequestReason =
  | 'time-entry-created'
  | 'time-entry-updated'
  | 'time-entry-stopped'
  | 'time-entry-deleted'
  | 'time-entry-paused'
  | 'time-entry-resumed'
  | 'time-entry-soft-limit-notified'
  | 'time-entry-bulk-stopped'
  | 'time-entry-linked'
  | 'time-entry-rate-updated'
  | 'local-change';

type AutoSyncRequestListener = (reason: AutoSyncRequestReason) => void;

const listeners = new Set<AutoSyncRequestListener>();

export function requestAutoSync(reason: AutoSyncRequestReason = 'local-change'): void {
  for (const listener of listeners) {
    try {
      listener(reason);
    } catch (error) {
      console.error('[auto-sync-request] listener failed', error);
    }
  }
}

export function subscribeToAutoSyncRequests(listener: AutoSyncRequestListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
