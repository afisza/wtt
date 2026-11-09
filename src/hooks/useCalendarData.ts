import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { basePath } from '@/lib/apiBase';
import {
  apiJson,
  isSessionExpired,
  SessionExpiredError,
  SESSION_EXPIRED_EVENT,
  SESSION_RESTORED_EVENT,
} from '@/lib/api';
import { storage } from '@/lib/storage';
import { getHourlyRate, isRateKey } from '@/lib/rate';
import { calculateTotalHours, normalizeTask, sumHours, MONTH_NAMES } from '@/lib/tasks';
import {
  ackDays,
  buildPayload,
  loadOutbox,
  overlayOutbox,
  recordChange,
  saveOutbox,
  type Outbox,
} from '@/lib/outbox';
import { saveStatusStore } from '@/lib/saveStatus';
import type { Task } from '@/components/tasks/types';

export interface DayData {
  date: string;
  tasks: Task[];
  totalHours: string;
}

export type TasksUpdater = Task[] | ((prev: Task[]) => Task[]);

export interface Assigner {
  id: number | string;
  name: string;
  avatar?: string;
}

const RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];
const FLUSH_DEBOUNCE_MS = 350;
const STALE_AFTER_MS = 2 * 60 * 1000;

const makeDay = (date: string, tasks: Task[]): DayData => ({
  date,
  tasks,
  totalHours: calculateTotalHours(tasks),
});

const toDateKey = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : format(new Date(date), 'yyyy-MM-dd');

