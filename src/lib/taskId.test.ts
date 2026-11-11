import { describe, expect, it } from 'vitest';
import { formatTaskRef, parseTaskRef } from './taskId';

describe('task ref', () => {
  it('formats with prefix', () => {
    expect(formatTaskRef('323525')).toBe('WTT-323525');
  });

  it('parses prefixed and bare numbers', () => {
    expect(parseTaskRef('wtt-323525')).toBe('323525');
    expect(parseTaskRef('WTT 323525')).toBe('323525');
    expect(parseTaskRef('#323525')).toBe('323525');
    expect(parseTaskRef(' 323525 ')).toBe('323525');
  });

  it('rejects other text', () => {
    expect(parseTaskRef('12345')).toBeNull();
    expect(parseTaskRef('wtt-abc')).toBeNull();
    expect(parseTaskRef('spotkanie 323525')).toBeNull();
  });
});
