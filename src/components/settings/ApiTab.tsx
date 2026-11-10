import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Copy, Check, Trash2, Plus, TriangleAlert } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { basePath } from '@/lib/apiBase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import SettingsSection, { Field } from './SettingsSection';

interface ApiToken {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revoked: boolean;
  expired: boolean;
}

const EXPIRY_OPTIONS = [
  { value: '30', label: '30 dni' },
  { value: '90', label: '90 dni' },
  { value: '365', label: '1 rok' },
  { value: '0', label: 'Bez terminu' },
];

/** Daty z MySQL ("2026-11-10 17:05:00") → czytelny zapis po polsku. */
function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      onClick={() =>
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        })
      }
    >
      {copied ? <Check className="h-4 w-4 text-status-done" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export default function ApiTab() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [requires2FA, setRequires2FA] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('Claude Code');
  const [expiry, setExpiry] = useState('365');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/api-tokens', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Nie udało się wczytać tokenów');
      setTokens(data.tokens ?? []);
      setRequires2FA(!!data.requires2FA);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Nie udało się wczytać tokenów');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setFormOpen(false);
    setPassword('');
    setTotpCode('');
    setError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/settings/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          expiresInDays: Number(expiry),
          password,
          totpCode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Nie udało się utworzyć tokenu');
        return;
      }
      setCreated({ name: data.name, token: data.token });
      resetForm();
      void load();
    } catch {
      setError('Brak połączenia z serwerem');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: number) => {
    const res = await apiFetch(`/api/settings/api-tokens?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLoadError(data.error || 'Nie udało się odwołać tokenu');
    }
    void load();
  };

  const apiUrl = `${window.location.origin}${basePath}/api/v1/entries`;
  const active = tokens.filter((t) => !t.revoked && !t.expired);
  const inactive = tokens.filter((t) => t.revoked || t.expired);

  return (
    <SettingsSection
      title="Dostęp API"
      description="Tokeny pozwalają dodawać wpisy czasu pracy z zewnątrz, np. z Claude Code. Token może tylko dodawać i odczytywać wpisy — nie zmienia ani nie usuwa zadań i nie loguje do aplikacji."
      actions={
        !formOpen && (
          <Button onClick={() => setFormOpen(true)} disabled={loading}>
            <Plus className="h-4 w-4" />
            Nowy token
          </Button>
        )
      }
    >
      <div className="flex max-w-2xl flex-col gap-6">
        {created && (
          <div
            role="status"
            className="flex flex-col gap-3 rounded-lg border border-highlight/50 bg-highlight/10 p-4"
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="h-4 w-4 text-highlight-ink" />
              Skopiuj token „{created.name}” teraz — później nie da się go już wyświetlić.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
                {created.token}
              </code>
              <CopyButton value={created.token} label="Kopiuj token" />
            </div>
            <p className="text-xs text-muted-foreground">
              Na Macu zapisz go w pęku kluczy:{' '}
              <code className="font-mono">
                security add-generic-password -U -s wtt-api -a timer.afisza.com -w
              </code>{' '}
              (polecenie zapyta o token).
            </p>
            <Button variant="ghost" className="self-start" onClick={() => setCreated(null)}>
              Zapisałem token
            </Button>
          </div>
        )}

        {formOpen && (
          <form onSubmit={handleCreate} className="flex flex-col gap-4 rounded-lg border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nazwa" htmlFor="api-token-name" hint="Np. „Claude Code – MacBook”">
                <Input
                  id="api-token-name"
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Ważność" htmlFor="api-token-expiry">
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger id="api-token-expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Twoje hasło"
                htmlFor="api-token-password"
                hint="Potwierdzenie tożsamości"
              >
                <Input
                  id="api-token-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              {requires2FA && (
                <Field label="Kod 2FA" htmlFor="api-token-totp">
                  <Input
                    id="api-token-totp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="tabular tracking-[0.3em]"
                    required
                  />
                </Field>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  busy || !name.trim() || !password || (requires2FA && totpCode.length !== 6)
                }
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Utwórz token
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Anuluj
              </Button>
            </div>
          </form>
        )}

        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
          </p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak aktywnych tokenów.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {active.map((t) => (
              <TokenRow key={t.id} token={t} onRevoke={() => handleRevoke(t.id)} />
            ))}
          </ul>
        )}

        {inactive.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Nieaktywne tokeny ({inactive.length})
            </summary>
            <ul className="mt-2 flex flex-col divide-y rounded-lg border opacity-70">
              {inactive.map((t) => (
                <TokenRow key={t.id} token={t} />
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-col gap-2 border-t pt-5">
          <h3 className="text-sm font-semibold">Jak użyć</h3>
          <p className="text-sm text-muted-foreground">
            Wyślij token w nagłówku <code className="font-mono">Authorization: Bearer …</code>. Gdy
            nie podasz godzin, wpis zaczyna się po ostatnim wpisie z tego dnia (albo o 8:00).
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {`curl -X POST ${apiUrl} \\
  -H "Authorization: Bearer wtt_…" \\
  -H "Content-Type: application/json" \\
  -d '{"client":"best-market.pl","duration":"3h 27min",
       "text":"Optymalizacja bazy danych"}'`}
          </pre>
          <p className="text-xs text-muted-foreground">
            Pola: <code>client</code> (nazwa, domena lub id), <code>text</code>,{' '}
            <code>minutes</code> albo <code>duration</code>, opcjonalnie <code>date</code>{' '}
            (YYYY-MM-DD, domyślnie dziś), <code>start</code>/<code>end</code> (HH:MM),{' '}
            <code>status</code> (domyślnie „wykonano”). Odczyt:{' '}
            <code>GET /api/v1/entries?date=…</code> i <code>GET /api/v1/clients</code>.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

function TokenRow({ token, onRevoke }: { token: ApiToken; onRevoke?: () => void }) {
  return (
    <li className="flex items-start gap-3 p-3">
      <KeyRound
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          onRevoke ? 'text-highlight-ink' : 'text-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {token.name}{' '}
          <code className="ml-1 font-mono text-xs text-muted-foreground">{token.prefix}…</code>
          {token.revoked && <span className="ml-2 text-xs text-muted-foreground">odwołany</span>}
          {!token.revoked && token.expired && (
            <span className="ml-2 text-xs text-muted-foreground">wygasł</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Utworzony {formatDate(token.createdAt)} · ważny do{' '}
          {token.expiresAt ? formatDate(token.expiresAt) : 'odwołania'} · ostatnio użyty{' '}
          {token.lastUsedAt
            ? `${formatDate(token.lastUsedAt)} (${token.lastUsedIp ?? '?'})`
            : 'nigdy'}
        </p>
      </div>
      {onRevoke && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Odwołaj token: ${token.name}`}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Odwołać token „{token.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Narzędzia, które go używają, stracą dostęp od razu. Tej operacji nie można cofnąć.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={onRevoke}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Odwołaj
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}
