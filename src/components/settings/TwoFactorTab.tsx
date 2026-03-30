import { useState, useEffect } from 'react'
import { basePath } from '@/lib/apiBase'
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function TwoFactorTab() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_uri: string } | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    try {
      const res = await fetch(`${basePath}/api/auth/2fa?action=status`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setEnabled(data.enabled)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleSetup = async () => {
    setError('')
    setMessage('')
    try {
      const res = await fetch(`${basePath}/api/auth/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'setup' }),
      })
      const data = await res.json()
      if (res.ok) {
        setSetupData(data)
      } else {
        setError(data.error || 'Blad')
      }
    } catch {
      setError('Blad sieci')
    }
  }

  const handleConfirm = async () => {
    setError('')
    try {
      const res = await fetch(`${basePath}/api/auth/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'confirm', code }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setEnabled(true)
        setSetupData(null)
        setCode('')
        setMessage('2FA zostalo wlaczone!')
      } else {
        setError(data.error || 'Nieprawidlowy kod')
      }
    } catch {
      setError('Blad sieci')
    }
  }

  const handleDisable = async () => {
    setError('')
    if (!code) { setError('Wprowadz kod 2FA aby wylaczyc'); return }
    try {
      const res = await fetch(`${basePath}/api/auth/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'disable', code }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setEnabled(false)
        setCode('')
        setMessage('2FA zostalo wylaczone')
      } else {
        setError(data.error || 'Blad')
      }
    } catch {
      setError('Blad sieci')
    }
  }

  const copySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 p-4"><Loader2 className="h-4 w-4 animate-spin" /> Ladowanie...</div>
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2 mb-2">
        {enabled ? (
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
        ) : (
          <ShieldOff className="h-5 w-5 text-muted-foreground" />
        )}
        <span className="font-medium">
          2FA jest {enabled ? 'wlaczone' : 'wylaczone'}
        </span>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!enabled && !setupData && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Dodaj dodatkowa warstwe bezpieczenstwa do swojego konta. Potrzebujesz aplikacji
            uwierzytelniajacej (np. Google Authenticator, Authy, 1Password).
          </p>
          <Button onClick={handleSetup}>
            <ShieldCheck className="h-4 w-4 mr-2" />
            Wlacz 2FA
          </Button>
        </div>
      )}

      {setupData && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Zeskanuj kod QR w aplikacji uwierzytelniajacej:</p>
            <div className="bg-white p-4 rounded-lg w-fit mx-auto">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.otpauth_uri)}`}
                alt="QR Code"
                className="w-[200px] h-[200px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Lub wpisz klucz recznie:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono break-all select-all">
                {setupData.secret}
              </code>
              <Button variant="outline" size="icon" onClick={copySecret} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>2. Wpisz kod z aplikacji aby potwierdzic:</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="text-center text-lg font-mono tracking-widest max-w-[160px]"
              />
              <Button onClick={handleConfirm} disabled={code.length !== 6}>
                Potwierdz
              </Button>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => { setSetupData(null); setCode('') }}>
            Anuluj
          </Button>
        </div>
      )}

      {enabled && !setupData && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Aby wylaczyc 2FA, wprowadz aktualny kod z aplikacji uwierzytelniajacej.
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="text-center text-lg font-mono tracking-widest max-w-[160px]"
            />
            <Button variant="destructive" onClick={handleDisable} disabled={code.length !== 6}>
              <ShieldOff className="h-4 w-4 mr-2" />
              Wylacz 2FA
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
