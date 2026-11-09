import type { Task, TaskStatus } from '@/components/tasks/types';

/** Suma godzin dnia z łączeniem nakładających się przedziałów (HH:MM). */
export function calculateTotalHours(tasks: Task[]): string {
  const intervals: Array<{ start: number; end: number }> = [];
  for (const task of tasks) {
    if (!task.startTime || !task.endTime) continue;
    const start = toMinutes(task.startTime);
    const end = toMinutes(task.endTime);
    if (end > start) intervals.push({ start, end });
  }
  if (intervals.length === 0) return '00:00';

  intervals.sort((a, b) => a.start - b.start);
  let total = 0;
  let cur = { ...intervals[0] };
  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    if (next.start <= cur.end) cur.end = Math.max(cur.end, next.end);
    else {
      total += cur.end - cur.start;
      cur = { ...next };
    }
  }
  total += cur.end - cur.start;
  return formatMinutes(total);
}

export function toMinutes(time: string): number {
  const [h, m] = (time || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function sumHours(values: string[]): string {
  return formatMinutes(values.reduce((acc, v) => acc + toMinutes(v), 0));
}

export function addOneHour(time: string): string {
  const next = toMinutes(time || '08:00') + 60;
  return formatMinutes(next % (24 * 60));
}

export function sortTasksChronologically(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const d = toMinutes(a.startTime || '08:00') - toMinutes(b.startTime || '08:00');
    return d !== 0 ? d : toMinutes(a.endTime || '16:00') - toMinutes(b.endTime || '16:00');
  });
}

/** Normalizacja zadania z API (stare formaty: string, completed, assignedBy jako string). */
export function normalizeTask(task: any): Task {
  if (typeof task === 'string') {
    return {
      id: '',
      text: task,
      assignedBy: [],
      startTime: '08:00',
      endTime: '16:00',
      status: 'do zrobienia',
      attachments: [],
    };
  }
  let assignedBy: string[] = [];
  if (Array.isArray(task?.assignedBy)) assignedBy = task.assignedBy.filter(Boolean);
  else if (typeof task?.assignedBy === 'string' && task.assignedBy.trim())
    assignedBy = [task.assignedBy];
  return {
    id: task?.id != null ? String(task.id) : '',
    text: task?.text || '',
    assignedBy,
    startTime: task?.startTime || '08:00',
    endTime: task?.endTime || '16:00',
    status: (task?.status || (task?.completed ? 'wykonano' : 'do zrobienia')) as TaskStatus,
    attachments: Array.isArray(task?.attachments) ? task.attachments : [],
  };
}

export const DAY_NAMES = [
  'niedziela',
  'poniedziałek',
  'wtorek',
  'środa',
  'czwartek',
  'piątek',
  'sobota',
];
export const DAY_NAMES_SHORT = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
export const MONTH_NAMES = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];
