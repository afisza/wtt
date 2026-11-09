import type { Task } from '@/components/tasks/types';
import { storage } from '@/lib/storage';

/**
 * Outbox — trwała kolejka niezapisanych zmian dni.
 *
 * Każda zmiana dnia trafia NAJPIERW do localStorage, dopiero potem idzie do API.
 * Wpis znika z outboxa wyłącznie po potwierdzeniu zapisu przez serwer (i tylko jeśli
 * w międzyczasie dzień nie został znowu zmieniony — pilnuje tego `rev`).
 * Dzięki temu przeładowanie strony, wygaśnięcie sesji czy brak sieci nie gubią wpisów:
 * po ponownym wczytaniu outbox jest nakładany na dane z serwera i wysyłany ponownie.
 */

export interface PendingDay {
  tasks: Task[];
  /** Zadania usunięte przez użytkownika — serwer kasuje tylko te. */
  deletedIds: string[];
  rev: number;
  updatedAt: number;
}

export type Outbox = Record<string, PendingDay>;

export interface DayPayload {
  date: string;
  tasks: Task[];
  deletedIds: string[];
}

const PREFIX = 'wtt:outbox:v1:';

export const outboxKey = (clientId: number) => `${PREFIX}${clientId}`;

export function loadOutbox(clientId: number): Outbox {
  const data = storage.getJSON<Outbox>(outboxKey(clientId));
  if (!data || typeof data !== 'object') return {};
  const out: Outbox = {};
  for (const [dateKey, day] of Object.entries(data)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && day && Array.isArray(day.tasks)) {
      out[dateKey] = {
        tasks: day.tasks,
        deletedIds: Array.isArray(day.deletedIds) ? day.deletedIds : [],
        rev: Number(day.rev) || 1,
        updatedAt: Number(day.updatedAt) || Date.now(),
      };
    }
  }
  return out;
}

export function saveOutbox(clientId: number, outbox: Outbox): boolean {
  if (Object.keys(outbox).length === 0) {
    storage.remove(outboxKey(clientId));
    return true;
  }
  return storage.setJSON(outboxKey(clientId), outbox);
}

/** Rejestruje zmianę dnia; wylicza usunięte zadania z różnicy poprzedni → nowy stan. */
export function recordChange(
  outbox: Outbox,
  dateKey: string,
  prevTasks: Task[],
  nextTasks: Task[],
): Outbox {
  const nextIds = new Set(nextTasks.map((t) => t.id).filter(Boolean));
  const removed = prevTasks.map((t) => t.id).filter((id) => id && !nextIds.has(id));
  const existing = outbox[dateKey];
  const deleted = new Set([...(existing?.deletedIds ?? []), ...removed]);
  // Przywrócone (np. „Cofnij”) zadanie nie może zostać usunięte
  for (const id of nextIds) deleted.delete(id);
  return {
    ...outbox,
    [dateKey]: {
      tasks: nextTasks,
      deletedIds: [...deleted],
      rev: (existing?.rev ?? 0) + 1,
      updatedAt: Date.now(),
    },
  };
}

/** Usuwa potwierdzone dni — tylko jeśli od wysłania nie było nowszej zmiany. */
export function ackDays(outbox: Outbox, sentRevs: Record<string, number>): Outbox {
  const next = { ...outbox };
  for (const [dateKey, rev] of Object.entries(sentRevs)) {
    if (next[dateKey] && next[dateKey].rev === rev) delete next[dateKey];
  }
  return next;
}

/** Grupuje dni z outboxa w payload API: { 'yyyy-MM': { 'yyyy-MM-dd': DayPayload } }. */
export function buildPayload(outbox: Outbox): Record<string, Record<string, DayPayload>> {
  const payload: Record<string, Record<string, DayPayload>> = {};
  for (const [dateKey, day] of Object.entries(outbox)) {
    const monthKey = dateKey.slice(0, 7);
    payload[monthKey] ??= {};
    payload[monthKey][dateKey] = { date: dateKey, tasks: day.tasks, deletedIds: day.deletedIds };
  }
  return payload;
}

/** Nakłada niezapisane zmiany na dane z serwera (lokalne wygrywają). */
export function overlayOutbox<T extends { tasks: Task[] }>(
  days: Record<string, T>,
  outbox: Outbox,
  make: (dateKey: string, tasks: Task[]) => T,
): Record<string, T> {
  const result = { ...days };
  for (const [dateKey, pending] of Object.entries(outbox)) {
    if (dateKey in result) result[dateKey] = make(dateKey, pending.tasks);
  }
  return result;
}
