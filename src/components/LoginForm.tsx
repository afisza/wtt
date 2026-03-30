import { useState } from 'react'
import { useNavigate } from 'react-router'
import { basePath } from '@/lib/apiBase'
import { Eye, EyeOff, Loader2, AlertCircle, Info, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface LoginFormProps {
  onLogin: () => void
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [needs2FA, setNeeds2FA] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = isRegisterMode ? `${basePath}/api/auth/register` : `${basePath}/api/auth/login`
      const payload: Record<string, string> = { email, password }
      if (needs2FA && totpCode) {
        payload.totpCode = totpCode
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (response.ok && data.requires2FA) {
        setNeeds2FA(true)
        setLoading(false)
        return
      }

      if (response.ok && data.success) {
        onLogin()
        navigate('/')
      } else {
        setError(data.error || (isRegisterMode ? 'Blad rejestracji' : 'Blad logowania'))
      }
    } catch {
      setError(isRegisterMode ? 'Wystapil blad podczas rejestracji' : 'Wystapil blad podczas logowania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex justify-center items-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-[380px]">
        <CardHeader className="text-center pb-4">
          <img
            src={`${basePath}/logo.png`}
            alt="Afisza Time Tracker"
            className="w-10 h-10 rounded-lg mx-auto mb-3 object-contain"
          />
          <CardTitle className="text-lg">Afisza Time Tracker</CardTitle>
          <CardDescription>
            {needs2FA
              ? 'Wprowadz kod z aplikacji uwierzytelniającej'
              : isRegisterMode ? 'Utworz nowe konto' : 'Zaloguj sie do swojego konta'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!needs2FA && (
            <Tabs
              value={isRegisterMode ? 'register' : 'login'}
              onValueChange={(v) => {
                setIsRegisterMode(v === 'register')
                setError('')
              }}
              className="mb-5"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Logowanie</TabsTrigger>
                <TabsTrigger value="register">Rejestracja</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!needs2FA ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="twoj@email.pl"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Haslo</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="pr-9"
                      autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Ukryj haslo' : 'Pokaz haslo'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {!isRegisterMode && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground cursor-pointer">
                      Zapamietaj mnie
                    </Label>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <span>Weryfikacja dwuetapowa (2FA)</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totp">Kod z aplikacji (6 cyfr)</Label>
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
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setNeeds2FA(false); setTotpCode(''); setError('') }}
                  className="text-xs text-muted-foreground underline"
                >
                  Wrocdo logowania
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {needs2FA
                ? (loading ? 'Weryfikacja...' : 'Zweryfikuj')
                : loading
                  ? (isRegisterMode ? 'Rejestrowanie...' : 'Logowanie...')
                  : (isRegisterMode ? 'Zarejestruj sie' : 'Zaloguj sie')
              }
            </Button>
          </form>

          {isRegisterMode && !needs2FA && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Rejestracja wymaga skonfigurowanej bazy danych MySQL. Skonfiguruj baze w ustawieniach aplikacji.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
