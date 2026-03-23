import { useState, useRef, useCallback, useMemo } from 'react'
import { format, getDay } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { useCalendarData } from '@/hooks/useCalendarData'
import CalendarHeader from '@/components/calendar/CalendarHeader'
import DayRow from '@/components/calendar/DayRow'
import DayCard from '@/components/calendar/DayCard'
import PdfExportButton from '@/components/calendar/PdfExportButton'
import ProgressBar from '@/components/ProgressBar'
import { cn } from '@/lib/utils'
import type { Task } from '@/components/tasks/types'

interface CalendarTableProps {
  clientId: number | null
  clientName?: string
  clientLogo?: string
  highlightDate?: string | null
}

export default function CalendarTable({ clientId, clientName, clientLogo, highlightDate }: CalendarTableProps) {
  const {
    daysData,
    loading,
    currentMonth,
    assigners,
    failedAvatars,
    setFailedAvatars,
    updateDayData,
    moveTask,
    calculateMonthTotal,
    calculateTotalAmount,
    calculateTotalHours,
    changeMonth,
    getDaysInMonth,
    getMonthDisplayName,
  } = useCalendarData(clientId)

  const [draggedTask, setDraggedTask] = useState<{ task: Task; sourceDate: string; taskIndex: number } | null>(null)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const handleChangeMonth = useCallback((direction: number) => {
    setSlideDirection(direction > 0 ? 'left' : 'right')
    changeMonth(direction)
    setTimeout(() => setSlideDirection(null), 300)
  }, [changeMonth])

  const handleDragStart = useCallback((e: React.DragEvent, date: string, taskIndex: number) => {
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : format(new Date(date), 'yyyy-MM-dd')
    const dayData = daysData[dateKey]
    if (dayData && dayData.tasks[taskIndex]) {
      setDraggedTask({
        task: dayData.tasks[taskIndex],
        sourceDate: dateKey,
        taskIndex,
      })
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', '')
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.classList.add('dragging-task')
      }
    }
  }, [daysData])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove('dragging-task')
    }
    // Clean up any lingering highlights
    document.querySelectorAll('.drag-over-highlight').forEach(el => {
      el.classList.remove('drag-over-highlight')
    })
    setDraggedTask(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedTask && e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add('drag-over-highlight')
    }
  }, [draggedTask])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove('drag-over-highlight')
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetDate: string) => {
    e.preventDefault()

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove('drag-over-highlight')
    }

    if (!draggedTask) return

    const targetDateKey = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : format(new Date(targetDate), 'yyyy-MM-dd')

    if (draggedTask.sourceDate === targetDateKey) {
      setDraggedTask(null)
      return
    }

    moveTask(draggedTask.sourceDate, targetDateKey, draggedTask.taskIndex)
    setDraggedTask(null)
  }, [draggedTask, moveTask])

  const getDayName = (date: Date): string => {
    const dayNames = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']
    return dayNames[getDay(date)]
  }

  const days = useMemo(() => getDaysInMonth(), [currentMonth])
  const monthTotal = useMemo(() => calculateMonthTotal(), [daysData])
  const totalAmount = useMemo(() => calculateTotalAmount(), [daysData])

  // Progress calculations (memoized)
  const { totalTasks, doneTasks, inProgressTasks, completionPercent, activePercent } = useMemo(() => {
    const allTasks = Object.values(daysData).flatMap(d => d.tasks)
    const total = allTasks.length
    const done = allTasks.filter(t => t.status === 'wykonano').length
    const inProgress = allTasks.filter(t => t.status === 'w trakcie').length
    return {
      totalTasks: total,
      doneTasks: done,
      inProgressTasks: inProgress,
      completionPercent: total > 0 ? (done / total) * 100 : 0,
      activePercent: total > 0 ? ((done + inProgress) / total) * 100 : 0,
    }
  }, [daysData])

  const dragHandlers = useMemo(() => ({
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  }), [handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 min-h-[400px]">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="mt-4 text-sm text-muted-foreground font-medium">
          Ładowanie zadań z bazy danych...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2" data-tour="calendar">
      <CalendarHeader
        monthDisplayName={getMonthDisplayName()}
        onPrevMonth={() => handleChangeMonth(-1)}
        onNextMonth={() => handleChangeMonth(1)}
      />

      {/* Progress bars */}
      {totalTasks > 0 && (
        <div className="rounded-lg border bg-card p-3 space-y-1.5">
          <ProgressBar value={completionPercent} label="Ukończone" size="sm" />
          <ProgressBar value={activePercent} label="Aktywne" size="sm" />
          <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
            <span>{doneTasks} z {totalTasks} zadań ukończonych</span>
            <span>{inProgressTasks} w trakcie</span>
          </div>
        </div>
      )}

      {/* Desktop table view */}
      <div
        ref={tableRef}
        className={cn(
          'hidden md:block overflow-x-auto rounded-lg border bg-card transition-all duration-300 ease-out',
          slideDirection === 'left' && 'animate-[slideInLeft_0.3s_ease-out]',
          slideDirection === 'right' && 'animate-[slideCalRight_0.3s_ease-out]',
        )}
      >
        <table className="w-full border-collapse" role="table" aria-label="Kalendarz zadań">
          <thead>
            <tr>
              <th className="w-[90px] text-sm px-2 py-2 bg-primary text-primary-foreground font-semibold text-left">Dzień</th>
              <th className="w-[70px] text-sm px-2 py-2 bg-primary text-primary-foreground font-semibold text-center">Godziny</th>
              <th className="w-[120px] text-sm px-2 py-2 bg-primary text-primary-foreground font-semibold text-left">Kto zlecił</th>
              <th className="min-w-[300px] text-sm px-2 py-2 bg-primary text-primary-foreground font-semibold text-left">Zadania</th>
              <th className="w-[120px] text-sm px-2 py-2 bg-primary text-primary-foreground font-semibold text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, dayIndex) => {
              const dateKey = format(day, 'yyyy-MM-dd')
              const dayData = daysData[dateKey] || {
                date: dateKey,
                tasks: [],
                totalHours: '00:00',
              }
              const isHighlighted = highlightDate === dateKey

              return (
                <DayRow
                  key={dateKey}
                  day={day}
                  dayData={dayData}
                  dayIndex={dayIndex}
                  isHighlighted={isHighlighted}
                  assigners={assigners}
                  failedAvatars={failedAvatars}
                  onFailedAvatar={(url) => setFailedAvatars(prev => new Set(prev).add(url))}
                  onUpdateTasks={(tasks) => updateDayData(dateKey, { tasks })}
                  dragHandlers={dragHandlers}
                />
              )
            })}

            {/* Total row */}
            <tr className="bg-primary text-primary-foreground font-semibold">
              <td className="text-right px-2 py-2 text-sm">RAZEM:</td>
              <td className="text-center px-2 py-2 text-sm">{monthTotal}</td>
              <td colSpan={3} className="text-right px-2 py-2 text-sm">
                {totalAmount && (
                  <span className="font-semibold">{totalAmount} zł</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div
        className={cn(
          'md:hidden flex flex-col gap-2 transition-all duration-300 ease-out',
          slideDirection === 'left' && 'animate-[slideInLeft_0.3s_ease-out]',
          slideDirection === 'right' && 'animate-[slideCalRight_0.3s_ease-out]',
        )}
      >
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayData = daysData[dateKey] || {
            date: dateKey,
            tasks: [],
            totalHours: '00:00',
          }
          const isHighlighted = highlightDate === dateKey

          return (
            <DayCard
              key={dateKey}
              day={day}
              dayData={dayData}
              isHighlighted={isHighlighted}
              assigners={assigners}
              failedAvatars={failedAvatars}
              onFailedAvatar={(url) => setFailedAvatars(prev => new Set(prev).add(url))}
              onUpdateTasks={(tasks) => updateDayData(dateKey, { tasks })}
            />
          )
        })}

        {/* Mobile total */}
        <div className="rounded-lg bg-primary text-primary-foreground p-3 flex items-center justify-between font-semibold text-sm">
          <span>RAZEM: {monthTotal}</span>
          {totalAmount && <span>{totalAmount} zł</span>}
        </div>
      </div>

      <div className="flex justify-end" data-tour="pdf-export">
        <PdfExportButton
          currentMonth={currentMonth}
          daysData={daysData}
          clientName={clientName}
          clientLogo={clientLogo}
          monthTotal={monthTotal}
          totalAmount={totalAmount}
          getDayName={getDayName}
          calculateTotalHours={calculateTotalHours}
          getDaysInMonth={getDaysInMonth}
        />
      </div>
    </div>
  )
}
