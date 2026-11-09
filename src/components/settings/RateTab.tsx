import { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { storage } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SettingsSection, { Field } from './SettingsSection';

export default function RateTab() {
  const { showToast } = useToast();
  const [hourlyRate, setHourlyRate] = useState<string>(() => storage.get('hourlyRate') ?? '');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const value = hourlyRate.trim().replace(',', '.');
    if (value && (isNaN(Number(value)) || Number(value) < 0)) {
      showToast('Podaj poprawną kwotę, np. 120 lub 85,50', 'error');
      return;
    }
    if (value) storage.set('hourlyRate', value);
    else storage.remove('hourlyRate');
    window.dispatchEvent(new Event('hourlyRateUpdated'));
    showToast(value ? 'Stawka zapisana' : 'Stawka usunięta', value ? 'success' : 'info');
  };

  return (
    <SettingsSection
      title="Stawka godzinowa"
      description="Służy do wyliczania kwoty w podsumowaniu miesiąca i w raporcie PDF. Zapisywana tylko w tej przeglądarce."
    >
      <form onSubmit={handleSave} className="flex max-w-sm flex-col gap-4">
        <Field
          label="Stawka za godzinę"
          htmlFor="hourly-rate"
          hint="Zostaw puste, aby ukryć kwoty."
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
        <Button type="submit" className="self-start">
          Zapisz stawkę
        </Button>
      </form>
    </SettingsSection>
  );
}
