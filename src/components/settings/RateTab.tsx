import { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import {
  DEFAULT_HOURLY_RATE,
  DEFAULT_RATE_BASIS,
  getHourlyRate,
  getRateBasis,
  RATE_UPDATED_EVENT,
  setHourlyRate as saveHourlyRate,
  setRateBasis,
  type RateBasis,
} from '@/lib/rate';
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const value = hourlyRate.trim().replace(',', '.');
    if (value && (isNaN(Number(value)) || Number(value) < 0)) {
      showToast('Podaj poprawną kwotę, np. 120 lub 85,50', 'error');
      return;
    }
    saveHourlyRate(value);
    setRateBasis(basis);
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
          <legend className="mb-1.5 text-sm font-medium">Kwota jest</legend>
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
          <p className="text-xs text-muted-foreground">
            Informacja trafia do podsumowania miesiąca i do raportu PDF.
          </p>
        </fieldset>

        <Button type="submit" className="self-start">
          Zapisz stawkę
        </Button>
      </form>
    </SettingsSection>
  );
}
