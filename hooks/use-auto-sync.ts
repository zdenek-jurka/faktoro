import {
  isAutoSyncEnabled,
  isAutoSyncBlockedDuringLocalTimerEnabled,
  isAutoSyncEventsEnabled,
  isAutoSyncLocalDbTriggerEnabled,
  isAutoSyncRunEnabled,
  isSyncEnabled,
} from '@/constants/features';
import database from '@/db';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { getSettings } from '@/repositories/settings-repository';
import {
  runOnlineSyncSafely,
  subscribeToSyncEvents,
  SYNC_TABLES,
} from '@/repositories/sync-repository';
import { getCurrentDeviceRunningTimeEntry } from '@/repositories/time-entry-repository';
import { subscribeToAutoSyncRequests } from '@/utils/auto-sync-request';
import { Q } from '@nozbe/watermelondb';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const AUTO_SYNC_INTERVAL_MS = 30000;
const WS_SAFETY_SYNC_INTERVAL_MS = 180000;
const HEALTH_TIMEOUT_MS = 4500;
const LOCAL_PUSH_DEBOUNCE_MS = 1200;
const POST_SYNC_DIRTY_CHECK_DELAY_MS = 150;
// Remote WS events only tell peers to pull after another device has already pushed.
// We therefore watch every syncable local table here so newly created records do not
// sit on the originating device until the next poll/foreground/manual sync.
const LOCAL_SYNC_TRIGGER_TABLES = SYNC_TABLES;

function normalizeServerUrl(value?: string | null): string {
  return value?.trim().replace(/\/+$/, '') || '';
}

async function hasCurrentDeviceRunningTimer(): Promise<boolean> {
  try {
    const entry = await getCurrentDeviceRunningTimeEntry();
    return !!entry?.isRunning;
  } catch {
    return false;
  }
}

