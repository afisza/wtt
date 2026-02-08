'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { useTheme } from '@/contexts/ThemeContext'
import { basePath } from '@/lib/apiBase'

interface LoginFormProps {
  onLogin: () => void
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark' // do ewentualnego użycia

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = isRegisterMode ? `${basePath}/api/auth/register` : `${basePath}/api/auth/login`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        // Cookie jest już zapisane przez API endpoint (Next.js Response.cookies)
        // Zapisz też po stronie klienta z dokładnie takimi samymi ustawieniami jak w API
        if (data.token) {
          // Użyj document.cookie bezpośrednio, aby mieć pełną kontrolę
          const expires = new Date()
          expires.setTime(expires.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 dni
          document.cookie = `auth_token=${data.token}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
          
          // Również przez js-cookie jako backup
          Cookies.set('auth_token', data.token, {
            expires: 7,
            path: '/',
            sameSite: 'lax',
            secure: false // W development (localhost) nie używaj secure
          })
        }
        
        console.log('LoginForm - Token received:', data.token ? 'yes' : 'no')
        console.log('LoginForm - Cookie value after login:', Cookies.get('auth_token') ? 'exists' : 'missing')
        console.log('LoginForm - document.cookie:', document.cookie)
        
        // Poczekaj chwilę, aby cookie zostało zapisane przed nawigacją
        await new Promise(resolve => setTimeout(resolve, 100))
        
        onLogin()
        router.push('/')
      } else {
        setError(data.error || (isRegisterMode ? 'Błąd rejestracji' : 'Błąd logowania'))
      }
    } catch (err) {
      setError(isRegisterMode ? 'Wystąpił błąd podczas rejestracji' : 'Wystąpił błąd podczas logowania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex justify-center items-center min-h-screen p-4" style={{ background: 'var(--app-bg)' }}>
      <div className="p-6 rounded border w-full max-w-[340px]" style={{ background: 'var(--app-card)', borderColor: 'var(--app-border)' }}>
        <div className="text-center mb-5">
          <img 
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.png`}
            alt="Afisza Time Tracker" 
            className="w-9 h-9 rounded mx-auto mb-2 object-contain"
            style={{ borderRadius: '3px' }}
          />
          <h1 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--app-text)' }}>
            Afisza Time Tracker
          </h1>
          <p className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
            {isRegisterMode ? 'Utwórz nowe konto' : 'Zaloguj się do swojego konta'}
          </p>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(false)
              setError('')
            }}
            className="flex-1 py-1.5 rounded text-[10px] font-medium transition-colors border"
            style={{
              background: !isRegisterMode ? 'var(--app-accent)' : 'var(--app-card-alt)',
              color: !isRegisterMode ? 'var(--app-accent-foreground)' : 'var(--app-text-muted)',
              borderColor: 'var(--app-border)'
            }}
          >
            Logowanie
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(true)
              setError('')
            }}
            className="flex-1 py-1.5 rounded text-[10px] font-medium transition-colors border"
            style={{
              background: isRegisterMode ? 'var(--app-accent)' : 'var(--app-card-alt)',
              color: isRegisterMode ? 'var(--app-accent-foreground)' : 'var(--app-text-muted)',
              borderColor: 'var(--app-border)'
            }}
          >
            Rejestracja
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1 font-medium text-[10px]" style={{ color: 'var(--app-text)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="twoj@email.pl"
              className="w-full px-2 py-1.5 border rounded text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0"
              style={{
                borderColor: 'var(--app-border)',
                background: 'var(--app-card-alt)',
                color: 'var(--app-text)'
              }}
            />
          </div>

          <div className="mb-4">
            <label className="block mb-1 font-medium text-[10px]" style={{ color: 'var(--app-text)' }}>
              Hasło
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-2 py-1.5 border rounded text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0"
              style={{
                borderColor: 'var(--app-border)',
                background: 'var(--app-card-alt)',
                color: 'var(--app-text)'
              }}
            />
          </div>

          {error && (
            <div className="mb-3 px-2 py-1.5 rounded border text-[10px]" style={{ color: 'var(--app-accent)', background: 'var(--app-card-alt)', borderColor: 'var(--app-accent)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded text-xs font-medium transition-colors text-white disabled:cursor-not-allowed"
            style={{
              background: loading ? 'var(--app-border)' : 'var(--app-accent)'
            }}
          >
            {loading 
              ? (isRegisterMode ? 'Rejestrowanie...' : 'Logowanie...') 
              : (isRegisterMode ? 'Zarejestruj się' : 'Zaloguj się')
            }
          </button>
        </form>

        {isRegisterMode && (
          <div className="mt-4 text-center text-[9px] px-2 py-2 rounded border" style={{ color: 'var(--app-text-muted)', background: 'var(--app-card-alt)', borderColor: 'var(--app-border)' }}>
            <p className="mb-1 font-medium" style={{ color: 'var(--app-text)' }}>Uwaga:</p>
            <p style={{ color: 'var(--app-text-muted)' }}>Rejestracja wymaga skonfigurowanej bazy danych MySQL. Skonfiguruj bazę w ustawieniach aplikacji.</p>
          </div>
        )}
      </div>
    </div>
  )
}
