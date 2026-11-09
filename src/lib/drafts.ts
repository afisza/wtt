import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { storage } from '@/lib/storage';

/**
 * Szkice formularzy w localStorage.
 * Każda zmiana w otwartym formularzu jest zapisywana od razu, więc przeładowanie,
 * zamknięcie karty czy wylogowanie nie gubią wpisywanej treści. Szkic jest usuwany
 * dopiero po zapisaniu zadania albo po świadomym „Odrzuć”.
 */

const PREFIX = 'wtt:draft:v1:';
const MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;

interface StoredDraft<T> {
  v: T;
  t: number;
}

/** Zakres szkiców — klient aktywny w kalendarzu. */
export const DraftScopeContext = createContext<{ clientId: number | null }>({ clientId: null });

export const useDraftScope = () => useContext(DraftScopeContext);

/** id: 'new' (formularz dodawania), '<taskId>' (edycja), 'inline:<taskId>' (szybka edycja). */
export function draftKey(clientId: number | null, date: string, id: string): string | null {
  if (clientId == null) return null;
  return `${PREFIX}${clientId}:${date}:${id}`;
}

export function readDraft<T>(key: string | null): T | null {
  if (!key) return null;
  const d = storage.getJSON<StoredDraft<T>>(key);
  if (!d || typeof d !== 'object' || !('v' in d)) return null;
  if (Date.now() - (d.t || 0) > MAX_AGE_MS) {
    storage.remove(key);
    return null;
  }
  return d.v;
}

export function writeDraft<T>(key: string | null, value: T) {
  if (key) storage.setJSON(key, { v: value, t: Date.now() } satisfies StoredDraft<T>);
}

export function clearDraft(key: string | null) {
  if (key) storage.remove(key);
}

/** Lista id szkiców zapisanych dla danego dnia (np. ['new', '123456', 'inline:123456']). */
export function listDraftIds(clientId: number | null, date: string): string[] {
  if (clientId == null) return [];
  const prefix = `${PREFIX}${clientId}:${date}:`;
  return storage.keys(prefix).map((k) => k.slice(prefix.length));
}

/** Liczba wszystkich szkiców danego klienta. */
export function countDrafts(clientId: number | null): number {
  if (clientId == null) return 0;
  return storage.keys(`${PREFIX}${clientId}:`).length;
}

/**
 * Stan formularza zsynchronizowany ze szkicem.
 * `isEmpty` decyduje, czy szkic w ogóle warto trzymać (pusty = usuwamy).
 */
export function useDraft<T>(key: string | null, initial: T, isEmpty: (v: T) => boolean) {
  const [restored] = useState(() => readDraft<T>(key) !== null);
  const [value, setValueState] = useState<T>(() => {
    const d = readDraft<T>(key);
    return d !== null ? { ...initial, ...d } : initial;
  });
  const keyRef = useRef(key);
  keyRef.current = key;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) return;
    if (isEmptyRef.current(value)) clearDraft(keyRef.current);
    else writeDraft(keyRef.current, value);
  }, [value]);

  const setValue = useCallback((patch: Partial<T> | ((prev: T) => T)) => {
    dirty.current = true;
    setValueState((prev) =>
      typeof patch === 'function' ? (patch as (p: T) => T)(prev) : { ...prev, ...patch },
    );
  }, []);

  const clear = useCallback(() => {
    dirty.current = false;
    clearDraft(keyRef.current);
  }, []);

  return { value, setValue, clear, restored };
}
