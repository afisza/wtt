import { beforeEach, describe, expect, it } from 'vitest';
import type { Task } from '@/components/tasks/types';
import {
  ackDays,
  buildPayload,
  loadOutbox,
  outboxKey,
  overlayOutbox,
  recordChange,
  saveOutbox,
  type Outbox,
} from './outbox';

const task = (id: string, text = `zadanie ${id}`): Task => ({
  id,
  text,
  assignedBy: [],
  startTime: '08:00',
  endTime: '09:00',
  status: 'do zrobienia',
});

describe('outbox', () => {
  beforeEach(() => localStorage.clear());

  it('records deletions as the diff between previous and next tasks', () => {
    const ob = recordChange({}, '2026-11-09', [task('111111'), task('222222')], [task('111111')]);
    expect(ob['2026-11-09'].deletedIds).toEqual(['222222']);
    expect(ob['2026-11-09'].tasks.map((t) => t.id)).toEqual(['111111']);
    expect(ob['2026-11-09'].rev).toBe(1);
  });

  it('accumulates deletions across edits and bumps rev', () => {
    let ob = recordChange(
      {},
      '2026-11-09',
      [task('1'), task('2'), task('3')],
      [task('1'), task('2')],
    );
    ob = recordChange(ob, '2026-11-09', [task('1'), task('2')], [task('1')]);
    expect(ob['2026-11-09'].deletedIds.sort()).toEqual(['2', '3']);
    expect(ob['2026-11-09'].rev).toBe(2);
  });

  it('never deletes a task that was restored (undo)', () => {
    let ob = recordChange({}, '2026-11-09', [task('1'), task('2')], [task('1')]);
    ob = recordChange(ob, '2026-11-09', [task('1')], [task('1'), task('2')]);
    expect(ob['2026-11-09'].deletedIds).toEqual([]);
  });

  it('acks a day only when its rev did not change while the request was in flight', () => {
    let ob = recordChange({}, '2026-11-09', [], [task('1')]);
    ob = recordChange(ob, '2026-11-10', [], [task('2')]);
    const sent = { '2026-11-09': 1, '2026-11-10': 1 };
    // użytkownik edytuje 10.11 w trakcie zapisu
    ob = recordChange(ob, '2026-11-10', [task('2')], [task('2', 'poprawione')]);
    const after = ackDays(ob, sent);
    expect(after['2026-11-09']).toBeUndefined();
    expect(after['2026-11-10']?.tasks[0].text).toBe('poprawione');
  });

  it('groups pending days by month in the API payload', () => {
    let ob: Outbox = {};
    ob = recordChange(ob, '2026-10-31', [], [task('1')]);
    ob = recordChange(ob, '2026-11-01', [task('9')], []);
    const payload = buildPayload(ob);
    expect(Object.keys(payload).sort()).toEqual(['2026-10', '2026-11']);
    expect(payload['2026-11']['2026-11-01']).toEqual({
      date: '2026-11-01',
      tasks: [],
      deletedIds: ['9'],
    });
  });

  it('overlays local changes on top of server data', () => {
    const server = {
      '2026-11-09': { tasks: [task('1', 'stare')] },
      '2026-11-10': { tasks: [task('2')] },
    };
    const ob = recordChange({}, '2026-11-09', [task('1', 'stare')], [task('1', 'nowe')]);
    const merged = overlayOutbox(server, ob, (_d, tasks) => ({ tasks }));
    expect(merged['2026-11-09'].tasks[0].text).toBe('nowe');
    expect(merged['2026-11-10']).toBe(server['2026-11-10']);
  });

  it('survives a reload: save → load round-trip, empty outbox removes the key', () => {
    const ob = recordChange({}, '2026-11-09', [], [task('1')]);
    saveOutbox(7, ob);
    expect(loadOutbox(7)['2026-11-09'].tasks[0].id).toBe('1');
    saveOutbox(7, {});
    expect(localStorage.getItem(outboxKey(7))).toBeNull();
  });

  it('ignores corrupted entries in storage', () => {
    localStorage.setItem(
      outboxKey(3),
      JSON.stringify({
        'not-a-date': { tasks: [] },
        '2026-11-09': { tasks: 'x' },
        '2026-11-10': { tasks: [] },
      }),
    );
    expect(Object.keys(loadOutbox(3))).toEqual(['2026-11-10']);
    localStorage.setItem(outboxKey(4), '{broken json');
    expect(loadOutbox(4)).toEqual({});
  });
});
