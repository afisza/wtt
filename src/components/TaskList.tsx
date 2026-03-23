import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Edit2, Trash2, Plus, X, Check, Clock, Loader2, Copy, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { generateTaskId } from '@/lib/taskId'
import { basePath } from '@/lib/apiBase'

// Sub-components
import Lightbox from './tasks/Lightbox'
import AssignerPicker from './tasks/AssignerPicker'
import AttachmentGallery from './tasks/AttachmentGallery'
import TaskForm from './tasks/TaskForm'

// Types — re-exported for backwards compatibility
export type { TaskStatus, Task, TaskListProps } from './tasks/types'
export { statusOptions, attachmentSrc, renderTextWithLinks } from './tasks/types'

import type { Task, TaskStatus } from './tasks/types'
import { renderTextWithLinks } from './tasks/types'

interface TaskListProps {
  date: string
  tasks: Task[]
  onUpdate: (tasks: Task[]) => void | Promise<void>
  onDragStart?: (e: React.DragEvent, taskIndex: number) => void
  onDragEnd?: (e: React.DragEvent) => void
}

export default function TaskList({ date, tasks, onUpdate, onDragStart, onDragEnd }: TaskListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [inlineEditingIndex, setInlineEditingIndex] = useState<number | null>(null)
  const [inlineEditingText, setInlineEditingText] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [assigners, setAssigners] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const { showToast } = useToast()

  // Show "Zapisano" indicator briefly after saving
  const showSavedIndicator = useCallback(() => {
    setSavedIndicator(true)
    setTimeout(() => setSavedIndicator(false), 2000)
  }, [])

  // ── Load assigners ────────────────────────────────────────────────────────
  useEffect(() => {
    const loadAssigners = async () => {
      try {
        const response = await fetch(`${basePath}/api/assigners`, { credentials: 'include' })
        if (response.ok) {
          const data = await response.json()
          setAssigners(data)
        }
      } catch (error) {
        console.error('Error loading assigners:', error)
      }
    }
    loadAssigners()
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const applyUpdate = async (newTasks: Task[]) => {
    const result = onUpdate(newTasks)
    if (result != null && typeof (result as Promise<void>).then === 'function') await result
  }

  const sortTasksChronologically = (tasksToSort: Task[]): Task[] => {
    return [...tasksToSort].sort((a, b) => {
      const parseTime = (time: string): number => {
        const [hours, minutes] = (time || '08:00').split(':').map(Number)
        return hours * 60 + minutes
      }
      const aStart = parseTime(a.startTime)
      const bStart = parseTime(b.startTime)
      if (aStart !== bStart) return aStart - bStart
      return parseTime(a.endTime) - parseTime(b.endTime)
    })
  }

  const findOriginalIndex = (task: Task) =>
    task.id
      ? tasks.findIndex(t => t.id === task.id)
      : tasks.findIndex(t =>
          t.text === task.text &&
          t.startTime === task.startTime &&
          t.endTime === task.endTime &&
          JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy)
        )

  const addOneHour = (time: string): string => {
    const [h, m] = (time || '08:00').split(':').map(Number)
    const next = (h + 1) * 60 + m
    const hours = Math.floor(next / 60) % 24
    const mins = next % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }

  // ── Upload helper (used in handleAdd) ─────────────────────────────────────
  const uploadTaskAttachment = async (taskId: string, file: File): Promise<string | null> => {
    const form = new FormData()
    form.append('file', file)
    form.append('taskId', taskId)
    const res = await fetch(`${basePath}/api/task-attachments/upload`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Błąd uploadu')
    }
    const data = await res.json()
    return data?.url ?? null
  }

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const handleAdd = (data: {
    text: string
    assignedBy: string[]
    startTime: string
    endTime: string
    status: TaskStatus
    pendingFiles: File[]
  }) => {
    setIsSaving(true)
    const existingIds = new Set(tasks.map(t => t.id).filter(Boolean))
    const id = generateTaskId(existingIds)
    const newTaskObj: Task = {
      id,
      text: data.text,
      assignedBy: data.assignedBy,
      startTime: data.startTime.trim() || '08:00',
      endTime: data.endTime.trim() || '16:00',
      status: data.status,
      attachments: [],
    }

    if (data.pendingFiles.length > 0) {
      setUploadingAttachment(true)
      Promise.all(data.pendingFiles.slice(0, 10).map(f => uploadTaskAttachment(id, f)))
        .then(async urls => {
          const valid = urls.filter(Boolean) as string[]
          await applyUpdate([...tasks, { ...newTaskObj, attachments: valid }])
          showToast('Zadanie zostało dodane', 'success')
          setShowAddForm(false)
        })
        .catch(err => showToast(err?.message || 'Błąd dodawania załączników', 'error'))
        .finally(() => { setUploadingAttachment(false); setIsSaving(false); showSavedIndicator() })
    } else {
      applyUpdate([...tasks, newTaskObj]).then(() => {
        showToast('Zadanie zostało dodane', 'success')
        setShowAddForm(false)
        setIsSaving(false)
        showSavedIndicator()
      }).catch(() => setIsSaving(false))
    }
  }

  const handleSave = async (task: Task, data: {
    text: string
    assignedBy: string[]
    startTime: string
    endTime: string
    status: TaskStatus
    attachments: string[]
  }) => {
    const originalIndex = findOriginalIndex(task)
    if (originalIndex !== -1) {
      setIsSaving(true)
      const updated = [...tasks]
      const existing = updated[originalIndex]
      updated[originalIndex] = {
        id: existing.id,
        text: data.text,
        assignedBy: data.assignedBy,
        startTime: data.startTime.trim() || '08:00',
        endTime: data.endTime.trim() || '16:00',
        status: data.status,
        attachments: data.attachments.length ? data.attachments : (existing.attachments || []),
      }
      try {
        await applyUpdate(updated)
        showToast('Zadanie zostało zaktualizowane', 'success')
        showSavedIndicator()
      } finally {
        setIsSaving(false)
      }
    }
    setEditingIndex(null)
  }

  const handleDelete = async (task: Task) => {
    const previousTasks = [...tasks]
    const updated = task.id
      ? tasks.filter(t => t.id !== task.id)
      : tasks.filter(t => !(
          t.text === task.text &&
          t.startTime === task.startTime &&
          t.endTime === task.endTime &&
          JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy)
        ))
    await applyUpdate(updated)

    showToast('Zadanie usunięte', 'warning', 5000, {
      label: 'Cofnij',
      onClick: async () => {
        await applyUpdate(previousTasks)
        showToast('Zadanie przywrócone', 'success')
      },
    })
  }

  const handleDuplicate = async (task: Task) => {
    const existingIds = new Set(tasks.map(t => t.id).filter(Boolean))
    const newId = generateTaskId(existingIds)
    const duplicate: Task = {
      id: newId,
      text: task.text,
      assignedBy: Array.isArray(task.assignedBy) ? [...task.assignedBy] : [],
      startTime: addOneHour(task.startTime),
      endTime: addOneHour(task.endTime),
      status: task.status,
      attachments: [],
    }
    const idx = findOriginalIndex(task)
    const insertAt = idx >= 0 ? idx + 1 : tasks.length
    const updated = [...tasks.slice(0, insertAt), duplicate, ...tasks.slice(insertAt)]
    await applyUpdate(updated)
    showToast('Zadanie skopiowane (+1h)', 'success')
  }

  // ── Inline edit handlers ──────────────────────────────────────────────────
  const handleInlineEdit = (task: Task) => {
    setInlineEditingIndex(findOriginalIndex(task))
    setInlineEditingText(task.text)
  }

  const handleInlineSave = async (task: Task) => {
    if (inlineEditingText.trim()) {
      const originalIndex = findOriginalIndex(task)
      if (originalIndex !== -1) {
        setIsSaving(true)
        const updated = [...tasks]
        updated[originalIndex] = { ...updated[originalIndex], text: inlineEditingText.trim() }
        try {
          await applyUpdate(updated)
          showToast('Zadanie zostało zaktualizowane', 'success')
          showSavedIndicator()
        } finally {
          setIsSaving(false)
        }
      }
    }
    setInlineEditingIndex(null)
    setInlineEditingText('')
  }

  const handleInlineCancel = () => {
    setInlineEditingIndex(null)
    setInlineEditingText('')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const sortedTasks = useMemo(() => sortTasksChronologically(tasks), [tasks])

  return (
    <div className="flex flex-col gap-[3px] min-h-[44px]">
      {(isSaving || savedIndicator) && (
        <div
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--app-card-alt)] border border-[var(--app-border)] rounded-md text-xs font-medium text-[var(--app-text)] mb-1 w-fit transition-opacity duration-300"
        >
          {isSaving ? (
            <>
              <Loader2 size={14} className="animate-spin shrink-0 text-[var(--app-text-muted)]" />
              <span>Zapisywanie…</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400">Zapisano</span>
            </>
          )}
        </div>
      )}

      {tasks.length === 0 && !showAddForm && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowAddForm(true)}
          onFocus={() => setShowAddForm(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAddForm(true) } }}
          className="text-sm text-[var(--app-text-muted)] py-2.5 cursor-pointer min-h-[40px] flex items-center rounded-[3px] outline-none"
          title="Kliknij lub ustaw kursor, aby dodać zadanie"
        >
          -
        </div>
      )}

      {sortedTasks.map((task, index) => {
        const originalIndex = task.id
          ? tasks.findIndex(t => t.id === task.id)
          : tasks.findIndex(t =>
              t.text === task.text &&
              t.startTime === task.startTime &&
              t.endTime === task.endTime &&
              JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy) &&
              t.status === task.status
            )
        const isEditing = editingIndex === originalIndex
        const isInlineEditing = inlineEditingIndex === originalIndex
        const taskNumber = index + 1

        return (
          <div
            key={task.id || index}
            draggable={!!onDragStart}
            onDragStart={onDragStart ? (e) => onDragStart(e, originalIndex) : undefined}
            onDragEnd={onDragEnd}
            className={cn(
              'flex gap-1 items-center p-[3px] bg-[var(--app-card-alt)] rounded-[3px] border border-[var(--app-border)] min-h-[22px] transition-opacity duration-200',
              index < sortedTasks.length - 1 ? 'mb-[2px]' : 'mb-0',
              onDragStart ? 'cursor-grab hover:opacity-90' : 'cursor-default'
            )}
          >
            {/* Task number badge */}
            <div className="min-w-[18px] h-[18px] flex items-center justify-center bg-[var(--app-accent)] text-[var(--app-accent-foreground)] rounded-[2px] text-[10px] font-semibold shrink-0 self-start mr-2">
              {taskNumber}
            </div>

            {isInlineEditing ? (
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={inlineEditingText}
                  onChange={(e) => setInlineEditingText(e.target.value)}
                  onBlur={() => handleInlineSave(task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleInlineSave(task) }
                    else if (e.key === 'Escape') { handleInlineCancel() }
                  }}
                  className="flex-1 px-1.5 py-[3px] text-[13px] bg-[var(--app-card-alt)] text-[var(--app-text)] border border-[var(--app-accent)] rounded-[3px] outline-none"
                  autoFocus
                />
                <button
                  onClick={() => handleInlineSave(task)}
                  className="p-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-emerald-500 bg-transparent border-none cursor-pointer flex items-center justify-center"
                  aria-label="Zapisz zmiany"
                  title="Zapisz"
                >
                  <Check size={14} color="#10B981" />
                </button>
                <button
                  onClick={handleInlineCancel}
                  className="p-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-red-500 bg-transparent border-none cursor-pointer flex items-center justify-center"
                  aria-label="Anuluj edycję"
                  title="Anuluj"
                >
                  <X size={14} color="#EF4444" />
                </button>
              </div>
            ) : isEditing ? (
              <div className="flex-1">
                <TaskForm
                  mode="edit"
                  task={task}
                  assigners={assigners}
                  onSave={(data) => handleSave(task, data)}
                  onCancel={() => setEditingIndex(null)}
                />
              </div>
            ) : (
              <>
                <div
                  className="flex-1 cursor-text"
                  onClick={() => handleInlineEdit(task)}
                  title="Kliknij aby edytować"
                >
                  <div className="text-[13px] text-[var(--app-text)] break-words leading-[1.3] mb-0.5">
                    {renderTextWithLinks(task.text)}
                  </div>
                  <div className={cn(
                    'text-[10px] text-[var(--app-text-muted)] font-medium flex items-center gap-[3px]',
                    task.attachments?.length ? 'mb-1' : 'mb-0'
                  )}>
                    <Clock size={11} className="text-[var(--app-text-muted)]" />
                    {task.startTime || '08:00'} - {task.endTime || '16:00'}
                  </div>
                  {task.attachments && task.attachments.length > 0 && (
                    <AttachmentGallery
                      attachments={task.attachments}
                      onOpenLightbox={(urls, idx) => setLightbox({ urls, index: idx })}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingIndex(originalIndex)
                    }}
                    aria-label="Edytuj szczegóły"
                    title="Edytuj szczegóły"
                    className="w-[26px] h-[26px] min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-[#d22f27] hover:bg-[var(--app-card)] hover:text-[#d22f27]"
                  >
                    <Edit2 size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(task) }}
                    aria-label="Duplikuj zadanie"
                    title="Duplikuj (+1h)"
                    className="w-[26px] h-[26px] min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-[var(--app-text-muted)] hover:bg-[var(--app-card)] hover:text-[var(--app-text)]"
                  >
                    <Copy size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); handleDelete(task) }}
                    aria-label="Usuń zadanie"
                    title="Usuń"
                    className="w-[26px] h-[26px] min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-red-500 hover:bg-[var(--app-card)] hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </>
            )}
          </div>
        )
      })}

      {editingIndex === null && (
        <>
          {!showAddForm ? (
            <div className="flex justify-end mt-1">
              <button
                onClick={() => setShowAddForm(true)}
                className="w-7 h-7 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-full bg-transparent text-[#d22f27] border-2 border-[var(--app-accent)] ring-2 ring-[var(--app-accent)] ring-offset-2 ring-offset-[var(--app-card)] flex items-center justify-center text-sm font-light cursor-pointer transition-all duration-200 hover:bg-[#d22f27] hover:text-white hover:scale-110"
                aria-label="Dodaj zadanie"
                title="Dodaj zadanie"
              >
                <Plus size={12} color="#d22f27" className="group-hover:text-white" />
              </button>
            </div>
          ) : (
            <TaskForm
              mode="add"
              assigners={assigners}
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              uploadingAttachment={uploadingAttachment}
            />
          )}
        </>
      )}

      <Lightbox lightbox={lightbox} setLightbox={setLightbox} />
    </div>
  )
}
