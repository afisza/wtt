import { useEffect, useState } from 'react';
import { storage } from '@/lib/storage';

/** Czy stawka (i wyliczona kwota) jest netto czy brutto — pokazywane w aplikacji i w raporcie PDF. */
export type RateBasis = 'netto' | 'brutto';

const RATE_KEY = 'hourlyRate';
const BASIS_KEY = 'hourlyRateBasis';
export const RATE_UPDATED_EVENT = 'hourlyRateUpdated';

/** Domyślnie: 80 zł brutto za godzinę — dopóki użytkownik nie ustawi własnej stawki. */
export const DEFAULT_HOURLY_RATE = '80';
export const DEFAULT_RATE_BASIS: RateBasis = 'brutto';

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

export const isRateKey = (key: string | null) => key === RATE_KEY || key === BASIS_KEY;

export function getRateBasis(): RateBasis {
  const v = storage.get(BASIS_KEY);
  return v === 'netto' || v === 'brutto' ? v : DEFAULT_RATE_BASIS;
}

export function setRateBasis(basis: RateBasis): void {
  storage.set(BASIS_KEY, basis);
}

/** Opis do dokumentu: „netto (bez VAT)” / „brutto (z VAT)”. */
export const basisDescription = (b: RateBasis) =>
  b === 'brutto' ? 'brutto (z VAT)' : 'netto (bez VAT)';

/** Aktualna podstawa kwoty; odświeża się po zapisie w ustawieniach i zmianie w innej karcie. */
export function useRateBasis(): RateBasis {
  const [basis, setBasis] = useState<RateBasis>(getRateBasis);
  useEffect(() => {
    const sync = () => setBasis(getRateBasis());
    const onStorage = (e: StorageEvent) => {
      if (e.key === BASIS_KEY) sync();
    };
    window.addEventListener(RATE_UPDATED_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RATE_UPDATED_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return basis;
}
