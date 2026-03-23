import React from 'react'
import { FileText, X } from 'lucide-react'
import { attachmentSrc } from './types'
import { basePath } from '@/lib/apiBase'
import { useToast } from '@/contexts/ToastContext'

interface AttachmentGalleryProps {
  attachments: string[]
  onChangeAttachments?: (urls: string[]) => void
  taskId?: string
  onOpenLightbox: (urls: string[], index: number) => void
  editable?: boolean
}

export default function AttachmentGallery({
  attachments,
  onChangeAttachments,
  taskId,
  onOpenLightbox,
  editable = false,
}: AttachmentGalleryProps) {
  const { showToast } = useToast()
  const [uploadingAttachment, setUploadingAttachment] = React.useState(false)

  const deleteTaskAttachment = async (url: string): Promise<void> => {
    const res = await fetch(`${basePath}/api/task-attachments?url=${encodeURIComponent(url)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Błąd usuwania pliku')
  }

  const uploadTaskAttachment = async (tid: string, file: File): Promise<string | null> => {
    const form = new FormData()
    form.append('file', file)
    form.append('taskId', tid)
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

  const handleUpload = async (files: File[]) => {
    if (!taskId || !files.length || !onChangeAttachments) return
    setUploadingAttachment(true)
    try {
      const urls = await Promise.all(
        files.slice(0, 10 - attachments.length).map(f => uploadTaskAttachment(taskId, f))
      )
      onChangeAttachments([...attachments, ...urls.filter(Boolean) as string[]])
      showToast('Załącznik dodany', 'success')
    } catch (err: any) {
      showToast(err?.message || 'Błąd dodawania załącznika', 'error')
    } finally {
      setUploadingAttachment(false)
    }
  }

  const handleDelete = async (url: string, idx: number) => {
    if (!onChangeAttachments) return
    try {
      await deleteTaskAttachment(url)
    } catch (_) {
      // ignore – remove locally regardless
    }
    onChangeAttachments(attachments.filter((_, i) => i !== idx))
  }

  if (!editable) {
    // View mode – compact thumbnails (max 5 + overflow count)
    if (!attachments || attachments.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {attachments.slice(0, 5).map((url, idx) => {
          const isImg = /\.(jpe?g|png|gif|webp)$/i.test(url) || url.includes('/task-attachments/')
          return (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              onClick={() => onOpenLightbox(attachments, idx)}
              onKeyDown={(e) => e.key === 'Enter' && onOpenLightbox(attachments, idx)}
              aria-label={`Otwórz załącznik ${idx + 1}`}
              className="w-7 h-7 rounded-[4px] overflow-hidden border border-[var(--app-border)] cursor-pointer flex items-center justify-center bg-[var(--app-card-alt)] focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isImg ? (
                <img src={attachmentSrc(url)} alt="" className="w-full h-full object-cover" />
              ) : (
                <FileText size={14} className="text-[var(--app-text-muted)]" />
              )}
            </div>
          )
        })}
        {attachments.length > 5 && (
          <span className="text-[10px] text-[var(--app-text-muted)] self-center">
            +{attachments.length - 5}
          </span>
        )}
      </div>
    )
  }

  // Editable mode – larger thumbnails with delete button + upload zone
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 items-center mb-1.5">
        {attachments.map((url, idx) => {
          const isImg = /\.(jpe?g|png|gif|webp)$/i.test(url) || url.includes('/task-attachments/')
          return (
            <div key={idx} className="relative">
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenLightbox(attachments, idx)}
                onKeyDown={(e) => e.key === 'Enter' && onOpenLightbox(attachments, idx)}
                aria-label={`Otwórz załącznik ${idx + 1}`}
                className="w-10 h-10 rounded-md overflow-hidden border border-[var(--app-border)] cursor-pointer flex items-center justify-center bg-[var(--app-card-alt)] focus-visible:ring-2 focus-visible:ring-ring"
              >
                {isImg ? (
                  <img src={attachmentSrc(url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <FileText size={20} className="text-[var(--app-text-muted)]" />
                )}
              </div>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation()
                  await handleDelete(url, idx)
                }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border-none bg-red-500 text-white cursor-pointer flex items-center justify-center p-0 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Usuń załącznik ${idx + 1}`}
                title="Usuń"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
      {attachments.length < 10 && (
        <div
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'var(--app-border)' }}
          onDragLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.style.background = 'transparent'
            const files = Array.from(e.dataTransfer.files)
            handleUpload(files)
          }}
          onClick={() => document.getElementById('edit-attachment-input')?.click()}
          className="border border-dashed border-[var(--app-border)] rounded-md p-2 text-center text-[11px] text-[var(--app-text-muted)] cursor-pointer bg-transparent"
        >
          <input
            id="edit-attachment-input"
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : []
              e.target.value = ''
              handleUpload(files)
            }}
          />
          {uploadingAttachment ? 'Dodawanie…' : 'Przeciągnij pliki lub kliknij'}
        </div>
      )}
    </div>
  )
}
