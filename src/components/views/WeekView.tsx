import { useEffect, useMemo, useState } from 'react';
import { addDays, format, getDay, isSameMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TaskList from '@/components/TaskList';
import { useTaskDrop } from '@/hooks/useTaskDrop';
import { DAY_NAMES_SHORT, sumHours } from '@/lib/tasks';
import { cn } from '@/lib/utils';
import type { Assigner, DayData, TasksUpdater } from '@/hooks/useCalendarData';

interface WeekViewProps {
  currentMonth: Date;
  daysData: Record<string, DayData>;
  assigners: Assigner[];
  todayKey: string;
  highlightDate?: string | null;
  onUpdateTasks: (dateKey: string, updater: TasksUpdater) => void;
  onMoveTask: (from: string, to: string, taskId: string) => void;
  onGoToMonth: (date: Date) => void;
}

const monday = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

export default function WeekView({
  currentMonth,
  daysData,
  assigners,
  todayKey,
  highlightDate,
  onUpdateTasks,
  onMoveTask,
  onGoToMonth,
}: WeekViewProps) {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    return monday(isSameMonth(today, currentMonth) ? today : currentMonth);
  });

  // Po zmianie miesiąca: zostań w tygodniu, jeśli ma wspólne dni; inaczej pierwszy/obecny tydzień
  useEffect(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    if (days.some((d) => isSameMonth(d, currentMonth))) return;
    const today = new Date();
    setWeekStart(monday(isSameMonth(today, currentMonth) ? today : currentMonth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  // Podświetlony wynik wyszukiwania → pokaż jego tydzień
  useEffect(() => {
    if (highlightDate) setWeekStart(monday(new Date(`${highlightDate}T12:00:00`)));
  }, [highlightDate]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekTotal = useMemo(
    () => sumHours(days.map((d) => daysData[format(d, 'yyyy-MM-dd')]?.totalHours ?? '00:00')),
    [days, daysData],
  );

  const shiftWeek = (dir: number) => {
    const next = addDays(weekStart, dir * 7);
    setWeekStart(next);
    const nextDays = Array.from({ length: 7 }, (_, i) => addDays(next, i));
    if (!nextDays.some((d) => isSameMonth(d, currentMonth))) onGoToMonth(addDays(next, 3));
  };

  const end = days[6];
  const rangeLabel =
    weekStart.getMonth() === end.getMonth()
      ? `${weekStart.getDate()}–${end.getDate()}.${format(end, 'MM')}`
      : `${format(weekStart, 'dd.MM')} – ${format(end, 'dd.MM')}`;

  const navBtn =
    'grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={navBtn}
          onClick={() => shiftWeek(-1)}
          aria-label="Poprzedni tydzień"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={navBtn}
          onClick={() => shiftWeek(1)}
          aria-label="Następny tydzień"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="tabular font-display text-lg font-semibold">{rangeLabel}</span>
        <span className="ml-auto text-sm text-muted-foreground">
          Tydzień: <span className="tabular font-semibold text-foreground">{weekTotal}</span>
        </span>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        <div className="grid min-w-[980px] grid-cols-7 gap-2">
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            return (
              <WeekColumn
                key={dateKey}
                day={day}
                dateKey={dateKey}
                inMonth={isSameMonth(day, currentMonth)}
                isToday={dateKey === todayKey}
                dayData={daysData[dateKey]}
                assigners={assigners}
                onUpdateTasks={onUpdateTasks}
                onMoveTask={onMoveTask}
                onGoToMonth={onGoToMonth}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekColumn({
  day,
  dateKey,
  inMonth,
  isToday,
  dayData,
  assigners,
  onUpdateTasks,
  onMoveTask,
  onGoToMonth,
}: {
  day: Date;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  dayData: DayData | undefined;
  assigners: Assigner[];
  onUpdateTasks: (dateKey: string, updater: TasksUpdater) => void;
  onMoveTask: (from: string, to: string, taskId: string) => void;
  onGoToMonth: (date: Date) => void;
}) {
  const weekday = getDay(day);
  const isWeekend = weekday === 0 || weekday === 6;
  const drop = useTaskDrop(({ from, taskId }) => {
    if (inMonth && from !== dateKey) onMoveTask(from, dateKey, taskId);
  });

  return (
    <section
      data-day={inMonth ? dateKey : undefined}
      {...(inMonth ? drop.handlers : {})}
      className={cn(
        'group/day flex min-h-[420px] flex-col rounded-lg border bg-card',
        isWeekend && 'bg-weekend/60',
        isToday && 'border-highlight-ink/60',
        drop.isOver && 'drag-over-highlight',
      )}
    >
      <header className="flex items-baseline justify-between border-b px-3 py-2">
        <span className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'tabular font-display text-lg font-semibold',
              isToday && 'rounded bg-highlight px-1.5 text-highlight-foreground',
              !inMonth && 'text-muted-foreground',
            )}
          >
            {day.getDate()}
          </span>
          <span
            className={cn(
              'text-xs',
              isWeekend ? 'text-status-cancelled/80' : 'text-muted-foreground',
            )}
          >
            {DAY_NAMES_SHORT[weekday]}
          </span>
        </span>
        {inMonth && (
          <span
            className={cn(
              'tabular text-sm font-semibold',
              dayData?.tasks.length ? 'text-foreground' : 'text-muted-foreground/40',
            )}
          >
            {dayData?.totalHours ?? '00:00'}
          </span>
        )}
      </header>
      <div className="flex-1 p-2">
        {inMonth ? (
          <TaskList
            date={dateKey}
            tasks={dayData?.tasks ?? []}
            assigners={assigners}
            compact
            emphasizeAdd={isToday}
            onUpdate={(updater) => onUpdateTasks(dateKey, updater)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onGoToMonth(day)}
            className="w-full rounded-md px-2 py-6 text-center text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Inny miesiąc — przejdź
          </button>
        )}
      </div>
    </section>
  );
}
