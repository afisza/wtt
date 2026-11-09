import { useEffect, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router';
import LoginForm from '@/components/LoginForm';
import ClientTabs from '@/components/ClientTabs';
import SaveIndicator from '@/components/SaveIndicator';
import { basePath } from '@/lib/apiBase';
import { markSessionRestored } from '@/lib/api';
import { Settings, LogOut, Calendar, Search, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const OnboardingTour = lazy(() => import('@/components/OnboardingTour'));

export default function HomePage() {
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    fetch(`${basePath}/api/auth/verify`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        setAuth(r.ok && data.authenticated === true ? 'in' : 'out');
      })
      .catch(() => setAuth('out'));
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${basePath}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    setAuth('out');
  };

  if (auth === 'checking') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <img
          src={`${basePath}/logo.png`}
          alt=""
          className="splash-logo h-12 w-12 rounded-xl object-contain"
        />
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      </div>
    );
  }

  if (auth === 'out') {
    return (
      <LoginForm
        onLogin={() => {
          markSessionRestored();
          setAuth('in');
        }}
      />
    );
  }

  return (
    <AppShell onLogout={handleLogout}>
      <ClientTabs />
      <Suspense fallback={null}>
        <OnboardingTour />
      </Suspense>
    </AppShell>
  );
}

export function AppShell({
  children,
  onLogout,
}: {
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const { theme, toggleTheme } = useTheme();

  const iconBtn =
    'grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={`${basePath}/logo.png`}
              alt=""
              className="h-7 w-7 rounded-md object-contain"
            />
            <span className="hidden font-display text-[15px] font-semibold sm:block">
              Afisza Time Tracker
            </span>
          </Link>

          <SaveIndicator className="ml-auto" />

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Nawigacja">
            <button
              type="button"
              onClick={toggleTheme}
              className={iconBtn}
              aria-label={theme === 'dark' ? 'Motyw jasny' : 'Motyw ciemny'}
              title={theme === 'dark' ? 'Motyw jasny' : 'Motyw ciemny'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link to="/settings" className={iconBtn} aria-label="Ustawienia" title="Ustawienia">
              <Settings className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className={iconBtn}
              aria-label="Wyloguj"
              title="Wyloguj"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 sm:pb-10">
        {children}
      </main>

      {/* Dolna nawigacja (mobile) */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t bg-background/95 backdrop-blur sm:hidden"
        aria-label="Nawigacja mobilna"
      >
        {[
          { label: 'Kalendarz', icon: Calendar, to: '/', active: true },
          {
            label: 'Szukaj',
            icon: Search,
            onClick: () =>
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })),
          },
          {
            label: theme === 'dark' ? 'Jasny' : 'Ciemny',
            icon: theme === 'dark' ? Sun : Moon,
            onClick: toggleTheme,
          },
          { label: 'Ustawienia', icon: Settings, to: '/settings' },
          { label: 'Wyloguj', icon: LogOut, onClick: onLogout },
        ].map((item) => {
          const cls = cn(
            'flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
            item.active ? 'text-highlight-ink' : 'text-muted-foreground',
          );
          const content = (
            <>
              <item.icon className="h-5 w-5" />
              {item.label}
            </>
          );
          return item.to ? (
            <Link
              key={item.label}
              to={item.to}
              className={cls}
              aria-current={item.active ? 'page' : undefined}
            >
              {content}
            </Link>
          ) : (
            <button key={item.label} type="button" onClick={item.onClick} className={cls}>
              {content}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
