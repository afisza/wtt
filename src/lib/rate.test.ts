import { beforeEach, describe, expect, it } from 'vitest';
import { getHourlyRate, getRateBasis, setHourlyRate, setRateBasis } from './rate';

describe('stawka godzinowa', () => {
  beforeEach(() => localStorage.clear());

  it('domyślnie 80 zł brutto', () => {
    expect(getHourlyRate()).toBe('80');
    expect(getRateBasis()).toBe('brutto');
  });

  it('własna stawka i podstawa nadpisują domyślne', () => {
    setHourlyRate('120.5');
    setRateBasis('netto');
    expect(getHourlyRate()).toBe('120.5');
    expect(getRateBasis()).toBe('netto');
  });

  it('pusta stawka = świadomie wyłączone kwoty (nie wraca do domyślnej)', () => {
    setHourlyRate('');
    expect(getHourlyRate()).toBe('');
  });

  it('nieznana wartość podstawy → domyślna', () => {
    localStorage.setItem('hourlyRateBasis', 'xyz');
    expect(getRateBasis()).toBe('brutto');
  });
});
