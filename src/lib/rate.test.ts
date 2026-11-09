import { beforeEach, describe, expect, it } from 'vitest';
import {
  getHourlyRate,
  getRateBasis,
  getVatRate,
  setHourlyRate,
  setRateBasis,
  setVatRate,
  splitAmount,
} from './rate';

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

describe('netto / VAT / brutto', () => {
  beforeEach(() => localStorage.clear());

  it('domyślny VAT 23%, niepoprawny wpis → 23', () => {
    expect(getVatRate()).toBe(23);
    localStorage.setItem('hourlyRateVat', 'abc');
    expect(getVatRate()).toBe(23);
    setVatRate(8);
    expect(getVatRate()).toBe(8);
    setVatRate(0);
    expect(getVatRate()).toBe(0);
  });

  it('z brutto: brutto bez zmian, netto + VAT = brutto', () => {
    expect(splitAmount(7320, 'brutto', 23)).toEqual({ net: 5951.22, vat: 1368.78, gross: 7320 });
    expect(splitAmount(80, 'brutto', 23)).toEqual({ net: 65.04, vat: 14.96, gross: 80 });
  });

  it('z netto: netto bez zmian, brutto = netto + VAT', () => {
    expect(splitAmount(100, 'netto', 23)).toEqual({ net: 100, vat: 23, gross: 123 });
    expect(splitAmount(100, 'netto', 0)).toEqual({ net: 100, vat: 0, gross: 100 });
  });
});
