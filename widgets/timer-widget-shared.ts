export type TimerWidgetAction = 'pause' | 'resume' | 'stop';

export const TIMER_WIDGET_TARGETS: Record<TimerWidgetAction, string> = {
  pause: 'timer.pause',
  resume: 'timer.resume',
  stop: 'timer.stop',
};

export type TimerWidgetProps = {
  /** Whether a timer is currently running */
  isRunning: boolean;
  /** Whether the running timer is paused */
  isPaused: boolean;
  /** Timer start timestamp in milliseconds */
  startTime: number;
  /** Total accumulated paused time in seconds */
  totalPausedDuration: number;
  /** Timestamp (ms) when current pause began; only set when isPaused */
  pausedAt?: number;
  /** Client name for the running timer */
  clientName: string;
  /** Optional description / activity */
  description?: string;
  /** Whether the current OS/build supports interactive widget actions */
  interactiveActionsEnabled?: boolean;
};
