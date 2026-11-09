import { useMemo, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import {
  DEFAULT_HOURLY_RATE,
  DEFAULT_RATE_BASIS,
  DEFAULT_VAT_RATE,
  getHourlyRate,
  getRateBasis,
  getVatRate,
  RATE_UPDATED_EVENT,
  setHourlyRate as saveHourlyRate,
  setRateBasis,
  setVatRate,
  splitAmount,
  type RateBasis,
} from '@/lib/rate';
import { formatMoney } from '@/lib/reportSummary';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SettingsSection, { Field } from './SettingsSection';

const BASIS_OPTIONS: { value: RateBasis; label: string; hint: string }[] = [
  { value: 'netto', label: 'Netto', hint: 'bez VAT' },
  { value: 'brutto', label: 'Brutto', hint: 'z VAT' },
];

export default function RateTab() {
  const { showToast } = useToast();
  const [hourlyRate, setHourlyRate] = useState<string>(getHourlyRate);
  const [basis, setBasis] = useState<RateBasis>(getRateBasis);
  const [vat, setVat] = useState<string>(() => String(getVatRate()).replace('.', ','));

  const vatNumber = Number(vat.trim().replace(',', '.'));
  const vatValid = vat.trim() !== '' && Number.isFinite(vatNumber) && vatNumber >= 0 && vatNumber <= 100;

  /** Podgląd: ta sama stawka w netto i brutto. */
  const preview = useMemo(() => {
    const rate = Number(hourlyRate.trim().replace(',', '.'));
    if (!hourlyRate.trim() || !Number.isFinite(rate) || rate <= 0 || !vatValid) return null;
    return splitAmount(rate, basis, vatNumber);
  }, [hourlyRate, basis, vatNumber, vatValid]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const value = hourlyRate.trim().replace(',', '.');
    if (value && (isNaN(Number(value)) || Number(value) < 0)) {
      showToast('Podaj poprawną kwotę, np. 120 lub 85,50', 'error');
      return;
    }
    if (!vatValid) {
      showToast('Stawka VAT musi być liczbą od 0 do 100', 'error');
      return;
    }
    saveHourlyRate(value);
    setRateBasis(basis);
    setVatRate(vatNumber);
    window.dispatchEvent(new Event(RATE_UPDATED_EVENT));
    showToast(value ? `Stawka zapisana (${basis})` : 'Stawka usunięta', value ? 'success' : 'info');
  };

  return (
    <SettingsSection
      title="Stawka godzinowa"
      description="Służy do wyliczania kwoty w podsumowaniu miesiąca i w raporcie PDF. Zapisywana tylko w tej przeglądarce."
    >
      <form onSubmit={handleSave} className="flex max-w-sm flex-col gap-5">
        <Field
          label="Stawka za godzinę"
          htmlFor="hourly-rate"
          hint={`Domyślnie ${DEFAULT_HOURLY_RATE} zł ${DEFAULT_RATE_BASIS}. Zostaw puste, aby ukryć kwoty.`}
        >
          <div className="relative">
            <Input
              id="hourly-rate"
              inputMode="decimal"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="np. 120"
              className="tabular pr-10"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              zł
            </span>
          </div>
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Wpisana stawka jest</legend>
          <div
            role="radiogroup"
            className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1"
          >
            {BASIS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={basis === o.value}
                onClick={() => setBasis(o.value)}
                className={cn(
                  'flex flex-col items-center rounded-md px-3 py-2 text-sm transition-colors',
                  basis === o.value
                    ? 'bg-card font-semibold text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
                <span className="text-[11px] font-normal text-muted-foreground">{o.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          label="Stawka VAT"
          htmlFor="vat-rate"
          hint={`Do przeliczenia netto ↔ brutto. Domyślnie ${DEFAULT_VAT_RATE}%, 0 = bez VAT.`}
        >
          <div className="relative w-28">
            <Input
              id="vat-rate"
              inputMode="decimal"
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              aria-invalid={!vatValid}
              className="tabular pr-8"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
        </Field>

        {preview && (
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
            {[
              { label: 'Netto / h', value: preview.net },
              { label: `VAT ${String(vatNumber).replace('.', ',')}%`, value: preview.vat },
              { label: 'Brutto / h', value: preview.gross },
            ].map((x) => (
              <div key={x.label} className="bg-card px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{x.label}</dt>
                <dd className="tabular font-semibold">{formatMoney(x.value)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="-mt-2 text-xs text-muted-foreground">
          Podsumowanie miesiąca i raport PDF pokazują kwotę netto, VAT i brutto.
        </p>

        <Button type="submit" className="self-start">
          Zapisz stawkę
        </Button>
      </form>
    </SettingsSection>
  );
}
