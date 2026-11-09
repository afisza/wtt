import { describe, expect, it } from 'vitest';
import type { Task } from '@/components/tasks/types';
import { buildReportSummary, formatHours, formatMoney, taskMinutes } from './reportSummary';

const task = (p: Partial<Task>): Task => ({
  id: '100000',
  text: 'Zadanie',
  assignedBy: [],
  startTime: '08:00',
  endTime: '09:00',
  status: 'wykonano',
  ...p,
});

const key = (d: Date) => d.toISOString().slice(0, 10);
const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe('buildReportSummary', () => {
  it('pomija puste dni, sortuje dni i zadania', () => {
    const s = buildReportSummary(
      [d('2026-11-03'), d('2026-11-01'), d('2026-11-02')],
      {
        '2026-11-03': { tasks: [task({ startTime: '12:00', endTime: '13:00' }), task({})] },
        '2026-11-01': { tasks: [task({})] },
        '2026-11-02': { tasks: [] },
      },
      key,
    );
    expect(s.days.map((x) => x.dateKey)).toEqual(['2026-11-01', '2026-11-03']);
    expect(s.days[1].tasks[0].startTime).toBe('08:00');
    expect(s.taskCount).toBe(3);
  });

  it('suma miesiąca łączy nakładające się zadania tak jak aplikacja', () => {
    const s = buildReportSummary(
      [d('2026-11-01')],
      {
        '2026-11-01': {
          tasks: [
            task({ startTime: '08:00', endTime: '10:00' }),
            task({ startTime: '09:00', endTime: '11:00' }),
          ],
        },
      },
      key,
    );
    expect(s.totalMinutes).toBe(180);
    expect(s.days[0].total).toBe('03:00');
  });

  it('liczy statusy i godziny osób zlecających', () => {
    const s = buildReportSummary(
      [d('2026-11-01')],
      {
        '2026-11-01': {
          tasks: [
            task({ assignedBy: ['Anna', 'Marek'], startTime: '08:00', endTime: '10:00' }),
            task({
              assignedBy: ['Anna'],
              status: 'anulowane',
              startTime: '10:00',
              endTime: '10:30',
            }),
            task({ text: '   ' }),
          ],
        },
      },
      key,
    );
    expect(s.byStatus.wykonano).toBe(1);
    expect(s.byStatus.anulowane).toBe(1);
    expect(s.byAssigner).toEqual([
      { name: 'Anna', minutes: 150, tasks: 2 },
      { name: 'Marek', minutes: 120, tasks: 1 },
    ]);
  });
});

describe('formatowanie', () => {
  it('formatHours / formatMoney / taskMinutes', () => {
    expect(formatHours(390)).toBe('6:30 h');
    expect(formatMoney(12345.5).replace(/\s/g, ' ')).toBe('12 345,50 zł');
    expect(taskMinutes(task({ startTime: '10:00', endTime: '09:00' }))).toBe(0);
  });
});
