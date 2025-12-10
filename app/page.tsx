'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LoginForm from '@/components/LoginForm'
import ClientTabs from '@/components/ClientTabs'
import Cookies from 'js-cookie'
import { useTheme } from '@/contexts/ThemeContext'
import { Clock, Sun, Moon, FileText } from 'lucide-react'

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  
  const isDark = theme === 'dark'

  useEffect(() => {
    const token = Cookies.get('auth_token')
    if (token) {
      setIsAuthenticated(true)
    }
    setLoading(false)
  }, [])

  const handleLogin = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    Cookies.remove('auth_token')
    setIsAuthenticated(false)
    router.push('/')
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#141414'
      }}>
        <div style={{
          color: '#d22f27',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          Ładowanie...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />
  }

  return (
    <div style={{ minHeight: '100vh', background: '#141414', transition: 'background-color 0.3s ease' }}>
      {/* Header */}
      <header style={{ background: '#141414', borderBottom: '1px solid #2a2a2a', padding: '8px 12px', marginBottom: '12px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img 
              src="/logo.png" 
              alt="Afisza Time Tracker" 
              style={{ 
                width: '28px', 
                height: '28px', 
                borderRadius: '3px',
                objectFit: 'contain'
              }} 
            />
            <h1 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>
              Afisza Time Tracker
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {/* Dark Theme Toggle */}
            <button
              onClick={toggleTheme}
              style={{
                padding: '4px',
                background: 'transparent',
                color: '#888',
                border: '1px solid #2a2a2a',
                borderRadius: '3px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '26px',
                height: '26px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2a2a2a'
                e.currentTarget.style.color = '#d22f27'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#888'
              }}
              title={isDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
            >
              {isDark ? <Sun size={14} color="#FBBF24" /> : <Moon size={14} color="#888" />}
            </button>
            <button 
              onClick={() => router.push('/settings')}
              style={{ 
                padding: '4px 8px', 
                background: 'transparent',
                color: '#d22f27',
                border: '1px solid #d22f27',
                borderRadius: '3px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#d22f27'
                e.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#d22f27'
              }}
            >
              Ustawienia
            </button>
            <button 
              onClick={handleLogout}
              style={{ 
                padding: '4px 8px', 
                background: '#d22f27',
                color: '#ffffff',
                border: 'none',
                borderRadius: '3px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#b0251f'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#d22f27'
              }}
            >
              Wyloguj
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 12px 16px' }}>
        <ClientTabs />
      </main>
    </div>
  )
}
