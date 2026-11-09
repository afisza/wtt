import { cn } from '@/lib/utils';
import { statusOptions, type TaskStatus } from './types';

/** Klasy kolorów statusu (tekst + tło chipa) — tokeny z palety. */
export const statusTone: Record<TaskStatus, string> = {
  wykonano: 'text-status-done bg-status-done/15',
  'w trakcie': 'text-status-progress bg-status-progress/15',
  'do zrobienia': 'text-status-todo bg-status-todo/15',
  zaplanowano: 'text-status-planned bg-status-planned/15',
  anulowane: 'text-status-cancelled bg-status-cancelled/15',
};

export const statusDot: Record<TaskStatus, string> = {
  wykonano: 'bg-status-done',
  'w trakcie': 'bg-status-progress',
  'do zrobienia': 'bg-status-todo',
  zaplanowano: 'bg-status-planned',
  anulowane: 'bg-status-cancelled',
};

interface StatusSelectProps {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  className?: string;
  label?: string;
}

/** Natywny select w formie chipa — szybki, dostępny z klawiatury i na telefonie. */
export default function StatusSelect({
  value,
  onChange,
  className,
  label = 'Status zadania',
}: StatusSelectProps) {
  return (
    <label className={cn('relative inline-flex shrink-0 items-center', className)}>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-2 h-1.5 w-1.5 rounded-full',
          statusDot[value],
        )}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'h-6 cursor-pointer appearance-none rounded-full border-0 pl-[18px] pr-2.5 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
          statusTone[value],
        )}
      >
        {statusOptions.map((s) => (
          <option key={s} value={s} className="bg-popover text-popover-foreground">
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
