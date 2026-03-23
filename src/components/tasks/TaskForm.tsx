import React, { useState } from 'react'
import { Check, X, Clock, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/contexts/ToastContext'
import { basePath } from '@/lib/apiBase'
import { Task, TaskStatus, statusOptions } from './types'
import AssignerPicker from './AssignerPicker'
import AttachmentGallery from './AttachmentGallery'

// ── Add-mode props ───────────────────────────────────────────────────────────
interface AddModeProps {
  mode: 'add'
  task?: undefined
  taskId?: undefined
  assigners: any[]
  onSave: (data: {
    text: string
    assignedBy: string[]
    startTime: string
    endTime: string
    status: TaskStatus
    pendingFiles: File[]
  }) => void
  onCancel: () => void
  uploadingAttachment?: boolean
}

// ── Edit-mode props ──────────────────────────────────────────────────────────
interface EditModeProps {
  mode: 'edit'
  task: Task
  taskId?: string
  assigners: any[]
  onSave: (data: {
    text: string
    assignedBy: string[]
    startTime: string
    endTime: string
    status: TaskStatus
    attachments: string[]
  }) => void
  onCancel: () => void
  uploadingAttachment?: boolean
}

type TaskFormProps = AddModeProps | EditModeProps

export default function TaskForm(props: TaskFormProps) {
  const { mode, assigners, onSave, onCancel, uploadingAttachment = false } = props

  const [text, setText] = useState(mode === 'edit' ? props.task.text : '')
  const [assignedBy, setAssignedBy] = useState<string[]>(
    mode === 'edit'
      ? Array.isArray(props.task.assignedBy)
        ? props.task.assignedBy
        : props.task.assignedBy
        ? [props.task.assignedBy as unknown as string]
        : []
      : []
  )
  const [startTime, setStartTime] = useState(mode === 'edit' ? props.task.startTime || '' : '')
  const [endTime, setEndTime] = useState(mode === 'edit' ? props.task.endTime || '' : '')
  const [status, setStatus] = useState<TaskStatus>(mode === 'edit' ? props.task.status : 'do zrobienia')

  // Edit mode: managed list of already-uploaded attachment URLs
  const [attachments, setAttachments] = useState<string[]>(
    mode === 'edit' ? (Array.isArray(props.task.attachments) ? [...props.task.attachments] : []) : []
  )

  // Add mode: files pending upload (uploaded after task is created)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  const { showToast } = useToast()

  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)

  const handleOpenLightbox = (urls: string[], index: number) => {
    setLightbox({ urls, index })
  }

  const handleSubmit = () => {
    if (!text.trim()) return
    if (mode === 'add') {
      ;(props as AddModeProps).onSave({
        text: text.trim(),
        assignedBy,
        startTime,
        endTime,
        status,
        pendingFiles,
      })
    } else {
      ;(props as EditModeProps).onSave({
        text: text.trim(),
        assignedBy,
        startTime,
        endTime,
        status,
        attachments,
      })
    }
  }

  return (
    <div className="flex flex-col gap-2.5 p-[12px_14px] mt-1.5 bg-[var(--app-card)] border border-[var(--app-border)] rounded-lg shadow-sm">
      {mode === 'edit' && props.task.id ? (
        <div className="text-[10px] text-[var(--app-text-muted)] font-semibold mb-0.5">
          Zadanie #{props.task.id}
        </div>
      ) : null}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={mode === 'add' ? 'Dodaj zadanie...' : 'Treść zadania...'}
        onKeyDown={mode === 'add' ? (e) => { if (e.key === 'Enter' && e.ctrlKey) handleSubmit() } : undefined}
        className="w-full px-2.5 py-2 border border-[var(--app-border)] rounded-md text-[13px] min-h-[56px] resize-y bg-[var(--app-card-alt)] text-[var(--app-text)] font-[inherit] outline-none"
        autoFocus
      />

      {/* Time inputs */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--app-text-muted)] mb-1">
            <Clock size={10} className="text-[var(--app-text-muted)]" />
            Czas OD
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-2 pointer-events-none flex items-center text-[var(--app-text-muted)]">
              <Clock size={12} />
            </span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full py-1.5 pr-2 pl-7 border border-[var(--app-border)] rounded-md text-xs bg-[var(--app-card-alt)] text-[var(--app-text)] font-[inherit] outline-none"
            />
          </div>
        </div>
        <div className="flex-1">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--app-text-muted)] mb-1">
            <Clock size={10} className="text-[var(--app-text-muted)]" />
            Czas DO
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-2 pointer-events-none flex items-center text-[var(--app-text-muted)]">
              <Clock size={12} />
            </span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full py-1.5 pr-2 pl-7 border border-[var(--app-border)] rounded-md text-xs bg-[var(--app-card-alt)] text-[var(--app-text)] font-[inherit] outline-none"
            />
          </div>
        </div>
      </div>

      {/* Assigner picker */}
      <AssignerPicker
        selectedAssigners={assignedBy}
        onChangeAssigners={setAssignedBy}
        assigners={assigners}
      />

      {/* Status select */}
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as TaskStatus)}
        className="w-full px-1.5 py-[3px] border border-[var(--app-accent)] rounded-[3px] text-[13px] bg-[var(--app-card-alt)] text-[var(--app-text)] font-[inherit] outline-none cursor-pointer"
      >
        {statusOptions.map(s => (
          <option key={s} value={s} className="bg-[var(--app-card-alt)] text-[var(--app-text)]">
            {s}
          </option>
        ))}
      </select>

      {/* Attachments */}
      <div className="mt-1.5">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--app-text-muted)] mb-1">
          <Paperclip size={10} className="text-[var(--app-text-muted)]" />
          {mode === 'add' ? 'Załączniki (dodane po zapisie)' : 'Załączniki'}
        </label>

        {mode === 'edit' ? (
          <AttachmentGallery
            attachments={attachments}
            onChangeAttachments={setAttachments}
            taskId={props.taskId ?? props.task.id}
            onOpenLightbox={handleOpenLightbox}
            editable
          />
        ) : (
          /* Add mode: local pending files list + drop zone */
          <>
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1 text-[11px] text-[var(--app-text-muted)]">
                {pendingFiles.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--app-card-alt)] rounded-[4px]">
                    {f.name}
                    <button
                      type="button"
                      onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))}
                      className="bg-none border-none cursor-pointer p-0"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {pendingFiles.length < 10 && (
              <div
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'var(--app-border)' }}
                onDragLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.currentTarget.style.background = 'transparent'
                  setPendingFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)].slice(0, 10))
                }}
                onClick={() => document.getElementById('new-attachment-input')?.click()}
                className="border border-dashed border-[var(--app-border)] rounded-md p-2 text-center text-[11px] text-[var(--app-text-muted)] cursor-pointer bg-transparent"
              >
                <input
                  id="new-attachment-input"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : []
                    e.target.value = ''
                    setPendingFiles(prev => [...prev, ...files].slice(0, 10))
                  }}
                />
                Przeciągnij pliki lub kliknij
              </div>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-1.5">
        <Button
          type="button"
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={handleSubmit}
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
          onClick={onCancel}
        >
          <X size={12} className="mr-1.5" />
          Anuluj
        </Button>
      </div>
    </div>
  )
}
