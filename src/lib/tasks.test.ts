import { describe, expect, it } from 'vitest';
import type { Task } from '@/components/tasks/types';
import { calculateTotalHours } from './tasks';

const t = (startTime: string, endTime: string): Task => ({
  id: '1',
  text: '',
  assignedBy: [],
  startTime,
  endTime,
  status: 'wykonano',
});

describe('calculateTotalHours', () => {
  it('sums separate intervals', () => {
    expect(calculateTotalHours([t('08:00', '10:00'), t('11:00', '12:30')])).toBe('03:30');
  });
  it('merges overlapping intervals instead of double counting', () => {
    expect(calculateTotalHours([t('08:00', '10:00'), t('09:00', '11:00')])).toBe('03:00');
  });
  it('ignores empty and inverted ranges', () => {
    expect(calculateTotalHours([t('', ''), t('12:00', '11:00')])).toBe('00:00');
  });
});
