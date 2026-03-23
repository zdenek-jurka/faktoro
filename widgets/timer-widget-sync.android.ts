export async function syncTimerToWidget(_data: { isRunning: boolean; seconds: number }) {
  // Android no-op
}

export function setTimerWidgetsEnabled(_enabled: boolean): void {
  // Android no-op
}

export function setupWidgetInteractionListener(): { remove: () => void } | null {
  // Android no-op
  return null;
}
