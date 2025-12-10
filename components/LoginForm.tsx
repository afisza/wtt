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
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        Cookies.set('auth_token', data.token, { expires: 7 })
        onLogin()
        router.push('/')
      } else {
        setError(data.error || 'Błąd logowania')
      }
    } catch (err) {
      setError('Wystąpił błąd podczas logowania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#141414] p-4">
      <div className="bg-[#141414] p-6 rounded border border-[#2a2a2a] w-full max-w-[340px]">
        <div className="text-center mb-5">
          <div className="w-9 h-9 bg-[#d22f27] rounded mx-auto mb-2 flex items-center justify-center">
            <span className="text-base">⏱️</span>
          </div>
          <h1 className="text-sm font-semibold text-white mb-1.5">
            Work Time Tracker - Best Market / Foodex24 / RSA
          </h1>
          <p className="text-[#888] text-[10px]">
            Zaloguj się do swojego konta
          </p>
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
            {loading ? 'Logowanie...' : 'Zaloguj się'}
          </button>
        </form>

        <div className="mt-4 text-center text-[9px] text-[#888] px-2 py-2 bg-[#1a1a1a] rounded border border-[#2a2a2a]">
          <p className="mb-1 font-medium text-white">Domyślne dane logowania:</p>
          <p className="mb-0.5">Email: <strong className="text-[#d22f27]">admin@wtt.pl</strong></p>
          <p>Hasło: <strong className="text-[#d22f27]">admin123</strong></p>
        </div>
      </div>
    </div>
  )
}