export function useCalendarData(clientId: number | null) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const saved = storage.get('wttCalendarMonth');
    if (saved) {
      const [y, m] = saved.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) return new Date(y, m - 1, 1);
    }
    return new Date();
  });
  const [daysData, setDaysData] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const [hourlyRate, setHourlyRate] = useState<string>(getHourlyRate);
  const [assigners, setAssigners] = useState<Assigner[]>([]);

  const monthKey = format(currentMonth, 'yyyy-MM');

  // Refy — zawsze aktualne wartości (bez nieświeżych domknięć)
  const daysDataRef = useRef(daysData);
  const clientIdRef = useRef(clientId);
  clientIdRef.current = clientId;
  const monthKeyRef = useRef(monthKey);
  monthKeyRef.current = monthKey;

  const outboxRef = useRef<Outbox>({});
  const inFlightRef = useRef(false);
  const flushAgainRef = useRef(false);
  const flushTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const loadSeqRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const lastLoadedAtRef = useRef(0);

  const commitDays = useCallback((next: Record<string, DayData>) => {
    daysDataRef.current = next;
    setDaysData(next);
  }, []);

  const publish = useCallback((patch: Parameters<typeof saveStatusStore.set>[0]) => {
    saveStatusStore.set({ pending: Object.keys(outboxRef.current).length, ...patch });
  }, []);

  const persistOutbox = useCallback(() => {
    const cid = clientIdRef.current;
    if (cid == null) return;
    if (!saveOutbox(cid, outboxRef.current)) {
      publish({
        state: 'error',
        error: 'Brak miejsca na lokalną kopię — nie zamykaj karty przed zapisem',
      });
    }
  }, [publish]);

  // ── Zapis (flush outboxa) ────────────────────────────────────────────────────
  const flush = useCallback(async (): Promise<void> => {
    const cid = clientIdRef.current;
    if (cid == null) return;
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (inFlightRef.current) {
      flushAgainRef.current = true;
      return;
    }
    const snapshot = outboxRef.current;
    const dateKeys = Object.keys(snapshot);
    if (dateKeys.length === 0) {
      const s = saveStatusStore.get().state;
      if (s !== 'saved' && s !== 'idle') publish({ state: 'saved', error: null });
      return;
    }
    if (isSessionExpired()) {
      publish({ state: 'auth', error: null });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      publish({ state: 'offline', error: null });
      return;
    }

    inFlightRef.current = true;
    publish({ state: 'saving', error: null });
    const sentRevs = Object.fromEntries(dateKeys.map((d) => [d, snapshot[d].rev]));
    let ok = false;
    try {
      await apiJson('/api/work-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(snapshot), clientId: cid }),
      });
      ok = true;
      if (clientIdRef.current === cid) {
        outboxRef.current = ackDays(outboxRef.current, sentRevs);
        persistOutbox();
      } else {
        // Użytkownik przełączył klienta w trakcie zapisu — potwierdź w kopii tamtego klienta
        saveOutbox(cid, ackDays(loadOutbox(cid), sentRevs));
      }
      retryAttemptRef.current = 0;
      publish({ state: 'saved', lastSavedAt: Date.now(), error: null });
    } catch (error: any) {
      if (error instanceof SessionExpiredError) {
        publish({ state: 'auth', error: null });
      } else {
        const delay =
          RETRY_DELAYS_MS[Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)];
        retryAttemptRef.current += 1;
        publish({
          state: navigator.onLine === false ? 'offline' : 'error',
          error: error?.message || 'Nie udało się zapisać',
        });
        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void flush();
        }, delay);
      }
    } finally {
      inFlightRef.current = false;
      const again = flushAgainRef.current;
      flushAgainRef.current = false;
      if (ok && (again || Object.keys(outboxRef.current).length > 0)) void flush();
    }
  }, [persistOutbox, publish]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flush();
    }, FLUSH_DEBOUNCE_MS);
  }, [flush]);

  /** Zapis „na pożegnanie” — przy zamykaniu/ukrywaniu karty (keepalive przeżywa unload). */
  const flushOnExit = useCallback(() => {
    const cid = clientIdRef.current;
    const ob = outboxRef.current;
    if (cid == null || Object.keys(ob).length === 0 || isSessionExpired()) return;
    try {
      void fetch(`${basePath}/api/work-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify({ ...buildPayload(ob), clientId: cid }),
      }).catch(() => {});
    } catch {
      /* outbox i tak zostaje w localStorage i zostanie wysłany przy następnym wejściu */
    }
  }, []);

  // ── Odczyt ───────────────────────────────────────────────────────────────────
  const loadData = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const cid = clientIdRef.current;
      if (cid == null) return;
      const mk = monthKeyRef.current;
      const seq = ++loadSeqRef.current;
      const key = `${cid}:${mk}`;
      if (!opts.silent || loadedKeyRef.current !== key) setLoading(true);

      try {
        const data = await apiJson<Record<string, Record<string, any>>>(
          `/api/work-time?month=${mk}&clientId=${cid}`,
        );
        if (seq !== loadSeqRef.current) return; // nowsze żądanie wygrało
        const monthData = (data && data[mk]) || {};
        const [y, m] = mk.split('-').map(Number);
        const days = eachDayOfInterval({
          start: new Date(y, m - 1, 1),
          end: endOfMonth(new Date(y, m - 1, 1)),
        });
        const fresh: Record<string, DayData> = {};
        for (const day of days) {
          const dateKey = format(day, 'yyyy-MM-dd');
          const raw = monthData[dateKey];
          const tasks: Task[] = Array.isArray(raw?.tasks) ? raw.tasks.map(normalizeTask) : [];
          fresh[dateKey] = makeDay(dateKey, tasks);
        }
        commitDays(overlayOutbox(fresh, outboxRef.current, makeDay));
        loadedKeyRef.current = key;
        lastLoadedAtRef.current = Date.now();
        setLoadError(null);
      } catch (error: any) {
        if (seq !== loadSeqRef.current) return;
        if (loadedKeyRef.current !== key) {
          setLoadError(
            error instanceof SessionExpiredError
              ? 'Sesja wygasła. Zaloguj się ponownie, aby wczytać dane.'
              : error?.message || 'Nie udało się wczytać danych.',
          );
        }
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [commitDays],
  );

  // Zmiana klienta: wczytaj jego outbox i wyślij zaległe zmiany
  useEffect(() => {
    if (clientId === null) {
      outboxRef.current = {};
      commitDays({});
      setLoading(false);
      return;
    }
    outboxRef.current = loadOutbox(clientId);
    retryAttemptRef.current = 0;
    publish({ state: Object.keys(outboxRef.current).length ? 'pending' : 'idle', error: null });
    void flush();
  }, [clientId, commitDays, flush, publish]);

  useEffect(() => {
    if (clientId === null) return;
    void loadData();
  }, [clientId, monthKey, loadData]);

  // Zdarzenia przeglądarki: zamknięcie karty, powrót do karty, sieć, sesja
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushOnExit();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Object.keys(outboxRef.current).length > 0) void flush();
      else if (Date.now() - lastLoadedAtRef.current > STALE_AFTER_MS && !inFlightRef.current) {
        void loadData({ silent: true });
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(outboxRef.current).length === 0 && !inFlightRef.current) return;
      flushOnExit();
      e.preventDefault();
      e.returnValue = '';
    };
    const onOnline = () => {
      retryAttemptRef.current = 0;
      void flush();
    };
    const onOffline = () => {
      if (Object.keys(outboxRef.current).length > 0) publish({ state: 'offline' });
    };
    const onRestored = () => {
      retryAttemptRef.current = 0;
      void flush();
      if (loadedKeyRef.current !== `${clientIdRef.current}:${monthKeyRef.current}`) void loadData();
    };
    const onExpired = () => {
      if (Object.keys(outboxRef.current).length > 0) publish({ state: 'auth' });
    };
    // Inna karta zapisała outbox tego klienta — zsynchronizuj (np. ta sama strona w 2 kartach)
    const onStorage = (e: StorageEvent) => {
      const cid = clientIdRef.current;
      if (cid != null && e.key === `wtt:outbox:v1:${cid}`) outboxRef.current = loadOutbox(cid);
      if (isRateKey(e.key)) setHourlyRate(getHourlyRate());
    };
    const onRate = () => setHourlyRate(getHourlyRate());

    document.addEventListener('visibilitychange', onHide);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', flushOnExit);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(SESSION_RESTORED_EVENT, onRestored);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener('storage', onStorage);
    window.addEventListener('hourlyRateUpdated', onRate);
    saveStatusStore.setRetryHandler(() => {
      retryAttemptRef.current = 0;
      void flush();
    });
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', flushOnExit);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(SESSION_RESTORED_EVENT, onRestored);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('hourlyRateUpdated', onRate);
      saveStatusStore.setRetryHandler(null);
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
        flushOnExit();
      }
    };
  }, [flush, flushOnExit, loadData, publish]);

  // Osoby zlecające — jedno żądanie na kalendarz (wcześniej: osobno w każdym dniu)
  useEffect(() => {
    const load = () =>
      apiJson<Assigner[]>('/api/assigners')
        .then((data) => setAssigners(Array.isArray(data) ? data : []))
        .catch(() => {});
    void load();
    window.addEventListener('assignerUpdated', load);
    return () => window.removeEventListener('assignerUpdated', load);
  }, []);

  // ── Mutacje ──────────────────────────────────────────────────────────────────
  const updateDayData = useCallback(
    (date: string, updater: TasksUpdater) => {
      const dateKey = toDateKey(date);
      const prevDay = daysDataRef.current[dateKey] ?? makeDay(dateKey, []);
      const nextTasks = typeof updater === 'function' ? updater(prevDay.tasks) : updater;
      commitDays({ ...daysDataRef.current, [dateKey]: makeDay(dateKey, nextTasks) });
      // Najpierw trwała kopia lokalna, potem sieć
      outboxRef.current = recordChange(outboxRef.current, dateKey, prevDay.tasks, nextTasks);
      persistOutbox();
      publish({ state: 'pending', error: null });
      scheduleFlush();
    },
    [commitDays, persistOutbox, publish, scheduleFlush],
  );

  const moveTask = useCallback(
    (sourceDate: string, targetDate: string, taskId: string) => {
      const src = toDateKey(sourceDate);
      const dst = toDateKey(targetDate);
      if (src === dst) return false;
      const task = daysDataRef.current[src]?.tasks.find((t) => t.id === taskId);
      if (!task) return false;
      updateDayData(src, (tasks) => tasks.filter((t) => t.id !== taskId));
      updateDayData(dst, (tasks) => [...tasks.filter((t) => t.id !== taskId), task]);
      return true;
    },
    [updateDayData],
  );

  const changeMonth = useCallback((direction: number) => {
    setCurrentMonth((cur) => {
      const next = new Date(cur.getFullYear(), cur.getMonth() + direction, 1);
      storage.set('wttCalendarMonth', format(next, 'yyyy-MM'));
      return next;
    });
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    storage.set('wttCalendarMonth', format(now, 'yyyy-MM'));
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  // Skok do miesiąca (np. z wyników wyszukiwania)
  useEffect(() => {
    const onGoto = (e: Event) => {
      const month = (e as CustomEvent<string>).detail;
      const [y, m] = (month || '').split('-').map(Number);
      if (y && m) setCurrentMonth(new Date(y, m - 1, 1));
    };
    window.addEventListener('wtt:goto-month', onGoto);
    return () => window.removeEventListener('wtt:goto-month', onGoto);
  }, []);

  const goToMonth = useCallback((date: Date) => {
    storage.set('wttCalendarMonth', format(date, 'yyyy-MM'));
    setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }, []);

  // ← / → zmieniają miesiąc (poza polami formularzy)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (
        !t?.closest ||
        t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
      )
        return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        changeMonth(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        changeMonth(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeMonth]);

  // ── Pochodne ─────────────────────────────────────────────────────────────────
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }),
    [currentMonth],
  );
  const monthTotal = useMemo(
    () => sumHours(Object.values(daysData).map((d) => d.totalHours)),
    [daysData],
  );
  const totalAmount = useMemo(() => {
    const rate = parseFloat(hourlyRate);
    if (!rate || rate <= 0) return '';
    const [h, m] = monthTotal.split(':').map(Number);
    return ((h + m / 60) * rate).toFixed(2);
  }, [monthTotal, hourlyRate]);
  const monthDisplayName = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  return {
    daysData,
    days,
    loading,
    loadError,
    currentMonth,
    monthDisplayName,
    monthTotal,
    totalAmount,
    hourlyRate,
    assigners,
    failedAvatars,
    setFailedAvatars,
    reload: loadData,
    updateDayData,
    moveTask,
    changeMonth,
    goToToday,
    goToMonth,
  };
}
