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

/** Validate that a URL is safe (http/https only) */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// Funkcja do wykrywania i renderowania linków w tekście
export const renderTextWithLinks = (text: string) => {
  // Only match URLs with explicit protocol or www. prefix
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g

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
    }

    if (isSafeUrl(url)) {
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
    } else {
      parts.push(match[0])
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? <>{parts}</> : text
}
