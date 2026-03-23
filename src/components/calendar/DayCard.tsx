import React, { useMemo } from 'react'
import { format, getDay } from 'date-fns'
import TaskList from '@/components/TaskList'
import { assetUrl } from '@/lib/apiBase'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/components/tasks/types'
import type { DayData } from '@/hooks/useCalendarData'

interface DayCardProps {
  day: Date
  dayData: DayData
  isHighlighted: boolean
  assigners: any[]
  failedAvatars: Set<string>
  onFailedAvatar: (url: string) => void
  onUpdateTasks: (tasks: Task[]) => void
}

const getDayName = (date: Date): string => {
  const dayNames = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.']
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

function DayCard({
  day,
  dayData,
  isHighlighted,
  assigners,
  failedAvatars,
  onFailedAvatar,
  onUpdateTasks,
}: DayCardProps) {
  const dateKey = format(day, 'yyyy-MM-dd')

  const dayAssigners = useMemo(() => Array.from(
    new Set(
      dayData.tasks
        .flatMap(t => Array.isArray(t.assignedBy) ? t.assignedBy : (t.assignedBy ? [t.assignedBy] : []))
        .filter(Boolean)
    )
  ), [dayData.tasks])

  const getAssignerByName = (name: string) => assigners.find(a => a.name === name)

  return (
    <div
      data-day={dateKey}
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isHighlighted
          ? 'bg-primary/10 border-primary'
          : 'bg-card border-border',
      )}
    >
      {/* Date header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-semibold',
            isHighlighted ? 'text-primary' : 'text-foreground'
          )}>
            {format(day, 'dd.MM')}
          </span>
          <span className="text-xs text-muted-foreground">{getDayName(day)}</span>
        </div>
        <span className="text-sm font-bold text-primary">{dayData.totalHours}</span>
      </div>

      {/* Assigners */}
      {dayAssigners.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {dayAssigners.map((assignerName, idx) => {
            const assigner = getAssignerByName(assignerName)
            return (
              <div key={idx} className="flex items-center gap-1 text-xs text-foreground bg-muted/50 rounded-full px-2 py-0.5">
                {assigner?.avatar && !failedAvatars.has(assigner.avatar) ? (
                  <img
                    src={assetUrl(assigner.avatar)}
                    alt={assigner.name}
                    className="w-4 h-4 rounded-full object-cover shrink-0"
                    onError={() => {
                      if (assigner?.avatar) onFailedAvatar(assigner.avatar)
                    }}
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center text-[8px] font-bold text-primary-foreground shrink-0">
                    {assignerName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span>{assignerName}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Tasks */}
      <TaskList
        date={dateKey}
        tasks={dayData.tasks}
        onUpdate={async (tasks) => { onUpdateTasks(tasks) }}
      />

      {/* Status badges */}
      {dayData.tasks.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {dayData.tasks.map((task, idx) => (
            <select
              key={idx}
              value={task.status}
              onChange={(e) => {
                const updatedTasks = [...dayData.tasks]
                updatedTasks[idx] = { ...updatedTasks[idx], status: e.target.value as Task['status'] }
                onUpdateTasks(updatedTasks)
              }}
              aria-label={`Status zadania ${idx + 1}`}
              className={cn(
                'h-7 px-2 rounded text-xs font-medium cursor-pointer border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                statusColorClass(task.status)
              )}
            >
              <option value="wykonano">wykonano</option>
              <option value="w trakcie">w trakcie</option>
              <option value="do zrobienia">do zrobienia</option>
              <option value="anulowane">anulowane</option>
              <option value="zaplanowano">zaplanowano</option>
            </select>
          ))}
        </div>
      )}
    </div>
  )
}

export default React.memo(DayCard, (prev, next) =>
  prev.dayData === next.dayData &&
  prev.isHighlighted === next.isHighlighted &&
  prev.failedAvatars === next.failedAvatars
)
