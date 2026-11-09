import { useState } from 'react';
import { basePath } from '@/lib/apiBase';
import { storage } from '@/lib/storage';
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LoginFormProps {
  onLogin: () => void;
  /** 'inline' = ponowne logowanie w oknie (sesja wygasła) — bez rejestracji i pełnego ekranu */
  variant?: 'page' | 'inline';
}

const LAST_EMAIL_KEY = 'wttLastEmail';

export default function LoginForm({ onLogin, variant = 'page' }: LoginFormProps) {
  const [email, setEmail] = useState(() => storage.get(LAST_EMAIL_KEY) || '');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const inline = variant === 'inline';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = `${basePath}/api/auth/${isRegisterMode ? 'register' : 'login'}`;
      const payload: Record<string, string> = { email, password };
      if (needs2FA && totpCode) payload.totpCode = totpCode;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.requires2FA) {
        setNeeds2FA(true);
        return;
      }
      if (response.ok && data.success) {
        storage.set(LAST_EMAIL_KEY, email);
        onLogin();
      } else {
        setError(
          data.error ||
            (isRegisterMode ? 'Rejestracja nie powiodła się' : 'Nieprawidłowy e-mail lub hasło'),
        );
      }
    } catch {
      setError('Brak połączenia z serwerem. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!needs2FA ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="twoj@email.pl"
              autoComplete="email"
              autoFocus={!email}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Hasło</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="pr-10"
                autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                autoFocus={!!email}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-0 grid h-full w-10 place-items-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-highlight-ink" />
            Wpisz kod z aplikacji uwierzytelniającej
          </p>
          <Input
            id="totp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            placeholder="000000"
            autoComplete="one-time-code"
            autoFocus
            aria-label="Kod 2FA"
            className="tabular h-12 text-center text-2xl tracking-[0.5em]"
          />
          <button
            type="button"
            onClick={() => {
              setNeeds2FA(false);
              setTotpCode('');
              setError('');
            }}
            className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Wróć do logowania
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" disabled={loading} className="mt-1 h-10 w-full">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {needs2FA ? 'Zweryfikuj' : isRegisterMode ? 'Utwórz konto' : 'Zaloguj się'}
      </Button>

      {!inline && !needs2FA && (
        <p className="text-center text-sm text-muted-foreground">
          {isRegisterMode ? 'Masz już konto?' : 'Nie masz konta?'}{' '}
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode((v) => !v);
              setError('');
            }}
            className="font-medium text-foreground underline underline-offset-4 hover:text-highlight-ink"
          >
            {isRegisterMode ? 'Zaloguj się' : 'Załóż konto'}
          </button>
        </p>
      )}
      {isRegisterMode && (
        <p className="text-xs text-muted-foreground">
          Rejestracja wymaga skonfigurowanej bazy MySQL.
        </p>
      )}
    </form>
  );

  if (inline) return form;

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Panel marki — tylko na dużych ekranach */}
      <aside className="relative hidden overflow-hidden bg-palette-ink text-[oklch(94.5%_0.012_60)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <img src={`${basePath}/logo.png`} alt="" className="h-9 w-9 rounded-lg object-contain" />
          <span className="font-display text-lg font-semibold">Afisza Time Tracker</span>
        </div>
        <LedgerArt />
        <p className="max-w-sm font-display text-3xl font-semibold leading-tight">
          Każda godzina na swoim miejscu.
          <span className="mt-3 block font-sans text-base font-normal text-[oklch(74%_0.032_270)]">
            Zadania, zleceniodawcy i raporty miesięczne dla klientów — w jednym rejestrze.
          </span>
        </p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src={`${basePath}/logo.png`}
              alt=""
              className="h-9 w-9 rounded-lg object-contain"
            />
            <span className="font-display text-lg font-semibold">Afisza Time Tracker</span>
          </div>
          <h1 className="mb-1 text-2xl font-semibold">
            {needs2FA ? 'Weryfikacja dwuetapowa' : isRegisterMode ? 'Nowe konto' : 'Witaj ponownie'}
          </h1>
          <p className="mb-7 text-sm text-muted-foreground">
            {isRegisterMode
              ? 'Utwórz konto, aby zacząć rejestrować czas.'
              : 'Zaloguj się, aby kontynuować.'}
          </p>
          {form}
        </div>
      </main>
    </div>
  );
}

/** Dekoracja: fragment „rejestru” — rząd dni z godzinami, jeden dzień podświetlony. */
function LedgerArt() {
  const rows = [
    ['pn', '06:30', 0.55],
    ['wt', '08:15', 0.75],
    ['śr', '07:45', 0.68],
    ['cz', '09:00', 0.85],
    ['pt', '05:20', 0.45],
  ] as const;
  return (
    <div aria-hidden className="my-10 flex flex-col gap-2.5">
      {rows.map(([d, h, w], i) => (
        <div key={d} className="tabular flex items-center gap-4 text-sm">
          <span className="w-6 text-[oklch(74%_0.032_270)]">{d}</span>
          <div className="h-2 flex-1 rounded-full bg-palette-navy">
            <div
              className={cn('h-2 rounded-full', i === 3 ? 'bg-palette-peach' : 'bg-palette-slate')}
              style={{ width: `${w * 100}%` }}
            />
          </div>
          <span
            className={cn(
              'w-12 text-right',
              i === 3 ? 'text-palette-peach' : 'text-[oklch(74%_0.032_270)]',
            )}
          >
            {h}
          </span>
        </div>
      ))}
    </div>
  );
}
