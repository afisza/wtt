import { useSyncExternalStore } from 'react';

/** Globalny stan synchronizacji — pokazywany w nagłówku aplikacji. */
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'offline' | 'auth';

export interface SaveStatus {
  state: SaveState;
  /** Liczba dni czekających na zapis */
  pending: number;
  lastSavedAt: number | null;
  error: string | null;
}

let status: SaveStatus = { state: 'idle', pending: 0, lastSavedAt: null, error: null };
const listeners = new Set<() => void>();
let retryHandler: (() => void) | null = null;

export const saveStatusStore = {
  get: () => status,
  set(patch: Partial<SaveStatus>) {
    status = { ...status, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setRetryHandler(fn: (() => void) | null) {
    retryHandler = fn;
  },
  retry() {
    retryHandler?.();
  },
};

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(saveStatusStore.subscribe, saveStatusStore.get, saveStatusStore.get);
}
