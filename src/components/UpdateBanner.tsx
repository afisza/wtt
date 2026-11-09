import { lazy, Suspense, useState } from 'react';
import { ArrowUpCircle, FileText, RefreshCw, X } from 'lucide-react';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { useSaveStatus } from '@/lib/saveStatus';
import { Button } from '@/components/ui/button';

const WhatsNewDialog = lazy(() => import('@/components/WhatsNewDialog'));

/** Zapamiętuje odłożoną wersję — żeby okno nie wracało co 5 minut. */
const DISMISS_KEY = 'wtt:update-dismissed-build';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * Okno „Nowa wersja dostępna” — pojawia się u każdego, kto ma aplikację otwartą w chwili wdrożenia.
 *
 * Przeładowanie jest zawsze kliknięciem człowieka. Niezapisane wpisy i tak przetrwają (kolejka zmian
 * i szkice są w pamięci przeglądarki), ale gdy zapis jeszcze trwa, mówimy to wprost.
 * „Później” chowa okno dla TEJ wersji; kolejne wdrożenie znów się odezwie.
 */
export default function UpdateBanner() {
  const { updateAvailable, deployedVersion, deployedBuild } = useVersionCheck();
  const { pending, state } = useSaveStatus();
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  if (!updateAvailable || !deployedBuild || dismissed === deployedBuild) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, deployedBuild);
    } catch {
      /* prywatne okno — okno wróci po odświeżeniu */
    }
    setDismissed(deployedBuild);
  };
  const reload = () => window.location.reload();
  const unsaved = pending > 0 || state === 'saving' || state === 'error' || state === 'offline';

  return (
    <>
      {!whatsNewOpen && (
        <div
          role="status"
          aria-live="polite"
          className="surface-shadow fixed bottom-20 right-4 z-[9000] w-[min(22rem,calc(100vw-2rem))] animate-[fadeIn_0.28s_cubic-bezier(0.22,1,0.36,1)] rounded-lg border bg-popover text-popover-foreground sm:bottom-6 sm:right-6"
        >
          <div className="flex items-start gap-3 p-4">
            <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-highlight-ink" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Nowa wersja dostępna</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {deployedVersion
                  ? `Wersja ${deployedVersion} jest już na serwerze. Odśwież, aby ją załadować.`
                  : 'Odśwież stronę, aby załadować najnowszą wersję.'}
                {unsaved && ' Twoje niezapisane wpisy są w kopii lokalnej i wrócą po odświeżeniu.'}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Zamknij"
              className="-m-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto"
              onClick={() => setWhatsNewOpen(true)}
            >
              <FileText className="h-4 w-4" aria-hidden />
              Co nowego
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Później
            </Button>
            <Button size="sm" onClick={reload}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Odśwież
            </Button>
          </div>
        </div>
      )}
      {whatsNewOpen && (
        <Suspense fallback={null}>
          <WhatsNewDialog
            open
            onOpenChange={setWhatsNewOpen}
            highlightVersion={deployedVersion}
            onReload={reload}
          />
        </Suspense>
      )}
    </>
  );
}
