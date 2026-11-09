import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalendarHeaderProps {
  monthDisplayName: string;
  isCurrentMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  children?: React.ReactNode;
}

export default function CalendarHeader({
  monthDisplayName,
  isCurrentMonth,
  onPrevMonth,
  onNextMonth,
  onToday,
  children,
}: CalendarHeaderProps) {
  const navBtn =
    'grid h-9 w-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';
  const [month, year] = [monthDisplayName.split(' ')[0], monthDisplayName.split(' ')[1]];

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex items-center gap-3">
        <h2 className="min-w-[11ch] font-display text-3xl font-semibold leading-none sm:text-4xl">
          {month} <span className="font-medium text-muted-foreground">{year}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevMonth}
            className={navBtn}
            aria-label="Poprzedni miesiąc"
            title="Poprzedni (←)"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            className={navBtn}
            aria-label="Następny miesiąc"
            title="Następny (→)"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            disabled={isCurrentMonth}
            className={cn(
              'ml-1 h-9 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            Dziś
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
