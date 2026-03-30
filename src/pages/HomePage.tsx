import { useEffect, useState, lazy, Suspense } from 'react'
import { useNavigate, Link } from 'react-router'
import LoginForm from '@/components/LoginForm'
import ClientTabs from '@/components/ClientTabs'
const OnboardingTour = lazy(() => import('@/components/OnboardingTour'))
import { basePath } from '@/lib/apiBase'
import { Settings, LogOut, Menu, Calendar, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${basePath}/api/auth/verify`, {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setIsAuthenticated(data.authenticated === true)
        } else {
          setIsAuthenticated(false)
        }
      } catch {
        setIsAuthenticated(false)
      }
      setLoading(false)
    }
    checkAuth()
  }, [])

  const handleLogin = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = async () => {
    try {
      await fetch(`${basePath}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch { /* ignore */ }
    setIsAuthenticated(false)
    navigate('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <img
          src={`${basePath}/logo.png`}
          alt="Afisza Time Tracker"
          className="w-16 h-16 rounded-2xl object-contain splash-logo mb-4"
        />
        <h1 className="text-lg font-semibold text-foreground mb-1">Afisza Time Tracker</h1>
        <p className="text-sm text-muted-foreground">Ładowanie...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <img
              src={`${basePath}/logo.png`}
              alt="Afisza Time Tracker"
              className="w-8 h-8 rounded-lg object-contain"
            />
            <h1 className="text-sm font-semibold text-foreground hidden sm:block">
              Afisza Time Tracker
            </h1>
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-2">
            <Button variant="outline" size="sm" className="min-h-[44px]" asChild>
              <Link to="/settings">
                <Settings className="h-4 w-4 mr-2" />
                Ustawienia
              </Link>
            </Button>
            <Button variant="default" size="sm" className="min-h-[44px]" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Wyloguj
            </Button>
          </div>

          {/* Mobile hamburger */}
          <div className="sm:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Menu nawigacji">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-3 mt-6">
                  <Button variant="outline" className="justify-start min-h-[44px]" asChild>
                    <Link to="/settings">
                      <Settings className="h-4 w-4 mr-2" />
                      Ustawienia
                    </Link>
                  </Button>
                  <Button variant="destructive" className="justify-start min-h-[44px]" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Wyloguj
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-[1400px] mx-auto px-4 py-4 pb-20 sm:pb-4">
        <ClientTabs />
      </main>

      {/* Onboarding tour for new users */}
      <Suspense fallback={null}>
        <OnboardingTour />
      </Suspense>

      {/* Mobile bottom navigation */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t flex items-center justify-around py-1 safe-bottom"
        aria-label="Nawigacja mobilna"
      >
        <button
          className="flex flex-col items-center gap-0.5 p-2 min-h-[48px] min-w-[48px] text-primary"
          aria-label="Kalendarz"
          aria-current="page"
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] font-medium">Kalendarz</span>
        </button>
        <button
          className="flex flex-col items-center gap-0.5 p-2 min-h-[48px] min-w-[48px] text-muted-foreground"
          aria-label="Szukaj"
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
          }}
        >
          <Search className="h-5 w-5" />
          <span className="text-[10px] font-medium">Szukaj</span>
        </button>
        <Link
          to="/settings"
          className="flex flex-col items-center gap-0.5 p-2 min-h-[48px] min-w-[48px] text-muted-foreground"
          aria-label="Ustawienia"
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px] font-medium">Ustawienia</span>
        </Link>
        <button
          className="flex flex-col items-center gap-0.5 p-2 min-h-[48px] min-w-[48px] text-muted-foreground"
          onClick={handleLogout}
          aria-label="Wyloguj"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] font-medium">Wyloguj</span>
        </button>
      </nav>
    </div>
  )
}
