import { useEffect, useState } from 'react';
import { Check, CloudOff, Loader2, RotateCw, ShieldAlert, CircleDot } from 'lucide-react';
import { saveStatusStore, useSaveStatus } from '@/lib/saveStatus';
import { cn } from '@/lib/utils';

const timeFmt = (ts: number) =>
  new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

/** Stały, zawsze widoczny stan synchronizacji danych z serwerem. */
export default function SaveIndicator({ className }: { className?: string }) {
  const { state, pending, lastSavedAt, error } = useSaveStatus();
  const [, tick] = useState(0);

  // „Zapisano” wygasa wizualnie do spokojnego stanu po kilku sekundach
  useEffect(() => {
    if (state !== 'saved') return;
    const t = window.setTimeout(() => tick((n) => n + 1), 4000);
    return () => window.clearTimeout(t);
  }, [state, lastSavedAt]);

  const recentlySaved = state === 'saved' && lastSavedAt != null && Date.now() - lastSavedAt < 4000;
  const daysLabel = `${pending} ${pending === 1 ? 'dzień' : 'dni'}`;

  let icon = <Check className="h-3.5 w-3.5" />;
  let label = lastSavedAt ? `Zapisano ${timeFmt(lastSavedAt)}` : 'Wszystko zapisane';
  let tone = 'text-muted-foreground';
  let action: React.ReactNode = null;

  switch (state) {
    case 'pending':
      icon = <CircleDot className="h-3.5 w-3.5" />;
      label = 'Zmiany czekają na zapis';
      tone = 'text-highlight-ink';
      break;
    case 'saving':
      icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      label = 'Zapisywanie…';
      tone = 'text-foreground';
      break;
    case 'saved':
      if (recentlySaved) tone = 'text-status-done';
      break;
    case 'error':
      icon = <RotateCw className="h-3.5 w-3.5" />;
      label = `Nie zapisano (${daysLabel}) — ponawiam`;
      tone = 'text-destructive';
      action = (
        <button
          type="button"
          onClick={() => saveStatusStore.retry()}
          className="ml-1 rounded px-1.5 py-0.5 font-semibold underline underline-offset-2 hover:bg-destructive/10"
        >
          Ponów teraz
        </button>
      );
      break;
    case 'offline':
      icon = <CloudOff className="h-3.5 w-3.5" />;
      label = `Offline — ${daysLabel} zapisane lokalnie`;
      tone = 'text-highlight-ink';
      break;
    case 'auth':
      icon = <ShieldAlert className="h-3.5 w-3.5" />;
      label = `Zaloguj się, aby zapisać (${daysLabel})`;
      tone = 'text-highlight-ink';
      break;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      title={error || undefined}
      className={cn(
        'tabular inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium',
        tone,
        className,
      )}
    >
      {icon}
      <span>{label}</span>
      {action}
    </div>
  );
}
