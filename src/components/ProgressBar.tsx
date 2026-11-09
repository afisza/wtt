import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/components/tasks/types';
import { statusDot } from '@/components/tasks/StatusSelect';

interface StatusBreakdownProps {
  counts: Record<TaskStatus, number>;
  className?: string;
}

const ORDER: TaskStatus[] = ['wykonano', 'w trakcie', 'zaplanowano', 'do zrobienia', 'anulowane'];

/** Pasek rozkładu statusów miesiąca + legenda z liczbami. */
export default function ProgressBar({ counts, className }: StatusBreakdownProps) {
  const total = ORDER.reduce((s, k) => s + (counts[k] || 0), 0);
  if (total === 0) return null;
  const done = counts['wykonano'] || 0;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${done} z ${total} zadań wykonanych`}
      >
        {ORDER.map((k) =>
          counts[k] ? (
            <div
              key={k}
              className={cn('progress-bar-animated h-full', statusDot[k])}
              style={{ width: `${(counts[k] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {ORDER.filter((k) => counts[k]).map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', statusDot[k])} />
            {k} <span className="tabular font-semibold text-foreground">{counts[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
