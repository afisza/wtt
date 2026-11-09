import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, Copy, Plus, Clock, GripVertical, FilePen } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';
import { generateTaskId } from '@/lib/taskId';
import { addOneHour, sortTasksChronologically, toMinutes, formatMinutes } from '@/lib/tasks';
import {
  clearDraft,
  draftKey,
  listDraftIds,
  readDraft,
  useDraft,
  useDraftScope,
} from '@/lib/drafts';
import Lightbox from './tasks/Lightbox';
import AttachmentGallery, { uploadTaskAttachment } from './tasks/AttachmentGallery';
import TaskForm, { type TaskFormValues } from './tasks/TaskForm';
import StatusSelect from './tasks/StatusSelect';
import AssignerAvatar from './tasks/AssignerAvatar';
import { renderTextWithLinks } from './tasks/types';
import type { Task } from './tasks/types';
import type { Assigner, TasksUpdater } from '@/hooks/useCalendarData';

// Typy — re-eksport dla zgodności wstecznej
export type { TaskStatus, Task } from './tasks/types';
export { statusOptions, attachmentSrc, renderTextWithLinks } from './tasks/types';

export { TASK_DRAG_TYPE } from '@/hooks/useTaskDrop';
import { setTaskDragData } from '@/hooks/useTaskDrop';

interface TaskListProps {
  date: string;
  tasks: Task[];
  assigners: Assigner[];
  onUpdate: (updater: TasksUpdater) => void;
  draggable?: boolean;
  /** Dzień bieżący — przycisk dodawania zawsze widoczny */
  emphasizeAdd?: boolean;
  /** Zewnętrzny wyzwalacz otwarcia formularza (np. przycisk w kolumnie daty) */
  addSignal?: number;
  /** Przycisk „Dodaj” tylko na telefonie (na desktopie jest w kolumnie daty) */
  addButtonMobileOnly?: boolean;
  /** Wąska kolumna (widok tygodnia): akcje nad treścią */
  compact?: boolean;
}

type Lightboxed = { urls: string[]; index: number } | null;

