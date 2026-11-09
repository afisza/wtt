import { useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { assetUrl } from '@/lib/apiBase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export interface Entity {
  id: string | number;
  name: string;
  image?: string;
  extra?: string;
}

export interface EntityDraft {
  name: string;
  image: string;
  extra: string;
}

interface EntityManagerProps {
  items: Entity[];
  loading: boolean;
  shape: 'round' | 'square';
  nameLabel: string;
  namePlaceholder: string;
  extraLabel?: string;
  extraPlaceholder?: string;
  addLabel: string;
  emptyText: string;
  deleteTitle: (name: string) => string;
  deleteDescription: string;
  onUpload: (file: File) => Promise<string | null>;
  onCreate: (draft: EntityDraft) => Promise<boolean>;
  onUpdate: (id: Entity['id'], draft: EntityDraft) => Promise<boolean>;
  onDelete: (id: Entity['id']) => Promise<void>;
}

const EMPTY: EntityDraft = { name: '', image: '', extra: '' };

/** Wspólny edytor listy „nazwa + obrazek (+ pole dodatkowe)” — klienci i osoby zlecające. */
export default function EntityManager(props: EntityManagerProps) {
  const { items, loading, shape, addLabel, emptyText } = props;
  const [editingId, setEditingId] = useState<Entity['id'] | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <EntityForm
        {...props}
        initial={EMPTY}
        submitLabel={addLabel}
        submitIcon={<Plus className="h-4 w-4" />}
        onSubmit={props.onCreate}
        resetOnSuccess
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        {loading && items.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
              <Skeleton
                className={cn('h-10 w-10', shape === 'round' ? 'rounded-full' : 'rounded-md')}
              />
              <Skeleton className="h-4 w-40" />
            </div>
          ))
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul>
            {items.map((item) =>
              editingId === item.id ? (
                <li key={item.id} className="border-b bg-accent/30 p-4 last:border-b-0">
                  <EntityForm
                    {...props}
                    compact
                    initial={{ name: item.name, image: item.image ?? '', extra: item.extra ?? '' }}
                    submitLabel="Zapisz"
                    submitIcon={<Check className="h-4 w-4" />}
                    onSubmit={async (d) => {
                      const ok = await props.onUpdate(item.id, d);
                      if (ok) setEditingId(null);
                      return ok;
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <EntityRow
                  key={item.id}
                  item={item}
                  shape={shape}
                  deleteTitle={props.deleteTitle}
                  deleteDescription={props.deleteDescription}
                  onEdit={() => setEditingId(item.id)}
                  onDelete={() => props.onDelete(item.id)}
                />
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function EntityImage({
  src,
  name,
  shape,
  size = 40,
}: {
  src?: string;
  name: string;
  shape: 'round' | 'square';
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const radius = shape === 'round' ? 'rounded-full' : 'rounded-md';
  if (src && !failed) {
    return (
      <img
        src={assetUrl(src)}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className={cn('shrink-0 border object-cover', radius)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'grid shrink-0 place-items-center bg-secondary font-display font-semibold text-secondary-foreground',
        radius,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

function EntityRow({
  item,
  shape,
  deleteTitle,
  deleteDescription,
  onEdit,
  onDelete,
}: {
  item: Entity;
  shape: 'round' | 'square';
  deleteTitle: (name: string) => string;
  deleteDescription: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <EntityImage src={item.image} name={item.name} shape={shape} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        {item.extra && (
          <p className="truncate text-xs text-muted-foreground">
            {item.extra.replace(/^https?:\/\//, '')}
          </p>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edytuj: ${item.name}`}>
        <Pencil className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Usuń: ${item.name}`}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle(item.name)}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function EntityForm({
  initial,
  shape,
  nameLabel,
  namePlaceholder,
  extraLabel,
  extraPlaceholder,
  submitLabel,
  submitIcon,
  onUpload,
  onSubmit,
  onCancel,
  resetOnSuccess,
  compact,
}: EntityManagerProps & {
  initial: EntityDraft;
  submitLabel: string;
  submitIcon: React.ReactNode;
  onSubmit: (d: EntityDraft) => Promise<boolean>;
  onCancel?: () => void;
  resetOnSuccess?: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<EntityDraft>(initial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = async (file: File) => {
    setUploading(true);
    const url = await onUpload(file);
    setUploading(false);
    if (url) setDraft((d) => ({ ...d, image: url }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    const ok = await onSubmit({ ...draft, name: draft.name.trim(), extra: draft.extra.trim() });
    setSaving(false);
    if (ok && resetOnSuccess) setDraft(EMPTY);
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}
      className={cn(
        'flex flex-wrap items-end gap-3',
        !compact && 'rounded-lg border border-dashed p-4',
      )}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            'grid h-10 w-10 place-items-center overflow-hidden border text-muted-foreground transition-colors hover:border-ring hover:text-foreground',
            shape === 'round' ? 'rounded-full' : 'rounded-md',
          )}
          aria-label={draft.image ? 'Zmień obrazek' : 'Dodaj obrazek'}
          title={draft.image ? 'Zmień obrazek' : 'Dodaj obrazek'}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : draft.image ? (
            <img src={assetUrl(draft.image)} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
        </button>
        {draft.image && !uploading && (
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, image: '' }))}
            aria-label="Usuń obrazek"
            className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-foreground text-background"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pickFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{nameLabel}</span>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={namePlaceholder}
          autoFocus={compact}
          required
        />
      </label>

      {extraLabel && (
        <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{extraLabel}</span>
          <Input
            type="url"
            value={draft.extra}
            onChange={(e) => setDraft((d) => ({ ...d, extra: e.target.value }))}
            placeholder={extraPlaceholder}
          />
        </label>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={!draft.name.trim() || saving || uploading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : submitIcon}
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Anuluj
          </Button>
        )}
      </div>
    </form>
  );
}
