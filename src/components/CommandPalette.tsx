import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Search, Settings, Calendar, Users, Clock, FileText, Loader2 } from 'lucide-react'
import { format, parse, isValid } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

const MIN_SEARCH_LENGTH = 2

type SearchResult = {
  date: string
  task: { text: string; assignedBy: string[]; startTime: string; endTime: string; status: string }
}

interface CommandPaletteProps {
  activeClientId: number | null
  clients: Array<{ id: number; name: string }>
  onSelectClient?: (clientId: number) => void
  onSelectDate?: (date: string) => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  searchResults: SearchResult[]
  searchLoading?: boolean
}

export default function CommandPalette({
  activeClientId,
  clients,
  onSelectClient,
  onSelectDate,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  searchLoading = false,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const isSearching = searchQuery.trim().length >= MIN_SEARCH_LENGTH

  // Cmd+K / Ctrl+K handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSelectResult = (date: string) => {
    setOpen(false)
    if (onSelectDate) onSelectDate(date)
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'wykonano': return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20'
      case 'w trakcie': return 'bg-amber-500/15 text-amber-600 border-amber-500/20'
      case 'anulowane': return 'bg-red-500/15 text-red-600 border-red-500/20'
      case 'zaplanowano': return 'bg-blue-500/15 text-blue-600 border-blue-500/20'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      commandProps={{
        shouldFilter: false,
        filter: () => 1,
      }}
    >
      <CommandInput
        placeholder="Szukaj zadań, klientów, nawiguj..."
        value={searchQuery}
        onValueChange={onSearchQueryChange}
      />
      <CommandList>
        {/* Search results – shown first when there's a query */}
        {isSearching && searchLoading && (
          <CommandGroup heading="Wyszukiwanie..." forceMount>
            <CommandItem disabled className="pointer-events-none" value="__loading__" forceMount>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Wyszukiwanie...
            </CommandItem>
          </CommandGroup>
        )}

        {isSearching && !searchLoading && searchResults.length > 0 && (
          <CommandGroup heading={`Zadania (${searchResults.length})`} forceMount>
            {searchResults.slice(0, 15).map((result, idx) => (
              <CommandItem
                key={idx}
                value={`task-${idx}-${result.date}`}
                onSelect={() => handleSelectResult(result.date)}
                className="flex-col items-start"
                forceMount
              >
                <div className="flex items-center gap-2 w-full">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      try {
                        const parsedDate = parse(result.date, 'yyyy-MM-dd', new Date())
                        return isValid(parsedDate) ? format(parsedDate, 'dd.MM.yyyy') : result.date
                      } catch { return result.date }
                    })()}
                    {' '}{result.task.startTime} - {result.task.endTime}
                  </span>
                  <Badge variant="outline" className={`text-[9px] ml-auto ${statusColor(result.task.status)}`}>
                    {result.task.status}
                  </Badge>
                </div>
                <span className="text-sm mt-0.5 line-clamp-1">{result.task.text}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {isSearching && !searchLoading && searchResults.length === 0 && (
          <CommandGroup heading="Wyniki" forceMount>
            <CommandItem disabled className="pointer-events-none text-muted-foreground" value="__no-results__" forceMount>
              {!activeClientId
                ? 'Wybierz klienta (zakładkę), aby wyszukać zadania.'
                : 'Brak wyników w bieżącym kliencie.'}
            </CommandItem>
          </CommandGroup>
        )}

        {isSearching && <CommandSeparator />}

        {/* Quick navigation */}
        <CommandGroup heading="Nawigacja" forceMount>
          <CommandItem value="nav-kalendarz" onSelect={() => { setOpen(false); navigate('/') }} forceMount>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Kalendarz</span>
          </CommandItem>
          <CommandItem value="nav-ustawienia" onSelect={() => { setOpen(false); navigate('/settings') }} forceMount>
            <Settings className="mr-2 h-4 w-4" />
            <span>Ustawienia</span>
          </CommandItem>
          <CommandItem value="nav-osoby" onSelect={() => { setOpen(false); navigate('/settings?tab=assigners') }} forceMount>
            <Users className="mr-2 h-4 w-4" />
            <span>Osoby zlecające</span>
          </CommandItem>
          <CommandItem value="nav-klienci" onSelect={() => { setOpen(false); navigate('/settings?tab=clients') }} forceMount>
            <FileText className="mr-2 h-4 w-4" />
            <span>Klienci</span>
          </CommandItem>
        </CommandGroup>

        {/* Clients */}
        {clients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Klienci" forceMount>
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`client-${client.id}-${client.name}`}
                  onSelect={() => {
                    setOpen(false)
                    if (onSelectClient) onSelectClient(client.id)
                  }}
                  forceMount
                >
                  <div className="w-5 h-5 rounded-sm bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold mr-2">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{client.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
