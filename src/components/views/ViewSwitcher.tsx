import { Rows3, CalendarRange, CalendarDays, SquareKanban } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalendarView = 'list' | 'week' | 'month' | 'kanban';

export const VIEWS: { id: CalendarView; label: string; icon: typeof Rows3; key: string }[] = [
  { id: 'list', label: 'Lista', icon: Rows3, key: '1' },
  { id: 'week', label: 'Tydzień', icon: CalendarRange, key: '2' },
  { id: 'month', label: 'Miesiąc', icon: CalendarDays, key: '3' },
  { id: 'kanban', label: 'Kanban', icon: SquareKanban, key: '4' },
];

interface ViewSwitcherProps {
  value: CalendarView;
  onChange: (view: CalendarView) => void;
}

/** Przełącznik widoków (skróty 1–4). */
export default function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Widok"
      className="inline-flex rounded-md border bg-muted/50 p-0.5"
    >
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={value === v.id}
          onClick={() => onChange(v.id)}
          title={`${v.label} (${v.key})`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === v.id
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <v.icon className={cn('h-3.5 w-3.5', value === v.id && 'text-highlight-ink')} />
          <span className="hidden sm:inline">{v.label}</span>
        </button>
      ))}
    </div>
  );
}
