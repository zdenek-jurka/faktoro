// Fallback for platforms without a specific implementation (e.g. web).
// Metro bundler resolves timer-widget-sync.ios.ts / .android.ts at runtime.
import type TimeEntryModel from '@/model/TimeEntryModel';
import type ClientModel from '@/model/ClientModel';

export function syncTimerToWidget(
  _entry: TimeEntryModel | null,
  _client: ClientModel | undefined,
): void {
  // no-op
}

export function setTimerWidgetsEnabled(_enabled: boolean): void {
  // no-op
}

export function setupWidgetInteractionListener(): { remove: () => void } | null {
  // no-op
  return null;
}
