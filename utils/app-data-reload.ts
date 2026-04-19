type AppDataReloadListener = () => void;

const listeners = new Set<AppDataReloadListener>();

export function requestAppDataReload(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeToAppDataReload(listener: AppDataReloadListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
