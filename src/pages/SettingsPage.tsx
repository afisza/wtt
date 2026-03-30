import { useNavigate } from 'react-router'
import { useEffect, useState } from 'react'
import React from 'react'
import { basePath } from '@/lib/apiBase'
import { useTheme } from '@/contexts/ThemeContext'
import { Settings, Sun, Moon, ChevronRight, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import ConfigTab from '@/components/settings/ConfigTab'
import InfoTab from '@/components/settings/InfoTab'
import RateTab from '@/components/settings/RateTab'
import AssignersTab from '@/components/settings/AssignersTab'
import ClientsTab from '@/components/settings/ClientsTab'
import TwoFactorTab from '@/components/settings/TwoFactorTab'

const SettingsPage = (): React.ReactElement | null => {
  const navigate = useNavigate()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${basePath}/api/auth/verify`, {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          if (data.authenticated) {
            setIsAuthenticated(true)
            setLoading(false)
            return
          }
        }
      } catch { /* ignore */ }
      navigate('/')
    }
    checkAuth()
  }, [navigate])

  const handleLogout = async () => {
    try {
      await fetch(`${basePath}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch { /* ignore */ }
    navigate('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--app-bg)] pb-6">
        <div className="border-b px-4 py-3 mb-4">
          <div className="max-w-[1200px] mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Skeleton className="w-8 h-8 rounded" />
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-11 w-11 rounded-lg" />
              <Skeleton className="h-11 w-40 rounded-lg" />
              <Skeleton className="h-11 w-24 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="max-w-[1200px] mx-auto px-6 space-y-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] pb-6">
      {/* Header */}
      <header className="bg-[var(--app-bg)] border-b border-[var(--app-border)] px-4 py-3 mb-4">
        <div className="max-w-[1200px] mx-auto flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--app-accent)] rounded flex items-center justify-center">
              <Settings size={18} color="var(--app-accent-foreground)" />
            </div>
            <h1 className="text-base font-semibold text-[var(--app-text)] tracking-tight">
              Ustawienia
            </h1>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={toggleTheme}
              className="p-2.5 bg-[var(--app-card-alt)] text-[var(--app-text-muted)] border-2 border-[var(--app-border)] rounded-lg cursor-pointer flex items-center justify-center min-w-[44px] h-[44px] transition-all hover:brightness-95 hover:scale-105"
              title={isDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
            >
              {isDark ? <Sun size={20} color="#FBBF24" /> : <Moon size={20} color="var(--app-text-muted)" />}
            </button>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="border-2 border-[var(--app-accent)] text-[var(--app-accent)] bg-transparent hover:bg-[var(--app-accent)] hover:text-[var(--app-accent-foreground)] font-semibold transition-all hover:-translate-y-px whitespace-nowrap"
            >
              Powrót do kalendarza
            </Button>
            <Button
              onClick={handleLogout}
              className="bg-[var(--app-accent)] text-[var(--app-accent-foreground)] hover:brightness-90 hover:-translate-y-px font-semibold transition-all"
            >
              Wyloguj
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-6">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4" aria-label="Breadcrumb">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Kalendarz</span>
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Ustawienia</span>
        </nav>

        <Tabs defaultValue="config">
          <TabsList className="mb-3 flex-wrap h-auto gap-1">
            <TabsTrigger value="config" className="text-sm">Konfiguracja MySQL</TabsTrigger>
            <TabsTrigger value="info" className="text-sm">Informacje o bazie danych</TabsTrigger>
            <TabsTrigger value="rate" className="text-sm">Stawka godzinowa</TabsTrigger>
            <TabsTrigger value="assigners" className="text-sm">Osoby zlecające</TabsTrigger>
            <TabsTrigger value="clients" className="text-sm">Klienci</TabsTrigger>
            <TabsTrigger value="2fa" className="text-sm">2FA</TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <ConfigTab />
          </TabsContent>

          <TabsContent value="info">
            <InfoTab />
          </TabsContent>

          <TabsContent value="rate">
            <RateTab />
          </TabsContent>

          <TabsContent value="assigners">
            <AssignersTab />
          </TabsContent>

          <TabsContent value="clients">
            <ClientsTab />
          </TabsContent>

          <TabsContent value="2fa">
            <TwoFactorTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default SettingsPage
