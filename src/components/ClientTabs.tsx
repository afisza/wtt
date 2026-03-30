import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Plus, Globe, Search, XCircle, Loader2, Users } from 'lucide-react'
import CalendarTable from './CalendarTable'
const CommandPalette = lazy(() => import('./CommandPalette'))
import { format, parse, isValid } from 'date-fns'
import { basePath, assetUrl } from '@/lib/apiBase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Client {
  id: number
  name: string
  logo: string
  website?: string
}

interface ClientTabsProps {
  onClientChange?: (clientId: number | null) => void
}

export default function ClientTabs({ onClientChange }: ClientTabsProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [activeClientId, setActiveClientId] = useState<number | null>(() => {
    const saved = localStorage.getItem('wttActiveClientId')
    if (saved) {
      const n = parseInt(saved, 10)
      if (!isNaN(n)) return n
    }
    return null
  })
  const [loading, setLoading] = useState(true)
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{
    date: string
    task: {
      text: string
      assignedBy: string[]
      startTime: string
      endTime: string
      status: string
    }
  }>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedResultDate, setSelectedResultDate] = useState<string | null>(null)

  useEffect(() => {
    loadClients()
    checkAndMigrateData()
  }, [])

  const checkAndMigrateData = async () => {
    try {
      const response = await fetch(`${basePath}/api/clients/migrate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          const clientsResponse = await fetch(`${basePath}/api/clients`, {
            credentials: 'include',
          })
          if (clientsResponse.ok) {
            const updatedClients = await clientsResponse.json()
            if (Array.isArray(updatedClients)) {
              setClients(updatedClients)
              if (result.clientId && activeClientId === null && updatedClients.length > 0) {
                const bestMarketClient = updatedClients.find((c: any) => c.id === result.clientId || c.name === 'Best Market')
                if (bestMarketClient) {
                  setActiveClientId(bestMarketClient.id)
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Migration check error:', error)
    }
  }

  useEffect(() => {
    if (!Array.isArray(clients) || clients.length === 0) {
      if (activeClientId !== null) {
        setActiveClientId(null)
        if (onClientChange) onClientChange(null)
      }
      return
    }
    const savedId = localStorage.getItem('wttActiveClientId')
    const savedNum = savedId ? parseInt(savedId, 10) : NaN
    const exists = !isNaN(savedNum) && clients.some(c => c.id === savedNum)

    let nextId: number | null = activeClientId
    if (activeClientId === null || (exists && activeClientId !== savedNum)) {
      nextId = exists ? savedNum : clients[0].id
    } else if (!clients.some(c => c.id === activeClientId)) {
      nextId = clients[0].id
    }

    if (nextId !== activeClientId) {
      setActiveClientId(nextId)
    }
    if (onClientChange) onClientChange(nextId)
  }, [clients])

  useEffect(() => {
    if (onClientChange) {
      onClientChange(activeClientId)
    }
  }, [activeClientId, onClientChange])

  const loadClients = async () => {
    try {
      const response = await fetch(`${basePath}/api/clients`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          setClients(data)
        } else {
          setClients([])
        }
      } else {
        setClients([])
        if (response.status === 401) {
          window.location.href = '/'
        }
      }
    } catch (error) {
      console.error('Error loading clients:', error)
      setClients([])
    } finally {
      setLoading(false)
    }
  }

  const handleTabClick = (clientId: number) => {
    setActiveClientId(clientId)
    try {
      localStorage.setItem('wttActiveClientId', String(clientId))
    } catch (_) {}
  }

  const handleAddClient = () => {
    window.location.href = '/settings?tab=clients'
  }

  const MIN_SEARCH_LENGTH = 2

  const performSearch = useCallback(async (query: string) => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery || trimmedQuery.length < MIN_SEARCH_LENGTH || !activeClientId) {
      setSearchResults([])
      setSelectedResultDate(null)
      return
    }

    setSearchLoading(true)
    try {
      const url = `${basePath}/api/search-tasks?q=${encodeURIComponent(trimmedQuery)}&clientId=${activeClientId}`
      const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept-Charset': 'utf-8' },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.error) {
          setSearchResults([])
        } else {
          setSearchResults(data.results || [])
        }
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [activeClientId])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [searchQuery, performSearch])

  const handleSearchResultClick = (date: string) => {
    setSelectedResultDate(date)
    setTimeout(() => {
      const dayElement = document.querySelector(`[data-day="${date}"]`)
      if (dayElement) {
        dayElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        dayElement.classList.add('search-highlight')
        setTimeout(() => {
          dayElement.classList.remove('search-highlight')
        }, 2000)
      } else {
        const calendarElement = document.querySelector('[data-calendar-container]')
        if (calendarElement) {
          calendarElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    }, 100)
  }

  useEffect(() => {
    const handleClientUpdate = () => {
      loadClients()
    }
    window.addEventListener('clientUpdated', handleClientUpdate)
    return () => window.removeEventListener('clientUpdated', handleClientUpdate)
  }, [])

  const activeClient = Array.isArray(clients) ? clients.find(c => c.id === activeClientId) : null

  const statusColor = (status: string) => {
    switch (status) {
      case 'wykonano': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      case 'w trakcie': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20'
      case 'anulowane': return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20'
      case 'zaplanowano': return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-32 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    )
  }

  if (!Array.isArray(clients) || clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Users className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Brak klientów. Dodaj pierwszego klienta w ustawieniach.
        </p>
        <Button onClick={handleAddClient}>
          <Plus className="h-4 w-4 mr-2" />
          Dodaj klienta
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Website link */}
      {activeClient?.website && (() => {
        const raw = activeClient.website
        const full = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
        let safe = false
        try { const u = new URL(full); safe = u.protocol === 'http:' || u.protocol === 'https:' } catch {}
        if (!safe) return null
        return (
          <div className="mb-3 px-3 py-2 rounded-lg border bg-muted/50">
            <a
              href={full}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{raw}</span>
            </a>
          </div>
        )
      })()}

      {/* Client Tabs */}
      <div className="flex gap-1 border-b mb-3 overflow-x-auto scrollbar-thin pb-px" data-tour="client-tabs">
        {Array.isArray(clients) && clients.map((client) => {
          const isActive = activeClientId === client.id
          return (
            <button
              key={client.id}
              onClick={() => handleTabClick(client.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-px',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {client.logo && !failedLogos.has(client.logo) ? (
                <img
                  src={assetUrl(client.logo)}
                  alt={client.name}
                  className="w-5 h-5 rounded-sm object-cover shrink-0"
                  onError={() => {
                    setFailedLogos(prev => new Set(prev).add(client.logo))
                  }}
                />
              ) : (
                <div
                  className={cn(
                    'w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold shrink-0',
                    isActive
                      ? 'bg-primary-foreground text-primary'
                      : 'bg-primary text-primary-foreground'
                  )}
                >
                  {client.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span>{client.name}</span>
            </button>
          )
        })}
      </div>

      {/* Search Bar */}
      {activeClientId !== null && (
        <div className="sticky top-[49px] z-40 mb-3 bg-background pb-2" data-tour="search">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Wyszukaj zadania... (⌘K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults([])
                  setSelectedResultDate(null)
                }}
                aria-label="Wyczyść wyszukiwanie"
                className="absolute right-0 top-0 h-9 w-9 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && (searchLoading || searchResults.length > 0) && (
            <div className="absolute left-0 right-0 mt-1 max-h-[400px] overflow-y-auto rounded-lg border bg-card shadow-lg z-50">
              {searchLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Wyszukiwanie...
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <div className="sticky top-0 z-10 border-b bg-muted/80 backdrop-blur px-3 py-2 text-xs font-medium text-muted-foreground">
                    Znaleziono {searchResults.length} {searchResults.length === 1 ? 'zadanie' : 'zadań'}
                  </div>
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      onClick={() => handleSearchResultClick(result.date)}
                      className={cn(
                        'px-3 py-2.5 cursor-pointer transition-colors border-b last:border-b-0',
                        selectedResultDate === result.date
                          ? 'bg-muted'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground mb-1">
                            {(() => {
                              try {
                                const parsedDate = parse(result.date, 'yyyy-MM-dd', new Date())
                                return isValid(parsedDate) ? format(parsedDate, 'dd.MM.yyyy') : result.date
                              } catch {
                                return result.date
                              }
                            })()} • {result.task.startTime} - {result.task.endTime}
                          </div>
                          <div className="text-sm text-foreground break-words leading-snug">
                            {result.task.text}
                          </div>
                          {result.task.assignedBy.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {result.task.assignedBy.join(', ')}
                            </div>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] shrink-0', statusColor(result.task.status))}
                        >
                          {result.task.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Calendar Content */}
      {activeClientId !== null && (
        <div className="flex-1" data-calendar-container>
          <CalendarTable
            clientId={activeClientId}
            clientName={activeClient?.name}
            clientLogo={activeClient?.logo}
            highlightDate={selectedResultDate}
          />
        </div>
      )}

      {/* Command Palette (Cmd+K) – współdzieli stan wyszukiwania z polem nad tabelą */}
      <Suspense fallback={null}>
        <CommandPalette
          activeClientId={activeClientId}
          clients={clients}
          onSelectClient={(id) => handleTabClick(id)}
          onSelectDate={(date) => handleSearchResultClick(date)}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchResults={searchResults}
          searchLoading={searchLoading}
        />
      </Suspense>
    </div>
  )
}
