import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, getDay, isSameMonth } from 'date-fns';
import { AlertTriangle, Eye, EyeOff, RotateCw } from 'lucide-react';
import { useCalendarData, type TasksUpdater } from '@/hooks/useCalendarData';
import { DraftScopeContext } from '@/lib/drafts';
import { calculateTotalHours, DAY_NAMES } from '@/lib/tasks';
import { storage } from '@/lib/storage';
import { hasVat, splitAmount, useRateSettings, visibleAmounts } from '@/lib/rate';
import { formatMoney } from '@/lib/reportSummary';
import { useToast } from '@/contexts/ToastContext';
import CalendarHeader from '@/components/calendar/CalendarHeader';
import DayRow from '@/components/calendar/DayRow';
import PdfExportButton from '@/components/calendar/PdfExportButton';
import ProgressBar from '@/components/ProgressBar';
import ViewSwitcher, { VIEWS, type CalendarView } from '@/components/views/ViewSwitcher';
import WeekView from '@/components/views/WeekView';
import MonthGridView from '@/components/views/MonthGridView';
import KanbanView from '@/components/views/KanbanView';
import DayPanel from '@/components/views/DayPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/components/tasks/types';

interface CalendarTableProps {
  clientId: number | null;
  clientName?: string;
  clientLogo?: string;
  highlightDate?: string | null;
}

const HIDE_EMPTY_KEY = 'wttHideEmptyDays';
const VIEW_KEY = 'wttCalendarView';

