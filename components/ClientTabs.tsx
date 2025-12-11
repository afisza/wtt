'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Globe } from 'lucide-react'
import CalendarTable from './CalendarTable'

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
      <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
        Ładowanie klientów...
      </div>
    )
  }

  if (!Array.isArray(clients) || clients.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ color: '#888', marginBottom: '12px', fontSize: '13px' }}>
          Brak klientów. Dodaj pierwszego klienta w ustawieniach.
        </div>
        <button
          onClick={handleAddClient}
          style={{
            padding: '6px 12px',
            background: '#d22f27',
            color: '#ffffff',
            border: 'none',
            borderRadius: '3px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#b0251f'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#d22f27'
          }}
        >
          <Plus size={14} color="#ffffff" style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} />
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
              background: '#1a1a1a', 
              borderRadius: '4px',
              border: '1px solid #2a2a2a'
            }}>
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#d22f27',
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
        borderBottom: '1px solid #2a2a2a',
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
              background: activeClientId === client.id ? '#d22f27' : 'transparent',
              color: activeClientId === client.id ? '#ffffff' : '#888',
              border: 'none',
              borderBottom: activeClientId === client.id ? '2px solid #d22f27' : '2px solid transparent',
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
                e.currentTarget.style.background = '#1a1a1a'
                e.currentTarget.style.color = '#ffffff'
              }
            }}
            onMouseLeave={(e) => {
              if (activeClientId !== client.id) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#888'
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
                  background: activeClientId === client.id ? '#ffffff' : '#d22f27',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: '600',
                  color: activeClientId === client.id ? '#d22f27' : '#ffffff',
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

      {/* Calendar Content */}
      {activeClientId !== null && (() => {
        const activeClient = Array.isArray(clients) ? clients.find(c => c.id === activeClientId) : null
        return (
          <div style={{ flex: 1 }}>
            <CalendarTable 
              clientId={activeClientId} 
              clientName={activeClient?.name}
              clientLogo={activeClient?.logo}
            />
          </div>
        )
      })()}
    </div>
  )
}




