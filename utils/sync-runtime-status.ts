import { useSyncExternalStore } from 'react';

export type SyncTransportMode = 'ws' | 'polling';

export type SyncRuntimeStatus = {
  isRegistered: boolean;
  isConfigured: boolean;
  autoEnabled: boolean;
  serverReachable: boolean | null;
  syncRunning: boolean;
  pendingLocalChanges: boolean;
  indicatorEnabled: boolean;
  transportMode: SyncTransportMode;
  lastSuccessfulSyncAt: number | null;
  lastErrorAt: number | null;
  updatedAt: number;
};

const DEFAULT_SYNC_RUNTIME_STATUS: SyncRuntimeStatus = {
  isRegistered: false,
  isConfigured: false,
  autoEnabled: true,
  serverReachable: null,
  syncRunning: false,
  pendingLocalChanges: false,
  indicatorEnabled: false,
  transportMode: 'polling',
  lastSuccessfulSyncAt: null,
  lastErrorAt: null,
  updatedAt: Date.now(),
};

let currentStatus = DEFAULT_SYNC_RUNTIME_STATUS;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function getSyncRuntimeStatus(): SyncRuntimeStatus {
  return currentStatus;
}

export function setSyncRuntimeStatus(patch: Partial<SyncRuntimeStatus>): void {
  currentStatus = {
    ...currentStatus,
    ...patch,
    updatedAt: Date.now(),
  };
  emit();
}

export function resetSyncRuntimeStatus(): void {
  currentStatus = {
    ...DEFAULT_SYNC_RUNTIME_STATUS,
    updatedAt: Date.now(),
  };
  emit();
}

export function subscribeToSyncRuntimeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSyncRuntimeStatus(): SyncRuntimeStatus {
  return useSyncExternalStore(
    subscribeToSyncRuntimeStatus,
    getSyncRuntimeStatus,
    getSyncRuntimeStatus,
  );
}
