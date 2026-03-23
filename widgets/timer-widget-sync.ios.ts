import { AppState, Platform } from 'react-native';
import { addUserInteractionListener } from 'expo-widgets';
import type TimeEntryModel from '@/model/TimeEntryModel';
import type ClientModel from '@/model/ClientModel';
import {
  getCurrentDeviceRunningTimeEntry,
  pauseTimeEntry,
  resumeTimeEntry,
  stopTimeEntry,
} from '@/repositories/time-entry-repository';
import database from '@/db';
import ClientModel_ from '@/model/ClientModel';
import {
  TIMER_WIDGET_TARGETS,
  timerLiveActivity,
  timerWidget,
  type TimerWidgetAction,
  type TimerWidgetProps,
} from './TimerWidget';

// Interval between scheduled widget timeline entries (seconds)
const ENTRY_INTERVAL_SECONDS = 30;
// How far ahead we pre-schedule entries (minutes)
const SCHEDULE_MINUTES = 5;
const ENTRY_COUNT = Math.ceil((SCHEDULE_MINUTES * 60) / ENTRY_INTERVAL_SECONDS);

const TIMER_ACTION_BY_TARGET: Record<string, TimerWidgetAction> = {
  [TIMER_WIDGET_TARGETS.pause]: 'pause',
  [TIMER_WIDGET_TARGETS.resume]: 'resume',
  [TIMER_WIDGET_TARGETS.stop]: 'stop',
};

const LIVE_ACTIVITY_URL = 'faktoro://timer';
const IOS_MAJOR_VERSION =
  typeof Platform.Version === 'string' ? parseInt(Platform.Version, 10) : Number(Platform.Version);
const SUPPORTS_INTERACTIVE_WIDGET_ACTIONS = IOS_MAJOR_VERSION >= 17;
const SUPPORTS_TIMER_LIVE_ACTIVITY = IOS_MAJOR_VERSION >= 16;

let liveActivitySyncChain: Promise<void> = Promise.resolve();
let interactionListenerSubscription: { remove: () => void } | null = null;
let timerSurfaceSyncChain: Promise<void> = Promise.resolve();
let timerWidgetsEnabled = true;

function clearTimerSurfaces(): void {
  timerWidget.updateSnapshot({
    isRunning: false,
    isPaused: false,
    startTime: 0,
    totalPausedDuration: 0,
    clientName: '',
    interactiveActionsEnabled: SUPPORTS_INTERACTIVE_WIDGET_ACTIONS,
  });
  queueLiveActivitySync(null, undefined);
}

export function setTimerWidgetsEnabled(enabled: boolean): void {
  timerWidgetsEnabled = enabled;

  if (!enabled) {
    interactionListenerSubscription?.remove();
    clearTimerSurfaces();
  }
}

/**
 * Push current timer state to the iOS widget.
 * When running: schedules future timeline entries so elapsed time updates every 30 s.
 * When paused/stopped: pushes a single snapshot.
 */
export function syncTimerToWidget(
  entry: TimeEntryModel | null,
  client: ClientModel | undefined,
): void {
  if (Platform.OS !== 'ios') return;
  if (!timerWidgetsEnabled) {
    clearTimerSurfaces();
    return;
  }

  timerSurfaceSyncChain = timerSurfaceSyncChain
    .catch(() => undefined)
    .then(async () => {
      if (!entry || !entry.isRunning) {
        timerWidget.updateSnapshot({
          isRunning: false,
          isPaused: false,
          startTime: 0,
          totalPausedDuration: 0,
          clientName: '',
          interactiveActionsEnabled: SUPPORTS_INTERACTIVE_WIDGET_ACTIONS,
        });
        queueLiveActivitySync(null, undefined);
        return;
      }

      let resolvedClient = client;
      if (!resolvedClient) {
        try {
          resolvedClient = await database
            .get<ClientModel_>(ClientModel_.table)
            .find(entry.clientId);
        } catch {
          resolvedClient = undefined;
        }
      }

      const baseProps: TimerWidgetProps = {
        isRunning: true,
        isPaused: entry.isPaused,
        startTime: entry.startTime,
        totalPausedDuration: entry.totalPausedDuration ?? 0,
        pausedAt: entry.isPaused ? entry.pausedAt : undefined,
        clientName: resolvedClient?.name ?? '',
        description: entry.description ?? undefined,
        interactiveActionsEnabled: SUPPORTS_INTERACTIVE_WIDGET_ACTIONS,
      };

      if (entry.isPaused) {
        // Frozen time – single snapshot is enough
        timerWidget.updateSnapshot(baseProps);
        queueLiveActivitySync(entry, resolvedClient);
        return;
      }

      // Schedule entries so the widget derives elapsed time from env.date at render
      const now = Date.now();
      const entries = Array.from({ length: ENTRY_COUNT }, (_, i) => ({
        date: new Date(now + i * ENTRY_INTERVAL_SECONDS * 1000),
        props: baseProps,
      }));
      timerWidget.updateTimeline(entries);

      queueLiveActivitySync(entry, resolvedClient);
    })
    .catch((err) => {
      console.error('[TimerWidget] syncTimerToWidget failed:', err);
    });
}

// Timestamp of the last widget interaction processed by the foreground notification path.
// Used to avoid double-processing when the app is in the foreground and both the
// notification AND the pending-action poll fire for the same event.
let lastProcessedActionTime = 0;

function getTimerActionFromTarget(target: string | undefined): TimerWidgetAction | null {
  if (!target) return null;
  return TIMER_ACTION_BY_TARGET[target] ?? null;
}

