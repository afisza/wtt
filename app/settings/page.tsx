'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import React from 'react'
import Cookies from 'js-cookie'
import { useTheme } from '@/contexts/ThemeContext'
import { Plus, Edit2, Trash2, Upload, X, Check, User } from 'lucide-react'

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

const SettingsPage = (): JSX.Element | null => {
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
  const [dbInfo, setDbInfo] = useState<{ size: string; tables: TableInfo[] } | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(false)
  const [initResult, setInitResult] = useState<{ success: boolean; message?: string; alreadyExists?: boolean } | null>(null)
  
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
      const response = await fetch('/api/settings/db-config')
      if (response.ok) {
        const data = await response.json()
        if (data.config) {
          setConfig(data.config)
          setHasPassword(data.hasPassword)
        }
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
  }, [])

  useEffect(() => {
    const token = Cookies.get('auth_token')
    if (!token) {
      router.push('/')
      return
    }
    setIsAuthenticated(true)
    setLoading(false)
    loadConfig()
    // Load hourly rate from localStorage
    const savedRate = localStorage.getItem('hourlyRate')
    if (savedRate) {
      setHourlyRate(savedRate)
    }
    // Load assigners
    loadAssigners()
  }, [router, loadConfig])
  
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
      const response = await fetch('/api/assigners')
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
      
      const response = await fetch('/api/assigners/upload', {
        method: 'POST',
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
      const response = await fetch('/api/assigners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch('/api/assigners', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(`/api/assigners?id=${id}`, {
        method: 'DELETE'
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
      const response = await fetch('/api/settings/db-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      const response = await fetch('/api/settings/db-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
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
      const response = await fetch('/api/settings/db-info')
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
      const response = await fetch('/api/settings/db-init', {
        method: 'POST',
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
      background: '#141414',
      paddingBottom: '24px',
      transition: 'background-color 0.3s ease'
    }}>
      {/* Header */}
      <header style={{
        background: '#141414',
        borderBottom: '1px solid #2a2a2a',
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
                background: '#d22f27',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '16px' }}>⚙️</span>
              </div>
              <h1 style={{ 
                fontSize: '16px', 
                fontWeight: '600',
                color: '#ffffff',
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
                background: isDark ? '#374151' : 'transparent',
                color: isDark ? '#FBBF24' : '#6B7280',
                border: `2px solid ${isDark ? '#4B5563' : '#E5E7EB'}`,
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
                e.currentTarget.style.background = isDark ? '#4B5563' : '#F3F4F6'
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDark ? '#374151' : 'transparent'
                e.currentTarget.style.transform = 'scale(1)'
              }}
              title={isDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => router.push('/')}
              style={{ 
                padding: '10px 16px', 
                background: isDark ? '#374151' : 'white',
                color: '#d22f27',
                border: '2px solid #d22f27',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#d22f27'
                e.currentTarget.style.color = 'white'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDark ? '#374151' : 'white'
                e.currentTarget.style.color = '#d22f27'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Powrót do kalendarza
            </button>
            <button
              onClick={handleLogout}
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
                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#DC2626'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(239, 68, 68, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#d22f27'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(239, 68, 68, 0.2)'
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
          background: '#141414',
          borderRadius: '4px',
          padding: '4px',
          border: '1px solid #2a2a2a',
          display: 'inline-flex',
          gap: '4px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setActiveTab('config')}
            style={{
              padding: '6px 12px',
              background: activeTab === 'config' 
                ? '#d22f27' 
                : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: activeTab === 'config' ? '500' : '400',
              color: activeTab === 'config' ? '#ffffff' : '#888',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'config') {
                e.currentTarget.style.background = isDark ? '#374151' : '#F3F4F6'
                e.currentTarget.style.color = '#d22f27'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'config') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = isDark ? '#E5E7EB' : '#6B7280'
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
              padding: '12px 24px',
              background: activeTab === 'info' 
                ? '#d22f27' 
                : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: activeTab === 'info' ? '600' : '500',
              color: activeTab === 'info' ? 'white' : (isDark ? '#E5E7EB' : '#6B7280'),
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'info') {
                e.currentTarget.style.background = isDark ? '#374151' : '#F3F4F6'
                e.currentTarget.style.color = '#d22f27'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'info') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = isDark ? '#E5E7EB' : '#6B7280'
              }
            }}
          >
            Informacje o bazie danych
          </button>
          <button
            onClick={() => setActiveTab('rate')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'rate' 
                ? '#d22f27' 
                : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: activeTab === 'rate' ? '600' : '500',
              color: activeTab === 'rate' ? 'white' : (isDark ? '#E5E7EB' : '#6B7280'),
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'rate') {
                e.currentTarget.style.background = isDark ? '#374151' : '#F3F4F6'
                e.currentTarget.style.color = '#d22f27'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'rate') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = isDark ? '#E5E7EB' : '#6B7280'
              }
            }}
          >
            Stawka godzinowa
          </button>
          <button
            onClick={() => setActiveTab('assigners')}
            style={{
              padding: '12px 24px',
              background: activeTab === 'assigners' 
                ? '#d22f27' 
                : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: activeTab === 'assigners' ? '600' : '500',
              color: activeTab === 'assigners' ? 'white' : (isDark ? '#E5E7EB' : '#6B7280'),
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'assigners') {
                e.currentTarget.style.background = isDark ? '#374151' : '#F3F4F6'
                e.currentTarget.style.color = '#d22f27'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'assigners') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = isDark ? '#E5E7EB' : '#6B7280'
              }
            }}
          >
            Osoby zlecające
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            style={{
              padding: '8px 16px',
              background: activeTab === 'clients' 
                ? '#d22f27' 
                : 'transparent',
              border: 'none',
              borderRadius: '4px',
              fontSize: '15px',
              fontWeight: activeTab === 'clients' ? '600' : '500',
              color: activeTab === 'clients' ? 'white' : (isDark ? '#E5E7EB' : '#6B7280'),
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'clients') {
                e.currentTarget.style.background = isDark ? '#374151' : '#F3F4F6'
                e.currentTarget.style.color = '#d22f27'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'clients') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = isDark ? '#E5E7EB' : '#6B7280'
              }
            }}
          >
            Klienci
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ 
          background: '#141414', 
          padding: '16px', 
          borderRadius: '4px', 
          border: '1px solid #2a2a2a'
        }}>
        {activeTab === 'config' && (
          <div>
            <h2 style={{ 
              marginBottom: '24px',
              fontSize: '22px',
              fontWeight: '700',
              color: isDark ? '#F9FAFB' : '#1F2937',
              letterSpacing: '-0.5px'
            }}>
              Konfiguracja połączenia MySQL
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: '#374151',
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
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: '#F9FAFB',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'white'
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E5E7EB'
                    e.target.style.background = '#F9FAFB'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: '#374151',
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
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: '#F9FAFB',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'white'
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E5E7EB'
                    e.target.style.background = '#F9FAFB'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: '#374151',
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
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: '#F9FAFB',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'white'
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E5E7EB'
                    e.target.style.background = '#F9FAFB'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: '#374151',
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
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: '#F9FAFB',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'white'
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E5E7EB'
                    e.target.style.background = '#F9FAFB'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {hasPassword && (
                  <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '6px' }}>
                    {config.password ? 'Zostanie zapisane nowe hasło' : 'Pozostaw puste aby użyć zapisanego hasła przy teście połączenia'}
                  </p>
                )}
                {!hasPassword && !config.password && (
                  <p style={{ fontSize: '12px', color: '#d22f27', marginTop: '6px' }}>
                    ⚠️ Hasło jest wymagane do połączenia z bazą danych
                  </p>
                )}
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600',
                  color: '#374151',
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
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '15px',
                    background: '#F9FAFB',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#d22f27'
                    e.target.style.background = 'white'
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E5E7EB'
                    e.target.style.background = '#F9FAFB'
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
                      <span style={{ fontSize: '20px' }}>✓</span>
                      <strong style={{ fontSize: '15px' }}>
                        Połączenie z bazą danych zostało nawiązane pomyślnie!
                      </strong>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '20px' }}>✗</span>
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
              color: isDark ? '#F9FAFB' : '#1F2937',
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
                    color: isDark ? '#F9FAFB' : '#1F2937',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ 
                margin: 0,
                fontSize: '22px',
                fontWeight: '700',
                color: '#1F2937',
                letterSpacing: '-0.5px'
              }}>
                Informacje o bazie danych
              </h2>
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

            {initResult && (
              <div style={{
                padding: '16px 20px',
                borderRadius: '10px',
                background: initResult.success 
                  ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' 
                  : 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
                border: `2px solid ${initResult.success ? '#10B981' : '#d22f27'}`,
                color: initResult.success ? '#065F46' : '#991B1B',
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>{initResult.success ? '✓' : '✗'}</span>
                  <strong style={{ fontSize: '15px' }}>{initResult.message}</strong>
                </div>
              </div>
            )}
            
            {infoLoading ? (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center',
                color: '#6B7280',
                fontSize: '15px'
              }}>
                Ładowanie informacji...
              </div>
            ) : dbInfo ? (
              <div>
                <div style={{ 
                  marginBottom: '32px',
                  padding: '20px',
                  background: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)',
                  borderRadius: '12px',
                  border: '2px solid #C084FC'
                }}>
                  <h3 style={{ 
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#6B7280',
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
                </div>

                <div>
                  <h3 style={{ 
                    marginBottom: '16px',
                    fontSize: '18px',
                    fontWeight: '700',
                    color: '#1F2937'
                  }}>
                    Tabele w bazie danych
                  </h3>
                  <div style={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
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
                              color: '#9CA3AF',
                              fontSize: '14px'
                            }}>
                              Brak tabel w bazie danych
                            </td>
                          </tr>
                        ) : (
                          dbInfo.tables.map((table, index) => (
                            <tr key={index} style={{ 
                              background: index % 2 === 0 ? '#fff' : '#F9FAFB',
                              transition: 'background-color 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#EDE9FE'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = index % 2 === 0 ? '#fff' : '#F9FAFB'
                            }}
                            >
                              <td style={{ 
                                padding: '14px 16px', 
                                border: 'none',
                                borderBottom: '1px solid #E5E7EB',
                                fontWeight: '600',
                                color: '#1F2937'
                              }}>
                                {table.name}
                              </td>
                              <td style={{ 
                                padding: '14px 16px', 
                                textAlign: 'right', 
                                border: 'none',
                                borderBottom: '1px solid #E5E7EB',
                                color: '#6B7280'
                              }}>
                                {table.rows.toLocaleString()}
                              </td>
                              <td style={{ 
                                padding: '14px 16px', 
                                textAlign: 'right', 
                                border: 'none',
                                borderBottom: '1px solid #E5E7EB',
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
                      background: 'white',
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
                      e.currentTarget.style.background = 'white'
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
                  background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                  border: '2px solid #F59E0B',
                  marginBottom: '24px'
                }}>
                  <p style={{ 
                    color: '#92400E', 
                    marginBottom: '12px', 
                    fontWeight: '700',
                    fontSize: '15px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>⚠️</span> Nie można pobrać informacji o bazie danych
                  </p>
                  <p style={{ color: '#92400E', fontSize: '14px', marginBottom: '8px' }}>
                    Upewnij się, że:
                  </p>
                  <ul style={{ 
                    color: '#92400E', 
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
              color: isDark ? '#F9FAFB' : '#1F2937',
              letterSpacing: '-0.5px'
            }}>
              Osoby zlecające
            </h2>
            
            {/* Formularz dodawania */}
            <div style={{ 
              marginBottom: '24px', 
              padding: '16px', 
              background: isDark ? '#1a1a1a' : '#F9FAFB',
              borderRadius: '8px',
              border: '1px solid #2a2a2a'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937', marginBottom: '12px' }}>
                Dodaj nową osobę zlecającą
              </h3>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                {/* Awatar preview/upload */}
                <div style={{ position: 'relative' }}>
                  {newAssignerAvatar ? (
                    <img
                      src={newAssignerAvatar}
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
                        color: isDark ? '#F9FAFB' : '#1F2937',
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
                background: isDark ? '#1a1a1a' : '#F9FAFB',
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
                      background: isDark ? '#1a1a1a' : '#F9FAFB',
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
                          src={assigner.avatar}
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
                            color: isDark ? '#F9FAFB' : '#1F2937',
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
                          <div style={{ fontSize: '16px', fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937', marginBottom: '4px' }}>
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
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [editingClientName, setEditingClientName] = useState('')
  const [editingClientLogo, setEditingClientLogo] = useState('')

  useEffect(() => {
    loadClients()
    // Sprawdź czy trzeba przeprowadzić migrację
    checkAndMigrateData()
  }, [])

  const checkAndMigrateData = async () => {
    try {
      // Sprawdź czy są dane bez klienta
      const response = await fetch('/api/clients/migrate', {
        method: 'POST',
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
      const response = await fetch('/api/clients')
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

      const response = await fetch('/api/clients/upload', {
        method: 'POST',
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
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName.trim(), logo: newClientLogo }),
      })

      if (response.ok) {
        const newClient = await response.json()
        setClients([...clients, newClient])
        setNewClientName('')
        setNewClientLogo('')
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
      const response = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editingClientName.trim(), logo: editingClientLogo }),
      })

      if (response.ok) {
        await loadClients()
        setEditingClient(null)
        setEditingClientName('')
        setEditingClientLogo('')
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
      const response = await fetch(`/api/clients?id=${id}`, {
        method: 'DELETE',
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
  }

  const handleCancelEdit = () => {
    setEditingClient(null)
    setEditingClientName('')
    setEditingClientLogo('')
  }

  return (
    <div>
      <h2 style={{ 
        marginBottom: '24px',
        fontSize: '22px',
        fontWeight: '700',
        color: isDark ? '#F9FAFB' : '#1F2937',
        letterSpacing: '-0.5px'
      }}>
        Klienci
      </h2>
      
      {/* Formularz dodawania */}
      <div style={{ 
        marginBottom: '24px', 
        padding: '16px', 
        background: isDark ? '#1a1a1a' : '#F9FAFB',
        borderRadius: '8px',
        border: '1px solid #2a2a2a'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937', marginBottom: '12px' }}>
          Dodaj nowego klienta
        </h3>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {/* Logo preview/upload */}
          <div style={{ position: 'relative' }}>
            {newClientLogo ? (
              <img
                src={newClientLogo}
                alt="Preview"
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '4px',
                  objectFit: 'cover',
                  border: '2px solid #d22f27'
                }}
              />
            ) : (
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '4px',
                background: '#2a2a2a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed #888'
              }}>
                <User size={24} color="#888" />
              </div>
            )}
            <label style={{
              position: 'absolute',
              bottom: '-8px',
              right: '-8px',
              background: '#d22f27',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: '2px solid #141414'
            }}>
              <Upload size={12} color="white" />
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
                background: '#1a1a1a',
                color: '#ffffff',
                border: '1px solid #2a2a2a',
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
                background: '#d22f27',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: uploadingLogo ? 'not-allowed' : 'pointer',
                opacity: uploadingLogo ? 0.6 : 1
              }}
            >
              <Plus size={14} color="#ffffff" style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} />
              Dodaj klienta
            </button>
          </div>
        </div>
      </div>

      {/* Lista klientów */}
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937', marginBottom: '12px' }}>
          Lista klientów ({clients.length})
        </h3>
        {clientsLoading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
            Ładowanie...
          </div>
        ) : clients.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
            Brak klientów
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {clients.map((client) => (
              <div
                key={client.id}
                style={{
                  padding: '16px',
                  background: isDark ? '#1a1a1a' : '#F9FAFB',
                  borderRadius: '8px',
                  border: '1px solid #2a2a2a',
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
                          src={editingClientLogo}
                          alt="Preview"
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '4px',
                            objectFit: 'cover',
                            border: '2px solid #d22f27'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '4px',
                          background: '#2a2a2a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '2px dashed #888'
                        }}>
                          <User size={24} color="#888" />
                        </div>
                      )}
                      <label style={{
                        position: 'absolute',
                        bottom: '-8px',
                        right: '-8px',
                        background: '#d22f27',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        border: '2px solid #141414'
                      }}>
                        <Upload size={12} color="white" />
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
                    <input
                      type="text"
                      value={editingClientName}
                      onChange={(e) => setEditingClientName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '15px',
                        background: '#1a1a1a',
                        color: '#ffffff',
                        border: '1px solid #d22f27',
                        borderRadius: '4px',
                        outline: 'none'
                      }}
                    />
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
                        src={client.logo}
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
                        background: '#d22f27',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        fontWeight: '600',
                        color: '#ffffff'
                      }}>
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '600', color: isDark ? '#F9FAFB' : '#1F2937' }}>
                        {client.name}
                      </div>
                    </div>
                    <button
                      onClick={() => handleEdit(client)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        color: '#d22f27',
                        border: '1px solid #d22f27',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      <Edit2 size={14} color="#d22f27" />
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
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={14} color="#EF4444" />
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
