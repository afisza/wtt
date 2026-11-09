import { useEffect, useRef, useState } from 'react';
import { Clock, FileText, Paperclip, X, CloudCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/lib/drafts';
import { cn } from '@/lib/utils';
import { Task, TaskStatus } from './types';
import AssignerPicker from './AssignerPicker';
import AttachmentGallery from './AttachmentGallery';
import StatusSelect from './StatusSelect';
import type { Assigner } from '@/hooks/useCalendarData';

export interface TaskFormValues {
  text: string;
  assignedBy: string[];
  startTime: string;
  endTime: string;
  status: TaskStatus;
  attachments: string[];
}

interface TaskFormProps {
  mode: 'add' | 'edit';
  task?: Task;
  assigners: Assigner[];
  draftKey: string | null;
  /** Domyślne godziny dla nowego zadania */
  defaults?: { startTime: string; endTime: string };
  onSave: (values: TaskFormValues, pendingFiles: File[]) => void;
  /** Zwinięcie formularza; `discard` = szkic został świadomie odrzucony */
  onClose: (discard: boolean) => void;
  busy?: boolean;
  onOpenLightbox?: (urls: string[], index: number) => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export default function TaskForm({
  mode,
  task,
  assigners,
  draftKey,
  defaults,
  onSave,
  onClose,
  busy,
  onOpenLightbox,
}: TaskFormProps) {
  const initial: TaskFormValues =
    mode === 'edit' && task
      ? {
          text: task.text,
          assignedBy: Array.isArray(task.assignedBy) ? task.assignedBy : [],
          startTime: task.startTime || '',
          endTime: task.endTime || '',
          status: task.status,
          attachments: Array.isArray(task.attachments) ? [...task.attachments] : [],
        }
      : {
          text: '',
          assignedBy: [],
          startTime: defaults?.startTime ?? '08:00',
          endTime: defaults?.endTime ?? '16:00',
          status: 'do zrobienia',
          attachments: [],
        };

  const initialJson = useRef(JSON.stringify(initial)).current;
  const isPristine = (v: TaskFormValues) =>
    mode === 'add'
      ? !v.text.trim() && v.assignedBy.length === 0
      : JSON.stringify(v) === initialJson;

  const { value, setValue, clear, restored } = useDraft<TaskFormValues>(
    draftKey,
    initial,
    isPristine,
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = !isPristine(value);

  // Autosize textarea
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value.text]);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  const timeInvalid = !!value.startTime && !!value.endTime && value.endTime <= value.startTime;

  const submit = () => {
    if (!value.text.trim() || busy) {
      textRef.current?.focus();
      return;
    }
    onSave({ ...value, text: value.text.trim() }, pendingFiles);
    clear();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(false); // szkic zostaje
    }
  };

  return (
    <div
      onKeyDown={onKeyDown}
      className="surface-shadow animate-fade-in flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4"
    >
      {(restored || mode === 'edit') && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{mode === 'edit' && task?.id ? `Zadanie #${task.id}` : 'Nowe zadanie'}</span>
          {restored && dirty && (
            <span className="font-medium text-highlight-ink">Przywrócono niezapisany szkic</span>
          )}
        </div>
      )}

      <textarea
        ref={textRef}
        value={value.text}
        onChange={(e) => setValue({ text: e.target.value })}
        placeholder="Co zostało zrobione?"
        rows={2}
        aria-label="Treść zadania"
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus:border-ring"
      />

      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
        <TimeField
          label="Od"
          value={value.startTime}
          onChange={(v) => setValue({ startTime: v })}
        />
        <TimeField
          label="Do"
          value={value.endTime}
          onChange={(v) => setValue({ endTime: v })}
          invalid={timeInvalid}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Status</span>
          <StatusSelect
            value={value.status}
            onChange={(s) => setValue({ status: s })}
            className="h-9"
          />
        </div>
      </div>
      {timeInvalid && (
        <p className="-mt-1.5 text-xs text-destructive">
          Godzina „do” musi być późniejsza niż „od”.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Kto zlecił</span>
        <AssignerPicker
          selectedAssigners={value.assignedBy}
          onChangeAssigners={(a) => setValue({ assignedBy: a })}
          assigners={assigners}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Załączniki</span>
        {mode === 'edit' && task ? (
          <AttachmentGallery
            attachments={value.attachments}
            onChangeAttachments={(a) => setValue({ attachments: a })}
            taskId={task.id}
            onOpenLightbox={onOpenLightbox ?? (() => {})}
            editable
          />
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {pendingFiles.map((f, i) => (
              <span
                key={f.name + i}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Usuń ${f.name}`}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {pendingFiles.length < 10 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setPendingFiles((p) => [...p, ...Array.from(e.dataTransfer.files)].slice(0, 10));
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:border-ring hover:text-foreground"
              >
                <Paperclip className="h-3 w-3" />
                Dodaj pliki
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = '';
                setPendingFiles((p) => [...p, ...files].slice(0, 10));
              }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span
          className={cn(
            'mr-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-opacity',
            dirty ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden={!dirty}
        >
          <CloudCheck className="h-3.5 w-3.5" />
          Szkic zapisany w przeglądarce
        </span>
        <span className="hidden text-[11px] text-muted-foreground lg:inline">
          <kbd className="font-sans">{isMac ? '⌘' : 'Ctrl'}+↵</kbd> zapisz ·{' '}
          <kbd className="font-sans">Esc</kbd> zwiń
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            clear();
            onClose(true);
          }}
        >
          {dirty ? 'Odrzuć' : 'Anuluj'}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={busy || !value.text.trim() || timeInvalid}
        >
          {mode === 'add' ? 'Dodaj zadanie' : 'Zapisz zmiany'}
        </Button>
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="relative flex items-center">
        <Clock className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'tabular h-9 w-[124px] rounded-md border border-input bg-background pl-8 pr-2 text-sm outline-none transition-colors focus:border-ring',
            invalid && 'border-destructive',
          )}
        />
      </span>
    </label>
  );
}
