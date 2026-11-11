import { Hash } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';
import { formatTaskRef } from '@/lib/taskId';

/**
 * Numer zadania (np. WTT-323525) — klik kopiuje go do schowka.
 * Ten numer można podać botowi Telegram, np. „usuń zadanie WTT-323525”.
 */
export default function TaskIdBadge({ id, className }: { id: string; className?: string }) {
  const { showToast } = useToast();
  if (!id) return null;
  const ref = formatTaskRef(id);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ref);
      showToast(`Skopiowano ${ref}`, 'success');
    } catch {
      showToast(`Numer zadania: ${ref}`, 'info');
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      onPointerDown={(e) => e.stopPropagation()}
      title="Numer zadania — kliknij, aby skopiować"
      aria-label={`Kopiuj numer zadania ${ref}`}
      className={cn(
        'tabular inline-flex items-center gap-0.5 rounded px-1 font-mono text-[11px] text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <Hash className="h-3 w-3" />
      {ref}
    </button>
  );
}