export default function TaskList({
  date,
  tasks,
  assigners,
  onUpdate,
  draggable = true,
  emphasizeAdd = false,
  addSignal = 0,
  addButtonMobileOnly = false,
  compact = false,
}: TaskListProps) {
  const { clientId } = useDraftScope();
  const { showToast } = useToast();
  const [lightbox, setLightbox] = useState<Lightboxed>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [draftTick, setDraftTick] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Po przeładowaniu strony: otwórz formularze, dla których istnieje szkic
  useEffect(() => {
    const ids = listDraftIds(clientId, date);
    if (ids.length === 0) return;
    if (ids.includes('new')) setAddOpen(true);
    const edit = ids.find(
      (id) => !id.startsWith('inline:') && id !== 'new' && tasks.some((t) => t.id === id),
    );
    if (edit) setEditingId(edit);
    const inline = ids.find(
      (id) => id.startsWith('inline:') && tasks.some((t) => `inline:${t.id}` === id),
    );
    if (inline && !edit) setInlineId(inline.slice(7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, date]);

  useEffect(() => {
    if (addSignal > 0) setAddOpen(true);
  }, [addSignal]);

  const sorted = useMemo(() => sortTasksChronologically(tasks), [tasks]);
  const assignerByName = useCallback(
    (name: string) => assigners.find((a) => a.name === name),
    [assigners],
  );

  // Domyślne godziny nowego zadania: od końca ostatniego zadania, +1h
  const addDefaults = useMemo(() => {
    if (tasks.length === 0) return { startTime: '08:00', endTime: '16:00' };
    const lastEnd = Math.max(...tasks.map((t) => toMinutes(t.endTime || '16:00')));
    const start = formatMinutes(Math.min(lastEnd, 23 * 60));
    return { startTime: start, endTime: addOneHour(start) };
  }, [tasks]);

  const newDraftKey = draftKey(clientId, date, 'new');
  const closedNewDraft = useMemo(
    () => (!addOpen ? readDraft<TaskFormValues>(newDraftKey) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addOpen, newDraftKey, draftTick],
  );

  const handleAdd = (values: TaskFormValues, pendingFiles: File[]) => {
    const existing = new Set(tasks.map((t) => t.id).filter(Boolean));
    const id = generateTaskId(existing);
    const task: Task = {
      id,
      text: values.text,
      assignedBy: values.assignedBy,
      startTime: values.startTime || '08:00',
      endTime: values.endTime || '16:00',
      status: values.status,
      attachments: [],
    };
    // Treść zapisujemy od razu (outbox) — pliki dociągamy w tle
    onUpdate((prev) => [...prev, task]);
    setAddOpen(false);
    if (pendingFiles.length) {
      setUploading(true);
      Promise.allSettled(pendingFiles.slice(0, 10).map((f) => uploadTaskAttachment(id, f)))
        .then((results) => {
          const urls = results.flatMap((r) =>
            r.status === 'fulfilled' && r.value ? [r.value] : [],
          );
          if (urls.length) {
            onUpdate((prev) =>
              prev.map((t) =>
                t.id === id ? { ...t, attachments: [...(t.attachments || []), ...urls] } : t,
              ),
            );
          }
          if (urls.length < pendingFiles.length)
            showToast('Część załączników nie została wysłana', 'error');
        })
        .finally(() => setUploading(false));
    }
  };

  const handleEditSave = (task: Task, values: TaskFormValues) => {
    onUpdate((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              text: values.text,
              assignedBy: values.assignedBy,
              startTime: values.startTime || '08:00',
              endTime: values.endTime || '16:00',
              status: values.status,
              attachments: values.attachments,
            }
          : t,
      ),
    );
    setEditingId(null);
  };

  const handleDelete = (task: Task) => {
    onUpdate((prev) => prev.filter((t) => t.id !== task.id));
    clearDraft(draftKey(clientId, date, task.id));
    clearDraft(draftKey(clientId, date, `inline:${task.id}`));
    showToast('Zadanie usunięte', 'warning', 6000, {
      label: 'Cofnij',
      onClick: () =>
        onUpdate((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task])),
    });
  };

  const handleDuplicate = (task: Task) => {
    const existing = new Set(tasks.map((t) => t.id).filter(Boolean));
    const copy: Task = {
      ...task,
      id: generateTaskId(existing),
      assignedBy: [...(task.assignedBy || [])],
      startTime: addOneHour(task.startTime),
      endTime: addOneHour(task.endTime),
      attachments: [],
    };
    onUpdate((prev) => [...prev, copy]);
    showToast('Skopiowano zadanie (+1 h)', 'success');
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {sorted.length > 0 && (
        <ul className="flex flex-col gap-1">
          {sorted.map((task, i) =>
            editingId === task.id ? (
              <li key={task.id || i}>
                <TaskForm
                  mode="edit"
                  task={task}
                  assigners={assigners}
                  draftKey={draftKey(clientId, date, task.id)}
                  onSave={(values) => handleEditSave(task, values)}
                  onClose={() => {
                    setEditingId(null);
                    setDraftTick((n) => n + 1);
                  }}
                  onOpenLightbox={(urls, index) => setLightbox({ urls, index })}
                />
              </li>
            ) : (
              <TaskItem
                compact={compact}
                key={task.id || i}
                task={task}
                date={date}
                clientId={clientId}
                draggable={draggable}
                inlineEditing={inlineId === task.id}
                hasEditDraft={!!readDraft(draftKey(clientId, date, task.id))}
                assignerByName={assignerByName}
                onStartInline={() => setInlineId(task.id)}
                onEndInline={() => setInlineId(null)}
                onUpdate={onUpdate}
                onEdit={() => {
                  setInlineId(null);
                  setEditingId(task.id);
                }}
                onDelete={() => handleDelete(task)}
                onDuplicate={() => handleDuplicate(task)}
                onOpenLightbox={(urls, index) => setLightbox({ urls, index })}
              />
            ),
          )}
        </ul>
      )}

      {addOpen ? (
        <TaskForm
          key={`add-${draftTick}`}
          mode="add"
          assigners={assigners}
          draftKey={newDraftKey}
          defaults={addDefaults}
          busy={uploading}
          onSave={handleAdd}
          onClose={() => {
            setAddOpen(false);
            setDraftTick((n) => n + 1);
          }}
        />
      ) : closedNewDraft && closedNewDraft.text.trim() ? (
        <button
          type="button"
          onClick={() => {
            setAddOpen(true);
          }}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-highlight-ink/60 bg-highlight/10 px-2.5 py-1.5 text-left text-xs"
        >
          <FilePen className="h-3.5 w-3.5 shrink-0 text-highlight-ink" />
          <span className="shrink-0 font-semibold text-highlight-ink">Szkic</span>
          <span className="truncate text-muted-foreground">{closedNewDraft.text}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAddOpen(true);
          }}
          className={cn(
            'inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:opacity-100',
            addButtonMobileOnly
              ? 'md:hidden'
              : !emphasizeAdd &&
                  'opacity-0 group-hover/day:opacity-100 [@media(hover:none)]:opacity-100',
          )}
          aria-label={`Dodaj zadanie ${date}`}
        >
          <Plus className="h-3.5 w-3.5" />
          {tasks.length === 0 ? 'Dodaj zadanie' : 'Dodaj kolejne'}
        </button>
      )}

      <Lightbox lightbox={lightbox} setLightbox={setLightbox} />
    </div>
  );
}

