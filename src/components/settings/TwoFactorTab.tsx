import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SettingsSection, { Field } from './SettingsSection';

async function post2fa(body: Record<string, string>) {
  const res = await apiFetch('/api/auth/2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Kod QR generowany lokalnie — sekret TOTP nie opuszcza przeglądarki. */
function QrCode({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(value, { width: 360, margin: 1, errorCorrectionLevel: 'M' }))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value]);
  if (!src)
    return (
      <div className="grid h-[180px] w-[180px] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#181A2F]" />
      </div>
    );
  return (
    <img src={src} alt="Kod QR do aplikacji uwierzytelniającej" className="h-[180px] w-[180px]" />
  );
}

function CodeInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      className="tabular max-w-[160px] text-center text-lg tracking-[0.3em]"
    />
  );
}

export default function TwoFactorTab() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch('/api/auth/2fa?action=status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEnabled(!!d.enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const run = async (body: Record<string, string>, onOk: (data: any) => void, fallback: string) => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const { ok, data } = await post2fa(body);
      if (ok && (data.success ?? true)) onOk(data);
      else setError(data.error || fallback);
    } catch {
      setError('Brak połączenia z serwerem');
    } finally {
      setBusy(false);
    }
  };

  const handleSetup = () => run({ action: 'setup' }, setSetupData, 'Nie udało się rozpocząć');

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      { action: 'confirm', code },
      () => {
        setEnabled(true);
        setSetupData(null);
        setCode('');
        setMessage('Weryfikacja dwuetapowa jest włączona.');
      },
      'Nieprawidłowy kod',
    );
  };

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      { action: 'disable', code },
      () => {
        setEnabled(false);
        setCode('');
        setMessage('Weryfikacja dwuetapowa jest wyłączona.');
      },
      'Nieprawidłowy kod',
    );
  };

  const copySecret = () => {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <SettingsSection
      title="Weryfikacja dwuetapowa"
      description="Przy logowaniu, oprócz hasła, poprosimy o 6-cyfrowy kod z aplikacji uwierzytelniającej (Google Authenticator, Authy, 1Password)."
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Sprawdzanie…
        </p>
      ) : (
        <div className="flex max-w-xl flex-col gap-5">
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg border p-4',
              enabled && 'border-status-done/40 bg-status-done/10',
            )}
          >
            {enabled ? (
              <ShieldCheck className="h-5 w-5 text-status-done" />
            ) : (
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {enabled ? 'Włączona — konto jest dodatkowo chronione' : 'Wyłączona'}
            </p>
          </div>

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

          {!enabled && !setupData && (
            <Button onClick={handleSetup} disabled={busy} className="self-start">
              <ShieldCheck className="h-4 w-4" />
              Włącz weryfikację
            </Button>
          )}

          {setupData && (
            <form onSubmit={handleConfirm} className="flex flex-col gap-5">
              <ol className="flex flex-col gap-5">
                <li className="flex flex-col gap-2">
                  <p className="text-sm font-medium">1. Zeskanuj kod QR w aplikacji</p>
                  <div className="w-fit rounded-lg bg-[#fbf8f5] p-3">
                    <QrCode value={setupData.otpauth_uri} />
                  </div>
                  <p className="text-xs text-muted-foreground">Albo wpisz klucz ręcznie:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
                      {setupData.secret}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={copySecret}
                      aria-label="Kopiuj klucz"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-status-done" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </li>
                <li>
                  <Field label="2. Wpisz kod z aplikacji" htmlFor="totp-confirm">
                    <CodeInput id="totp-confirm" value={code} onChange={setCode} />
                  </Field>
                </li>
              </ol>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || code.length !== 6}>
                  Potwierdź i włącz
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSetupData(null);
                    setCode('');
                  }}
                >
                  Anuluj
                </Button>
              </div>
            </form>
          )}

          {enabled && !setupData && (
            <form onSubmit={handleDisable} className="flex flex-col gap-3">
              <Field label="Aby wyłączyć, podaj aktualny kod z aplikacji" htmlFor="totp-disable">
                <div className="flex flex-wrap gap-2">
                  <CodeInput id="totp-disable" value={code} onChange={setCode} />
                  <Button type="submit" variant="destructive" disabled={busy || code.length !== 6}>
                    <ShieldOff className="h-4 w-4" />
                    Wyłącz
                  </Button>
                </div>
              </Field>
            </form>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
