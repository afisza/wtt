import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { appVersion } from '@/lib/version';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Release {
  version: string;
  date: string;
  sections: { title: string; items: string[] }[];
}

/** Parser CHANGELOG.md w formacie Keep a Changelog: `## [x.y.z] - data`, `### tytuł`, `- punkt`. */
export function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  let current: Release | null = null;
  let section: Release['sections'][number] | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const rel = /^## \[([^\]]+)\](?:\s*-\s*(.+))?/.exec(line);
    if (rel) {
      current = { version: rel[1], date: rel[2]?.trim() ?? '', sections: [] };
      section = null;
      releases.push(current);
      continue;
    }
    if (!current) continue;
    const head = /^### (.+)/.exec(line);
    if (head) {
      section = { title: head[1].trim(), items: [] };
      current.sections.push(section);
      continue;
    }
    const item = /^\s*[-*] (.+)/.exec(line);
    if (item) {
      if (!section) {
        section = { title: '', items: [] };
        current.sections.push(section);
      }
      section.items.push(item[1].trim());
    } else if (/^\s{2,}\S/.test(line) && section?.items.length) {
      // Kontynuacja zawiniętego punktu listy
      section.items[section.items.length - 1] += ` ${line.trim()}`;
    }
  }
  return releases;
}

/** Usuwa znaczniki markdown, których nie renderujemy (pogrubienie, kod). */
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');

export default function WhatsNewDialog({
  open,
  onOpenChange,
  highlightVersion,
  onReload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wersja wdrożona na serwerze — wyróżniona, gdy karta ma starszą. */
  highlightVersion?: string | null;
  onReload?: () => void;
}) {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || releases) return;
    setError(false);
    apiFetch('/api/version/changelog?limit=10')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { changelog?: string }) => setReleases(parseChangelog(d.changelog ?? '')))
      .catch(() => setError(true));
  }, [open, releases]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-5 text-left">
          <DialogTitle className="font-display text-xl">Co nowego</DialogTitle>
          <DialogDescription>
            {appVersion ? `Masz wersję ${appVersion}.` : 'Lista zmian w aplikacji.'}
            {highlightVersion && highlightVersion !== appVersion
              ? ` Na serwerze jest już ${highlightVersion}.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="text-sm text-muted-foreground">
              Nie udało się pobrać listy zmian. Spróbuj ponownie za chwilę.
            </p>
          ) : !releases ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wpisów.</p>
          ) : (
            <ol className="flex flex-col gap-8">
              {releases.map((r) => {
                const isNew = !!highlightVersion && r.version === highlightVersion;
                return (
                  <li key={r.version}>
                    <div className="mb-3 flex items-baseline gap-3">
                      <h3 className="font-display text-lg font-semibold">{r.version}</h3>
                      {r.date && (
                        <span className="tabular text-xs text-muted-foreground">{r.date}</span>
                      )}
                      {(isNew || r.version === appVersion) && (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            isNew
                              ? 'bg-highlight/20 text-highlight-ink'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {isNew ? 'Nowa' : 'Twoja wersja'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-4">
                      {r.sections.map((s, i) => (
                        <section key={i}>
                          {s.title && <h4 className="mb-1.5 text-sm font-semibold">{s.title}</h4>}
                          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground marker:text-highlight-ink">
                            {s.items.map((it, j) => (
                              <li key={j}>{plain(it)}</li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {onReload && highlightVersion && highlightVersion !== appVersion && (
          <div className="flex justify-end border-t px-6 py-4">
            <Button onClick={onReload}>
              <RefreshCw className="h-4 w-4" />
              Odśwież do {highlightVersion}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