interface TaskItemProps {
  task: Task;
  date: string;
  clientId: number | null;
  draggable: boolean;
  inlineEditing: boolean;
  hasEditDraft: boolean;
  assignerByName: (name: string) => Assigner | undefined;
  onStartInline: () => void;
  onEndInline: () => void;
  onUpdate: (updater: TasksUpdater) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpenLightbox: (urls: string[], index: number) => void;
  compact?: boolean;
}

function TaskItem({
  compact = false,
  task,
  date,
  clientId,
  draggable,
  inlineEditing,
  hasEditDraft,
  assignerByName,
  onStartInline,
  onEndInline,
  onUpdate,
  onEdit,
  onDelete,
  onDuplicate,
  onOpenLightbox,
}: TaskItemProps) {
  const patch = (changes: Partial<Task>) =>
    onUpdate((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...changes } : t)));

  const actionBtn =
    'grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

  return (
    <li
      draggable={draggable && !inlineEditing}
      onDragStart={(e) => {
        setTaskDragData(e, { from: date, taskId: task.id });
        e.currentTarget.classList.add('dragging-task');
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging-task')}
      className={cn(
        'group/task relative flex items-start gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent/50',
        compact && 'flex-wrap gap-x-1 gap-y-1 border bg-card px-2 py-2 hover:bg-card',
        task.status === 'anulowane' && 'opacity-60',
      )}
    >
      {draggable && !compact && (
        <GripVertical
          aria-hidden
          className="mt-1 hidden h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/40 group-hover/task:text-muted-foreground md:block"
        />
      )}
      <StatusSelect
        value={task.status}
        onChange={(status) => patch({ status })}
        className="mt-0.5"
      />

      <div className={cn('min-w-0 flex-1', compact && 'order-3 basis-full')}>
        {inlineEditing ? (
          <InlineEditor
            task={task}
            draftKeyValue={draftKey(clientId, date, `inline:${task.id}`)}
            onSave={(text) => {
              if (text !== task.text) patch({ text });
              onEndInline();
            }}
            onCancel={onEndInline}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) return;
              onStartInline();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onStartInline();
              }
            }}
            title="Kliknij, aby edytować treść"
            className={cn(
              'cursor-text whitespace-pre-wrap break-words text-sm leading-snug',
              task.status === 'anulowane' && 'line-through decoration-muted-foreground/60',
            )}
          >
            {renderTextWithLinks(task.text)}
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {task.startTime || '08:00'}–{task.endTime || '16:00'}
          </span>
          {(task.assignedBy || []).map((name) => (
            <span key={name} className="inline-flex items-center gap-1.5">
              <AssignerAvatar name={name} avatar={assignerByName(name)?.avatar} size={16} />
              {name}
            </span>
          ))}
          {hasEditDraft && (
            <span className="font-medium text-highlight-ink">• niezapisany szkic</span>
          )}
        </div>
        <AttachmentGallery attachments={task.attachments || []} onOpenLightbox={onOpenLightbox} />
      </div>

      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5 transition-opacity',
          compact && 'absolute right-1 top-1 rounded-md border bg-popover shadow-sm',
          'opacity-0 focus-within:opacity-100 group-hover/task:opacity-100 [@media(hover:none)]:opacity-100',
        )}
      >
        <button
          type="button"
          onClick={onEdit}
          className={actionBtn}
          aria-label="Edytuj szczegóły"
          title="Edytuj"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className={actionBtn}
          aria-label="Duplikuj zadanie"
          title="Duplikuj (+1 h)"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={cn(actionBtn, 'hover:bg-destructive/10 hover:text-destructive')}
          aria-label="Usuń zadanie"
          title="Usuń"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/** Szybka edycja treści: Enter zapisuje, Shift+Enter nowa linia, Esc anuluje. Szkic na bieżąco. */
function InlineEditor({
  task,
  draftKeyValue,
  onSave,
  onCancel,
}: {
  task: Task;
  draftKeyValue: string | null;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const { value, setValue, clear } = useDraft<{ text: string }>(
    draftKeyValue,
    { text: task.text },
    (v) => v.text === task.text,
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value.text]);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const text = value.text.trim();
    clear();
    if (text) onSave(text);
    else onCancel();
  };

  return (
    <textarea
      ref={ref}
      value={value.text}
      rows={1}
      aria-label="Treść zadania"
      onChange={(e) => setValue({ text: e.target.value })}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done.current = true;
          clear();
          onCancel();
        }
      }}
      className="-mx-1 w-[calc(100%+0.5rem)] resize-none rounded-md border border-ring bg-background px-1 py-0.5 text-sm leading-snug outline-none"
    />
  );
}
