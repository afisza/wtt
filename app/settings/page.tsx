'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import React from 'react'
import Cookies from 'js-cookie'
import { basePath, assetUrl } from '@/lib/apiBase'
import { useTheme } from '@/contexts/ThemeContext'
import { Plus, Edit2, Trash2, Upload, X, Check, User, Settings, Sun, Moon, CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'

interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

interface TestResult {
  success: boolean
  error?: string
  details?: string
}

interface TableInfo {
  name: string
  rows: number
  size: string
}

const SettingsPage = (): React.ReactElement | null => {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'config' | 'info' | 'rate' | 'assigners' | 'clients'>('config')
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  
  // Database config state
  const [config, setConfig] = useState<Partial<DatabaseConfig>>({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
  })
  const [hasPassword, setHasPassword] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  
  // Database info state
  const [dbInfo, setDbInfo] = useState<{ size: string; tables: TableInfo[]; limitedPrivileges?: boolean; message?: string } | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(false)
  const [initResult, setInitResult] = useState<{ success: boolean; message?: string; alreadyExists?: boolean } | null>(null)
  const [migrateLoading, setMigrateLoading] = useState(false)
  const [migrateResult, setMigrateResult] = useState<{ 
    success: boolean
    message?: string
    migrated?: { days: number; tasks: number }
    progress?: { total: number; current: number; percentage: number; stage: string; details?: any }
    details?: {
      clientsProcessed: number
      monthsProcessed: number
      daysWithTasks: number
      daysSkipped: number
      tasksAdded: number
      tasksUpdated: number
      tasksDeleted: number
      errors: string[]
      errorsCount: number
    }
    debug?: any
  } | null>(null)
  const [storageMode, setStorageMode] = useState<'mysql' | 'json'>('mysql')
  
  // Hourly rate state
  const [hourlyRate, setHourlyRate] = useState<string>('')
  
  // Assigners state
  const [assigners, setAssigners] = useState<any[]>([])
  const [assignersLoading, setAssignersLoading] = useState(false)
  const [editingAssigner, setEditingAssigner] = useState<any | null>(null)
  const [newAssignerName, setNewAssignerName] = useState('')
  const [newAssignerAvatar, setNewAssignerAvatar] = useState<string | undefined>(undefined)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch(`${basePath}/api/settings/db-config`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Settings - Loaded config data:', data)
        if (data.config) {
          setConfig({
            host: data.config.host || '',
            port: data.config.port || 3306,
            user: data.config.user || '',
            password: '', // Hasło nie jest zwracane z API ze względów bezpieczeństwa
            database: data.config.database || '',
          })
          setHasPassword(data.hasPassword || false)
          console.log('Settings - Config loaded:', {
            host: data.config.host,
            port: data.config.port,
            user: data.config.user,
            database: data.config.database,
            hasPassword: data.hasPassword
          })
        } else {
          console.log('Settings - No config found in response')
        }
      } else {
        console.error('Settings - Failed to load config:', response.status)
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      // Sprawdź czy token istnieje
      const token = Cookies.get('auth_token')
      if (!token) {
        router.push('/')
        return
      }

      // Weryfikuj token przez API
      try {
        const response = await fetch(`${basePath}/api/auth/verify`, {
          credentials: 'include',
        })
        
        if (!response.ok) {
          // Token nieprawidłowy - przekieruj do logowania
          Cookies.remove('auth_token', { path: '/' })
          router.push('/')
          return
        }

        const data = await response.json()
        if (!data.authenticated) {
          // Token nieprawidłowy - przekieruj do logowania
          Cookies.remove('auth_token', { path: '/' })
          router.push('/')
          return
        }

        // Token poprawny - załaduj dane
        setIsAuthenticated(true)
        setLoading(false)
        loadConfig()
        loadStorageMode()
        // Load hourly rate from localStorage
        const savedRate = localStorage.getItem('hourlyRate')
        if (savedRate) {
          setHourlyRate(savedRate)
        }
        // Load assigners
        loadAssigners()
      } catch (error) {
        console.error('Error verifying auth:', error)
        Cookies.remove('auth_token', { path: '/' })
        router.push('/')
      }
    }
    
    checkAuth()
  }, [router, loadConfig])

  const loadStorageMode = async () => {
    try {
      const response = await fetch(`${basePath}/api/settings/storage-mode`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setStorageMode(data.mode || 'mysql')
      }
    } catch (error) {
      console.error('Error loading storage mode:', error)
    }
  }

  const handleStorageModeChange = async (mode: 'mysql' | 'json') => {
    try {
      const response = await fetch(`${basePath}/api/settings/storage-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode })
      })
      if (response.ok) {
        setStorageMode(mode)
        alert(`Tryb przechowywania zmieniony na: ${mode === 'mysql' ? 'MySQL' : 'JSON'}`)
      } else {
        alert('Błąd podczas zmiany trybu przechowywania')
      }
    } catch (error) {
      console.error('Error changing storage mode:', error)
      alert('Błąd podczas zmiany trybu przechowywania')
    }
  }

  const handleMigrateJSONToMySQL = async () => {
    if (!confirm('Czy na pewno chcesz zmigrować wszystkie dane z JSON do MySQL? Ta operacja może zająć chwilę.')) {
      return
    }

    setMigrateLoading(true)
    setMigrateResult(null)

    try {
      const response = await fetch(`${basePath}/api/settings/migrate-json-to-mysql`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await response.json()
      setMigrateResult(data)

      if (data.success) {
        // Odśwież informacje o bazie danych
        setTimeout(() => {
          loadDatabaseInfo()
        }, 1000)
      }
    } catch (error: any) {
      console.error('Migration error:', error)
      setMigrateResult({ success: false, message: error.message || 'Błąd podczas migracji' })
      alert('Błąd podczas migracji danych')
    } finally {
      setMigrateLoading(false)
    }
  }
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      // This will be handled by individual components
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])
  
  const loadAssigners = async () => {
    setAssignersLoading(true)
    try {
      const response = await fetch(`${basePath}/api/assigners`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setAssigners(data)
      }
    } catch (error) {
      console.error('Error loading assigners:', error)
    } finally {
      setAssignersLoading(false)
    }
  }
  
  const handleUploadAvatar = async (file: File, assignerId?: string) => {
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch(`${basePath}/api/assigners/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })
      
      if (response.ok) {
        const data = await response.json()
        return data.avatar
      } else {
        const error = await response.json()
        alert(`Błąd uploadowania: ${error.error}`)
        return null
      }
    } catch (error) {
      alert('Błąd podczas uploadowania awatara')
      return null
    } finally {
      setUploadingAvatar(false)
    }
  }
  
  const handleCreateAssigner = async () => {
    if (!newAssignerName.trim()) {
      alert('Podaj nazwę osoby zlecającej')
      return
    }
    
    try {
      const response = await fetch(`${basePath}/api/assigners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newAssignerName, avatar: newAssignerAvatar })
      })
      
      if (response.ok) {
        await loadAssigners()
        setNewAssignerName('')
        setNewAssignerAvatar(undefined)
        window.dispatchEvent(new Event('assignerUpdated'))
      } else {
        const error = await response.json()
        alert(`Błąd: ${error.error}${error.details ? '\nSzczegóły: ' + error.details : ''}`)
      }
    } catch (error: any) {
      console.error('Error creating assigner:', error)
      alert(`Błąd podczas tworzenia osoby zlecającej: ${error.message || 'Nieznany błąd'}`)
    }
  }
  
  const handleUpdateAssigner = async (id: string, name: string, avatar?: string) => {
    try {
      const response = await fetch(`${basePath}/api/assigners`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, name, avatar })
      })
      
      if (response.ok) {
        await loadAssigners()
        setEditingAssigner(null)
        window.dispatchEvent(new Event('assignerUpdated'))
      } else {
        const error = await response.json()
        alert(`Błąd: ${error.error}`)
      }
    } catch (error) {
      alert('Błąd podczas aktualizacji osoby zlecającej')
    }
  }
  
  const handleDeleteAssigner = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę osobę zlecającą?')) {
      return
    }
    
    try {
      const response = await fetch(`${basePath}/api/assigners?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      
      if (response.ok) {
        await loadAssigners()
        window.dispatchEvent(new Event('assignerUpdated'))
      } else {
        const error = await response.json()
        alert(`Błąd: ${error.error}`)
      }
    } catch (error) {
      alert('Błąd podczas usuwania osoby zlecającej')
    }
  }
  
  const handleSaveHourlyRate = () => {
    if (hourlyRate) {
      localStorage.setItem('hourlyRate', hourlyRate)
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event('hourlyRateUpdated'))
      alert('Stawka godzinowa zapisana pomyślnie!')
    } else {
      localStorage.removeItem('hourlyRate')
      window.dispatchEvent(new Event('hourlyRateUpdated'))
      alert('Stawka godzinowa usunięta!')
    }
  }

  const handleSaveConfig = async () => {
    setConfigLoading(true)
    setTestResult(null)
    
    try {
      const response = await fetch(`${basePath}/api/settings/db-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(config),
      })
      
      const data = await response.json()
      
      if (response.ok) {
        alert('Konfiguracja zapisana pomyślnie!')
        await loadConfig()
      } else {
        alert(`Błąd: ${data.error}`)
      }
    } catch (error) {
      alert('Wystąpił błąd podczas zapisywania konfiguracji')
    } finally {
      setConfigLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setTestLoading(true)
    setTestResult(null)
    
    try {
      const response = await fetch(`${basePath}/api/settings/db-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(config),
      })
      
      const data = await response.json()
      setTestResult(data)
    } catch (error) {
      setTestResult({ success: false, error: 'Wystąpił błąd podczas testowania połączenia' })
    } finally {
      setTestLoading(false)
    }
  }

  const loadDatabaseInfo = async () => {
    setInfoLoading(true)
    setDbInfo(null)
    try {
      const response = await fetch(`${basePath}/api/settings/db-info`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setDbInfo(data)
      } else {
        const error = await response.json()
        console.error('Database info error:', error)
        // Nie pokazuj alertu, tylko wyświetl komunikat w interfejsie
        setDbInfo(null)
      }
    } catch (error: any) {
      console.error('Error loading database info:', error)
      setDbInfo(null)
    } finally {
      setInfoLoading(false)
    }
  }

  const initializeDatabase = async () => {
    setInitLoading(true)
    setInitResult(null)
    try {
      const response = await fetch(`${basePath}/api/settings/db-init`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json()
      
      if (response.ok) {
        setInitResult({ success: true, message: data.message, alreadyExists: data.alreadyExists })
        // Odśwież informacje o bazie danych
        setTimeout(() => {
          loadDatabaseInfo()
        }, 1000)
      } else {
        setInitResult({ success: false, message: data.error || 'Błąd inicjalizacji bazy danych' })
      }
    } catch (error: any) {
      setInitResult({ success: false, message: 'Wystąpił błąd podczas inicjalizacji bazy danych' })
    } finally {
      setInitLoading(false)
    }
  }

  const handleLogout = () => {
    Cookies.remove('auth_token')
    router.push('/')
  }

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>Ładowanie...</div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'var(--app-bg)',
      paddingBottom: '24px'
    }}>
      {/* Header */}
      <header style={{
        background: 'var(--app-bg)',
        borderBottom: '1px solid var(--app-border)',
        padding: '12px 16px',
        marginBottom: '16px'
      }}>
          <div style={{ 
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                background: 'var(--app-accent)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Settings size={18} color="var(--app-accent-foreground)" />
              </div>
              <h1 style={{ 
                fontSize: '16px', 
                fontWeight: '600',
                color: 'var(--app-text)',
                letterSpacing: '-0.3px'
              }}>
                Ustawienia
              </h1>
            </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {/* Dark Theme Toggle */}
            <button
              onClick={toggleTheme}
              style={{
                padding: '10px',
                background: 'var(--app-card-alt)',
                color: 'var(--app-text-muted)',
                border: '2px solid var(--app-border)',
                borderRadius: '8px',
                fontSize: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '44px',
                height: '44px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(0.95)'
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none'
                e.currentTarget.style.transform = 'scale(1)'
              }}
              title={isDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
            >
              {isDark ? <Sun size={20} color="#FBBF24" /> : <Moon size={20} color="var(--app-text-muted)" />}
            </button>
            <button
              onClick={() => router.push('/')}
              style={{ 
                padding: '10px 16px', 
                background: 'transparent',
                color: 'var(--app-accent)',
                border: '2px solid var(--app-accent)',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--app-accent)'
                e.currentTarget.style.color = 'var(--app-accent-foreground)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--app-accent)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Powrót do kalendarza
            </button>
            <button
              onClick={handleLogout}
              style={{ 
                padding: '10px 20px', 
                background: 'var(--app-accent)',
                color: 'var(--app-accent-foreground)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(0.9)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Wyloguj
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        {/* Tabs */}
        <div style={{ 
          marginBottom: '12px',
          background: 'var(--app-bg)',
          borderRadius: '4px',
          padding: '4px',
          border: '1px solid var(--app-border)',
          display: 'inline-flex',
          gap: '4px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setActiveTab('config')}
            style={{
              padding: '6px 12px',
              background: activeTab === 'config' ? 'var(--app-accent)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'config' ? '600' : '500',
              color: activeTab === 'config' ? 'var(--app-accent-foreground)' : 'var(--app-text-muted)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'config') {
                e.currentTarget.style.background = 'var(--app-card-alt)'
                e.currentTarget.style.color = 'var(--app-accent)'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'config') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--app-text-muted)'
              }
            }}
          >
            Konfiguracja MySQL
          </button>
          <button
            onClick={() => {
              setActiveTab('info')
              if (!dbInfo) {
                loadDatabaseInfo()
              }
            }}
            style={{
              padding: '6px 12px',
              background: activeTab === 'info' ? 'var(--app-accent)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'info' ? '600' : '500',
              color: activeTab === 'info' ? 'var(--app-accent-foreground)' : 'var(--app-text-muted)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'info') {
                e.currentTarget.style.background = 'var(--app-card-alt)'
                e.currentTarget.style.color = 'var(--app-accent)'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'info') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--app-text-muted)'
              }
            }}
          >
            Informacje o bazie danych
          </button>
          <button
            onClick={() => setActiveTab('rate')}
            style={{
              padding: '6px 12px',
              background: activeTab === 'rate' ? 'var(--app-accent)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'rate' ? '600' : '500',
              color: activeTab === 'rate' ? 'var(--app-accent-foreground)' : 'var(--app-text-muted)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'rate') {
                e.currentTarget.style.background = 'var(--app-card-alt)'
                e.currentTarget.style.color = 'var(--app-accent)'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'rate') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--app-text-muted)'
              }
            }}
          >
            Stawka godzinowa
          </button>
          <button
            onClick={() => setActiveTab('assigners')}
            style={{
              padding: '6px 12px',
              background: activeTab === 'assigners' ? 'var(--app-accent)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'assigners' ? '600' : '500',
              color: activeTab === 'assigners' ? 'var(--app-accent-foreground)' : 'var(--app-text-muted)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'assigners') {
                e.currentTarget.style.background = 'var(--app-card-alt)'
                e.currentTarget.style.color = 'var(--app-accent)'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'assigners') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--app-text-muted)'
              }
            }}
          >
            Osoby zlecające
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            style={{
              padding: '6px 12px',
              background: activeTab === 'clients' ? 'var(--app-accent)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'clients' ? '600' : '500',
              color: activeTab === 'clients' ? 'var(--app-accent-foreground)' : 'var(--app-text-muted)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'clients') {
                e.currentTarget.style.background = 'var(--app-card-alt)'
                e.currentTarget.style.color = 'var(--app-accent)'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'clients') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--app-text-muted)'
              }
            }}
          >
            Klienci
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ 
          background: 'var(--app-card)', 
          padding: '16px', 
          borderRadius: '4px', 
          border: '1px solid var(--app-border)'
        }}>
        {activeTab === 'config' && (
          <div>
            <h2 style={{ 
              marginBottom: '24px',
              fontSize: '22px',
              fontWeight: '700',
              color: 'var(--app-text)',
              letterSpacing: '-0.5px'
            }}>
              Konfiguracja połączenia MySQL
            </h2>

            {/* Tryb przechowywania danych */}
            <div style={{ 
              marginBottom: '32px', 
              padding: '20px', 
              background: 'var(--app-card-alt)',
              borderRadius: '12px',
              border: `1px solid ${'var(--app-border)'}`
            }}>
              <h3 style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: 'var(--app-text)', 
                marginBottom: '16px' 
              }}>
                Tryb przechowywania danych
              </h3>
              <p style={{ 
                fontSize: '13px', 
                color: 'var(--app-text-muted)', 
                marginBottom: '16px',
                lineHeight: '1.6'
              }}>
                Wybierz sposób przechowywania danych zadań i czasu pracy. 
                MySQL oferuje lepszą wydajność i skalowalność, JSON jest prostszy w konfiguracji.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleStorageModeChange('mysql')}
                  style={{
                    padding: '12px 24px',
                    background: storageMode === 'mysql' 
                      ? '#d22f27' 
                      : (isDark ? '#2a2a2a' : '#ffffff'),
                    color: storageMode === 'mysql' 
                      ? '#ffffff' 
                      : ('var(--app-text)'),
                    border: `2px solid ${storageMode === 'mysql' ? '#d22f27' : ('var(--app-border)')}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    if (storageMode !== 'mysql') {
                      e.currentTarget.style.borderColor = '#d22f27'
                      e.currentTarget.style.background = 'var(--app-card-alt)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (storageMode !== 'mysql') {
                      e.currentTarget.style.borderColor = 'var(--app-border)'
                      e.currentTarget.style.background = 'var(--app-card-alt)'
                    }
                  }}
                >
                  {storageMode === 'mysql' && <CheckCircle2 size={16} color="#ffffff" />}
                  <span>MySQL (domyślny)</span>
                </button>
                <button
                  onClick={() => handleStorageModeChange('json')}
                  style={{
                    padding: '12px 24px',
                    background: storageMode === 'json' 
                      ? '#d22f27' 
                      : (isDark ? '#2a2a2a' : '#ffffff'),
                    color: storageMode === 'json' 
                      ? '#ffffff' 
                      : ('var(--app-text)'),
                    border: `2px solid ${storageMode === 'json' ? '#d22f27' : ('var(--app-border)')}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => {
                    if (storageMode !== 'json') {
                      e.currentTarget.style.borderColor = '#d22f27'
                      e.currentTarget.style.background = 'var(--app-card-alt)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (storageMode !== 'json') {
                      e.currentTarget.style.borderColor = 'var(--app-border)'
                      e.currentTarget.style.background = 'var(--app-card-alt)'
                    }
                  }}
                >
                  {storageMode === 'json' && <CheckCircle2 size={16} color="#ffffff" />}
                  <span>JSON (plik)</span>
                </button>
              </div>
              {storageMode === 'mysql' && (
                <p style={{ 
                  fontSize: '12px', 
                  color: isDark ? '#10B981' : '#059669', 
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Info size={14} color={isDark ? '#10B981' : '#059669'} />
                  <span>Dane będą zapisywane do bazy danych MySQL. Upewnij się, że konfiguracja jest poprawna.</span>
                </p>
              )}
              {storageMode === 'json' && (
                <p style={{ 
                  fontSize: '12px', 
                  color: isDark ? '#FBBF24' : '#D97706', 
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} color={isDark ? '#FBBF24' : '#D97706'} />
                  <span>Dane będą zapisywane do pliku JSON (data/work-time.json). MySQL nie będzie używany.</span>
                </p>
              )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: isDark ? '#F9FAFB' : '#374151',
                  fontSize: '14px'
                }}>
                  Host
                </label>
                <input
                  type="text"
                  value={config.host || ''}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  placeholder="np. localhost lub adres IP"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: `2px solid ${'var(--app-border)'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(210, 47, 39, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--app-border)'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: isDark ? '#F9FAFB' : '#374151',
                  fontSize: '14px'
                }}>
                  Port
                </label>
                <input
                  type="number"
                  value={config.port || 3306}
                  onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 3306 })}
                  placeholder="3306"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: `2px solid ${'var(--app-border)'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(210, 47, 39, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--app-border)'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: isDark ? '#F9FAFB' : '#374151',
                  fontSize: '14px'
                }}>
                  Użytkownik
                </label>
                <input
                  type="text"
                  value={config.user || ''}
                  onChange={(e) => setConfig({ ...config, user: e.target.value })}
                  placeholder="np. root"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: `2px solid ${'var(--app-border)'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(210, 47, 39, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--app-border)'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: isDark ? '#F9FAFB' : '#374151',
                  fontSize: '14px'
                }}>
                  Hasło {!config.password && hasPassword && <span style={{ color: '#d22f27', fontSize: '12px', fontWeight: '400' }}>(użyje zapisanego)</span>}
                </label>
                <input
                  type="password"
                  value={config.password || ''}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  placeholder={hasPassword ? 'Wprowadź nowe hasło lub pozostaw puste' : 'Wprowadź hasło'}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: `2px solid ${'var(--app-border)'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(210, 47, 39, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--app-border)'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {hasPassword && (
                  <p style={{ fontSize: '12px', color: 'var(--app-text-muted)', marginTop: '6px' }}>
                    {config.password ? 'Zostanie zapisane nowe hasło' : 'Pozostaw puste aby użyć zapisanego hasła przy teście połączenia'}
                  </p>
                )}
                {!hasPassword && !config.password && (
                  <p style={{ fontSize: '12px', color: '#d22f27', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={12} color="#d22f27" />
                    <span>Hasło jest wymagane do połączenia z bazą danych</span>
                  </p>
                )}
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: isDark ? '#F9FAFB' : '#374151',
                  fontSize: '14px'
                }}>
                  Nazwa bazy danych
                </label>
                <input
                  type="text"
                  value={config.database || ''}
                  onChange={(e) => setConfig({ ...config, database: e.target.value })}
                  placeholder="np. wtt"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: `2px solid ${'var(--app-border)'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(210, 47, 39, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--app-border)'
                    e.target.style.background = 'var(--app-card-alt)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={handleTestConnection}
                  disabled={testLoading || !config.host || !config.database}
                  style={{
                    padding: '12px 24px',
                    background: testLoading || !config.host || !config.database 
                      ? '#D1D5DB' 
                      : 'white',
                    color: testLoading || !config.host || !config.database 
                      ? '#9CA3AF' 
                      : '#d22f27',
                    border: `2px solid ${testLoading || !config.host || !config.database ? '#D1D5DB' : '#d22f27'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: testLoading || !config.host || !config.database ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!testLoading && config.host && config.database) {
                      e.currentTarget.style.background = '#d22f27'
                      e.currentTarget.style.color = 'white'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!testLoading && config.host && config.database) {
                      e.currentTarget.style.background = 'white'
                      e.currentTarget.style.color = '#d22f27'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }
                  }}
                >
                  {testLoading ? 'Testowanie...' : 'Testuj połączenie'}
                </button>

                <button
                  onClick={handleSaveConfig}
                  disabled={configLoading || !config.host || !config.database}
                  style={{
                    padding: '12px 24px',
                    background: configLoading || !config.host || !config.database 
                      ? '#D1D5DB' 
                      : '#d22f27',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: configLoading || !config.host || !config.database ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: configLoading || !config.host || !config.database 
                      ? 'none' 
                      : '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    if (!configLoading && config.host && config.database) {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(139, 92, 246, 0.3)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!configLoading && config.host && config.database) {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
                    }
                  }}
                >
                  {configLoading ? 'Zapisywanie...' : 'Zapisz konfigurację'}
                </button>
              </div>

              {testResult && (
                <div style={{
                  padding: '16px 20px',
                  borderRadius: '10px',
                  background: testResult.success 
                    ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' 
                    : 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
                  color: testResult.success ? '#065F46' : '#991B1B',
                  border: `2px solid ${testResult.success ? '#10B981' : '#d22f27'}`,
                  marginTop: '16px'
                }}>
                  {testResult.success ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <CheckCircle2 size={20} color={isDark ? '#D1FAE5' : '#065F46'} />
                      <strong style={{ fontSize: '15px' }}>
                        Połączenie z bazą danych zostało nawiązane pomyślnie!
                      </strong>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <XCircle size={20} color={isDark ? '#FEE2E2' : '#991B1B'} />
                        <strong style={{ fontSize: '15px' }}>Błąd połączenia:</strong>
                      </div>
                      <p style={{ marginTop: '8px', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                        {testResult.error}
                      </p>
                      {testResult.details && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          background: 'rgba(0,0,0,0.05)',
                          borderRadius: '6px',
                          fontSize: '13px',
                          whiteSpace: 'pre-line',
                          lineHeight: '1.6'
                        }}>
                          {testResult.details}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          )}

        {activeTab === 'rate' && (
          <div>
            <h2 style={{ 
              marginBottom: '24px',
              fontSize: '22px',
              fontWeight: '700',
              color: 'var(--app-text)',
              letterSpacing: '-0.5px'
            }}>
              Stawka godzinowa
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: isDark ? '#D1D5DB' : '#374151',
                  fontSize: '14px'
                }}>
                  Stawka za godzinę (zł)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="np. 50.00"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: `2px solid ${isDark ? '#374151' : '#E5E7EB'}`,
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: isDark ? '#111827' : '#F9FAFB',
                    color: 'var(--app-text)',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = isDark ? '#1F2937' : 'white'
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = isDark ? '#374151' : '#E5E7EB'
                    e.target.style.background = isDark ? '#111827' : '#F9FAFB'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
              
              <button
                onClick={handleSaveHourlyRate}
                style={{
                  padding: '12px 24px',
                  background: '#d22f27',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(139, 92, 246, 0.3)',
                  alignSelf: 'flex-start'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(139, 92, 246, 0.3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
                }}
              >
                Zapisz stawkę godzinową
              </button>
            </div>
          </div>
        )}

        {activeTab === 'info' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ 
                margin: 0,
                fontSize: '22px',
                fontWeight: '700',
                color: 'var(--app-text)',
                letterSpacing: '-0.5px'
              }}>
                Informacje o bazie danych
              </h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleMigrateJSONToMySQL}
                  disabled={migrateLoading}
                  style={{
                    padding: '10px 20px',
                    background: migrateLoading 
                      ? '#D1D5DB' 
                      : '#10B981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: migrateLoading ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    boxShadow: migrateLoading 
                      ? 'none' 
                      : '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    if (!migrateLoading) {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(16, 185, 129, 0.3)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!migrateLoading) {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
                    }
                  }}
                >
                  {migrateLoading ? 'Migrowanie...' : 'Migruj JSON → MySQL'}
                </button>
                <button
                  onClick={initializeDatabase}
                  disabled={initLoading}
                  style={{
                    padding: '10px 20px',
                    background: initLoading 
                      ? '#D1D5DB' 
                      : '#d22f27',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: initLoading ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    boxShadow: initLoading 
                      ? 'none' 
                      : '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    if (!initLoading) {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(139, 92, 246, 0.3)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!initLoading) {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
                    }
                  }}
                >
                  {initLoading ? 'Tworzenie...' : 'Utwórz tabele'}
                </button>
              </div>
            </div>

            {migrateLoading && (
              <div style={{
                padding: '20px',
                borderRadius: '10px',
                background: isDark ? '#1F2937' : '#F9FAFB',
                border: '2px solid #10B981',
                marginBottom: '24px'
              }}>
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: isDark ? '#D1FAE5' : '#065F46' }}>
                    Migracja w toku...
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: isDark ? '#D1FAE5' : '#065F46' }}>
                    {migrateResult?.progress?.percentage || 0}%
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '24px',
                  background: isDark ? '#374151' : '#E5E7EB',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  <div style={{
                    width: `${migrateResult?.progress?.percentage || 0}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
                    transition: 'width 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {migrateResult?.progress?.percentage || 0}%
                  </div>
                </div>
                {migrateResult?.progress?.stage && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: isDark ? '#9CA3AF' : '#6B7280' }}>
                    {migrateResult.progress.stage}
                  </div>
                )}
              </div>
            )}

            {migrateResult && !migrateLoading && (
              <div style={{
                padding: '20px',
                borderRadius: '10px',
                background: migrateResult.success 
                  ? (isDark ? 'linear-gradient(135deg, #064E3B 0%, #065F46 100%)' : 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)')
                  : (isDark ? 'linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%)' : 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)'),
                border: `2px solid ${migrateResult.success ? '#10B981' : '#d22f27'}`,
                color: migrateResult.success 
                  ? (isDark ? '#D1FAE5' : '#065F46')
                  : (isDark ? '#FEE2E2' : '#991B1B'),
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  {migrateResult.success ? (
                    <CheckCircle2 size={20} color={isDark ? '#D1FAE5' : '#065F46'} />
                  ) : (
                    <XCircle size={20} color={isDark ? '#FEE2E2' : '#991B1B'} />
                  )}
                  <strong style={{ fontSize: '15px' }}>{migrateResult.message}</strong>
                </div>

                {migrateResult.migrated && (
                  <div style={{ marginBottom: '16px', padding: '12px', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Podsumowanie migracji:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '13px' }}>
                      <div>Dni: <strong>{migrateResult.migrated.days}</strong></div>
                      <div>Zadania: <strong>{migrateResult.migrated.tasks}</strong></div>
                    </div>
                  </div>
                )}

                {migrateResult.details && (
                  <div style={{ marginBottom: '16px', padding: '12px', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Szczegóły migracji:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '13px' }}>
                      <div>Klienci: <strong>{migrateResult.details.clientsProcessed}</strong></div>
                      <div>Miesiące: <strong>{migrateResult.details.monthsProcessed}</strong></div>
                      <div>Dni z zadaniami: <strong>{migrateResult.details.daysWithTasks}</strong></div>
                      <div>Dni pominięte: <strong>{migrateResult.details.daysSkipped}</strong></div>
                      <div>Zadania dodane: <strong style={{ color: '#10B981' }}>{migrateResult.details.tasksAdded}</strong></div>
                      <div>Zadania zaktualizowane: <strong style={{ color: '#F59E0B' }}>{migrateResult.details.tasksUpdated}</strong></div>
                      <div>Zadania usunięte: <strong style={{ color: '#d22f27' }}>{migrateResult.details.tasksDeleted || 0}</strong></div>
                      <div>Błędy: <strong style={{ color: migrateResult.details.errorsCount > 0 ? '#d22f27' : '#10B981' }}>{migrateResult.details.errorsCount}</strong></div>
                    </div>
                  </div>
                )}

                {migrateResult.details?.errors && migrateResult.details.errors.length > 0 && (
                  <div style={{ marginTop: '16px', padding: '12px', background: isDark ? 'rgba(127, 29, 29, 0.3)' : 'rgba(254, 242, 242, 0.8)', borderRadius: '8px', border: '1px solid #d22f27' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#d22f27' }}>Błędy podczas migracji:</div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '12px' }}>
                      {migrateResult.details.errors.map((error: string, index: number) => (
                        <div key={index} style={{ marginBottom: '4px', padding: '4px 8px', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)', borderRadius: '4px' }}>
                          {error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {migrateResult.debug && (
                  <details style={{ marginTop: '16px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: '600', padding: '8px', background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)', borderRadius: '4px' }}>
                      Szczegóły debugowania (kliknij, aby rozwinąć)
                    </summary>
                    <pre style={{ 
                      marginTop: '8px', 
                      padding: '12px', 
                      background: isDark ? '#1F2937' : '#F9FAFB', 
                      borderRadius: '8px', 
                      overflow: 'auto', 
                      fontSize: '11px',
                      maxHeight: '400px',
                      color: isDark ? '#D1D5DB' : '#374151',
                      border: '1px solid',
                      borderColor: isDark ? '#374151' : '#E5E7EB'
                    }}>
                      {JSON.stringify(migrateResult.debug, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {initResult && (
              <div style={{
                padding: '16px 20px',
                borderRadius: '10px',
                background: initResult.success 
                  ? (isDark ? 'linear-gradient(135deg, #064E3B 0%, #065F46 100%)' : 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)')
                  : (isDark ? 'linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%)' : 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)'),
                border: `2px solid ${initResult.success ? '#10B981' : '#d22f27'}`,
                color: initResult.success 
                  ? (isDark ? '#D1FAE5' : '#065F46')
                  : (isDark ? '#FEE2E2' : '#991B1B'),
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {initResult.success ? (
                    <CheckCircle2 size={20} color={isDark ? '#D1FAE5' : '#065F46'} />
                  ) : (
                    <XCircle size={20} color={isDark ? '#FEE2E2' : '#991B1B'} />
                  )}
                  <strong style={{ fontSize: '15px' }}>{initResult.message}</strong>
                </div>
              </div>
            )}

            {infoLoading ? (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center',
                color: 'var(--app-text-muted)',
                fontSize: '15px'
              }}>
                Ładowanie informacji...
              </div>
            ) : dbInfo ? (
              <div>
                <div style={{ 
                  marginBottom: '32px',
                  padding: '20px',
                  background: isDark 
                    ? 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)'
                    : 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)',
                  borderRadius: '12px',
                  border: `2px solid ${isDark ? '#2a2a2a' : '#C084FC'}`
                }}>
                  <h3 style={{ 
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--app-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Rozmiar bazy danych
                  </h3>
                  <p style={{ 
                    fontSize: '28px', 
                    fontWeight: '700', 
                    color: '#d22f27',
                    margin: 0
                  }}>
                    {dbInfo.size}
                  </p>
                  {dbInfo.limitedPrivileges && dbInfo.message && (
                    <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--app-text-muted)' }}>
                      {dbInfo.message}
                    </p>
                  )}
                </div>

                <div>
                  <h3 style={{ 
                    marginBottom: '16px',
                    fontSize: '18px',
                    fontWeight: '700',
                    color: 'var(--app-text)'
                  }}>
                    Tabele w bazie danych
                  </h3>
                  <div style={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: `1px solid ${'var(--app-border)'}`,
                    boxShadow: isDark ? '0 1px 3px 0 rgba(0, 0, 0, 0.3)' : '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ 
                            padding: '14px 16px', 
                            textAlign: 'left', 
                            border: 'none',
                            background: '#d22f27',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '13px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Nazwa tabeli
                          </th>
                          <th style={{ 
                            padding: '14px 16px', 
                            textAlign: 'right', 
                            border: 'none',
                            background: '#d22f27',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '13px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Liczba wierszy
                          </th>
                          <th style={{ 
                            padding: '14px 16px', 
                            textAlign: 'right', 
                            border: 'none',
                            background: '#d22f27',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '13px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Rozmiar
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbInfo.tables.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ 
                              padding: '32px', 
                              textAlign: 'center', 
                              color: isDark ? '#666' : '#9CA3AF',
                              fontSize: '14px',
                              background: isDark ? '#1a1a1a' : '#fff'
                            }}>
                              Brak tabel w bazie danych
                            </td>
                          </tr>
                        ) : (
                          dbInfo.tables.map((table, index) => (
                            <tr key={index} style={{ 
                              background: index % 2 === 0 
                                ? (isDark ? '#1a1a1a' : '#fff')
                                : (isDark ? '#141414' : '#F9FAFB'),
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = isDark ? '#2a2a2a' : '#EDE9FE'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = index % 2 === 0 
                                ? (isDark ? '#1a1a1a' : '#fff')
                                : (isDark ? '#141414' : '#F9FAFB')
                            }}
                            >
                              <td style={{ 
                                padding: '14px 16px', 
                                border: 'none',
                                borderBottom: `1px solid ${'var(--app-border)'}`,
                                fontWeight: '600',
                                color: 'var(--app-text)'
                              }}>
                                {table.name}
                              </td>
                              <td style={{ 
                                padding: '14px 16px', 
                                textAlign: 'right', 
                                border: 'none',
                                borderBottom: `1px solid ${'var(--app-border)'}`,
                                color: 'var(--app-text-muted)'
                              }}>
                                {table.rows.toLocaleString()}
                              </td>
                              <td style={{ 
                                padding: '14px 16px', 
                                textAlign: 'right', 
                                border: 'none',
                                borderBottom: `1px solid ${'var(--app-border)'}`,
                                color: '#d22f27',
                                fontWeight: '600'
                              }}>
                                {table.size}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <button
                    onClick={loadDatabaseInfo}
                    style={{
                      padding: '10px 20px',
                      background: isDark ? '#1a1a1a' : 'white',
                      color: '#d22f27',
                      border: '2px solid #d22f27',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#d22f27'
                      e.currentTarget.style.color = 'white'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isDark ? '#1a1a1a' : 'white'
                      e.currentTarget.style.color = '#d22f27'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    Odśwież informacje
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '32px' }}>
                <div style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: isDark 
                    ? 'linear-gradient(135deg, #78350F 0%, #92400E 100%)'
                    : 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                  border: '2px solid #F59E0B',
                  marginBottom: '24px'
                }}>
                  <p style={{ 
                    color: isDark ? '#FDE68A' : '#92400E', 
                    marginBottom: '12px', 
                    fontWeight: '700',
                    fontSize: '15px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={16} color={isDark ? '#FDE68A' : '#92400E'} />
                    <span>Nie można pobrać informacji o bazie danych</span>
                  </p>
                  <p style={{ color: isDark ? '#FDE68A' : '#92400E', fontSize: '14px', marginBottom: '8px' }}>
                    Upewnij się, że:
                  </p>
                  <ul style={{ 
                    color: isDark ? '#FDE68A' : '#92400E', 
                    fontSize: '14px', 
                    marginTop: '8px', 
                    paddingLeft: '20px',
                    lineHeight: '1.8'
                  }}>
                    <li>Konfiguracja MySQL została zapisana</li>
                    <li>Połączenie testowe zakończyło się sukcesem</li>
                    <li>Użytkownik ma uprawnienia do odczytu informacji o bazie</li>
                  </ul>
                </div>
                <button
                  onClick={loadDatabaseInfo}
                  style={{
                    padding: '10px 20px',
                    background: '#d22f27',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(139, 92, 246, 0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(139, 92, 246, 0.3)'
                  }}
                >
                  Spróbuj ponownie
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'assigners' && (
          <div>
            <h2 style={{ 
              marginBottom: '24px',
              fontSize: '22px',
              fontWeight: '700',
              color: 'var(--app-text)',
              letterSpacing: '-0.5px'
            }}>
              Osoby zlecające
            </h2>
            
            {/* Formularz dodawania */}
            <div style={{ 
              marginBottom: '24px', 
              padding: '16px', 
              background: 'var(--app-card-alt)',
              borderRadius: '8px',
              border: '1px solid #2a2a2a'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--app-text)', marginBottom: '12px' }}>
                Dodaj nową osobę zlecającą
              </h3>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                {/* Awatar preview/upload */}
                <div style={{ position: 'relative' }}>
                  {newAssignerAvatar ? (
                    <img
                      src={assetUrl(newAssignerAvatar)}
                      alt="Preview"
                      style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid #d22f27'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: '#d22f27',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '24px',
                      fontWeight: '600'
                    }}>
                      ?
                    </div>
                  )}
                  <label
                    style={{
                      position: 'absolute',
                      bottom: '-4px',
                      right: '-4px',
                      background: '#d22f27',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      border: '2px solid #141414'
                    }}
                    title="Dodaj awatar"
                  >
                    <Upload size={12} color="white" />
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const avatar = await handleUploadAvatar(file)
                          if (avatar) {
                            setNewAssignerAvatar(avatar)
                          }
                        }
                      }}
                    />
                  </label>
                  {newAssignerAvatar && (
                    <button
                      onClick={() => setNewAssignerAvatar(undefined)}
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        background: '#EF4444',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        border: '2px solid #141414',
                        padding: 0
                      }}
                      title="Usuń awatar"
                    >
                      <X size={10} color="white" />
                    </button>
                  )}
                </div>
                
                {/* Formularz */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: isDark ? '#D1D5DB' : '#374151', marginBottom: '4px', fontWeight: '500' }}>
                      Nazwa
                    </label>
                    <input
                      type="text"
                      value={newAssignerName}
                      onChange={(e) => setNewAssignerName(e.target.value)}
                      placeholder="np. Jan Kowalski"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateAssigner()
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
                        borderRadius: '6px',
                        fontSize: '14px',
                        background: isDark ? '#111827' : 'white',
                        color: 'var(--app-text)',
                        outline: 'none'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#d22f27'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = isDark ? '#374151' : '#E5E7EB'
                      }}
                    />
                  </div>
                  <button
                    onClick={handleCreateAssigner}
                    disabled={uploadingAvatar}
                    style={{
                      padding: '8px 16px',
                      background: uploadingAvatar ? '#6B7280' : '#d22f27',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                      alignSelf: 'flex-start'
                    }}
                    onMouseEnter={(e) => {
                      if (!uploadingAvatar) {
                        e.currentTarget.style.background = '#b0251f'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!uploadingAvatar) {
                        e.currentTarget.style.background = '#d22f27'
                      }
                    }}
                  >
                    {uploadingAvatar ? (
                      <>⏳ Uploadowanie...</>
                    ) : (
                      <>
                        <Plus size={16} color="#ffffff" />
                        Dodaj
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Lista osób zlecających */}
            {assignersLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280', fontSize: '15px' }}>
                Ładowanie...
              </div>
            ) : assigners.length === 0 ? (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                color: '#6B7280', 
                fontSize: '15px',
                background: 'var(--app-card-alt)',
                borderRadius: '8px',
                border: '1px solid #2a2a2a'
              }}>
                Brak osób zlecających. Dodaj pierwszą osobę powyżej.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {assigners.map((assigner) => (
                  <div
                    key={assigner.id}
                    style={{
                      padding: '16px',
                      background: 'var(--app-card-alt)',
                      borderRadius: '8px',
                      border: '1px solid #2a2a2a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px'
                    }}
                  >
                    {/* Awatar */}
                    <div style={{ position: 'relative' }}>
                      {assigner.avatar ? (
                        <img
                          src={assetUrl(assigner.avatar)}
                          alt={assigner.name}
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid #d22f27'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '50%',
                          background: '#d22f27',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '24px',
                          fontWeight: '600'
                        }}>
                          {assigner.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {editingAssigner?.id === assigner.id && (
                        <label
                          style={{
                            position: 'absolute',
                            bottom: '-4px',
                            right: '-4px',
                            background: '#d22f27',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            border: '2px solid #141414'
                          }}
                        >
                          <Upload size={12} color="white" />
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                const avatar = await handleUploadAvatar(file, assigner.id)
                                if (avatar) {
                                  handleUpdateAssigner(assigner.id, editingAssigner.name, avatar)
                                }
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {/* Nazwa */}
                    {editingAssigner?.id === assigner.id ? (
                      <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editingAssigner.name}
                          onChange={(e) => setEditingAssigner({ ...editingAssigner, name: e.target.value })}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            border: '1px solid #d22f27',
                            borderRadius: '4px',
                            fontSize: '14px',
                            background: isDark ? '#111827' : 'white',
                            color: 'var(--app-text)',
                            outline: 'none'
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleUpdateAssigner(assigner.id, editingAssigner.name, editingAssigner.avatar)}
                          style={{
                            padding: '6px 12px',
                            background: '#10B981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px'
                          }}
                        >
                          <Check size={14} color="#ffffff" />
                        </button>
                        <button
                          onClick={() => setEditingAssigner(null)}
                          style={{
                            padding: '6px 12px',
                            background: '#EF4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px'
                          }}
                        >
                          <X size={14} color="#ffffff" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--app-text)', marginBottom: '4px' }}>
                            {assigner.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6B7280' }}>
                            Utworzono: {new Date(assigner.createdAt).toLocaleDateString('pl-PL')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => setEditingAssigner({ ...assigner })}
                            style={{
                              padding: '8px 12px',
                              background: 'transparent',
                              color: '#d22f27',
                              border: '1px solid #d22f27',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '13px',
                              fontWeight: '500'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#d22f27'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = '#d22f27'
                            }}
                          >
                            <Edit2 size={14} color="#d22f27" />
                            Edytuj
                          </button>
                          <button
                            onClick={() => handleDeleteAssigner(assigner.id)}
                            style={{
                              padding: '8px 12px',
                              background: 'transparent',
                              color: '#EF4444',
                              border: '1px solid #EF4444',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '13px',
                              fontWeight: '500'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#EF4444'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = '#EF4444'
                            }}
                          >
                            <Trash2 size={14} color="#EF4444" />
                            Usuń
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'clients' && (
          <ClientsSection isDark={isDark} />
        )}
        </div>
      </div>
    </div>
  )
}

// Komponent sekcji klientów
function ClientsSection({ isDark }: { isDark: boolean }) {
  const [clients, setClients] = useState<any[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [editingClient, setEditingClient] = useState<number | null>(null)
  const [newClientName, setNewClientName] = useState('')
  const [newClientLogo, setNewClientLogo] = useState('')
  const [newClientWebsite, setNewClientWebsite] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [editingClientName, setEditingClientName] = useState('')
  const [editingClientLogo, setEditingClientLogo] = useState('')
  const [editingClientWebsite, setEditingClientWebsite] = useState('')

  useEffect(() => {
    loadClients()
    // Sprawdź czy trzeba przeprowadzić migrację
    checkAndMigrateData()
  }, [])

  const checkAndMigrateData = async () => {
    try {
      // Sprawdź czy są dane bez klienta
      const response = await fetch(`${basePath}/api/clients/migrate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          if (result.updatedRows > 0) {
            alert(`Migracja zakończona: ${result.updatedRows} dni pracy zostało przypisanych do klienta "Best Market"`)
          } else if (result.clientId) {
            // Utworzono klienta dla istniejących danych JSON
            console.log('Client "Best Market" created for existing data')
          }
          loadClients()
        }
      }
    } catch (error) {
      console.error('Migration check error:', error)
    }
  }

  const loadClients = async () => {
    setClientsLoading(true)
    try {
      const response = await fetch(`${basePath}/api/clients`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setClients(data)
      }
    } catch (error) {
      console.error('Error loading clients:', error)
      alert('Błąd podczas ładowania klientów')
    } finally {
      setClientsLoading(false)
    }
  }

  const handleUploadLogo = async (file: File, isEdit: boolean = false) => {
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${basePath}/api/clients/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        if (isEdit) {
          setEditingClientLogo(data.url)
        } else {
          setNewClientLogo(data.url)
        }
      } else {
        const error = await response.json()
        alert(error.details || 'Błąd podczas uploadu logo')
      }
    } catch (error) {
      console.error('Error uploading logo:', error)
      alert('Błąd podczas uploadu logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      alert('Nazwa klienta jest wymagana')
      return
    }

    try {
      const response = await fetch(`${basePath}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newClientName.trim(), logo: newClientLogo, website: newClientWebsite.trim() }),
      })

      if (response.ok) {
        const newClient = await response.json()
        setClients([...clients, newClient])
        setNewClientName('')
        setNewClientLogo('')
        setNewClientWebsite('')
        window.dispatchEvent(new Event('clientUpdated'))
        alert('Klient został dodany')
      } else {
        const error = await response.json()
        alert(error.details || 'Błąd podczas tworzenia klienta')
      }
    } catch (error) {
      console.error('Error creating client:', error)
      alert('Błąd podczas tworzenia klienta')
    }
  }

  const handleUpdateClient = async (id: number) => {
    if (!editingClientName.trim()) {
      alert('Nazwa klienta jest wymagana')
      return
    }

    try {
      const response = await fetch(`${basePath}/api/clients`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, name: editingClientName.trim(), logo: editingClientLogo, website: editingClientWebsite.trim() }),
      })

      if (response.ok) {
        await loadClients()
        setEditingClient(null)
        setEditingClientName('')
        setEditingClientLogo('')
        setEditingClientWebsite('')
        window.dispatchEvent(new Event('clientUpdated'))
        alert('Klient został zaktualizowany')
      } else {
        const error = await response.json()
        alert(error.details || 'Błąd podczas aktualizacji klienta')
      }
    } catch (error) {
      console.error('Error updating client:', error)
      alert('Błąd podczas aktualizacji klienta')
    }
  }

  const handleDeleteClient = async (id: number) => {
    if (!confirm('Czy na pewno chcesz usunąć tego klienta? Wszystkie powiązane dane zostaną usunięte.')) {
      return
    }

    try {
      const response = await fetch(`${basePath}/api/clients?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        await loadClients()
        window.dispatchEvent(new Event('clientUpdated'))
        alert('Klient został usunięty')
      } else {
        const error = await response.json()
        alert(error.details || 'Błąd podczas usuwania klienta')
      }
    } catch (error) {
      console.error('Error deleting client:', error)
      alert('Błąd podczas usuwania klienta')
    }
  }

  const handleEdit = (client: any) => {
    setEditingClient(client.id)
    setEditingClientName(client.name)
    setEditingClientLogo(client.logo || '')
    setEditingClientWebsite(client.website || '')
  }

  const handleCancelEdit = () => {
    setEditingClient(null)
    setEditingClientName('')
    setEditingClientLogo('')
    setEditingClientWebsite('')
  }

  return (
    <div>
      <h2 style={{ 
        marginBottom: '24px',
        fontSize: '22px',
        fontWeight: '700',
        color: 'var(--app-text)',
        letterSpacing: '-0.5px'
      }}>
        Klienci
      </h2>
      
      {/* Formularz dodawania */}
      <div style={{ 
        marginBottom: '24px', 
        padding: '16px', 
        background: 'var(--app-card-alt)',
        borderRadius: '8px',
        border: '1px solid var(--app-border)'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--app-text)', marginBottom: '12px' }}>
          Dodaj nowego klienta
        </h3>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {/* Logo preview/upload */}
          <div style={{ position: 'relative' }}>
            {newClientLogo ? (
              <img
                src={assetUrl(newClientLogo)}
                alt="Preview"
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '4px',
                  objectFit: 'cover',
                  border: '2px solid var(--app-accent)'
                }}
              />
            ) : (
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '4px',
                background: 'var(--app-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed var(--app-border)'
              }}>
                <User size={24} style={{ color: 'var(--app-text-muted)' }} />
              </div>
            )}
            <label style={{
              position: 'absolute',
              bottom: '-8px',
              right: '-8px',
              background: 'var(--app-accent)',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: '2px solid var(--app-bg)'
            }}>
              <Upload size={12} style={{ color: 'var(--app-accent-foreground)' }} />
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUploadLogo(file, false)
                }}
              />
            </label>
            {newClientLogo && (
              <button
                onClick={() => setNewClientLogo('')}
                style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: '#EF4444',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: 'none',
                  padding: 0
                }}
              >
                <X size={12} color="white" />
              </button>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Nazwa klienta..."
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '15px',
                background: 'var(--app-card)',
                color: 'var(--app-text)',
                border: '1px solid var(--app-border)',
                borderRadius: '4px',
                marginBottom: '8px',
                outline: 'none'
              }}
            />
            <input
              type="url"
              value={newClientWebsite}
              onChange={(e) => setNewClientWebsite(e.target.value)}
              placeholder="Adres strony www (opcjonalnie)..."
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '15px',
                background: 'var(--app-card)',
                color: 'var(--app-text)',
                border: '1px solid var(--app-border)',
                borderRadius: '4px',
                marginBottom: '8px',
                outline: 'none'
              }}
            />
            <button
              onClick={handleCreateClient}
              disabled={uploadingLogo}
              style={{
                padding: '6px 12px',
                background: 'var(--app-accent)',
                color: 'var(--app-accent-foreground)',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: uploadingLogo ? 'not-allowed' : 'pointer',
                opacity: uploadingLogo ? 0.6 : 1
              }}
            >
              <Plus size={14} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle', color: 'var(--app-accent-foreground)' }} />
              Dodaj klienta
            </button>
          </div>
        </div>
      </div>

      {/* Lista klientów */}
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--app-text)', marginBottom: '12px' }}>
          Lista klientów ({clients.length})
        </h3>
        {clientsLoading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--app-text-muted)' }}>
            Ładowanie...
          </div>
        ) : clients.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--app-text-muted)' }}>
            Brak klientów
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {clients.map((client) => (
              <div
                key={client.id}
                style={{
                  padding: '16px',
                  background: 'var(--app-card-alt)',
                  borderRadius: '8px',
                  border: '1px solid var(--app-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                {editingClient === client.id ? (
                  <>
                    <div style={{ position: 'relative' }}>
                      {editingClientLogo ? (
                        <img
                          src={assetUrl(editingClientLogo)}
                          alt="Preview"
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '4px',
                            objectFit: 'cover',
                            border: '2px solid var(--app-accent)'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '4px',
                          background: 'var(--app-card)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '2px dashed var(--app-border)'
                        }}>
                          <User size={24} style={{ color: 'var(--app-text-muted)' }} />
                        </div>
                      )}
                      <label style={{
                        position: 'absolute',
                        bottom: '-8px',
                        right: '-8px',
                        background: 'var(--app-accent)',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        border: '2px solid var(--app-bg)'
                      }}>
                        <Upload size={12} style={{ color: 'var(--app-accent-foreground)' }} />
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleUploadLogo(file, true)
                          }}
                        />
                      </label>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="text"
                        value={editingClientName}
                        onChange={(e) => setEditingClientName(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          fontSize: '15px',
                          background: 'var(--app-card)',
                          color: 'var(--app-text)',
                          border: '1px solid var(--app-accent)',
                          borderRadius: '4px',
                          outline: 'none'
                        }}
                      />
                      <input
                        type="url"
                        value={editingClientWebsite}
                        onChange={(e) => setEditingClientWebsite(e.target.value)}
                        placeholder="Adres strony www (opcjonalnie)..."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          fontSize: '15px',
                          background: 'var(--app-card)',
                          color: 'var(--app-text)',
                          border: '1px solid var(--app-accent)',
                          borderRadius: '4px',
                          outline: 'none'
                        }}
                      />
                    </div>
                    <button
                      onClick={() => handleUpdateClient(client.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#10B981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      <Check size={14} color="#ffffff" />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        color: '#EF4444',
                        border: '1px solid #EF4444',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      <X size={14} color="#EF4444" />
                    </button>
                  </>
                ) : (
                  <>
                    {client.logo ? (
                      <img
                        src={assetUrl(client.logo)}
                        alt={client.name}
                        style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '4px',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '4px',
                        background: 'var(--app-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        fontWeight: '600',
                        color: 'var(--app-accent-foreground)'
                      }}>
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--app-text)' }}>
                        {client.name}
                      </div>
                    </div>
                    <button
                      onClick={() => handleEdit(client)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        color: 'var(--app-accent)',
                        border: '1px solid var(--app-accent)',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Edit2 size={14} style={{ color: 'var(--app-accent)', flexShrink: 0 }} />
                      Edytuj
                    </button>
                    <button
                      onClick={() => handleDeleteClient(client.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        color: '#EF4444',
                        border: '1px solid #EF4444',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Trash2 size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                      Usuń
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsPage
