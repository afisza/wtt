import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  Users,
  UserCheck,
  Coins,
  ShieldCheck,
  KeyRound,
  Send,
  Database,
  Server,
} from 'lucide-react';
import { basePath } from '@/lib/apiBase';
import { Skeleton } from '@/components/ui/skeleton';
import { AppShell } from '@/pages/HomePage';
import ConfigTab from '@/components/settings/ConfigTab';
import InfoTab from '@/components/settings/InfoTab';
import RateTab from '@/components/settings/RateTab';
import AssignersTab from '@/components/settings/AssignersTab';
import ClientsTab from '@/components/settings/ClientsTab';
import TwoFactorTab from '@/components/settings/TwoFactorTab';
import ApiTab from '@/components/settings/ApiTab';
import TelegramTab from '@/components/settings/TelegramTab';
import { cn } from '@/lib/utils';
import { appVersion } from '@/lib/version';

const WhatsNewDialog = lazy(() => import('@/components/WhatsNewDialog'));

const TABS = [
  { id: 'clients', label: 'Klienci', icon: Users, Component: ClientsTab },
  { id: 'assigners', label: 'Osoby zlecające', icon: UserCheck, Component: AssignersTab },
  { id: 'rate', label: 'Stawka godzinowa', icon: Coins, Component: RateTab },
  { id: '2fa', label: 'Weryfikacja 2FA', icon: ShieldCheck, Component: TwoFactorTab },
  { id: 'api', label: 'Dostęp API', icon: KeyRound, Component: ApiTab },
  { id: 'telegram', label: 'Telegram', icon: Send, Component: TelegramTab },
  { id: 'config', label: 'Połączenie MySQL', icon: Server, Component: ConfigTab },
  { id: 'info', label: 'Baza danych', icon: Database, Component: InfoTab },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [ready, setReady] = useState(false);

  const requested = params.get('tab') as TabId | null;
  const active: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : 'clients';

  useEffect(() => {
    fetch(`${basePath}/api/auth/verify`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.authenticated) setReady(true);
        else navigate('/');
      })
      .catch(() => navigate('/'));
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await fetch(`${basePath}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    navigate('/');
  };

  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const current = TABS.find((t) => t.id === active)!;

  return (
    <AppShell onLogout={handleLogout}>
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="grid h-9 w-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Wróć do kalendarza"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-semibold">Ustawienia</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr] md:gap-10">
        <nav
          aria-label="Sekcje ustawień"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setParams({ tab: tab.id }, { replace: true })}
              aria-current={active === tab.id ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                active === tab.id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <tab.icon className={cn('h-4 w-4', active === tab.id && 'text-highlight-ink')} />
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setWhatsNewOpen(true)}
            className="hidden items-center gap-2 px-3 pt-6 text-left text-xs text-muted-foreground transition-colors hover:text-foreground md:flex"
          >
            Wersja {appVersion || '—'} ·{' '}
            <span className="underline underline-offset-2">Co nowego</span>
          </button>
        </nav>

        <section aria-label={current.label} className="animate-fade-in min-w-0" key={active}>
          {ready ? (
            <current.Component />
          ) : (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-[260px] w-full rounded-lg" />
            </div>
          )}
        </section>
      </div>
      <button
        type="button"
        onClick={() => setWhatsNewOpen(true)}
        className="mt-10 text-xs text-muted-foreground underline-offset-2 hover:underline md:hidden"
      >
        Wersja {appVersion || '—'} · Co nowego
      </button>
      {whatsNewOpen && (
        <Suspense fallback={null}>
          <WhatsNewDialog open onOpenChange={setWhatsNewOpen} />
        </Suspense>
      )}
    </AppShell>
  );
}
