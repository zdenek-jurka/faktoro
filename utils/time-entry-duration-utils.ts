import type TimeEntryModel from '@/model/TimeEntryModel';

export function getDisplayedTimeEntryDuration(
  entry: Pick<
    TimeEntryModel,
    'duration' | 'isRunning' | 'isPaused' | 'startTime' | 'pausedAt' | 'totalPausedDuration'
  >,
  nowMs = Date.now(),
): number {
  if (!entry.isRunning) {
    return entry.duration || 0;
  }

  const totalElapsed = Math.floor((nowMs - entry.startTime) / 1000);
  let pausedDuration = entry.totalPausedDuration || 0;

  if (entry.isPaused && entry.pausedAt) {
    const currentPauseDuration = Math.floor((nowMs - entry.pausedAt) / 1000);
    pausedDuration += currentPauseDuration;
  }

  return Math.max(0, totalElapsed - pausedDuration);
}