export default function CalendarTable({
  clientId,
  clientName,
  clientLogo,
  highlightDate,
}: CalendarTableProps) {
  const {
    daysData,
    days,
    loading,
    loadError,
    currentMonth,
    monthDisplayName,
    monthTotal,
    totalAmount,
    assigners,
    reload,
    updateDayData,
    moveTask,
    changeMonth,
    goToToday,
    goToMonth,
  } = useCalendarData(clientId);
  const { basis: rateBasis, vatRate, showNet, showGross } = useRateSettings();
  const show = visibleAmounts(showNet, showGross, vatRate);
  const amount =
    totalAmount && show.any ? splitAmount(Number(totalAmount), rateBasis, vatRate) : null;
  const withVat = hasVat(vatRate);
  const [view, setView] = useState<CalendarView>(() => {
    const v = storage.get(VIEW_KEY) as CalendarView | null;
    return v && VIEWS.some((x) => x.id === v) ? v : 'list';
  });
  const [panelDate, setPanelDate] = useState<string | null>(null);

  const changeView = useCallback((v: CalendarView) => {
    setView(v);
    storage.set(VIEW_KEY, v);
  }, []);

  // Skróty 1–4 przełączają widok (poza polami formularzy)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        !t?.closest ||
        t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
      )
        return;
      const match = VIEWS.find((v) => v.key === e.key);
      if (match) changeView(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeView]);
  const { showToast } = useToast();
  const [hideEmpty, setHideEmpty] = useState(() => storage.get(HIDE_EMPTY_KEY) === '1');
  const [slide, setSlide] = useState<'left' | 'right' | null>(null);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const draftScope = useMemo(() => ({ clientId }), [clientId]);

  const handleChangeMonth = useCallback(
    (dir: number) => {
      setSlide(dir > 0 ? 'left' : 'right');
      changeMonth(dir);
      window.setTimeout(() => setSlide(null), 320);
    },
    [changeMonth],
  );

  const onUpdateTasks = useCallback(
    (dateKey: string, updater: TasksUpdater) => updateDayData(dateKey, updater),
    [updateDayData],
  );

  const onMoveTask = useCallback(
    (from: string, to: string, taskId: string) => {
      if (moveTask(from, to, taskId)) {
        showToast(`Przeniesiono na ${to.split('-').reverse().join('.')}`, 'success');
      }
    },
    [moveTask, showToast],
  );

  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = {
      wykonano: 0,
      'w trakcie': 0,
      'do zrobienia': 0,
      anulowane: 0,
      zaplanowano: 0,
    };
    for (const d of Object.values(daysData))
      for (const t of d.tasks) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [daysData]);

  const workDays = useMemo(
    () => Object.values(daysData).filter((d) => d.tasks.length > 0).length,
    [daysData],
  );

  const visibleDays = useMemo(
    () =>
      hideEmpty
        ? days.filter((d) => {
            const k = format(d, 'yyyy-MM-dd');
            return (daysData[k]?.tasks.length ?? 0) > 0 || k === todayKey || k === highlightDate;
          })
        : days,
    [days, daysData, hideEmpty, todayKey, highlightDate],
  );

  const toggleHideEmpty = () => {
    setHideEmpty((v) => {
      storage.set(HIDE_EMPTY_KEY, v ? '0' : '1');
      return !v;
    });
  };

  const header = (
    <CalendarHeader
      monthDisplayName={monthDisplayName}
      isCurrentMonth={isSameMonth(currentMonth, new Date())}
      onPrevMonth={() => handleChangeMonth(-1)}
      onNextMonth={() => handleChangeMonth(1)}
      onToday={goToToday}
    >
      <dl className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Dni pracy</dt>
          <dd className="tabular font-display text-xl font-semibold">{workDays}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Suma godzin</dt>
          <dd className="tabular font-display text-xl font-semibold">{monthTotal}</dd>
        </div>
        {amount && show.net && (
          <div>
            <dt className="text-xs text-muted-foreground">
              {show.gross ? 'Netto' : withVat ? 'Kwota netto · bez VAT' : 'Kwota netto'}
            </dt>
            <dd
              className={cn(
                'tabular font-display text-xl font-semibold',
                !show.gross && 'text-highlight-ink',
              )}
            >
              {formatMoney(amount.net)}
            </dd>
          </div>
        )}
        {amount && show.gross && (
          <div title={withVat ? `VAT ${vatRate}%: ${formatMoney(amount.vat)}` : undefined}>
            <dt className="text-xs text-muted-foreground">
              {withVat ? `Brutto · VAT ${vatRate}%` : 'Kwota brutto'}
            </dt>
            <dd className="tabular font-display text-xl font-semibold text-highlight-ink">
              {formatMoney(amount.gross)}
            </dd>
          </div>
        )}
      </dl>
    </CalendarHeader>
  );

  if (loading && Object.keys(daysData).length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div className="overflow-hidden rounded-lg border bg-card">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 border-b px-4 py-4 last:border-b-0">
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Nie udało się wczytać zadań
          </p>
          <p className="text-sm text-muted-foreground">
            {loadError} Edycja jest wstrzymana, aby nie nadpisać danych — Twoje niezapisane zmiany
            są bezpieczne w tej przeglądarce.
          </p>
          <Button size="sm" variant="outline" onClick={() => reload()}>
            <RotateCw className="h-3.5 w-3.5" />
            Spróbuj ponownie
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DraftScopeContext.Provider value={draftScope}>
      <div className="flex flex-col gap-5" data-tour="calendar">
        {header}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ViewSwitcher value={view} onChange={changeView} />
          <ProgressBar
            counts={counts}
            className="order-last min-w-[240px] basis-full lg:order-none lg:flex-1 lg:basis-auto"
          />
          <div className="flex items-center gap-2" data-tour="pdf-export">
            {view === 'list' && (
              <Button variant="ghost" size="sm" onClick={toggleHideEmpty} aria-pressed={hideEmpty}>
                {hideEmpty ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">
                  {hideEmpty ? 'Pokaż wszystkie dni' : 'Ukryj puste dni'}
                </span>
              </Button>
            )}
            <PdfExportButton
              currentMonth={currentMonth}
              daysData={daysData}
              clientName={clientName}
              clientLogo={clientLogo}
              totalAmount={totalAmount}
              getDaysInMonth={() => days}
            />
          </div>
        </div>

        {view === 'week' && (
          <WeekView
            currentMonth={currentMonth}
            daysData={daysData}
            assigners={assigners}
            todayKey={todayKey}
            highlightDate={highlightDate}
            onUpdateTasks={onUpdateTasks}
            onMoveTask={onMoveTask}
            onGoToMonth={goToMonth}
          />
        )}
        {view === 'month' && (
          <MonthGridView
            days={days}
            daysData={daysData}
            todayKey={todayKey}
            highlightDate={highlightDate}
            onOpenDay={setPanelDate}
            onMoveTask={onMoveTask}
          />
        )}
        {view === 'kanban' && (
          <KanbanView
            daysData={daysData}
            assigners={assigners}
            onUpdateTasks={onUpdateTasks}
            onOpenDay={setPanelDate}
          />
        )}

        {view === 'list' && (
          <div
            className={cn(
              'overflow-hidden rounded-lg border bg-card',
              slide === 'left' && 'animate-[slideInLeft_0.3s_cubic-bezier(0.22,1,0.36,1)]',
              slide === 'right' && 'animate-[slideCalRight_0.3s_cubic-bezier(0.22,1,0.36,1)]',
            )}
          >
            <div className="hidden grid-cols-[88px_1fr_76px] gap-x-4 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
              <span>Dzień</span>
              <span>Zadania</span>
              <span className="text-right">Godziny</span>
            </div>

            {visibleDays.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                W tym miesiącu nie ma jeszcze wpisów.{' '}
                <button
                  type="button"
                  onClick={toggleHideEmpty}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Pokaż wszystkie dni
                </button>
                , aby dodać pierwsze zadanie.
              </div>
            ) : (
              visibleDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                return (
                  <DayRow
                    key={dateKey}
                    day={day}
                    dayData={daysData[dateKey] ?? { date: dateKey, tasks: [], totalHours: '00:00' }}
                    isToday={dateKey === todayKey}
                    isHighlighted={highlightDate === dateKey}
                    assigners={assigners}
                    onUpdateTasks={onUpdateTasks}
                    onMoveTask={onMoveTask}
                  />
                );
              })
            )}

            <div className="flex items-center justify-between gap-4 border-t bg-muted/40 px-4 py-3 md:grid md:grid-cols-[88px_1fr_76px]">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Razem
              </span>
              <span className="hidden text-right text-sm text-muted-foreground md:block">
                {amount &&
                  [
                    show.net && `${formatMoney(amount.net)} netto`,
                    show.gross && `${formatMoney(amount.gross)} brutto`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
              </span>
              <span className="tabular text-right font-display text-lg font-semibold">
                {monthTotal}
              </span>
            </div>
          </div>
        )}
      </div>

      <DayPanel
        dateKey={panelDate}
        dayData={panelDate ? daysData[panelDate] : undefined}
        assigners={assigners}
        onClose={() => setPanelDate(null)}
        onUpdateTasks={onUpdateTasks}
      />
    </DraftScopeContext.Provider>
  );
}
