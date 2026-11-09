import { format, getDay } from 'date-fns';
import { useTaskDrop, setTaskDragData } from '@/hooks/useTaskDrop';
import { DAY_NAMES_SHORT, sortTasksChronologically } from '@/lib/tasks';
import { statusDot } from '@/components/tasks/StatusSelect';
import { cn } from '@/lib/utils';
import type { DayData } from '@/hooks/useCalendarData';

interface MonthGridViewProps {
  days: Date[];
  daysData: Record<string, DayData>;
  todayKey: string;
  highlightDate?: string | null;
  onOpenDay: (dateKey: string) => void;
  onMoveTask: (from: string, to: string, taskId: string) => void;
}

const HEADERS = [1, 2, 3, 4, 5, 6, 0].map((d) => DAY_NAMES_SHORT[d]);
const MAX_VISIBLE = 3;

/** Klasyczna siatka miesiąca — cały miesiąc na jednym ekranie. */
export default function MonthGridView({
  days,
  daysData,
  todayKey,
  highlightDate,
  onOpenDay,
  onMoveTask,
}: MonthGridViewProps) {
  const offset = days.length ? (getDay(days[0]) + 6) % 7 : 0;
  const trailing = (7 - ((offset + days.length) % 7)) % 7;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {HEADERS.map((h, i) => (
          <div
            key={h}
            className={cn(
              'px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
              i >= 5 && 'text-status-cancelled/80',
            )}
          >
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} className="border-b border-r bg-muted/20" aria-hidden />
        ))}
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          return (
            <MonthCell
              key={dateKey}
              day={day}
              dateKey={dateKey}
              dayData={daysData[dateKey]}
              isToday={dateKey === todayKey}
              isHighlighted={highlightDate === dateKey}
              onOpenDay={onOpenDay}
              onMoveTask={onMoveTask}
            />
          );
        })}
        {Array.from({ length: trailing }).map((_, i) => (
          <div
            key={`tail-${i}`}
            className="border-b border-r bg-muted/20 [&:nth-child(7n)]:border-r-0"
          />
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  dateKey,
  dayData,
  isToday,
  isHighlighted,
  onOpenDay,
  onMoveTask,
}: {
  day: Date;
  dateKey: string;
  dayData: DayData | undefined;
  isToday: boolean;
  isHighlighted: boolean;
  onOpenDay: (dateKey: string) => void;
  onMoveTask: (from: string, to: string, taskId: string) => void;
}) {
  const weekday = getDay(day);
  const isWeekend = weekday === 0 || weekday === 6;
  const tasks = sortTasksChronologically(dayData?.tasks ?? []);
  const drop = useTaskDrop(({ from, taskId }) => {
    if (from !== dateKey) onMoveTask(from, dateKey, taskId);
  });

  return (
    <div
      data-day={dateKey}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDay(dateKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDay(dateKey);
        }
      }}
      aria-label={`${format(day, 'dd.MM')}: ${tasks.length} zadań, ${dayData?.totalHours ?? '00:00'}`}
      {...drop.handlers}
      className={cn(
        'group flex min-h-[72px] cursor-pointer flex-col gap-1 border-b border-r p-1.5 text-left transition-colors hover:bg-accent/50 sm:min-h-[118px] sm:p-2 [&:nth-child(7n)]:border-r-0',
        isWeekend && 'bg-weekend/60',
        isHighlighted && 'search-highlight',
        drop.isOver && 'drag-over-highlight',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            'tabular grid h-6 min-w-6 place-items-center rounded font-display text-sm font-semibold',
            isToday
              ? 'bg-highlight px-1 text-highlight-foreground'
              : tasks.length
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {day.getDate()}
        </span>
        {tasks.length > 0 && (
          <span className="tabular hidden text-[11px] font-semibold text-muted-foreground sm:inline">
            {dayData?.totalHours}
          </span>
        )}
      </div>

      {/* Telefon: same kropki statusów */}
      <div className="flex flex-wrap gap-0.5 sm:hidden">
        {tasks.map((t) => (
          <span key={t.id} className={cn('h-1.5 w-1.5 rounded-full', statusDot[t.status])} />
        ))}
      </div>

      <ul className="hidden flex-col gap-0.5 sm:flex">
        {tasks.slice(0, MAX_VISIBLE).map((t) => (
          <li
            key={t.id}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              setTaskDragData(e, { from: dateKey, taskId: t.id });
            }}
            className={cn(
              'flex cursor-grab items-center gap-1.5 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-background/80',
              t.status === 'anulowane' && 'line-through opacity-60',
            )}
            title={`${t.startTime}–${t.endTime} · ${t.text}`}
          >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot[t.status])} />
            <span className="truncate">{t.text}</span>
          </li>
        ))}
        {tasks.length > MAX_VISIBLE && (
          <li className="px-1 text-[11px] font-medium text-muted-foreground">
            +{tasks.length - MAX_VISIBLE} więcej
          </li>
        )}
      </ul>
    </div>
  );
}
