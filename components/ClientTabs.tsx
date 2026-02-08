'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Globe, Search, XCircle } from 'lucide-react'
import CalendarTable from './CalendarTable'
import { format, parse, isValid } from 'date-fns'

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
  const [activeClientId, setActiveClientId] = useState<number | null>(null)
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
    // Sprawdź czy trzeba przeprowadzić migrację przy pierwszym ładowaniu
    checkAndMigrateData()
  }, [])

  const checkAndMigrateData = async () => {
    try {
      const response = await fetch('/api/clients/migrate', {
        method: 'POST',
        credentials: 'include',
      })
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          // Przeładuj klientów po migracji
          const clientsResponse = await fetch('/api/clients', {
            credentials: 'include',
          })
          if (clientsResponse.ok) {
            const updatedClients = await clientsResponse.json()
            if (Array.isArray(updatedClients)) {
              setClients(updatedClients)
              
              // Ustaw nowo utworzonego klienta jako aktywnego jeśli nie ma aktywnego
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
    // Ustaw pierwszy klient jako aktywny po załadowaniu
    if (Array.isArray(clients)) {
      if (clients.length > 0 && activeClientId === null) {
        setActiveClientId(clients[0].id)
        if (onClientChange) {
          onClientChange(clients[0].id)
        }
      } else if (clients.length === 0 && activeClientId !== null) {
        setActiveClientId(null)
        if (onClientChange) {
          onClientChange(null)
        }
      }
    }
  }, [clients])

  useEffect(() => {
    if (onClientChange) {
      onClientChange(activeClientId)
    }
  }, [activeClientId, onClientChange])

  const loadClients = async () => {
    try {
      const response = await fetch('/api/clients', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        // Upewnij się, że data jest tablicą
        if (Array.isArray(data)) {
          setClients(data)
        } else {
          console.error('Expected array but got:', data)
          setClients([])
        }
      } else {
        // Jeśli response nie jest OK, nie parsuj JSON - może być błąd
        console.error('Failed to load clients:', response.status, response.statusText)
        setClients([])
        // Jeśli 401, przekieruj do logowania
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
  }

  const handleAddClient = () => {
    // Otwórz modal/dialog do dodania klienta - będzie w ustawieniach
    window.location.href = '/settings?tab=clients'
  }

  // Wyszukiwanie zadań
  const performSearch = useCallback(async (query: string) => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery || !activeClientId) {
      setSearchResults([])
      setSelectedResultDate(null)
      return
    }

    setSearchLoading(true)
    try {
      const url = `/api/search-tasks?q=${encodeURIComponent(trimmedQuery)}&clientId=${activeClientId}`
      console.log('[SEARCH] Fetching:', url)
      
      const response = await fetch(url, {
        credentials: 'include',
      })
      
      console.log('[SEARCH] Response status:', response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log('[SEARCH] Response data:', { 
          resultsCount: data.results?.length || 0,
          hasError: !!data.error,
          error: data.error 
        })
        
        if (data.error) {
          console.error('Search API error:', data.error, data.details)
          setSearchResults([])
        } else {
          const results = data.results || []
          console.log('[SEARCH] Setting results:', results.length)
          setSearchResults(results)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Search response error:', response.status, errorData)
        setSearchResults([])
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [activeClientId])

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery)
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchQuery, performSearch])

  const handleSearchResultClick = (date: string) => {
    setSelectedResultDate(date)
    // Przewiń do konkretnego dnia w kalendarzu
    setTimeout(() => {
      const dayElement = document.querySelector(`[data-day="${date}"]`)
      if (dayElement) {
        dayElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Dodatkowe podświetlenie
        dayElement.classList.add('search-highlight')
        setTimeout(() => {
          dayElement.classList.remove('search-highlight')
        }, 2000)
      } else {
        // Jeśli dzień nie jest widoczny (inny miesiąc), przewiń do kalendarza
        const calendarElement = document.querySelector('[data-calendar-container]')
        if (calendarElement) {
          calendarElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    }, 100)
  }

  // Listen for client updates
  useEffect(() => {
    const handleClientUpdate = () => {
      loadClients()
    }
    window.addEventListener('clientUpdated', handleClientUpdate)
    return () => window.removeEventListener('clientUpdated', handleClientUpdate)
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--app-text-muted)' }}>
        Ładowanie klientów...
      </div>
    )
  }

  if (!Array.isArray(clients) || clients.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ color: 'var(--app-text-muted)', marginBottom: '12px', fontSize: '13px' }}>
          Brak klientów. Dodaj pierwszego klienta w ustawieniach.
        </div>
        <button
          onClick={handleAddClient}
          style={{
            padding: '6px 12px',
            background: 'var(--app-accent)',
            color: 'var(--app-accent-foreground)',
            border: 'none',
            borderRadius: '3px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(0.9)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none'
          }}
        >
          <Plus size={14} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle', color: 'var(--app-accent-foreground)' }} />
          Dodaj klienta
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Website link if available */}
      {(() => {
        if (!Array.isArray(clients)) {
          return null
        }
        const activeClient = Array.isArray(clients) ? clients.find(c => c.id === activeClientId) : null
        if (activeClient?.website) {
          const websiteUrl = activeClient.website.startsWith('http://') || activeClient.website.startsWith('https://') 
            ? activeClient.website 
            : `https://${activeClient.website}`
          return (
            <div style={{ 
              marginBottom: '12px', 
              padding: '8px 12px', 
              background: 'var(--app-card-alt)', 
              borderRadius: '4px',
              border: '1px solid var(--app-border)'
            }}>
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--app-accent)',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none'
                }}
              >
                <Globe size={14} color="#d22f27" />
                <span>{activeClient.website}</span>
              </a>
            </div>
          )
        }
        return null
      })()}
      
      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '4px', 
        borderBottom: '1px solid var(--app-border)',
        paddingBottom: '0',
        marginBottom: '12px',
        overflowX: 'auto',
        scrollbarWidth: 'thin'
      }}>
        {Array.isArray(clients) && clients.map((client) => (
          <button
            key={client.id}
            onClick={() => handleTabClick(client.id)}
            style={{
              padding: '8px 12px',
              background: activeClientId === client.id ? 'var(--app-accent)' : 'transparent',
              color: activeClientId === client.id ? 'var(--app-accent-foreground)' : 'var(--app-text-muted)',
              border: 'none',
              borderBottom: activeClientId === client.id ? '2px solid var(--app-accent)' : '2px solid transparent',
              borderRadius: '3px 3px 0 0',
              fontSize: '13px',
              fontWeight: activeClientId === client.id ? '600' : '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              minHeight: '36px'
            }}
            onMouseEnter={(e) => {
              if (activeClientId !== client.id) {
                e.currentTarget.style.background = 'var(--app-card-alt)'
                e.currentTarget.style.color = 'var(--app-text)'
              }
            }}
            onMouseLeave={(e) => {
              if (activeClientId !== client.id) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--app-text-muted)'
              }
            }}
          >
            {client.logo && !failedLogos.has(client.logo) ? (
              <img
                src={client.logo}
                alt={client.name}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '2px',
                  objectFit: 'cover',
                  flexShrink: 0
                }}
                onError={() => {
                  setFailedLogos(prev => new Set(prev).add(client.logo))
                }}
              />
            ) : (
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '2px',
                  background: activeClientId === client.id ? 'var(--app-accent-foreground)' : 'var(--app-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: '600',
                  color: activeClientId === client.id ? 'var(--app-accent)' : 'var(--app-accent-foreground)',
                  flexShrink: 0
                }}
              >
                {client.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span>{client.name}</span>
          </button>
        ))}
      </div>

      {/* Search Bar - Sticky */}
      {activeClientId !== null && (
        <div style={{
          position: 'sticky',
          top: '0',
          zIndex: 100,
          marginBottom: '12px',
          background: 'var(--app-bg)',
          borderBottom: '1px solid var(--app-border)',
          padding: '8px',
          borderRadius: '4px 4px 0 0'
        }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={16} style={{ flexShrink: 0, color: 'var(--app-text-muted)' }} />
            <input
              type="text"
              placeholder="Wyszukaj zadania..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '6px 8px',
                background: 'var(--app-card-alt)',
                border: '1px solid var(--app-border)',
                borderRadius: '3px',
                color: 'var(--app-text)',
                fontSize: '13px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--app-accent)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--app-border)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults([])
                  setSelectedResultDate(null)
                }}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <XCircle size={16} color="#888" />
              </button>
            )}
          </div>
          
          {/* Search Results Dropdown */}
          {searchQuery && (searchLoading || searchResults.length > 0) && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '0',
              right: '0',
              marginTop: '4px',
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid var(--app-border)',
              borderRadius: '0 0 4px 4px',
              background: 'var(--app-card)',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
              zIndex: 101
            }}>
              {searchLoading ? (
                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--app-text-muted)', fontSize: '12px' }}>
                  Wyszukiwanie...
                </div>
              ) : searchResults.length > 0 ? (
                <div>
                  <div style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--app-border)',
                    fontSize: '12px',
                    color: 'var(--app-text-muted)',
                    fontWeight: '500',
                    background: 'var(--app-bg)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }}>
                    Znaleziono {searchResults.length} {searchResults.length === 1 ? 'zadanie' : 'zadań'}
                  </div>
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      onClick={() => handleSearchResultClick(result.date)}
                      style={{
                        padding: '10px 12px',
                        borderBottom: index < searchResults.length - 1 ? '1px solid var(--app-border)' : 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                        background: selectedResultDate === result.date ? 'var(--app-card-alt)' : 'transparent'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedResultDate !== result.date) {
                          e.currentTarget.style.background = '#222'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedResultDate !== result.date) {
                          e.currentTarget.style.background = 'transparent'
                        }
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '12px'
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '12px',
                            color: 'var(--app-text-muted)',
                            marginBottom: '4px'
                          }}>
                            {(() => {
                              try {
                                const parsedDate = parse(result.date, 'yyyy-MM-dd', new Date())
                                return isValid(parsedDate) ? format(parsedDate, 'dd.MM.yyyy') : result.date
                              } catch {
                                return result.date
                              }
                            })()} • {result.task.startTime} - {result.task.endTime}
                          </div>
                          <div style={{
                            fontSize: '13px',
                            color: 'var(--app-text)',
                            wordBreak: 'break-word',
                            lineHeight: '1.4'
                          }}>
                            {result.task.text}
                          </div>
                          {result.task.assignedBy.length > 0 && (
                            <div style={{
                              fontSize: '11px',
                              color: 'var(--app-text-muted)',
                              marginTop: '4px'
                            }}>
                              {result.task.assignedBy.join(', ')}
                            </div>
                          )}
                        </div>
                        <div style={{
                          padding: '2px 6px',
                          background: result.task.status === 'wykonano' ? '#10B981' : 
                                     result.task.status === 'w trakcie' ? '#F59E0B' : 
                                     result.task.status === 'anulowane' ? '#d22f27' : '#6B7280',
                          borderRadius: '3px',
                          fontSize: '10px',
                          color: 'var(--app-text)',
                          fontWeight: '500',
                          flexShrink: 0,
                          height: 'fit-content'
                        }}>
                          {result.task.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Calendar Content */}
      {activeClientId !== null && (() => {
        const activeClient = Array.isArray(clients) ? clients.find(c => c.id === activeClientId) : null
        return (
          <div style={{ flex: 1 }} data-calendar-container>
            <CalendarTable 
              clientId={activeClientId} 
              clientName={activeClient?.name}
              clientLogo={activeClient?.logo}
              highlightDate={selectedResultDate}
            />
          </div>
        )
      })()}
    </div>
  )
}





