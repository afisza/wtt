import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Minimalny renderHook bez @testing-library/dom (brak w zależnościach)
function renderHook<R>(hook: () => R) {
  const result = { current: undefined as unknown as R };
  const Probe = () => {
    result.current = hook();
    return null;
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(Probe)));
  return { result, unmount: () => act(() => root.unmount()) };
}
import {
  clearDraft,
  countDrafts,
  draftKey,
  listDraftIds,
  readDraft,
  useDraft,
  writeDraft,
} from './drafts';

describe('drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('has no key without an active client', () => {
    expect(draftKey(null, '2026-11-09', 'new')).toBeNull();
  });

  it('writes, lists and clears drafts per client and day', () => {
    writeDraft(draftKey(1, '2026-11-09', 'new'), { text: 'a' });
    writeDraft(draftKey(1, '2026-11-09', 'inline:123456'), { text: 'b' });
    writeDraft(draftKey(2, '2026-11-09', 'new'), { text: 'c' });
    expect(listDraftIds(1, '2026-11-09').sort()).toEqual(['inline:123456', 'new']);
    expect(countDrafts(1)).toBe(2);
    clearDraft(draftKey(1, '2026-11-09', 'new'));
    expect(readDraft(draftKey(1, '2026-11-09', 'new'))).toBeNull();
    expect(countDrafts(2)).toBe(1);
  });

  it('expires drafts older than 45 days', () => {
    const key = draftKey(1, '2026-09-01', 'new')!;
    localStorage.setItem(key, JSON.stringify({ v: { text: 'stary' }, t: Date.now() - 46 * 864e5 }));
    expect(readDraft(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('useDraft persists typing and restores it after a remount (page reload)', () => {
    const key = draftKey(5, '2026-11-09', 'new');
    const initial = { text: '', startTime: '08:00' };
    const isEmpty = (v: typeof initial) => !v.text.trim();

    const first = renderHook(() => useDraft(key, initial, isEmpty));
    expect(first.result.current.restored).toBe(false);
    act(() => first.result.current.setValue({ ...initial, text: 'Niezapisany wpis' }));
    first.unmount();

    const second = renderHook(() => useDraft(key, initial, isEmpty));
    expect(second.result.current.restored).toBe(true);
    expect(second.result.current.value.text).toBe('Niezapisany wpis');

    act(() => second.result.current.clear());
    expect(readDraft(key)).toBeNull();
  });
});
