import { useEffect, useState } from 'react';
import { storage } from '@/lib/storage';

/** Czy stawka (i wyliczona kwota) jest netto czy brutto — pokazywane w aplikacji i w raporcie PDF. */
export type RateBasis = 'netto' | 'brutto';

const RATE_KEY = 'hourlyRate';
const BASIS_KEY = 'hourlyRateBasis';
const VAT_KEY = 'hourlyRateVat';
export const RATE_UPDATED_EVENT = 'hourlyRateUpdated';

/** Domyślnie: 80 zł brutto za godzinę — dopóki użytkownik nie ustawi własnej stawki. */
export const DEFAULT_HOURLY_RATE = '80';
export const DEFAULT_RATE_BASIS: RateBasis = 'brutto';
/** Stawka VAT w procentach — do przeliczania netto ↔ brutto. */
export const DEFAULT_VAT_RATE = 23;

/**
 * Stawka godzinowa. Brak wpisu = stawka domyślna; pusty wpis (`''`) = użytkownik świadomie
 * wyłączył kwoty („Zostaw puste, aby ukryć kwoty”).
 */
export function getHourlyRate(): string {
  const v = storage.get(RATE_KEY);
  return v === null ? DEFAULT_HOURLY_RATE : v;
}

export function setHourlyRate(value: string): void {
  storage.set(RATE_KEY, value);
}

export const isRateKey = (key: string | null) =>
  key === RATE_KEY || key === BASIS_KEY || key === VAT_KEY;

export function getRateBasis(): RateBasis {
  const v = storage.get(BASIS_KEY);
  return v === 'netto' || v === 'brutto' ? v : DEFAULT_RATE_BASIS;
}

export function setRateBasis(basis: RateBasis): void {
  storage.set(BASIS_KEY, basis);
}

/** Stawka VAT w % (0–100). Brak / niepoprawny wpis = 23. */
export function getVatRate(): number {
  const raw = storage.get(VAT_KEY);
  if (raw === null || raw.trim() === '') return DEFAULT_VAT_RATE;
  const v = Number(raw.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_VAT_RATE;
}

export function setVatRate(value: number): void {
  storage.set(VAT_KEY, String(value));
}

export interface AmountBreakdown {
  net: number;
  vat: number;
  gross: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Rozbija kwotę wpisaną jako netto albo brutto na netto + VAT = brutto (grosze zaokrąglone,
 * suma zawsze się zgadza). Kwota w podstawie wpisanej przez użytkownika zostaje bez zmian.
 */
export function splitAmount(amount: number, basis: RateBasis, vatRate: number): AmountBreakdown {
  const factor = 1 + vatRate / 100;
  if (basis === 'brutto') {
    const gross = round2(amount);
    const net = round2(gross / factor);
    return { net, vat: round2(gross - net), gross };
  }
  const net = round2(amount);
  const vat = round2(net * (vatRate / 100));
  return { net, vat, gross: round2(net + vat) };
}

/** Opis do dokumentu: „netto (bez VAT)” / „brutto (z VAT)”. */
export const basisDescription = (b: RateBasis) =>
  b === 'brutto' ? 'brutto (z VAT)' : 'netto (bez VAT)';

export interface RateSettings {
  basis: RateBasis;
  vatRate: number;
}

const readSettings = (): RateSettings => ({ basis: getRateBasis(), vatRate: getVatRate() });

/** Podstawa kwoty i VAT; odświeża się po zapisie w ustawieniach i zmianie w innej karcie. */
export function useRateSettings(): RateSettings {
  const [settings, setSettings] = useState<RateSettings>(readSettings);
  useEffect(() => {
    const sync = () => setSettings(readSettings());
    const onStorage = (e: StorageEvent) => {
      if (isRateKey(e.key)) sync();
    };
    window.addEventListener(RATE_UPDATED_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RATE_UPDATED_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return settings;
}
