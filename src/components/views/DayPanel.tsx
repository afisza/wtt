import { getDay, parse } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import TaskList from '@/components/TaskList';
import { DAY_NAMES } from '@/lib/tasks';
import type { Assigner, DayData, TasksUpdater } from '@/hooks/useCalendarData';

interface DayPanelProps {
  dateKey: string | null;
  dayData: DayData | undefined;
  assigners: Assigner[];
  onClose: () => void;
  onUpdateTasks: (dateKey: string, updater: TasksUpdater) => void;
}

const MONTH_GENITIVE = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

/** Panel boczny z pełną listą zadań dnia — używany przez widok miesiąca i Kanban. */
export default function DayPanel({
  dateKey,
  dayData,
  assigners,
  onClose,
  onUpdateTasks,
}: DayPanelProps) {
  const date = dateKey ? parse(dateKey, 'yyyy-MM-dd', new Date()) : null;

  return (
    <Sheet open={!!dateKey} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        {date && dateKey && (
          <>
            <SheetHeader className="border-b py-4 pl-5 pr-14 text-left">
              <SheetTitle className="flex items-baseline justify-between gap-4 font-display text-2xl">
                <span>
                  {date.getDate()} {MONTH_GENITIVE[date.getMonth()]}
                  <span className="ml-2 text-base font-medium capitalize text-muted-foreground">
                    {DAY_NAMES[getDay(date)]}
                  </span>
                </span>
                <span className="tabular text-lg">{dayData?.totalHours ?? '00:00'}</span>
              </SheetTitle>
              <SheetDescription>
                {dayData?.tasks.length
                  ? `${dayData.tasks.length} ${dayData.tasks.length === 1 ? 'zadanie' : dayData.tasks.length < 5 ? 'zadania' : 'zadań'}`
                  : 'Brak zadań tego dnia'}
              </SheetDescription>
            </SheetHeader>
            <div className="p-4">
              <TaskList
                key={dateKey}
                date={dateKey}
                tasks={dayData?.tasks ?? []}
                assigners={assigners}
                emphasizeAdd
                draggable={false}
                onUpdate={(updater) => onUpdateTasks(dateKey, updater)}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
