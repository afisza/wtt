import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Globe, Search, X, Loader2, Users } from 'lucide-react';
import CalendarTable from './CalendarTable';
import { format, parse, isValid } from 'date-fns';
import { assetUrl } from '@/lib/apiBase';
import { apiFetch, apiJson } from '@/lib/api';
import { storage } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { statusTone } from '@/components/tasks/StatusSelect';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/components/tasks/types';

const CommandPalette = lazy(() => import('./CommandPalette'));

interface Client {
  id: number;
  name: string;
  logo: string;
  website?: string;
}

interface SearchResult {
  date: string;
  task: { text: string; assignedBy: string[]; startTime: string; endTime: string; status: string };
}

interface ClientTabsProps {
  onClientChange?: (clientId: number | null) => void;
}

const ACTIVE_KEY = 'wttActiveClientId';
const MIN_SEARCH_LENGTH = 2;

// Migracja starych danych bez klienta — tylko raz na wczytanie strony
// (wcześniej podwójny efekt w StrictMode tworzył duplikaty klienta).
let migrationStarted = false;

export default function ClientTabs({ onClientChange }: ClientTabsProps) {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientId] = useState<number | null>(() => {
    const n = parseInt(storage.get(ACTIVE_KEY) || '', 10);
    return isNaN(n) ? null : n;
  });
  const [loading, setLoading] = useState(true);
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedResultDate, setSelectedResultDate] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const loadClients = useCallback(async () => {
    try {
      const data = await apiJson<Client[]>('/api/clients');
      setClients(Array.isArray(data) ? data : []);
    } catch {
      /* sesja/sieć — SessionGuard pokaże logowanie, lista zostaje */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
    if (!migrationStarted) {
      migrationStarted = true;
      apiFetch('/api/clients/migrate', { method: 'POST' })
        .then((r) => (r.ok ? r.json() : null))
        .then((result) => {
          if (result?.success && result?.clientId) void loadClients();
        })
        .catch(() => {});
    }
    const onUpdate = () => void loadClients();
    window.addEventListener('clientUpdated', onUpdate);
    return () => window.removeEventListener('clientUpdated', onUpdate);
  }, [loadClients]);

  // Wybór aktywnego klienta po wczytaniu listy
  useEffect(() => {
    if (clients.length === 0) return;
    if (activeClientId === null || !clients.some((c) => c.id === activeClientId)) {
      setActiveClientId(clients[0].id);
    }
  }, [clients, activeClientId]);

  useEffect(() => {
    onClientChange?.(activeClientId);
  }, [activeClientId, onClientChange]);

  const selectClient = (id: number) => {
    setActiveClientId(id);
    storage.set(ACTIVE_KEY, String(id));
  };

  const performSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (q.length < MIN_SEARCH_LENGTH || !activeClientId) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      try {
        const data = await apiJson<{ results?: SearchResult[] }>(
          `/api/search-tasks?q=${encodeURIComponent(q)}&clientId=${activeClientId}`,
        );
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [activeClientId],
  );

  useEffect(() => {
    const t = setTimeout(() => void performSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery, performSearch]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const goToDate = (date: string) => {
    // Skok do miesiąca wyniku, potem przewinięcie do dnia
    const month = date.slice(0, 7);
    if (storage.get('wttCalendarMonth') !== month) {
      storage.set('wttCalendarMonth', month);
      window.dispatchEvent(new CustomEvent('wtt:goto-month', { detail: month }));
    }
    setSelectedResultDate(null);
    setSearchOpen(false);
    window.setTimeout(() => {
      setSelectedResultDate(date);
      document
        .querySelector(`[data-day="${date}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => setSelectedResultDate(null), 1800);
    }, 350);
  };

  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-32 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-[420px] w-full rounded-lg" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border bg-card p-8 sm:p-12">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-highlight/20">
          <Users className="h-5 w-5 text-highlight-ink" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Dodaj pierwszego klienta</h2>
          <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
            Każdy klient ma osobny kalendarz godzin i własny raport PDF. Zacznij od dodania klienta,
            dla którego pracujesz.
          </p>
        </div>
        <Button onClick={() => navigate('/settings?tab=clients')}>
          <Plus className="h-4 w-4" />
          Dodaj klienta
        </Button>
      </div>
    );
  }

  const websiteUrl = (() => {
    const raw = activeClient?.website;
    if (!raw) return null;
    const full = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(full);
      return u.protocol === 'http:' || u.protocol === 'https:' ? { full, raw } : null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex flex-col gap-6">
      {/* Klienci + wyszukiwarka */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0"
          role="tablist"
          aria-label="Klienci"
          data-tour="client-tabs"
        >
          {clients.map((client) => {
            const isActive = activeClientId === client.id;
            return (
              <button
                key={client.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => selectClient(client.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {client.logo && !failedLogos.has(client.logo) ? (
                  <img
                    src={assetUrl(client.logo)}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-sm bg-background object-contain"
                    onError={() => setFailedLogos((prev) => new Set(prev).add(client.logo))}
                  />
                ) : (
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-sm text-[10px] font-bold',
                      isActive
                        ? 'bg-primary-foreground/20'
                        : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {client.name.charAt(0).toUpperCase()}
                  </span>
                )}
                {client.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => navigate('/settings?tab=clients')}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Dodaj klienta"
            title="Dodaj klienta"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {websiteUrl && (
            <a
              href={websiteUrl.full}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground xl:inline-flex"
            >
              <Globe className="h-3.5 w-3.5" />
              {websiteUrl.raw}
            </a>
          )}
          <div ref={searchRef} className="relative w-full lg:w-[340px]" data-tour="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Szukaj w zadaniach klienta…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchOpen(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              aria-label="Szukaj zadań"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-16 text-sm outline-none transition-colors focus:border-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                aria-label="Wyczyść wyszukiwanie"
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground sm:block">
                ⌘K
              </kbd>
            )}

            {searchOpen && searchQuery.trim().length >= MIN_SEARCH_LENGTH && (
              <div className="surface-shadow absolute right-0 top-full z-50 mt-1.5 max-h-[420px] w-full overflow-y-auto rounded-lg border bg-popover lg:w-[480px]">
                {searchLoading ? (
                  <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Szukam…
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-muted-foreground">
                    Brak zadań pasujących do „{searchQuery}”.
                  </div>
                ) : (
                  <ul>
                    <li className="sticky top-0 border-b bg-popover px-4 py-2 text-xs text-muted-foreground">
                      {searchResults.length} {searchResults.length === 1 ? 'wynik' : 'wyników'}
                    </li>
                    {searchResults.map((r, i) => {
                      const d = parse(r.date, 'yyyy-MM-dd', new Date());
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => goToDate(r.date)}
                            className="flex w-full items-start gap-3 border-b px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent"
                          >
                            <span className="tabular w-14 shrink-0 pt-0.5 text-xs text-muted-foreground">
                              {isValid(d) ? format(d, 'dd.MM.yy') : r.date}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-sm">{r.task.text}</span>
                              <span className="tabular mt-0.5 block text-xs text-muted-foreground">
                                {r.task.startTime}–{r.task.endTime}
                                {r.task.assignedBy?.length
                                  ? ` · ${r.task.assignedBy.join(', ')}`
                                  : ''}
                              </span>
                            </span>
                            <span
                              className={cn(
                                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                statusTone[r.task.status as TaskStatus] ??
                                  'bg-muted text-muted-foreground',
                              )}
                            >
                              {r.task.status}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {activeClientId !== null && (
        <div data-calendar-container>
          <CalendarTable
            key={activeClientId}
            clientId={activeClientId}
            clientName={activeClient?.name}
            clientLogo={activeClient?.logo}
            highlightDate={selectedResultDate}
          />
        </div>
      )}

      <Suspense fallback={null}>
        <CommandPalette
          activeClientId={activeClientId}
          clients={clients}
          onSelectClient={(id) => selectClient(id)}
          onSelectDate={(date) => goToDate(date)}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchResults={searchResults}
          searchLoading={searchLoading}
        />
      </Suspense>
    </div>
  );
}
