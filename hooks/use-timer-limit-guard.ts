import database from '@/db';
import { useI18nContext } from '@/i18n/i18n-react';
import ClientModel from '@/model/ClientModel';
import {
  getCurrentDeviceRunningTimeEntry,
  getEffectiveTimerLimitsForEntry,
  getTimeEntryHardLimitStopTime,
  markTimeEntrySoftLimitNotified,
  stopTimeEntry,
} from '@/repositories/time-entry-repository';
import { showAlert } from '@/utils/platform-alert';
import { getDisplayedTimeEntryDuration } from '@/utils/time-entry-duration-utils';
import { syncTimerToWidget } from '@/widgets/timer-widget-sync';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const TIMER_LIMIT_CHECK_INTERVAL_MS = 15000;

async function triggerWarningHaptic(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Haptics are optional. Ignore environments without native support.
  }
}

export function useTimerLimitGuard(): void {
  const { LL } = useI18nContext();
  const processingRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    const checkRunningTimerLimits = async () => {
      if (disposed || processingRef.current || AppState.currentState !== 'active') {
        return;
      }

      processingRef.current = true;
      try {
        const entry = await getCurrentDeviceRunningTimeEntry();
        if (!entry || !entry.isRunning) {
          return;
        }

        const { softLimitMinutes, hardLimitMinutes } = await getEffectiveTimerLimitsForEntry(entry);
        const nowMs = Date.now();
        const elapsedSeconds = getDisplayedTimeEntryDuration(entry, nowMs);

        if (hardLimitMinutes && elapsedSeconds >= hardLimitMinutes * 60) {
          const hardStopAt = getTimeEntryHardLimitStopTime(
            {
              duration: entry.duration,
              isRunning: entry.isRunning,
              isPaused: entry.isPaused,
              startTime: entry.startTime,
              pausedAt: entry.pausedAt,
              totalPausedDuration: entry.totalPausedDuration,
              timerHardLimitMinutes: hardLimitMinutes,
            },
            nowMs,
          );

          await stopTimeEntry(entry.id, hardStopAt ?? nowMs);
          await triggerWarningHaptic();
          syncTimerToWidget(null, undefined);
          showAlert(
            LL.timeTracking.timerHardLimitReachedTitle(),
            LL.timeTracking.timerHardLimitReachedMessage({
              hours: String(Math.floor(hardLimitMinutes / 60)),
            }),
          );
          return;
        }

        if (
          softLimitMinutes &&
          !entry.softLimitNotifiedAt &&
          elapsedSeconds >= softLimitMinutes * 60
        ) {
          await markTimeEntrySoftLimitNotified(entry.id, nowMs);
          await triggerWarningHaptic();
          const client = await database
            .get<ClientModel>(ClientModel.table)
            .find(entry.clientId)
            .catch(() => null);
          showAlert(
            LL.timeTracking.timerSoftLimitReachedTitle(),
            LL.timeTracking.timerSoftLimitReachedMessage({
              hours: String(Math.floor(softLimitMinutes / 60)),
              clientName: client?.name || LL.timeTracking.title(),
            }),
          );
        }
      } catch (error) {
        console.error('[timer-limit-guard] failed', error);
      } finally {
        processingRef.current = false;
      }
    };

    void checkRunningTimerLimits();
    const intervalId = setInterval(() => {
      void checkRunningTimerLimits();
    }, TIMER_LIMIT_CHECK_INTERVAL_MS);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkRunningTimerLimits();
      }
    });

    return () => {
      disposed = true;
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [LL]);
}