async function applyTimerAction(action: TimerWidgetAction): Promise<boolean> {
  const runningEntry = await getCurrentDeviceRunningTimeEntry();
  if (!runningEntry) return false;

  if (action === 'pause') {
    if (!runningEntry.isPaused) {
      await pauseTimeEntry(runningEntry.id);
    }
    return true;
  }

  if (action === 'resume') {
    if (runningEntry.isPaused) {
      await resumeTimeEntry(runningEntry.id);
    }
    return true;
  }

  await stopTimeEntry(runningEntry.id);
  return true;
}

function queueLiveActivitySync(
  entry: TimeEntryModel | null,
  client: ClientModel | undefined,
): void {
  if (!SUPPORTS_TIMER_LIVE_ACTIVITY) {
    return;
  }

  liveActivitySyncChain = liveActivitySyncChain
    .catch(() => undefined)
    .then(async () => {
      const instances = await timerLiveActivity.getInstances();

      if (!entry || !entry.isRunning) {
        await Promise.all(instances.map((instance) => instance.end('immediate')));
        return;
      }

      const props: TimerWidgetProps = {
        isRunning: true,
        isPaused: entry.isPaused,
        startTime: entry.startTime,
        totalPausedDuration: entry.totalPausedDuration ?? 0,
        pausedAt: entry.isPaused ? entry.pausedAt : undefined,
        clientName: client?.name ?? '',
        description: entry.description ?? undefined,
        interactiveActionsEnabled: SUPPORTS_INTERACTIVE_WIDGET_ACTIONS,
      };

      if (instances.length === 0) {
        await timerLiveActivity.start(props, LIVE_ACTIVITY_URL);
        return;
      }

      await Promise.all(instances.map((instance) => instance.update(props)));
    })
    .catch((err) => {
      console.error('[TimerWidget] queueLiveActivitySync failed:', err);
    });
}

/**
 * Read the widget timeline from shared App Group storage and process any pending
 * button-press action that was written there by the AppIntent (which runs in the
 * widget extension process when the app is not in the foreground).
 */
async function checkPendingWidgetAction(): Promise<boolean> {
  try {
    const entries = await timerWidget.getTimeline();
    for (const entry of entries) {
      const p = entry.props as TimerWidgetProps & {
        pendingAction?: string;
        pendingActionTime?: number;
      };
      if (
        p.pendingAction &&
        typeof p.pendingActionTime === 'number' &&
        p.pendingActionTime > lastProcessedActionTime
      ) {
        lastProcessedActionTime = p.pendingActionTime;
        if (
          p.pendingAction !== 'pause' &&
          p.pendingAction !== 'resume' &&
          p.pendingAction !== 'stop'
        ) {
          return false;
        }
        const handled = await applyTimerAction(p.pendingAction);
        if (!handled) return false;
        await syncCurrentTimerStateToSurfaces();
        return true;
      }
    }
  } catch (err) {
    console.error('[TimerWidget] checkPendingWidgetAction failed:', err);
  }
  return false;
}

/**
 * Re-query the DB and push fresh timeline entries when the app comes to the foreground
 * while a timer is running (refreshes the scheduled entries so the widget shows
 * accurate time after a long background period).
 */
async function syncCurrentTimerStateToWidget(): Promise<void> {
  try {
    const entry = await getCurrentDeviceRunningTimeEntry();
    if (!entry || !entry.isRunning) {
      syncTimerToWidget(null, undefined);
      return;
    }
    let client: ClientModel | undefined;
    try {
      client = await database.get<ClientModel_>(ClientModel_.table).find(entry.clientId);
    } catch {
      client = undefined;
    }
    syncTimerToWidget(entry, client);
  } catch (err) {
    console.error('[TimerWidget] syncCurrentTimerStateToWidget failed:', err);
  }
}

async function syncCurrentTimerStateToSurfaces(): Promise<void> {
  await syncCurrentTimerStateToWidget();
}

/**
 * Listen for Pause / Resume / Stop button taps from the widget.
 * Handles both the foreground path (instant notification) and the background path
 * (pending action written to shared storage by the widget extension AppIntent).
 * Returns an object with a remove() method – call it on unmount.
 */
export function setupWidgetInteractionListener(): { remove: () => void } | null {
  if (Platform.OS !== 'ios') return null;
  if (!timerWidgetsEnabled) return null;
  if (!SUPPORTS_INTERACTIVE_WIDGET_ACTIONS) return null;
  if (interactionListenerSubscription) return interactionListenerSubscription;

  // Foreground path: app is active when the button is tapped → iOS routes the
  // AppIntent to the main app process → NotificationCenter fires immediately.
  const notificationSub = addUserInteractionListener(async (event) => {
    const action = getTimerActionFromTarget(event.target);
    if (!action) return;
    // Mark this timestamp so the pending-action poll skips it.
    lastProcessedActionTime = Math.max(lastProcessedActionTime, event.timestamp);
    try {
      const handled = await applyTimerAction(action);
      if (!handled) return;
      await syncCurrentTimerStateToSurfaces();
    } catch (err) {
      console.error('[TimerWidget] action failed:', event.target, err);
    }
  });

  // Background / cold-start path: AppIntent ran in the widget extension → pending
  // action stored in shared App Group UserDefaults → process when app becomes active.
  const appStateSub = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      void (async () => {
        const handledPendingAction = await checkPendingWidgetAction();
        if (!handledPendingAction) {
          await syncCurrentTimerStateToSurfaces();
        }
      })();
    }
  });

  // Check immediately on startup in case the app was opened via a widget button tap.
  void (async () => {
    const handledPendingAction = await checkPendingWidgetAction();
    if (!handledPendingAction) {
      await syncCurrentTimerStateToSurfaces();
    }
  })();

  interactionListenerSubscription = {
    remove: () => {
      notificationSub.remove();
      appStateSub.remove();
      interactionListenerSubscription = null;
    },
  };

  return interactionListenerSubscription;
}
