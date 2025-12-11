'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { useTheme } from '@/contexts/ThemeContext'

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
  const isDark = theme === 'dark'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login'
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
    <div className="flex justify-center items-center min-h-screen bg-[#141414] p-4">
      <div className="bg-[#141414] p-6 rounded border border-[#2a2a2a] w-full max-w-[340px]">
        <div className="text-center mb-5">
          <img 
            src="/logo.png" 
            alt="Afisza Time Tracker" 
            className="w-9 h-9 rounded mx-auto mb-2 object-contain"
            style={{ borderRadius: '3px' }}
          />
          <h1 className="text-sm font-semibold text-white mb-1.5">
            Afisza Time Tracker
          </h1>
          <p className="text-[#888] text-[10px]">
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
            className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-colors ${
              !isRegisterMode
                ? 'bg-[#d22f27] text-white'
                : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] hover:bg-[#2a2a2a]'
            }`}
          >
            Logowanie
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegisterMode(true)
              setError('')
            }}
            className={`flex-1 py-1.5 rounded text-[10px] font-medium transition-colors ${
              isRegisterMode
                ? 'bg-[#d22f27] text-white'
                : 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] hover:bg-[#2a2a2a]'
            }`}
          >
            Rejestracja
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1 font-medium text-white text-[10px]">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="twoj@email.pl"
              className="w-full px-2 py-1.5 border border-[#2a2a2a] rounded text-xs bg-[#1a1a1a] text-white focus:border-[#d22f27] focus:bg-[#1f1f1f] transition-colors"
            />
          </div>

          <div className="mb-4">
            <label className="block mb-1 font-medium text-white text-[10px]">
              Hasło
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-2 py-1.5 border border-[#2a2a2a] rounded text-xs bg-[#1a1a1a] text-white focus:border-[#d22f27] focus:bg-[#1f1f1f] transition-colors"
            />
          </div>

          {error && (
            <div className="text-[#d22f27] mb-3 px-2 py-1.5 bg-[#1a1a1a] rounded border border-[#d22f27] text-[10px]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 rounded text-xs font-medium transition-colors ${
              loading 
                ? 'bg-[#2a2a2a] cursor-not-allowed' 
                : 'bg-[#d22f27] hover:bg-[#b0251f] cursor-pointer'
            } text-white`}
          >
            {loading 
              ? (isRegisterMode ? 'Rejestrowanie...' : 'Logowanie...') 
              : (isRegisterMode ? 'Zarejestruj się' : 'Zaloguj się')
            }
          </button>
        </form>

        {!isRegisterMode && (
          <div className="mt-4 text-center text-[9px] text-[#888] px-2 py-2 bg-[#1a1a1a] rounded border border-[#2a2a2a]">
            <p className="mb-1 font-medium text-white">Domyślne dane logowania:</p>
            <p className="mb-0.5">Email: <strong className="text-[#d22f27]">admin@wtt.pl</strong></p>
            <p>Hasło: <strong className="text-[#d22f27]">admin123</strong></p>
          </div>
        )}
        
        {isRegisterMode && (
          <div className="mt-4 text-center text-[9px] text-[#888] px-2 py-2 bg-[#1a1a1a] rounded border border-[#2a2a2a]">
            <p className="mb-1 font-medium text-white">Uwaga:</p>
            <p className="text-[#888]">Rejestracja wymaga skonfigurowanej bazy danych MySQL. Skonfiguruj bazę w ustawieniach aplikacji.</p>
          </div>
        )}
      </div>
    </div>
  )
}
