import React from 'react'
import { basePath } from '@/lib/apiBase'

export type TaskStatus = 'wykonano' | 'w trakcie' | 'do zrobienia' | 'anulowane' | 'zaplanowano'

export interface Task {
  id: string           // Unikalny numer 6+ cyfr (tylko cyfry)
  text: string
  assignedBy: string[] // Kto zlecił zadanie (może być wiele osób)
  startTime: string   // Format: HH:MM
  endTime: string     // Format: HH:MM
  status: TaskStatus  // Status zadania
  attachments?: string[] // URL-e załączników
}

export interface TaskListProps {
  date: string
  tasks: Task[]
  onUpdate: (tasks: Task[]) => void | Promise<void>
  onDragStart?: (e: React.DragEvent, taskIndex: number) => void
  onDragEnd?: (e: React.DragEvent) => void
}

export const statusOptions: TaskStatus[] = ['wykonano', 'w trakcie', 'do zrobienia', 'anulowane', 'zaplanowano']

/** URL do wyświetlenia załącznika – przez API, żeby uniknąć 404 gdy static nie jest serwowany (np. na VPS). */
export function attachmentSrc(url: string): string {
  if (url.startsWith('/task-attachments/')) {
    return `${basePath}/api/task-attachments?url=${encodeURIComponent(url)}`
  }
  return basePath + (url.startsWith('/') ? url : `/${url}`)
}

// Funkcja do wykrywania i renderowania linków w tekście
export const renderTextWithLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g

  const parts: (string | React.ReactElement)[] = []
  let lastIndex = 0
  let match
  let keyCounter = 0

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }

    let url = match[0]
    if (url.startsWith('www.')) {
      url = 'https://' + url
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }

    parts.push(
      <a
        key={`link-${keyCounter++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[color:var(--app-accent)] underline cursor-pointer break-all hover:opacity-85"
      >
        {match[0]}
      </a>
    )

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? <>{parts}</> : text
}
