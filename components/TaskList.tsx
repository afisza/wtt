'use client'

import { useState, useEffect } from 'react'
import { Edit2, Trash2, Plus, X, Check, Clock, Loader2, FileText, Paperclip, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { generateTaskId } from '@/lib/taskId'
import { basePath, assetUrl } from '@/lib/apiBase'

/** Wspólny styl karty formularza (shadcn-like) */
const formCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '12px 14px',
  marginTop: '6px',
  background: 'var(--app-card)',
  border: '1px solid var(--app-border)',
  borderRadius: '8px',
  boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
}
const formLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '11px',
  fontWeight: '600',
  color: 'var(--app-text-muted)',
  marginBottom: '4px',
}
const formInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px 6px 28px',
  border: '1px solid var(--app-border)',
  borderRadius: '6px',
  fontSize: '12px',
  background: 'var(--app-card-alt)',
  color: 'var(--app-text)',
  fontFamily: 'inherit',
  outline: 'none',
}
const formTimeWrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
}
const formTimeIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '8px',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  color: 'var(--app-text-muted)',
}

// Funkcja do wykrywania i renderowania linków w tekście
const renderTextWithLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g
  
  const parts: (string | JSX.Element)[] = []
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
        style={{ color: 'var(--app-accent)', textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.85'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--app-accent)'
          e.currentTarget.style.opacity = '1'
        }}
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

interface TaskListProps {
  date: string
  tasks: Task[]
  onUpdate: (tasks: Task[]) => void
  onDragStart?: (e: React.DragEvent, taskIndex: number) => void
  onDragEnd?: (e: React.DragEvent) => void
}

const statusOptions: TaskStatus[] = ['wykonano', 'w trakcie', 'do zrobienia', 'anulowane', 'zaplanowano']

