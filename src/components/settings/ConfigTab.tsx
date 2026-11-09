import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Database, FileJson } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SettingsSection, { Field } from './SettingsSection';

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface TestResult {
  success: boolean;
  error?: string;
  details?: string;
}

type StorageMode = 'mysql' | 'json';

const MODES: { id: StorageMode; label: string; desc: string; icon: typeof Database }[] = [
  {
    id: 'mysql',
    label: 'MySQL',
    desc: 'Zalecane. Szybkie, bezpieczne zapisy z transakcjami.',
    icon: Database,
  },
  {
    id: 'json',
    label: 'Plik JSON',
    desc: 'Awaryjnie, gdy baza jest niedostępna (data/work-time.json).',
    icon: FileJson,
  },
];

export default function ConfigTab() {
  const { showToast } = useToast();

  const [config, setConfig] = useState<DatabaseConfig>({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
  });
  const [hasPassword, setHasPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>('mysql');

  const loadConfig = useCallback(async () => {
    try {
      const response = await apiFetch('/api/settings/db-config');
      if (!response.ok) return;
      const data = await response.json();
      if (data.config) {
        setConfig({
          host: data.config.host || '',
          port: data.config.port || 3306,
          user: data.config.user || '',
          password: '', // API nie zwraca hasła
          database: data.config.database || '',
        });
        setHasPassword(!!data.hasPassword);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    apiFetch('/api/settings/storage-mode')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.mode && setStorageMode(data.mode))
      .catch(() => {});
  }, [loadConfig]);

  const set = <K extends keyof DatabaseConfig>(key: K, value: DatabaseConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setTestResult(null);
  };

  const handleStorageModeChange = async (mode: StorageMode) => {
    if (mode === storageMode) return;
    try {
      const response = await apiFetch('/api/settings/storage-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error();
      setStorageMode(mode);
      showToast(`Dane zapisywane teraz w: ${mode === 'mysql' ? 'MySQL' : 'pliku JSON'}`, 'success');
    } catch {
      showToast('Nie udało się zmienić trybu zapisu', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await apiFetch('/api/settings/db-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Nieznany błąd');
      showToast('Konfiguracja zapisana', 'success');
      await loadConfig();
    } catch (error) {
      showToast(`Nie zapisano: ${(error as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await apiFetch('/api/settings/db-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setTestResult(await response.json());
    } catch {
      setTestResult({ success: false, error: 'Nie udało się wykonać testu połączenia' });
    } finally {
      setTesting(false);
    }
  };

  const canSubmit = !!config.host && !!config.database;

  return (
    <SettingsSection
      title="Połączenie MySQL"
      description="Gdzie aplikacja przechowuje zadania i czas pracy oraz dane dostępowe do bazy."
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium">Tryb zapisu</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => {
            const active = storageMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => handleStorageModeChange(m.id)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                  active
                    ? 'border-highlight-ink bg-highlight/10'
                    : 'hover:border-muted-foreground/40 hover:bg-accent/40',
                )}
              >
                <m.icon
                  className={cn(
                    'mt-0.5 h-5 w-5 shrink-0',
                    active ? 'text-highlight-ink' : 'text-muted-foreground',
                  )}
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {m.label}
                    {active && <CheckCircle2 className="h-4 w-4 text-highlight-ink" />}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{m.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <form onSubmit={handleSave} className="flex max-w-xl flex-col gap-4">
        <h3 className="font-sans text-sm font-medium">Połączenie MySQL</h3>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Host" htmlFor="db-host">
            <Input
              id="db-host"
              value={config.host}
              onChange={(e) => set('host', e.target.value)}
              placeholder="localhost"
              autoComplete="off"
            />
          </Field>
          <Field label="Port" htmlFor="db-port">
            <Input
              id="db-port"
              type="number"
              value={config.port}
              onChange={(e) => set('port', parseInt(e.target.value) || 3306)}
              className="tabular"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Użytkownik" htmlFor="db-user">
            <Input
              id="db-user"
              value={config.user}
              onChange={(e) => set('user', e.target.value)}
              placeholder="root"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Hasło"
            htmlFor="db-pass"
            hint={
              hasPassword
                ? config.password
                  ? 'Zostanie zapisane nowe hasło.'
                  : 'Puste pole = użyj zapisanego hasła.'
                : undefined
            }
          >
            <Input
              id="db-pass"
              type="password"
              value={config.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder={hasPassword ? '••••••••' : 'Hasło do bazy'}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <Field label="Nazwa bazy" htmlFor="db-name">
          <Input
            id="db-name"
            value={config.database}
            onChange={(e) => set('database', e.target.value)}
            placeholder="wtt"
            autoComplete="off"
          />
        </Field>

        {testResult && (
          <div
            role="status"
            className={cn(
              'flex gap-3 rounded-lg border p-3 text-sm',
              testResult.success
                ? 'border-status-done/40 bg-status-done/10'
                : 'border-destructive/40 bg-destructive/10',
            )}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-status-done" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0">
              <p className="font-medium">
                {testResult.success ? 'Połączenie działa.' : testResult.error || 'Błąd połączenia'}
              </p>
              {testResult.details && (
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                  {testResult.details}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" disabled={saving || !canSubmit}>
            {saving ? 'Zapisywanie…' : 'Zapisz konfigurację'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || !canSubmit}
          >
            {testing ? 'Testowanie…' : 'Testuj połączenie'}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
