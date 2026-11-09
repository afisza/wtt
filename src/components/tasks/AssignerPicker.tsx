import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import AssignerAvatar from './AssignerAvatar';
import type { Assigner } from '@/hooks/useCalendarData';

interface AssignerPickerProps {
  selectedAssigners: string[];
  onChangeAssigners: (assigners: string[]) => void;
  assigners: Assigner[];
}

/** Wybór osób zlecających: lista od razu po fokusie, filtrowanie, ↑/↓/Enter, Backspace usuwa ostatnią. */
export default function AssignerPicker({
  selectedAssigners,
  onChangeAssigners,
  assigners,
}: AssignerPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assigners.filter(
      (a) => !selectedAssigners.includes(a.name) && (!q || a.name.toLowerCase().includes(q)),
    );
  }, [assigners, query, selectedAssigners]);

  const byName = (name: string) => assigners.find((a) => a.name === name);

  const select = (name: string) => {
    if (!selectedAssigners.includes(name)) onChangeAssigners([...selectedAssigners, name]);
    setQuery('');
    setActiveIdx(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && options[activeIdx] && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      select(options[activeIdx].name);
    } else if (e.key === 'Backspace' && !query && selectedAssigners.length) {
      onChangeAssigners(selectedAssigners.slice(0, -1));
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 transition-colors focus-within:border-ring"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedAssigners.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pl-0.5 pr-1.5 text-xs font-medium"
          >
            <AssignerAvatar name={name} avatar={byName(name)?.avatar} size={18} />
            {name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChangeAssigners(selectedAssigners.filter((n) => n !== name));
              }}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Usuń ${name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selectedAssigners.length ? '' : 'Kto zlecił?'}
          aria-label="Dodaj osobę zlecającą"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="h-7 min-w-[90px] flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {open && (
        <ul
          role="listbox"
          className="surface-shadow absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground"
        >
          {options.length === 0 ? (
            <li className="px-2.5 py-2 text-xs text-muted-foreground">
              {assigners.length === 0
                ? 'Dodaj osoby w Ustawieniach → Osoby zlecające'
                : 'Brak pasujących osób'}
            </li>
          ) : (
            options.map((a, i) => (
              <li
                key={a.id}
                role="option"
                aria-selected={i === activeIdx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(a.name);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
                  i === activeIdx && 'bg-accent',
                )}
              >
                <AssignerAvatar name={a.name} avatar={a.avatar} size={22} />
                <span className="flex-1">{a.name}</span>
                {i === activeIdx && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
