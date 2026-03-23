import React, { useMemo } from 'react'
import { format, getDay } from 'date-fns'
import TaskList from '@/components/TaskList'
import { assetUrl } from '@/lib/apiBase'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/components/tasks/types'
import type { DayData } from '@/hooks/useCalendarData'

interface DragHandlers {
  onDragStart: (e: React.DragEvent, date: string, taskIndex: number) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, date: string) => void
}

interface DayRowProps {
  day: Date
  dayData: DayData
  dayIndex: number
  isHighlighted: boolean
  assigners: any[]
  failedAvatars: Set<string>
  onFailedAvatar: (url: string) => void
  onUpdateTasks: (tasks: Task[]) => void
  dragHandlers: DragHandlers
}

const getDayName = (date: Date): string => {
  const dayNames = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']
  return dayNames[getDay(date)]
}

const statusColorClass = (status: TaskStatus): string => {
  switch (status) {
    case 'wykonano': return 'bg-emerald-500 text-white'
    case 'w trakcie': return 'bg-blue-500 text-white'
    case 'do zrobienia': return 'bg-yellow-500 text-white'
    case 'anulowane': return 'bg-gray-500 text-white'
    case 'zaplanowano': return 'bg-violet-500 text-white'
    default: return 'bg-muted text-muted-foreground'
  }
}

function DayRow({
  day,
  dayData,
  dayIndex,
  isHighlighted,
  assigners,
  failedAvatars,
  onFailedAvatar,
  onUpdateTasks,
  dragHandlers,
}: DayRowProps) {
  const dateKey = format(day, 'yyyy-MM-dd')
  const { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } = dragHandlers

  const dayAssigners = useMemo(() => Array.from(
    new Set(
      dayData.tasks
        .flatMap(t => Array.isArray(t.assignedBy) ? t.assignedBy : (t.assignedBy ? [t.assignedBy] : []))
        .filter(Boolean)
    )
  ), [dayData.tasks])

  const getAssignerByName = (name: string) => assigners.find(a => a.name === name)

  return (
    <tr
      key={dateKey}
      data-day={dateKey}
      className={cn(
        'transition-colors',
        isHighlighted
          ? 'bg-primary/10 border-l-[3px] border-l-primary'
          : dayIndex % 2 === 0 ? 'bg-background' : 'bg-card',
        'hover:bg-muted/50'
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, dateKey)}
    >
      {/* Date */}
      <td
        className="px-2 py-1 border-b align-top"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, dateKey)}
      >
        <div className={cn(
          'text-sm leading-tight',
          isHighlighted ? 'font-semibold text-primary' : 'font-medium text-foreground'
        )}>
          {format(day, 'dd.MM.yyyy')}
        </div>
        <div className="text-xs text-muted-foreground lowercase leading-tight">
          {getDayName(day)}
        </div>
      </td>

      {/* Hours */}
      <td
        className="px-2 py-1 border-b text-center text-sm font-semibold text-primary align-top"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, dateKey)}
      >
        {dayData.totalHours}
      </td>

      {/* Assigners */}
      <td
        className="px-2 py-1 border-b align-top"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, dateKey)}
      >
        {dayAssigners.length > 0 ? (
          <div className="flex flex-col gap-1">
            {dayAssigners.map((assignerName, idx) => {
              const assigner = getAssignerByName(assignerName)
              return (
                <div key={idx} className="flex items-center gap-1.5 text-xs text-foreground">
                  {assigner?.avatar && !failedAvatars.has(assigner.avatar) ? (
                    <img
                      src={assetUrl(assigner.avatar)}
                      alt={assigner.name}
                      className="w-5 h-5 rounded-full object-cover shrink-0"
                      onError={() => {
                        if (assigner?.avatar) {
                          onFailedAvatar(assigner.avatar)
                        }
                      }}
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[9px] font-bold text-primary-foreground shrink-0">
                      {assignerName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span>{assignerName}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </td>

      {/* Tasks */}
      <td
        className="px-2 py-1 border-b align-top"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, dateKey)}
      >
        <TaskList
          date={dateKey}
          tasks={dayData.tasks}
          onUpdate={async (tasks) => { onUpdateTasks(tasks) }}
          onDragStart={(e, taskIndex) => onDragStart(e, dateKey, taskIndex)}
          onDragEnd={onDragEnd}
        />
      </td>

      {/* Status */}
      <td
        className="px-2 py-1 border-b align-top"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, dateKey)}
      >
        {dayData.tasks.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {dayData.tasks.map((task, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={(e) => onDragStart(e, dateKey, idx)}
                onDragEnd={onDragEnd}
                className="flex items-center gap-1 cursor-grab min-h-[22px]"
              >
                <div className="min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-primary-foreground rounded-sm text-[10px] font-bold shrink-0">
                  {idx + 1}
                </div>
                <select
                  value={task.status}
                  onChange={(e) => {
                    const updatedTasks = [...dayData.tasks]
                    updatedTasks[idx] = { ...updatedTasks[idx], status: e.target.value as Task['status'] }
                    onUpdateTasks(updatedTasks)
                  }}
                  aria-label={`Status zadania ${idx + 1}`}
                  className={cn(
                    'flex-1 h-[26px] px-1.5 rounded-sm border-0 text-[11px] font-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    statusColorClass(task.status)
                  )}
                >
                  <option value="wykonano">wykonano</option>
                  <option value="w trakcie">w trakcie</option>
                  <option value="do zrobienia">do zrobienia</option>
                  <option value="anulowane">anulowane</option>
                  <option value="zaplanowano">zaplanowano</option>
                </select>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </td>
    </tr>
  )
}

export default React.memo(DayRow, (prev, next) =>
  prev.dayData === next.dayData &&
  prev.isHighlighted === next.isHighlighted &&
  prev.dayIndex === next.dayIndex &&
  prev.failedAvatars === next.failedAvatars
)
