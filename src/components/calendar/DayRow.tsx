import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { format, getDay } from 'date-fns';
import TaskList from '@/components/TaskList';
import { useTaskDrop } from '@/hooks/useTaskDrop';
import { DAY_NAMES, DAY_NAMES_SHORT } from '@/lib/tasks';
import { cn } from '@/lib/utils';
import type { Assigner, DayData, TasksUpdater } from '@/hooks/useCalendarData';

interface DayRowProps {
  day: Date;
  dayData: DayData;
  isToday: boolean;
  isHighlighted: boolean;
  assigners: Assigner[];
  onUpdateTasks: (dateKey: string, updater: TasksUpdater) => void;
  onMoveTask: (from: string, to: string, taskId: string) => void;
}

/**
 * Jeden dzień rejestru — ten sam komponent na desktopie (wiersz: data | zadania | godziny)
 * i na telefonie (nagłówek dnia nad listą zadań).
 */
function DayRow({
  day,
  dayData,
  isToday,
  isHighlighted,
  assigners,
  onUpdateTasks,
  onMoveTask,
}: DayRowProps) {
  const dateKey = format(day, 'yyyy-MM-dd');
  const weekday = getDay(day);
  const isWeekend = weekday === 0 || weekday === 6;
  const hasTasks = dayData.tasks.length > 0;
  const [addSignal, setAddSignal] = useState(0);
  const drop = useTaskDrop(({ from, taskId }) => {
    if (from !== dateKey) onMoveTask(from, dateKey, taskId);
  });

  return (
    <section
      data-day={dateKey}
      aria-label={`${format(day, 'dd.MM.yyyy')}, ${DAY_NAMES[weekday]}`}
      {...drop.handlers}
      className={cn(
        'group/day grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-b px-3 py-3 transition-colors last:border-b-0 md:grid-cols-[88px_1fr_76px] md:px-4',
        isWeekend && 'bg-weekend/60',
        isHighlighted && 'search-highlight',
        drop.isOver && 'drag-over-highlight',
      )}
    >
      {/* Data */}
      <div className="flex items-baseline gap-2 md:flex-col md:gap-0.5">
        <span
          className={cn(
            'tabular font-display text-xl font-semibold leading-none',
            isToday
              ? 'inline-grid h-8 min-w-8 place-items-center rounded-md bg-highlight px-1.5 text-highlight-foreground'
              : hasTasks
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {format(day, 'd')}
        </span>
        <span
          className={cn(
            'text-xs',
            isWeekend ? 'text-status-cancelled/80' : 'text-muted-foreground',
          )}
        >
          <span className="md:hidden">{DAY_NAMES_SHORT[weekday]}</span>
          <span className="hidden md:inline">{DAY_NAMES[weekday]}</span>
          {isToday && <span className="ml-1.5 font-semibold text-highlight-ink">· dziś</span>}
        </span>
        <button
          type="button"
          onClick={() => setAddSignal((n) => n + 1)}
          aria-label={`Dodaj zadanie ${format(day, 'dd.MM')}`}
          title="Dodaj zadanie"
          className={cn(
            'mt-1.5 hidden h-6 w-fit items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 md:inline-flex',
            !isToday && 'opacity-0 group-hover/day:opacity-100',
          )}
        >
          <Plus className="h-3 w-3" />
          Dodaj
        </button>
      </div>

      {/* Godziny — na telefonie w prawym górnym rogu */}
      <div
        className={cn(
          'tabular row-start-1 text-right font-display text-base font-semibold md:col-start-3',
          hasTasks ? 'text-foreground' : 'text-muted-foreground/40',
        )}
      >
        {dayData.totalHours}
      </div>

      {/* Zadania */}
      <div className="col-span-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
        <TaskList
          date={dateKey}
          tasks={dayData.tasks}
          assigners={assigners}
          emphasizeAdd={isToday}
          addSignal={addSignal}
          addButtonMobileOnly
          onUpdate={(updater) => onUpdateTasks(dateKey, updater)}
        />
      </div>
    </section>
  );
}

export default React.memo(
  DayRow,
  (a, b) =>
    a.dayData === b.dayData &&
    a.isToday === b.isToday &&
    a.isHighlighted === b.isHighlighted &&
    a.assigners === b.assigners &&
    a.onUpdateTasks === b.onUpdateTasks &&
    a.onMoveTask === b.onMoveTask,
);
