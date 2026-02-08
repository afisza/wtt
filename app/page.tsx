'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoginForm from '@/components/LoginForm'
import ClientTabs from '@/components/ClientTabs'
import Cookies from 'js-cookie'
import { Clock, FileText } from 'lucide-react'

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      // Spróbuj odczytać cookie na różne sposoby
      let token = Cookies.get('auth_token')
      
      // Fallback: sprawdź document.cookie bezpośrednio
      if (!token) {
        const cookies = document.cookie.split(';')
        const authCookie = cookies.find(c => c.trim().startsWith('auth_token='))
        if (authCookie) {
          token = authCookie.split('=')[1]
          console.log('app/page.tsx - Found token in document.cookie')
        }
      }
      
      console.log('app/page.tsx - Token from cookies:', token ? 'exists' : 'missing')
      console.log('app/page.tsx - All cookies:', document.cookie)
      
      if (token) {
        // Weryfikuj token przez API
        try {
          const response = await fetch('/api/auth/verify', {
            credentials: 'include',
          })
          
          if (!response.ok) {
            console.log('app/page.tsx - Verify response not OK:', response.status)
            Cookies.remove('auth_token', { path: '/' })
            setIsAuthenticated(false)
            setLoading(false)
            return
          }
          
          const data = await response.json()
          console.log('app/page.tsx - Verify response:', data)
          
          if (data.authenticated) {
            setIsAuthenticated(true)
          } else {
            // Token nieprawidłowy - usuń go
            console.log('app/page.tsx - Token not authenticated, removing cookie')
            Cookies.remove('auth_token', { path: '/' })
            setIsAuthenticated(false)
          }
        } catch (error) {
          // Błąd weryfikacji - usuń token
          console.error('app/page.tsx - Error verifying token:', error)
          Cookies.remove('auth_token', { path: '/' })
          setIsAuthenticated(false)
        }
      } else {
        console.log('app/page.tsx - No token found, user not authenticated')
        setIsAuthenticated(false)
      }
      setLoading(false)
    }
    checkAuth()
  }, [])
  
  // Sprawdź autentykację również po zmianie route (np. po powrocie z settings)
  useEffect(() => {
    const handleRouteChange = () => {
      const token = Cookies.get('auth_token')
      if (!token && isAuthenticated) {
        console.log('app/page.tsx - Token missing after route change, checking auth')
        setIsAuthenticated(false)
      }
    }
    
    // Sprawdź autentykację po załadowaniu
    const token = Cookies.get('auth_token')
    if (token && !isAuthenticated) {
      console.log('app/page.tsx - Token found but not authenticated, re-checking')
      const checkAuth = async () => {
        try {
          const response = await fetch('/api/auth/verify', {
            credentials: 'include',
          })
          if (response.ok) {
            const data = await response.json()
            if (data.authenticated) {
              setIsAuthenticated(true)
            }
          }
        } catch (error) {
          console.error('app/page.tsx - Error re-checking auth:', error)
        }
      }
      checkAuth()
    }
  }, [isAuthenticated])

  const handleLogin = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    Cookies.remove('auth_token', { path: '/' })
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
        background: 'var(--app-bg)'
      }}>
        <div style={{
          color: 'var(--app-accent)',
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
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)' }}>
      {/* Header */}
      <header style={{ background: 'var(--app-bg)', borderBottom: '1px solid var(--app-border)', padding: '8px 12px', marginBottom: '12px' }}>
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
            <h1 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-text)' }}>
              Afisza Time Tracker
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <Link 
              href="/settings"
              style={{ 
                padding: '4px 8px', 
                background: 'transparent',
                color: 'var(--app-accent)',
                border: '1px solid var(--app-accent)',
                borderRadius: '3px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                display: 'inline-block'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--app-accent)'
                e.currentTarget.style.color = 'var(--app-accent-foreground)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--app-accent)'
              }}
            >
              Ustawienia
            </Link>
            <button 
              onClick={handleLogout}
              style={{ 
                padding: '4px 8px', 
                background: 'var(--app-accent)',
                color: 'var(--app-accent-foreground)',
                border: 'none',
                borderRadius: '3px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(0.9)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none'
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
