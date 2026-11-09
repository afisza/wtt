import { useRef, useState } from 'react';
import { FileText, Paperclip, X, Loader2 } from 'lucide-react';
import { attachmentSrc } from './types';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';

interface AttachmentGalleryProps {
  attachments: string[];
  onChangeAttachments?: (urls: string[]) => void;
  taskId?: string;
  onOpenLightbox: (urls: string[], index: number) => void;
  editable?: boolean;
}

const isImage = (url: string) =>
  /\.(jpe?g|png|gif|webp)$/i.test(url) || url.includes('/task-attachments/');

export async function uploadTaskAttachment(taskId: string, file: File): Promise<string | null> {
  const form = new FormData();
  form.append('file', file);
  form.append('taskId', taskId);
  const res = await apiFetch('/api/task-attachments/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Nie udało się wysłać pliku');
  return data?.url ?? null;
}

export default function AttachmentGallery({
  attachments,
  onChangeAttachments,
  taskId,
  onOpenLightbox,
  editable = false,
}: AttachmentGalleryProps) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: File[]) => {
    if (!taskId || !files.length || !onChangeAttachments) return;
    setUploading(true);
    try {
      const urls = await Promise.all(
        files.slice(0, 10 - attachments.length).map((f) => uploadTaskAttachment(taskId, f)),
      );
      onChangeAttachments([...attachments, ...(urls.filter(Boolean) as string[])]);
    } catch (err: any) {
      showToast(err?.message || 'Błąd dodawania załącznika', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (url: string, idx: number) => {
    if (!onChangeAttachments) return;
    try {
      await apiFetch(`/api/task-attachments?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
    } catch {
      /* usuń lokalnie mimo błędu */
    }
    onChangeAttachments(attachments.filter((_, i) => i !== idx));
  };

  const thumb = (url: string, idx: number, size: 'sm' | 'md') => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenLightbox(attachments, idx);
      }}
      aria-label={`Otwórz załącznik ${idx + 1}`}
      className={cn(
        'grid place-items-center overflow-hidden rounded-md border bg-muted transition-transform hover:scale-[1.04]',
        size === 'sm' ? 'h-8 w-8' : 'h-12 w-12',
      )}
    >
      {isImage(url) ? (
        <img
          src={attachmentSrc(url)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );

  if (!editable) {
    if (!attachments?.length) return null;
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {attachments.slice(0, 6).map((url, idx) => (
          <span key={url + idx}>{thumb(url, idx, 'sm')}</span>
        ))}
        {attachments.length > 6 && (
          <span className="tabular text-[11px] text-muted-foreground">
            +{attachments.length - 6}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((url, idx) => (
            <div key={url + idx} className="relative">
              {thumb(url, idx, 'md')}
              <button
                type="button"
                onClick={() => handleDelete(url, idx)}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground"
                aria-label={`Usuń załącznik ${idx + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {attachments.length < 10 && (
        <button
          type="button"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleUpload(Array.from(e.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground',
            dragOver && 'border-ring bg-highlight/10',
          )}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          {uploading ? 'Wysyłanie…' : 'Dodaj pliki (lub upuść tutaj)'}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              void handleUpload(files);
            }}
          />
        </button>
      )}
    </div>
  );
}
