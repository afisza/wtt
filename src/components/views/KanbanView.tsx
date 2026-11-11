import { useMemo } from 'react';
import { getDay, parse } from 'date-fns';
import { Clock } from 'lucide-react';
import { useTaskDrop, setTaskDragData } from '@/hooks/useTaskDrop';
import { DAY_NAMES_SHORT, toMinutes } from '@/lib/tasks';
import { statusDot } from '@/components/tasks/StatusSelect';
import AssignerAvatar from '@/components/tasks/AssignerAvatar';
import TaskIdBadge from '@/components/tasks/TaskIdBadge';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus } from '@/components/tasks/types';
import type { Assigner, DayData, TasksUpdater } from '@/hooks/useCalendarData';

interface KanbanViewProps {
  daysData: Record<string, DayData>;
  assigners: Assigner[];
  onUpdateTasks: (dateKey: string, updater: TasksUpdater) => void;
  onOpenDay: (dateKey: string) => void;
}

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'zaplanowano', label: 'Zaplanowane' },
  { status: 'do zrobienia', label: 'Do zrobienia' },
  { status: 'w trakcie', label: 'W trakcie' },
  { status: 'wykonano', label: 'Wykonane' },
  { status: 'anulowane', label: 'Anulowane' },
];

interface Card {
  date: string;
  task: Task;
}

/** Tablica statusów — przeciągnięcie karty do innej kolumny zmienia status zadania. */
export default function KanbanView({
  daysData,
  assigners,
  onUpdateTasks,
  onOpenDay,
}: KanbanViewProps) {
  const columns = useMemo(() => {
    const map = new Map<TaskStatus, Card[]>(COLUMNS.map((c) => [c.status, []]));
    for (const [date, day] of Object.entries(daysData)) {
      for (const task of day.tasks) map.get(task.status)?.push({ date, task });
    }
    for (const cards of map.values()) {
      cards.sort(
        (a, b) =>
          a.date.localeCompare(b.date) || toMinutes(a.task.startTime) - toMinutes(b.task.startTime),
      );
    }
    return map;
  }, [daysData]);

  const setStatus = (date: string, taskId: string, status: TaskStatus) =>
    onUpdateTasks(date, (prev) =>
      prev.map((t) => (t.id === taskId && t.status !== status ? { ...t, status } : t)),
    );

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
      <div className="grid min-w-[1000px] snap-x grid-cols-5 gap-3">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            label={col.label}
            cards={columns.get(col.status) ?? []}
            assigners={assigners}
            onDropTask={(from, taskId) => setStatus(from, taskId, col.status)}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  label,
  cards,
  assigners,
  onDropTask,
  onOpenDay,
}: {
  status: TaskStatus;
  label: string;
  cards: Card[];
  assigners: Assigner[];
  onDropTask: (from: string, taskId: string) => void;
  onOpenDay: (dateKey: string) => void;
}) {
  const drop = useTaskDrop(({ from, taskId }) => onDropTask(from, taskId));

  return (
    <section
      aria-label={label}
      {...drop.handlers}
      className={cn(
        'flex min-h-[460px] snap-start flex-col rounded-lg border bg-muted/30',
        drop.isOver && 'drag-over-highlight',
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn('h-2 w-2 rounded-full', statusDot[status])} />
        <h3 className="font-sans text-sm font-semibold">{label}</h3>
        <span className="tabular ml-auto rounded-full bg-background px-2 text-xs font-semibold text-muted-foreground">
          {cards.length}
        </span>
      </header>
      <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {cards.length === 0 && (
          <li className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            Przeciągnij tu zadanie
          </li>
        )}
        {cards.map(({ date, task }) => {
          const d = parse(date, 'yyyy-MM-dd', new Date());
          return (
            <li
              key={`${date}-${task.id}`}
              draggable
              onDragStart={(e) => {
                setTaskDragData(e, { from: date, taskId: task.id });
                e.currentTarget.classList.add('dragging-task');
              }}
              onDragEnd={(e) => e.currentTarget.classList.remove('dragging-task')}
              onClick={() => onOpenDay(date)}
              onKeyDown={(e) => e.key === 'Enter' && onOpenDay(date)}
              tabIndex={0}
              className="cursor-grab rounded-md border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-ring/60 active:cursor-grabbing"
            >
              <div className="tabular mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {d.getDate()}.{String(d.getMonth() + 1).padStart(2, '0')}{' '}
                  <span className="font-normal text-muted-foreground">
                    {DAY_NAMES_SHORT[getDay(d)]}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {task.startTime}–{task.endTime}
                </span>
              </div>
              <p
                className={cn(
                  'line-clamp-4 text-sm leading-snug',
                  status === 'anulowane' && 'line-through',
                )}
              >
                {task.text}
              </p>
              <TaskIdBadge id={task.id} className="-ml-1 mt-1" />
              {task.assignedBy?.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {task.assignedBy.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1">
                      <AssignerAvatar
                        name={name}
                        avatar={assigners.find((a) => a.name === name)?.avatar}
                        size={16}
                      />
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