export default function TaskList({ date, tasks, onUpdate, onDragStart, onDragEnd }: TaskListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [inlineEditingIndex, setInlineEditingIndex] = useState<number | null>(null)
  const [inlineEditingText, setInlineEditingText] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [newAssignedBy, setNewAssignedBy] = useState<string[]>([])
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set())
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  const [newStatus, setNewStatus] = useState<TaskStatus>('do zrobienia')
  const [editingTask, setEditingTask] = useState('')
  const [editingAssignedBy, setEditingAssignedBy] = useState<string[]>([])
  const [editingStartTime, setEditingStartTime] = useState('')
  const [editingEndTime, setEditingEndTime] = useState('')
  const [editingStatus, setEditingStatus] = useState<TaskStatus>('do zrobienia')
  const [assigners, setAssigners] = useState<any[]>([])
  const [showAssignerDropdown, setShowAssignerDropdown] = useState<number | null>(null)
  const [showNewAssignerDropdown, setShowNewAssignerDropdown] = useState(false)
  const [assignerSearchQuery, setAssignerSearchQuery] = useState('')
  const [editingAssignerSearchQuery, setEditingAssignerSearchQuery] = useState<Record<number, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [editingAttachments, setEditingAttachments] = useState<string[]>([])
  const [newPendingFiles, setNewPendingFiles] = useState<File[]>([])
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const { showToast } = useToast()

  const deleteTaskAttachment = async (url: string): Promise<void> => {
    const res = await fetch(`${basePath}/api/task-attachments?url=${encodeURIComponent(url)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Błąd usuwania pliku')
  }

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

  useEffect(() => {
    const loadAssigners = async () => {
      try {
        const response = await fetch(`${basePath}/api/assigners`, {
          credentials: 'include',
        })
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
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-assigner-dropdown]')) {
        setShowAssignerDropdown(null)
        setShowNewAssignerDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    if (!lightbox) return
    const handleArrow = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setLightbox(prev => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : null)
      } else if (e.key === 'ArrowRight') {
        setLightbox(prev => prev ? { ...prev, index: Math.min(prev.urls.length - 1, prev.index + 1) } : null)
      }
    }
    document.addEventListener('keydown', handleArrow)
    return () => document.removeEventListener('keydown', handleArrow)
  }, [lightbox])
  
  const getAssignerByName = (name: string) => {
    return assigners.find(a => a.name === name)
  }
  
  const getFilteredAssigners = (query: string) => {
    if (!query || query.length < 2) {
      return []
    }
    const lowerQuery = query.toLowerCase()
    return assigners.filter(a => 
      a.name.toLowerCase().includes(lowerQuery)
    )
  }

  // Funkcja do sortowania zadań chronologicznie według czasu "od" i "do"
  const sortTasksChronologically = (tasksToSort: Task[]): Task[] => {
    return [...tasksToSort].sort((a, b) => {
      // Konwertuj czas na minuty od początku dnia dla łatwiejszego porównania
      const parseTime = (time: string): number => {
        const [hours, minutes] = (time || '08:00').split(':').map(Number)
        return hours * 60 + minutes
      }
      
      const aStart = parseTime(a.startTime)
      const bStart = parseTime(b.startTime)
      
      // Najpierw sortuj według czasu rozpoczęcia
      if (aStart !== bStart) {
        return aStart - bStart
      }
      
      // Jeśli czas rozpoczęcia jest taki sam, sortuj według czasu zakończenia
      const aEnd = parseTime(a.endTime)
      const bEnd = parseTime(b.endTime)
      return aEnd - bEnd
    })
  }

  const handleAdd = () => {
    if (!newTask.trim()) return
    setIsSaving(true)
    const existingIds = new Set(tasks.map(t => t.id).filter(Boolean))
    const id = generateTaskId(existingIds)
    const newTaskObj: Task = {
      id,
      text: newTask.trim(),
      assignedBy: newAssignedBy,
      startTime: newStartTime.trim() || '08:00',
      endTime: newEndTime.trim() || '16:00',
      status: newStatus,
      attachments: [],
    }
    const files = [...newPendingFiles]
    setNewPendingFiles([])
    const clearForm = () => {
      setNewTask('')
      setNewAssignedBy([])
      setNewStartTime('')
      setNewEndTime('')
      setNewStatus('do zrobienia')
      setShowAddForm(false)
    }
    if (files.length > 0) {
      setUploadingAttachment(true)
      Promise.all(files.slice(0, 10).map(f => uploadTaskAttachment(id, f)))
        .then(urls => {
          const valid = urls.filter(Boolean) as string[]
          onUpdate([...tasks, { ...newTaskObj, attachments: valid }])
          showToast('Zadanie zostało dodane', 'success')
          clearForm()
        })
        .catch(err => showToast(err?.message || 'Błąd dodawania załączników', 'error'))
        .finally(() => { setUploadingAttachment(false); setTimeout(() => setIsSaving(false), 500) })
    } else {
      onUpdate([...tasks, newTaskObj])
      showToast('Zadanie zostało dodane', 'success')
      clearForm()
      setTimeout(() => setIsSaving(false), 1000)
    }
  }

  const handleCancelAdd = () => {
    setNewTask('')
    setNewAssignedBy([])
    setNewStartTime('')
    setNewEndTime('')
    setNewStatus('do zrobienia')
    setNewPendingFiles([])
    setShowAddForm(false)
  }

  const handleInlineEdit = (task: Task) => {
    const originalIndex = task.id ? tasks.findIndex(t => t.id === task.id) : tasks.findIndex(t => 
      t.text === task.text && t.startTime === task.startTime && t.endTime === task.endTime &&
      JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy)
    )
    setInlineEditingIndex(originalIndex)
    setInlineEditingText(task.text)
  }

  const handleInlineSave = (task: Task) => {
    if (inlineEditingText.trim()) {
      const originalIndex = task.id ? tasks.findIndex(t => t.id === task.id) : tasks.findIndex(t => 
        t.text === task.text && t.startTime === task.startTime && t.endTime === task.endTime &&
        JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy)
      )
      if (originalIndex !== -1) {
        setIsSaving(true)
        const updated = [...tasks]
        updated[originalIndex] = { ...updated[originalIndex], text: inlineEditingText.trim() }
        onUpdate(updated)
        showToast('Zadanie zostało zaktualizowane', 'success')
        setTimeout(() => setIsSaving(false), 1000)
      }
    }
    setInlineEditingIndex(null)
    setInlineEditingText('')
  }

  const handleInlineCancel = () => {
    setInlineEditingIndex(null)
    setInlineEditingText('')
  }

  const handleEdit = (task: Task) => {
    const originalIndex = task.id ? tasks.findIndex(t => t.id === task.id) : tasks.findIndex(t => 
      t.text === task.text && t.startTime === task.startTime && t.endTime === task.endTime &&
      JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy)
    )
    setEditingIndex(originalIndex)
    setEditingTask(task.text)
    setEditingAssignedBy(Array.isArray(task.assignedBy) ? task.assignedBy : (task.assignedBy ? [task.assignedBy] : []))
    setEditingStartTime(task.startTime || '')
    setEditingEndTime(task.endTime || '')
    setEditingStatus(task.status)
    setEditingAttachments(Array.isArray(task.attachments) ? [...task.attachments] : [])
  }

  const handleSave = (task: Task) => {
    if (editingTask.trim()) {
      const originalIndex = task.id ? tasks.findIndex(t => t.id === task.id) : tasks.findIndex(t => 
        t.text === task.text && t.startTime === task.startTime && t.endTime === task.endTime &&
        JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy)
      )
      if (originalIndex !== -1) {
        setIsSaving(true)
        const updated = [...tasks]
        const existing = updated[originalIndex]
        updated[originalIndex] = { 
          id: existing.id,
          text: editingTask.trim(), 
          assignedBy: editingAssignedBy,
          startTime: editingStartTime.trim() || '08:00',
          endTime: editingEndTime.trim() || '16:00',
          status: editingStatus,
          attachments: editingAttachments.length ? editingAttachments : (existing.attachments || [])
        }
        onUpdate(updated)
        showToast('Zadanie zostało zaktualizowane', 'success')
        setTimeout(() => setIsSaving(false), 1000)
      }
    }
    setEditingIndex(null)
    setEditingTask('')
    setEditingAssignedBy([])
    setEditingStartTime('')
    setEditingEndTime('')
    setEditingStatus('do zrobienia')
    setEditingAttachments([])
  }

  const handleDelete = (task: Task) => {
    const updated = task.id
      ? tasks.filter(t => t.id !== task.id)
      : tasks.filter(t => !(t.text === task.text && t.startTime === task.startTime && t.endTime === task.endTime && JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy)))
    onUpdate(updated)
    showToast('Zadanie zostało usunięte', 'success')
  }

  const addOneHour = (time: string): string => {
    const [h, m] = (time || '08:00').split(':').map(Number)
    const next = (h + 1) * 60 + m
    const hours = Math.floor(next / 60) % 24
    const mins = next % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }

  const handleDuplicate = (task: Task) => {
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
    const idx = task.id ? tasks.findIndex(t => t.id === task.id) : tasks.findIndex(t => t.text === task.text && t.startTime === task.startTime && t.endTime === task.endTime && JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy))
    const insertAt = idx >= 0 ? idx + 1 : tasks.length
    const updated = [...tasks.slice(0, insertAt), duplicate, ...tasks.slice(insertAt)]
    onUpdate(updated)
    showToast('Zadanie skopiowane (+1h)', 'success')
  }

  // Sortuj zadania chronologicznie przed renderowaniem
  const sortedTasks = sortTasksChronologically(tasks)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '44px' }}>
      {isSaving && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: 'var(--app-card-alt)',
            border: '1px solid var(--app-border)',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            color: 'var(--app-text)',
            marginBottom: '4px',
            width: 'fit-content',
          }}
        >
          <Loader2 size={14} className="animate-spin" style={{ flexShrink: 0, color: 'var(--app-text-muted)' }} />
          <span>Zapisywanie…</span>
        </div>
      )}
      {tasks.length === 0 && !showAddForm && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowAddForm(true)}
          onFocus={() => setShowAddForm(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowAddForm(true) } }}
          style={{
            fontSize: '13px',
            color: 'var(--app-text-muted)',
            padding: '10px 0',
            cursor: 'pointer',
            minHeight: '40px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '3px',
            outline: 'none'
          }}
          title="Kliknij lub ustaw kursor, aby dodać zadanie"
        >
          -
        </div>
      )}
      {sortedTasks.map((task, index) => {
        // Znajdź oryginalny indeks zadania w nieposortowanej tablicy
        const originalIndex = task.id ? tasks.findIndex(t => t.id === task.id) : tasks.findIndex(t => 
          t.text === task.text && t.startTime === task.startTime && t.endTime === task.endTime &&
          JSON.stringify(t.assignedBy) === JSON.stringify(task.assignedBy) && t.status === task.status
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
            style={{ 
              display: 'flex', 
              gap: '4px', 
              alignItems: 'center', 
              padding: '3px', 
              background: 'var(--app-card-alt)', 
              borderRadius: '3px', 
              border: '1px solid var(--app-border)', 
              marginBottom: index < sortedTasks.length - 1 ? '2px' : '0px', 
              minHeight: '22px',
              cursor: onDragStart ? 'grab' : 'default',
              transition: 'opacity 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (onDragStart && e.currentTarget instanceof HTMLElement) {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.cursor = 'grab'
              }
            }}
            onMouseLeave={(e) => {
              if (onDragStart && e.currentTarget instanceof HTMLElement) {
                e.currentTarget.style.opacity = '1'
              }
            }}
          >
            {/* Numer zadania */}
            <div style={{ minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', borderRadius: '2px', fontSize: '10px', fontWeight: '600', flexShrink: 0, alignSelf: 'flex-start', marginRight: '8px' }}>
              {taskNumber}
            </div>

            {isInlineEditing ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  value={inlineEditingText}
                  onChange={(e) => setInlineEditingText(e.target.value)}
                  onBlur={() => handleInlineSave(task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleInlineSave(task)
                    } else if (e.key === 'Escape') {
                      handleInlineCancel()
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '3px 6px',
                    fontSize: '13px',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    border: '1px solid var(--app-accent)',
                    borderRadius: '3px',
                    outline: 'none'
                  }}
                  autoFocus
                />
                <button
                  onClick={() => handleInlineSave(task)}
                  style={{ padding: '2px', color: '#10B981', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  title="Zapisz"
                >
                  <Check size={12} color="#10B981" />
                </button>
                <button
                  onClick={handleInlineCancel}
                  style={{ padding: '2px', color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  title="Anuluj"
                >
                  <X size={12} color="#EF4444" />
                </button>
              </div>
            ) : isEditing ? (
              <div style={{ flex: 1, ...formCardStyle }}>
                {task.id ? (
                  <div style={{ fontSize: '10px', color: 'var(--app-text-muted)', fontWeight: '600', marginBottom: '2px' }}>Zadanie #{task.id}</div>
                ) : null}
                <textarea
                  value={editingTask}
                  onChange={(e) => setEditingTask(e.target.value)}
                  placeholder="Treść zadania..."
                  style={{ 
                    width: '100%', 
                    padding: '8px 10px', 
                    border: '1px solid var(--app-border)', 
                    borderRadius: '6px', 
                    fontSize: '13px',
                    minHeight: '56px',
                    resize: 'vertical',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={formLabelStyle}>
                      <Clock size={10} style={{ color: 'var(--app-text-muted)' }} />
                      Czas OD
                    </label>
                    <div style={formTimeWrapperStyle}>
                      <span style={formTimeIconStyle}><Clock size={12} /></span>
                      <input
                        type="time"
                        value={editingStartTime}
                        onChange={(e) => setEditingStartTime(e.target.value)}
                        style={formInputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={formLabelStyle}>
                      <Clock size={10} style={{ color: 'var(--app-text-muted)' }} />
                      Czas DO
                    </label>
                    <div style={formTimeWrapperStyle}>
                      <span style={formTimeIconStyle}><Clock size={12} /></span>
                      <input
                        type="time"
                        value={editingEndTime}
                        onChange={(e) => setEditingEndTime(e.target.value)}
                        style={formInputStyle}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ position: 'relative' }} data-assigner-dropdown>
                  {editingAssignedBy.length > 0 && (
                    <div
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        border: '1px solid var(--app-accent)',
                        borderRadius: '3px',
                        fontSize: '13px',
                        background: 'var(--app-card-alt)',
                        color: 'var(--app-text)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px',
                        marginBottom: '4px',
                        minHeight: '32px'
                      }}
                    >
                      {editingAssignedBy.map((name, idx) => {
                        const assigner = getAssignerByName(name)
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 6px',
                              background: 'var(--app-card)',
                              borderRadius: '12px',
                              fontSize: '11px'
                            }}
                          >
                            {assigner?.avatar && !failedAvatars.has(assigner.avatar) ? (
                              <img
                                src={assetUrl(assigner.avatar)}
                                alt={name}
                                style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }}
                                onError={() => {
                                  if (assigner?.avatar) {
                                    setFailedAvatars(prev => new Set(prev).add(assigner.avatar))
                                  }
                                }}
                              />
                            ) : (
                              <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '600' }}>
                                {name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span>{name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingAssignedBy(editingAssignedBy.filter((_, i) => i !== idx))
                              }}
                              style={{
                                padding: '0',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: 'var(--app-text-muted)',
                                marginLeft: '2px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#EF4444'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#888'
                              }}
                              title="Usuń"
                            >
                              <X size={12} color="currentColor" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <input
                    type="text"
                    value={editingAssignerSearchQuery[editingIndex] || ''}
                    onChange={(e) => {
                      const query = e.target.value
                      setEditingAssignerSearchQuery({ ...editingAssignerSearchQuery, [editingIndex]: query })
                      if (query.length >= 2) {
                        setShowAssignerDropdown(editingIndex)
                      } else {
                        setShowAssignerDropdown(null)
                      }
                    }}
                    placeholder="Wpisz minimum 2 litery aby dodać osobę..."
                    onClick={(e) => {
                      e.stopPropagation()
                      if ((editingAssignerSearchQuery[editingIndex] || '').length >= 2) {
                        setShowAssignerDropdown(editingIndex)
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: '1px solid var(--app-accent)',
                      borderRadius: '3px',
                      fontSize: '13px',
                      background: 'var(--app-card-alt)',
                      color: 'var(--app-text)',
                      outline: 'none'
                    }}
                    autoFocus
                  />
                  {showAssignerDropdown === editingIndex && (editingAssignerSearchQuery[editingIndex] || '').length >= 2 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'var(--app-card-alt)',
                        border: '1px solid var(--app-border)',
                        borderRadius: '3px',
                        marginTop: '4px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                      }}
                    >
                      {getFilteredAssigners(editingAssignerSearchQuery[editingIndex] || '').length === 0 ? (
                        <div style={{ padding: '8px 12px', color: 'var(--app-text-muted)', fontSize: '12px' }}>
                          Brak wyników
                        </div>
                      ) : (
                        getFilteredAssigners(editingAssignerSearchQuery[editingIndex] || '')
                          .filter(assigner => !editingAssignedBy.includes(assigner.name))
                          .map((assigner) => (
                            <div
                              key={assigner.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!editingAssignedBy.includes(assigner.name)) {
                                  setEditingAssignedBy([...editingAssignedBy, assigner.name])
                                }
                                setShowAssignerDropdown(null)
                                setEditingAssignerSearchQuery({ ...editingAssignerSearchQuery, [editingIndex]: '' })
                              }}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderBottom: '1px solid var(--app-border)'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--app-card)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                              }}
                            >
                              {assigner.avatar && !failedAvatars.has(assigner.avatar) ? (
                                <img
                                  src={assetUrl(assigner.avatar)}
                                  alt={assigner.name}
                                  style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                                  onError={() => {
                                    if (assigner.avatar) {
                                      setFailedAvatars(prev => new Set(prev).add(assigner.avatar))
                                    }
                                  }}
                                />
                              ) : (
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--app-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: 'var(--app-accent-foreground)' }}>
                                  {assigner.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span style={{ fontSize: '13px', color: 'var(--app-text)' }}>{assigner.name}</span>
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>
                <select
                  value={editingStatus}
                  onChange={(e) => setEditingStatus(e.target.value as TaskStatus)}
                  style={{ 
                    width: '100%', 
                    padding: '3px 6px', 
                    border: '1px solid var(--app-accent)', 
                    borderRadius: '3px', 
                    fontSize: '13px',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {statusOptions.map(status => (
                    <option key={status} value={status} style={{ background: 'var(--app-card-alt)', color: 'var(--app-text)' }}>{status}</option>
                  ))}
                </select>
                <div style={{ marginTop: '6px' }}>
                  <label style={formLabelStyle}>
                    <Paperclip size={10} style={{ color: 'var(--app-text-muted)' }} />
                    Załączniki
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                    {editingAttachments.map((url, idx) => {
                      const isImg = /\.(jpe?g|png|gif|webp)$/i.test(url) || url.includes('/task-attachments/')
                      return (
                        <div key={idx} style={{ position: 'relative' }}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setLightbox({ urls: editingAttachments, index: idx })}
                            onKeyDown={(e) => e.key === 'Enter' && setLightbox({ urls: editingAttachments, index: idx })}
                            style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--app-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-card-alt)' }}
                          >
                            {isImg ? (
                              <img src={basePath + url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <FileText size={20} style={{ color: 'var(--app-text-muted)' }} />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                await deleteTaskAttachment(url)
                                setEditingAttachments(editingAttachments.filter((_, i) => i !== idx))
                              } catch (_) {
                                setEditingAttachments(editingAttachments.filter((_, i) => i !== idx))
                              }
                            }}
                            style={{ position: 'absolute', top: '-4px', right: '-4px', width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: '#EF4444', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: '10px' }}
                            title="Usuń"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {editingAttachments.length < 10 && (
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'var(--app-border)' }}
                      onDragLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.currentTarget.style.background = 'transparent'
                        const files = Array.from(e.dataTransfer.files)
                        if (!task.id || !files.length) return
                        setUploadingAttachment(true)
                        Promise.all(files.slice(0, 10 - editingAttachments.length).map(f => uploadTaskAttachment(task.id, f)))
                          .then(urls => { setEditingAttachments(prev => [...prev, ...urls.filter(Boolean) as string[]]); showToast('Załącznik dodany', 'success') })
                          .catch(err => showToast(err?.message || 'Błąd dodawania załącznika', 'error'))
                          .finally(() => setUploadingAttachment(false))
                      }}
                      onClick={() => document.getElementById('edit-attachment-input')?.click()}
                      style={{ border: '1px dashed var(--app-border)', borderRadius: '6px', padding: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--app-text-muted)', cursor: 'pointer', background: 'transparent' }}
                    >
                      <input
                        id="edit-attachment-input"
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const files = e.target.files ? Array.from(e.target.files) : []
                          e.target.value = ''
                          if (!task.id || !files.length) return
                          setUploadingAttachment(true)
                          Promise.all(files.slice(0, 10 - editingAttachments.length).map(f => uploadTaskAttachment(task.id, f)))
                            .then(urls => { setEditingAttachments(prev => [...prev, ...urls.filter(Boolean) as string[]]); showToast('Załącznik dodany', 'success') })
                            .catch(err => showToast(err?.message || 'Błąd dodawania załącznika', 'error'))
                            .finally(() => setUploadingAttachment(false))
                        }}
                      />
                      {uploadingAttachment ? 'Dodawanie…' : 'Przeciągnij pliki lub kliknij'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => handleSave(task)}
                  >
                    <Check size={12} className="mr-1.5" />
                    Zapisz
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => {
                      setEditingIndex(null)
                      setEditingTask('')
                      setEditingAssignedBy([])
                      setEditingStartTime('')
                      setEditingEndTime('')
                      setEditingStatus('do zrobienia')
                      setEditingAttachments([])
                    }}
                  >
                    <X size={12} className="mr-1.5" />
                    Anuluj
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div 
                  style={{ flex: 1, cursor: 'text' }}
                  onClick={() => handleInlineEdit(task)}
                  title="Kliknij aby edytować"
                >
                  <div style={{ fontSize: '13px', color: 'var(--app-text)', wordBreak: 'break-word', lineHeight: '1.3', marginBottom: '2px' }}>
                    {renderTextWithLinks(task.text)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--app-text-muted)', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '3px', marginBottom: (task.attachments?.length ? 4 : 0) }}>
                    <Clock size={11} style={{ color: 'var(--app-text-muted)' }} />
                    {task.startTime || '08:00'} - {task.endTime || '16:00'}
                  </div>
                  {task.attachments && task.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                      {task.attachments.slice(0, 5).map((url, idx) => {
                        const isImg = /\.(jpe?g|png|gif|webp)$/i.test(url) || url.includes('/task-attachments/')
                        return (
                          <div
                            key={idx}
                            role="button"
                            tabIndex={0}
                            onClick={() => setLightbox({ urls: task.attachments!, index: idx })}
                            onKeyDown={(e) => e.key === 'Enter' && setLightbox({ urls: task.attachments!, index: idx })}
                            style={{ width: '28px', height: '28px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--app-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-card-alt)' }}
                          >
                            {isImg ? (
                              <img src={basePath + url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <FileText size={14} style={{ color: 'var(--app-text-muted)' }} />
                            )}
                          </div>
                        )
                      })}
                      {task.attachments.length > 5 && (
                        <span style={{ fontSize: '10px', color: 'var(--app-text-muted)', alignSelf: 'center' }}>+{task.attachments.length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(task)
                    }}
                    style={{ padding: '4px', color: '#d22f27', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                    title="Edytuj szczegóły"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--app-card)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <Edit2 size={15} color="#d22f27" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicate(task)
                    }}
                    style={{ padding: '4px', color: 'var(--app-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                    title="Duplikuj (+1h)"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--app-card)'
                      e.currentTarget.style.color = 'var(--app-text)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--app-text-muted)'
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(task)
                    }}
                    style={{ padding: '4px', color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                    title="Usuń"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--app-card)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <Trash2 size={15} color="#EF4444" />
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}
      
      {editingIndex === null && (
        <>
          {!showAddForm ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'transparent',
                  color: '#d22f27',
                  border: '1px solid var(--app-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: '300',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#d22f27'
                  e.currentTarget.style.color = '#ffffff'
                  e.currentTarget.style.transform = 'scale(1.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--app-accent)'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
                title="Dodaj zadanie"
              >
                <Plus size={12} color="#d22f27" />
              </button>
            </div>
          ) : (
            <div style={formCardStyle}>
              <textarea
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Dodaj zadanie..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    handleAdd()
                  }
                }}
                style={{ 
                  width: '100%', 
                  padding: '8px 10px', 
                  border: '1px solid var(--app-border)', 
                  borderRadius: '6px', 
                  fontSize: '13px',
                  minHeight: '56px',
                  resize: 'vertical',
                  background: 'var(--app-card-alt)',
                  color: 'var(--app-text)',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={formLabelStyle}>
                    <Clock size={10} style={{ color: 'var(--app-text-muted)' }} />
                    Czas OD
                  </label>
                  <div style={formTimeWrapperStyle}>
                    <span style={formTimeIconStyle}><Clock size={12} /></span>
                    <input
                      type="time"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      style={formInputStyle}
                    />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={formLabelStyle}>
                    <Clock size={10} style={{ color: 'var(--app-text-muted)' }} />
                    Czas DO
                  </label>
                  <div style={formTimeWrapperStyle}>
                    <span style={formTimeIconStyle}><Clock size={12} /></span>
                    <input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      style={formInputStyle}
                    />
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative' }} data-assigner-dropdown>
                {newAssignedBy.length > 0 && (
                  <div
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      border: '1px solid var(--app-border)',
                      borderRadius: '3px',
                      fontSize: '13px',
                      background: 'var(--app-card-alt)',
                      color: 'var(--app-text)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px',
                      marginBottom: '4px',
                      minHeight: '32px'
                    }}
                  >
                    {newAssignedBy.map((name, idx) => {
                      const assigner = getAssignerByName(name)
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            background: 'var(--app-card)',
                            borderRadius: '12px',
                            fontSize: '11px'
                          }}
                        >
                          {assigner?.avatar && !failedAvatars.has(assigner.avatar) ? (
                            <img
                              src={assetUrl(assigner.avatar)}
                              alt={name}
                              style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }}
                              onError={() => {
                                if (assigner?.avatar) {
                                  setFailedAvatars(prev => new Set(prev).add(assigner.avatar))
                                }
                              }}
                            />
                          ) : (
                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '600' }}>
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span>{name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setNewAssignedBy(newAssignedBy.filter((_, i) => i !== idx))
                            }}
                            style={{
                              padding: '0',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              color: 'var(--app-text-muted)',
                              marginLeft: '2px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#EF4444'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#888'
                            }}
                            title="Usuń"
                          >
                            <X size={12} color="currentColor" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <input
                  type="text"
                  value={assignerSearchQuery}
                  onChange={(e) => {
                    const query = e.target.value
                    setAssignerSearchQuery(query)
                    if (query.length >= 2) {
                      setShowNewAssignerDropdown(true)
                    } else {
                      setShowNewAssignerDropdown(false)
                    }
                  }}
                  placeholder="Wpisz minimum 2 litery aby dodać osobę..."
                  onClick={(e) => {
                    e.stopPropagation()
                    if (assignerSearchQuery.length >= 2) {
                      setShowNewAssignerDropdown(true)
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    border: '1px solid var(--app-border)',
                    borderRadius: '3px',
                    fontSize: '13px',
                    background: 'var(--app-card-alt)',
                    color: 'var(--app-text)',
                    outline: 'none'
                  }}
                  autoFocus
                />
                {showNewAssignerDropdown && assignerSearchQuery.length >= 2 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--app-card-alt)',
                      border: '1px solid var(--app-border)',
                      borderRadius: '3px',
                      marginTop: '4px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                    }}
                  >
                    {getFilteredAssigners(assignerSearchQuery).length === 0 ? (
                      <div style={{ padding: '8px 12px', color: 'var(--app-text-muted)', fontSize: '12px' }}>
                        Brak wyników
                      </div>
                    ) : (
                      getFilteredAssigners(assignerSearchQuery)
                        .filter(assigner => !newAssignedBy.includes(assigner.name))
                        .map((assigner) => (
                          <div
                            key={assigner.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!newAssignedBy.includes(assigner.name)) {
                                setNewAssignedBy([...newAssignedBy, assigner.name])
                              }
                              setShowNewAssignerDropdown(false)
                              setAssignerSearchQuery('')
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              borderBottom: '1px solid var(--app-border)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--app-card)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            {assigner.avatar && !failedAvatars.has(assigner.avatar) ? (
                              <img
                                src={assetUrl(assigner.avatar)}
                                alt={assigner.name}
                                style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                                onError={() => {
                                  if (assigner.avatar) {
                                    setFailedAvatars(prev => new Set(prev).add(assigner.avatar))
                                  }
                                }}
                              />
                            ) : (
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--app-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: 'var(--app-accent-foreground)' }}>
                                {assigner.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span style={{ fontSize: '13px', color: 'var(--app-text)' }}>{assigner.name}</span>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                style={{ 
                  width: '100%', 
                  padding: '3px 6px', 
                  border: '1px solid var(--app-border)', 
                  borderRadius: '3px', 
                  fontSize: '13px',
                  background: 'var(--app-card-alt)',
                  color: 'var(--app-text)',
                  fontFamily: 'inherit',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {statusOptions.map(status => (
                  <option key={status} value={status} style={{ background: 'var(--app-card-alt)', color: 'var(--app-text)' }}>{status}</option>
                ))}
              </select>
              <div style={{ marginTop: '6px' }}>
                <label style={formLabelStyle}>
                  <Paperclip size={10} style={{ color: 'var(--app-text-muted)' }} />
                  Załączniki (dodane po zapisie)
                </label>
                {newPendingFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px', fontSize: '11px', color: 'var(--app-text-muted)' }}>
                    {newPendingFiles.map((f, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', background: 'var(--app-card-alt)', borderRadius: '4px' }}>
                        {f.name}
                        <button type="button" onClick={() => setNewPendingFiles(newPendingFiles.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                {newPendingFiles.length < 10 && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'var(--app-border)' }}
                    onDragLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.currentTarget.style.background = 'transparent'
                      setNewPendingFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)].slice(0, 10))
                    }}
                    onClick={() => document.getElementById('new-attachment-input')?.click()}
                    style={{ border: '1px dashed var(--app-border)', borderRadius: '6px', padding: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--app-text-muted)', cursor: 'pointer', background: 'transparent' }}
                  >
                    <input
                      id="new-attachment-input"
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : []
                        e.target.value = ''
                        setNewPendingFiles(prev => [...prev, ...files].slice(0, 10))
                      }}
                    />
                    Przeciągnij pliki lub kliknij
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={handleAdd}
                  disabled={uploadingAttachment}
                >
                  <Check size={12} className="mr-1.5" />
                  Zapisz
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={handleCancelAdd}
                >
                  <X size={12} className="mr-1.5" />
                  Anuluj
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: '12px', right: '12px', background: 'var(--app-card)', border: '1px solid var(--app-border)', borderRadius: '6px', padding: '8px', cursor: 'pointer', color: 'var(--app-text)', fontSize: '14px' }}
          >
            Zamknij
          </button>
          {lightbox.urls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightbox(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : null) }}
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', background: 'var(--app-card)', border: '1px solid var(--app-border)', borderRadius: '6px', padding: '8px', cursor: 'pointer', color: 'var(--app-text)' }}
                aria-label="Poprzedni"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightbox(prev => prev && prev.index < prev.urls.length - 1 ? { ...prev, index: prev.index + 1 } : null) }}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'var(--app-card)', border: '1px solid var(--app-border)', borderRadius: '6px', padding: '8px', cursor: 'pointer', color: 'var(--app-text)' }}
                aria-label="Następny"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {(() => {
              const url = lightbox.urls[lightbox.index]
              if (!url) return null
              const isImg = /\.(jpe?g|png|gif|webp)$/i.test(url) || url.includes('/task-attachments/')
              return isImg ? (
                <img src={basePath + url} alt="" style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }} />
              ) : (
                <a href={basePath + url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--app-accent)', fontSize: '16px' }}>Otwórz / Pobierz plik</a>
              )
            })()}
          </div>
          {lightbox.urls.length > 1 && (
            <span style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', color: 'var(--app-text-muted)', fontSize: '12px' }}>
              {lightbox.index + 1} / {lightbox.urls.length}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
