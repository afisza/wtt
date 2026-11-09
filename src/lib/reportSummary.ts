import type { Task, TaskStatus } from '@/components/tasks/types';
import {
  calculateTotalHours,
  formatMinutes,
  sortTasksChronologically,
  toMinutes,
} from '@/lib/tasks';

/** Dzień raportu: tylko dni z wpisami, zadania chronologicznie. */
export interface ReportDay {
  dateKey: string;
  date: Date;
  tasks: Task[];
  /** Suma dnia z łączeniem nakładających się przedziałów — ta sama co w aplikacji. */
  total: string;
}

export interface ReportSummary {
  days: ReportDay[];
  totalMinutes: number;
  taskCount: number;
  byStatus: Record<TaskStatus, number>;
  /** Godziny wg osoby zlecającej, malejąco. Zadanie zlecone przez 2 osoby liczy się każdej. */
  byAssigner: { name: string; minutes: number; tasks: number }[];
}

export const STATUS_ORDER: TaskStatus[] = [
  'wykonano',
  'w trakcie',
  'do zrobienia',
  'zaplanowano',
  'anulowane',
];

/** Czas trwania pojedynczego zadania w minutach (0 dla niepoprawnego przedziału). */
export function taskMinutes(task: Task): number {
  if (!task.startTime || !task.endTime) return 0;
  return Math.max(0, toMinutes(task.endTime) - toMinutes(task.startTime));
}

export function buildReportSummary(
  days: Date[],
  daysData: Record<string, { tasks: Task[] } | undefined>,
  toKey: (d: Date) => string,
): ReportSummary {
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<
    TaskStatus,
    number
  >;
  const assigners = new Map<string, { minutes: number; tasks: number }>();
  const reportDays: ReportDay[] = [];
  let totalMinutes = 0;
  let taskCount = 0;

  for (const date of [...days].sort((a, b) => a.getTime() - b.getTime())) {
    const dateKey = toKey(date);
    const tasks = (daysData[dateKey]?.tasks ?? []).filter((t) => t.text?.trim());
    if (tasks.length === 0) continue;

    const total = calculateTotalHours(tasks);
    totalMinutes += toMinutes(total);
    taskCount += tasks.length;
    reportDays.push({ dateKey, date, tasks: sortTasksChronologically(tasks), total });

    for (const t of tasks) {
      if (t.status in byStatus) byStatus[t.status] += 1;
      const minutes = taskMinutes(t);
      for (const name of new Set(Array.isArray(t.assignedBy) ? t.assignedBy : [])) {
        if (!name) continue;
        const a = assigners.get(name) ?? { minutes: 0, tasks: 0 };
        a.minutes += minutes;
        a.tasks += 1;
        assigners.set(name, a);
      }
    }
  }

  return {
    days: reportDays,
    totalMinutes,
    taskCount,
    byStatus,
    byAssigner: [...assigners.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, 'pl')),
  };
}

/** „6:30 h” — czytelniej niż „06:30” w dokumencie dla klienta. */
export function formatHours(minutes: number): string {
  const [h, m] = formatMinutes(minutes).split(':');
  return `${Number(h)}:${m} h`;
}

export function formatMoney(value: number): string {
  return `${value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}