async function isServerReachable(serverUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${serverUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function hasPendingLocalPushChanges(): Promise<boolean> {
  try {
    for (const table of LOCAL_SYNC_TRIGGER_TABLES) {
      const dirtyRows = await database
        .get(table)
        .query(
          Q.or(Q.where('_status', Q.notEq('synced')), Q.where('_changed', Q.notEq(''))),
          Q.take(1),
        )
        .fetch();
      if (dirtyRows.length > 0) {
        return true;
      }
    }
  } catch (error) {
    console.error('[auto-sync] failed to inspect pending local changes', error);
  }

  return false;
}

export function useAutoSync(): void {
  const syncRunningRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const suppressLocalChangeSchedulingRef = useRef(false);
  const localChangeDuringSuppressionRef = useRef(false);
  const localChangesInitializedRef = useRef(false);
  const lastReachableRef = useRef(false);
  const lastSuccessfulSyncAtRef = useRef(0);
  const pollingEnabledRef = useRef(false);
  const transportModeRef = useRef<'ws' | 'polling'>('polling');
  const eventsUnsubscribeRef = useRef<(() => void) | null>(null);
  const eventsSubscriptionKeyRef = useRef('');

  useEffect(() => {
    if (!isSyncEnabled || !isAutoSyncEnabled) {
      return;
    }

    let disposed = false;

    const runSyncCycle = async (
      reason: 'startup' | 'poll' | 'active' | 'settings' | 'event' | 'local',
    ) => {
      if (disposed) {
        return;
      }

      if (syncRunningRef.current) {
        pendingSyncRef.current = true;
        return;
      }

      const appSettings = await getSettings();
      const deviceSettings = await getDeviceSyncSettings(appSettings);
      const serverUrl = normalizeServerUrl(deviceSettings.syncServerUrl);
      const autoSyncEnabled = deviceSettings.syncAutoEnabled !== false;
      const isConfigured =
        autoSyncEnabled &&
        !!deviceSettings.syncFeatureEnabled &&
        !!deviceSettings.syncIsRegistered &&
        !!serverUrl &&
        !!deviceSettings.syncDeviceId.trim() &&
        !!deviceSettings.syncAuthToken.trim();
      pollingEnabledRef.current = isConfigured;

      if (!isConfigured) {
        if (eventsUnsubscribeRef.current) {
          eventsUnsubscribeRef.current();
          eventsUnsubscribeRef.current = null;
          eventsSubscriptionKeyRef.current = '';
        }
        transportModeRef.current = 'polling';
        lastReachableRef.current = false;
        return;
      }

      // This guard used to be always-on because syncing during an active local timer
      // had caused iOS timer controls to become unresponsive in earlier builds.
      // The heavy duration churn has since been removed, so we now keep the guard
      // opt-in via ENV for easier validation and rollback if the old issue returns.
      if (
        isAutoSyncBlockedDuringLocalTimerEnabled &&
        reason !== 'settings' &&
        (await hasCurrentDeviceRunningTimer())
      ) {
        return;
      }

      const nextSubscriptionKey = `${serverUrl}|${deviceSettings.syncDeviceId}|${deviceSettings.syncAuthToken}`;
      if (isAutoSyncEventsEnabled) {
        if (eventsSubscriptionKeyRef.current !== nextSubscriptionKey) {
          if (eventsUnsubscribeRef.current) {
            eventsUnsubscribeRef.current();
            eventsUnsubscribeRef.current = null;
          }

          eventsUnsubscribeRef.current = subscribeToSyncEvents(
            {
              settings: appSettings,
              syncServerUrl: deviceSettings.syncServerUrl,
              syncDeviceId: deviceSettings.syncDeviceId,
              syncAuthToken: deviceSettings.syncAuthToken,
              syncIsRegistered: deviceSettings.syncIsRegistered,
            },
            {
              onRemoteOnlinePush: () => {
                void runSyncCycle('event');
              },
              onError: (error) => {
                console.error('[auto-sync:events] failed', error);
              },
              onTransportModeChange: (mode) => {
                transportModeRef.current = mode;
              },
            },
            {
              pollIntervalMs: 5000,
              initialSinceMs: Date.now(),
            },
          );
          eventsSubscriptionKeyRef.current = nextSubscriptionKey;
        }
      } else if (eventsUnsubscribeRef.current) {
        eventsUnsubscribeRef.current();
        eventsUnsubscribeRef.current = null;
        eventsSubscriptionKeyRef.current = '';
        transportModeRef.current = 'polling';
      }

      const reachable = await isServerReachable(serverUrl);
      const wasReachable = lastReachableRef.current;
      lastReachableRef.current = reachable;

      if (!reachable) {
        return;
      }

      const shouldSync =
        reason === 'poll' ||
        reason === 'startup' ||
        reason === 'active' ||
        reason === 'local' ||
        !wasReachable;
      if (!shouldSync && reason !== 'event') {
        return;
      }

      if (!isAutoSyncRunEnabled) {
        lastSuccessfulSyncAtRef.current = Date.now();
        return;
      }

      let syncCompleted = false;
      syncRunningRef.current = true;
      suppressLocalChangeSchedulingRef.current = true;
      try {
        await runOnlineSyncSafely(appSettings);
        syncCompleted = true;
        lastSuccessfulSyncAtRef.current = Date.now();
      } catch (error) {
        console.error(`[auto-sync:${reason}] failed`, error);
      } finally {
        const shouldCheckSuppressedLocalChanges =
          syncCompleted && localChangeDuringSuppressionRef.current;
        localChangeDuringSuppressionRef.current = false;
        syncRunningRef.current = false;
        // Watermelon synchronize() mutates local rows and their sync metadata.
        // Those changes are not user edits and must not immediately schedule
        // another sync cycle, otherwise we can end up in a self-triggered loop.
        setTimeout(() => {
          suppressLocalChangeSchedulingRef.current = false;
        }, 0);
        if (pendingSyncRef.current) {
          pendingSyncRef.current = false;
          void runSyncCycle('local');
        } else if (shouldCheckSuppressedLocalChanges) {
          setTimeout(() => {
            if (disposed || syncRunningRef.current) {
              return;
            }
            void hasPendingLocalPushChanges().then((hasPendingChanges) => {
              if (!disposed && hasPendingChanges && !syncRunningRef.current) {
                scheduleLocalPush();
              }
            });
          }, POST_SYNC_DIRTY_CHECK_DELAY_MS);
        }
      }
    };

    let localPushTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLocalPush = () => {
      if (localPushTimer) {
        clearTimeout(localPushTimer);
      }
      localPushTimer = setTimeout(() => {
        void runSyncCycle('local');
      }, LOCAL_PUSH_DEBOUNCE_MS);
    };

    const syncRequestSubscription = subscribeToAutoSyncRequests(() => {
      if (disposed) {
        return;
      }

      if (syncRunningRef.current) {
        pendingSyncRef.current = true;
        return;
      }

      scheduleLocalPush();
    });

    const runDirtyAwarePoll = async () => {
      if (!pollingEnabledRef.current) {
        return;
      }

      if (
        transportModeRef.current === 'ws' &&
        Date.now() - lastSuccessfulSyncAtRef.current < WS_SAFETY_SYNC_INTERVAL_MS
      ) {
        if (syncRunningRef.current) {
          return;
        }

        const hasPendingPush = await hasPendingLocalPushChanges();
        if (!hasPendingPush) {
          return;
        }

        void runSyncCycle('local');
        return;
      }

      void runSyncCycle('poll');
    };

    void runSyncCycle('startup');
    const intervalId = setInterval(() => {
      void runDirtyAwarePoll();
    }, AUTO_SYNC_INTERVAL_MS);

    if (lastSuccessfulSyncAtRef.current === 0) {
      lastSuccessfulSyncAtRef.current = Date.now();
    }

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runSyncCycle('active');
        return;
      }
    });

    const settingsSubscription = observeDeviceSyncSettings(() => {
      void runSyncCycle('settings');
    });

    const localDataSubscription = isAutoSyncLocalDbTriggerEnabled
      ? database
          .withChangesForTables(LOCAL_SYNC_TRIGGER_TABLES as unknown as string[])
          .subscribe(() => {
            if (!localChangesInitializedRef.current) {
              localChangesInitializedRef.current = true;
              return;
            }

            if (suppressLocalChangeSchedulingRef.current) {
              localChangeDuringSuppressionRef.current = true;
              return;
            }

            if (syncRunningRef.current) {
              pendingSyncRef.current = true;
              return;
            }
            scheduleLocalPush();
          })
      : null;

    return () => {
      disposed = true;
      if (localPushTimer) {
        clearTimeout(localPushTimer);
        localPushTimer = null;
      }
      if (eventsUnsubscribeRef.current) {
        eventsUnsubscribeRef.current();
        eventsUnsubscribeRef.current = null;
      }
      clearInterval(intervalId);
      appStateSubscription.remove();
      settingsSubscription();
      syncRequestSubscription();
      localDataSubscription?.unsubscribe();
    };
  }, []);
}
