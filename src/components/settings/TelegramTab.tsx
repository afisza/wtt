import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, CheckCircle2, Circle, Link2, Unplug } from 'lucide-react';
import { apiFetch } from '@/lib/api';
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

interface TelegramStatus {
  botConfigured: boolean;
  botUsername: string | null;
  hasElevenLabsKey: boolean;
  hasAnthropicKey: boolean;
  linked: boolean;
  linkedName: string | null;
  defaultAssigner: string | null;
  assigners: string[];
}

const NO_ASSIGNER = '__none__';

async function call(init: RequestInit = {}) {
  const res = await apiFetch('/api/settings/telegram', {
    cache: 'no-store',
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Błąd serwera');
  return data;
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-done" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className={cn(!done && 'text-muted-foreground')}>{children}</span>
    </li>
  );
}

export default function TelegramTab() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [botToken, setBotToken] = useState('');
  const [elevenKey, setElevenKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await call());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wczytać stanu');
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load]);

  // Po wygenerowaniu linku sprawdzamy co 3 s, czy konto Telegram zostało przypięte
  useEffect(() => {
    if (!linkUrl) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const s: TelegramStatus = await call();
        if (s.linked) {
          setStatus(s);
          setLinkUrl(null);
          setMessage('Konto Telegram połączone. Wyślij botowi głosówkę!');
        }
      } catch {
        /* spróbujemy ponownie */
      }
    }, 3000);
    const stop = window.setTimeout(() => setLinkUrl(null), 15 * 60 * 1000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.clearTimeout(stop);
    };
  }, [linkUrl]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const s = await call({
        method: 'POST',
        body: JSON.stringify({
          botToken: botToken.trim(),
          elevenlabsKey: elevenKey.trim(),
          anthropicKey: anthropicKey.trim(),
        }),
      });
      setStatus(s);
      setBotToken('');
      setElevenKey('');
      setAnthropicKey('');
      setMessage('Zapisano.');
    });
  };

  const handleLink = () =>
    void run(async () => {
      const data = await call({ method: 'POST', body: JSON.stringify({ action: 'link' }) });
      setStatus(data);
      setLinkUrl(data.url);
      window.open(data.url, '_blank', 'noopener');
    });

  const handleDisconnect = () =>
    void run(async () => {
      setStatus(await call({ method: 'DELETE' }));
      setLinkUrl(null);
      setMessage('Bot odłączony, klucze usunięte.');
    });

  const handleDefaultAssigner = (value: string) =>
    void run(async () => {
      setStatus(
        await call({
          method: 'POST',
          body: JSON.stringify({ defaultAssigner: value === NO_ASSIGNER ? null : value }),
        }),
      );
      setMessage('Zapisano domyślną osobę.');
    });

  const savedHint = 'Zapisany — zostaw puste, aby nie zmieniać';
  const ready = status?.botConfigured && status.hasElevenLabsKey && status.hasAnthropicKey;

  return (
    <SettingsSection
      title="Telegram"
      description="Dodawaj wpisy głosówką lub wiadomością do własnego bota w Telegramie. Nagranie rozpoznaje ElevenLabs Scribe (polski, ukraiński, rosyjski, angielski), a Claude zamienia je na wpis. Przed zapisem bot zawsze prosi o potwierdzenie."
    >
      {!status ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </p>
      ) : (
        <div className="flex max-w-2xl flex-col gap-6">
          <ol className="flex flex-col gap-2 rounded-lg border p-4">
            <Step done={status.botConfigured}>
              Bot{status.botUsername ? ` @${status.botUsername}` : ''} podłączony
            </Step>
            <Step done={status.hasElevenLabsKey}>Klucz ElevenLabs (rozpoznawanie mowy)</Step>
            <Step done={status.hasAnthropicKey}>Klucz Anthropic (Claude — odczyt wpisu)</Step>
            <Step done={status.linked}>
              Konto Telegram połączone{status.linkedName ? `: ${status.linkedName}` : ''}
            </Step>
          </ol>

          {message && (
            <p role="status" className="text-sm text-status-done">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Field
              label="Token bota"
              htmlFor="tg-bot-token"
              hint={
                status.botConfigured ? (
                  savedHint
                ) : (
                  <>
                    W Telegramie napisz do <span className="font-medium">@BotFather</span>: /newbot
                    → nazwa → nazwa użytkownika kończąca się na „bot”. Skopiuj token.
                  </>
                )
              }
            >
              <Input
                id="tg-bot-token"
                type="password"
                autoComplete="off"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={status.botConfigured ? '••••••••' : '123456789:AA…'}
              />
            </Field>
            <Field
              label="Klucz API ElevenLabs"
              htmlFor="tg-eleven-key"
              hint={
                status.hasElevenLabsKey
                  ? savedHint
                  : 'elevenlabs.io → Developers → API Keys. Wystarczy uprawnienie „Speech to Text”.'
              }
            >
              <Input
                id="tg-eleven-key"
                type="password"
                autoComplete="off"
                value={elevenKey}
                onChange={(e) => setElevenKey(e.target.value)}
                placeholder={status.hasElevenLabsKey ? '••••••••' : 'sk_…'}
              />
            </Field>
            <Field
              label="Klucz API Anthropic"
              htmlFor="tg-anthropic-key"
              hint={status.hasAnthropicKey ? savedHint : 'platform.claude.com → API Keys.'}
            >
              <Input
                id="tg-anthropic-key"
                type="password"
                autoComplete="off"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder={status.hasAnthropicKey ? '••••••••' : 'sk-ant-…'}
              />
            </Field>
            <Button
              type="submit"
              className="self-start"
              disabled={busy || (!botToken.trim() && !elevenKey.trim() && !anthropicKey.trim())}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Zapisz
            </Button>
          </form>

          {status.botConfigured && (
            <div className="flex flex-col gap-3 border-t pt-5">
              <h3 className="text-sm font-semibold">Połączenie z Twoim kontem Telegram</h3>
              <p className="text-sm text-muted-foreground">
                Bot odpowiada tylko na wiadomości z połączonego konta. Link jest jednorazowy i ważny
                15 minut — otwórz go w Telegramie i naciśnij „Start”.
              </p>
              {linkUrl && (
                <p className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Czekam na połączenie…{' '}
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-highlight-ink underline underline-offset-2"
                  >
                    otwórz link ponownie
                  </a>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={status.linked ? 'outline' : 'default'}
                  onClick={handleLink}
                  disabled={busy || !ready}
                >
                  <Link2 className="h-4 w-4" />
                  {status.linked ? 'Połącz inne konto' : 'Połącz konto Telegram'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" className="text-muted-foreground" disabled={busy}>
                      <Unplug className="h-4 w-4" />
                      Odłącz bota
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Odłączyć bota?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Bot przestanie przyjmować wiadomości, a zapisane klucze ElevenLabs i
                        Anthropic zostaną usunięte. Wpisy w kalendarzu zostają.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Anuluj</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDisconnect}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Odłącz
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <Field
                label="Domyślna osoba zlecająca"
                htmlFor="tg-default-assigner"
                hint="Gdy powiesz np. „zadanie od Aliny”, bot wybierze tę osobę z listy Osób. Jeśli nikogo nie wskażesz, wpis dostanie osobę ustawioną tutaj."
              >
                <Select
                  value={status.defaultAssigner ?? NO_ASSIGNER}
                  onValueChange={handleDefaultAssigner}
                  disabled={busy || status.assigners.length === 0}
                >
                  <SelectTrigger id="tg-default-assigner" className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ASSIGNER}>Brak</SelectItem>
                    {status.assigners.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {!ready && (
                <p className="text-xs text-muted-foreground">
                  Uzupełnij oba klucze API, aby połączyć konto.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
