import { useEffect, useState } from 'react'
import { basePath, assetUrl } from '@/lib/apiBase'
import { useToast } from '@/contexts/ToastContext'
import { Plus, Edit2, Trash2, Upload, X, Check, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
} from '@/components/ui/alert-dialog'

export default function ClientsTab() {
  const { showToast } = useToast()

  const [clients, setClients] = useState<any[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [editingClient, setEditingClient] = useState<number | null>(null)
  const [newClientName, setNewClientName] = useState('')
  const [newClientLogo, setNewClientLogo] = useState('')
  const [newClientWebsite, setNewClientWebsite] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [editingClientName, setEditingClientName] = useState('')
  const [editingClientLogo, setEditingClientLogo] = useState('')
  const [editingClientWebsite, setEditingClientWebsite] = useState('')

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
          if (result.updatedRows > 0) {
            showToast(`Migracja zakończona: ${result.updatedRows} dni pracy zostało przypisanych do klienta "Best Market"`, 'info')
          } else if (result.clientId) {
            console.log('Client "Best Market" created for existing data')
          }
          loadClients()
        }
      }
    } catch (error) {
      console.error('Migration check error:', error)
    }
  }

  const loadClients = async () => {
    setClientsLoading(true)
    try {
      const response = await fetch(`${basePath}/api/clients`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setClients(data)
      }
    } catch (error) {
      console.error('Error loading clients:', error)
      showToast('Błąd podczas ładowania klientów', 'error')
    } finally {
      setClientsLoading(false)
    }
  }

  const handleUploadLogo = async (file: File, isEdit: boolean = false) => {
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${basePath}/api/clients/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        if (isEdit) {
          setEditingClientLogo(data.url)
        } else {
          setNewClientLogo(data.url)
        }
      } else {
        const error = await response.json()
        showToast(error.details || 'Błąd podczas uploadu logo', 'error')
      }
    } catch (error) {
      console.error('Error uploading logo:', error)
      showToast('Błąd podczas uploadu logo', 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      showToast('Nazwa klienta jest wymagana', 'warning')
      return
    }

    try {
      const response = await fetch(`${basePath}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newClientName.trim(), logo: newClientLogo, website: newClientWebsite.trim() }),
      })

      if (response.ok) {
        const newClient = await response.json()
        setClients([...clients, newClient])
        setNewClientName('')
        setNewClientLogo('')
        setNewClientWebsite('')
        window.dispatchEvent(new Event('clientUpdated'))
        showToast('Klient został dodany', 'success')
      } else {
        const error = await response.json()
        showToast(error.details || 'Błąd podczas tworzenia klienta', 'error')
      }
    } catch (error) {
      console.error('Error creating client:', error)
      showToast('Błąd podczas tworzenia klienta', 'error')
    }
  }

  const handleUpdateClient = async (id: number) => {
    if (!editingClientName.trim()) {
      showToast('Nazwa klienta jest wymagana', 'warning')
      return
    }

    try {
      const response = await fetch(`${basePath}/api/clients`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, name: editingClientName.trim(), logo: editingClientLogo, website: editingClientWebsite.trim() }),
      })

      if (response.ok) {
        await loadClients()
        setEditingClient(null)
        setEditingClientName('')
        setEditingClientLogo('')
        setEditingClientWebsite('')
        window.dispatchEvent(new Event('clientUpdated'))
        showToast('Klient został zaktualizowany', 'success')
      } else {
        const error = await response.json()
        showToast(error.details || 'Błąd podczas aktualizacji klienta', 'error')
      }
    } catch (error) {
      console.error('Error updating client:', error)
      showToast('Błąd podczas aktualizacji klienta', 'error')
    }
  }

  const handleDeleteClient = async (id: number) => {
    try {
      const response = await fetch(`${basePath}/api/clients?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        await loadClients()
        window.dispatchEvent(new Event('clientUpdated'))
        showToast('Klient został usunięty', 'success')
      } else {
        const error = await response.json()
        showToast(error.details || 'Błąd podczas usuwania klienta', 'error')
      }
    } catch (error) {
      console.error('Error deleting client:', error)
      showToast('Błąd podczas usuwania klienta', 'error')
    }
  }

  const handleEdit = (client: any) => {
    setEditingClient(client.id)
    setEditingClientName(client.name)
    setEditingClientLogo(client.logo || '')
    setEditingClientWebsite(client.website || '')
  }

  const handleCancelEdit = () => {
    setEditingClient(null)
    setEditingClientName('')
    setEditingClientLogo('')
    setEditingClientWebsite('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl tracking-tight">Klienci</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Add form */}
        <Card className="bg-[var(--app-card-alt)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dodaj nowego klienta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-start">
              {/* Logo preview/upload */}
              <div className="relative shrink-0">
                {newClientLogo ? (
                  <img
                    src={assetUrl(newClientLogo)}
                    alt="Preview"
                    className="w-[60px] h-[60px] rounded object-cover border-2 border-[var(--app-accent)]"
                  />
                ) : (
                  <div className="w-[60px] h-[60px] rounded bg-[var(--app-card)] flex items-center justify-center border-2 border-dashed border-[var(--app-border)]">
                    <User size={24} className="text-[var(--app-text-muted)]" />
                  </div>
                )}
                <label className="absolute -bottom-2 -right-2 bg-[var(--app-accent)] rounded-full w-6 h-6 flex items-center justify-center cursor-pointer border-2 border-[var(--app-bg)]">
                  <Upload size={12} className="text-[var(--app-accent-foreground)]" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUploadLogo(file, false)
                    }}
                  />
                </label>
                {newClientLogo && (
                  <button
                    onClick={() => setNewClientLogo('')}
                    className="absolute -top-2 -right-2 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer border-none p-0"
                  >
                    <X size={12} color="white" />
                  </button>
                )}
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <Input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Nazwa klienta..."
                  className="text-sm"
                />
                <Input
                  type="url"
                  value={newClientWebsite}
                  onChange={(e) => setNewClientWebsite(e.target.value)}
                  placeholder="Adres strony www (opcjonalnie)..."
                  className="text-sm"
                />
                <Button
                  onClick={handleCreateClient}
                  disabled={uploadingLogo}
                  className="self-start text-xs font-semibold bg-[var(--app-accent)] hover:brightness-90 text-[var(--app-accent-foreground)] disabled:opacity-60"
                >
                  <Plus size={14} className="mr-1" />
                  Dodaj klienta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <div>
          <h3 className="text-base font-semibold text-[var(--app-text)] mb-3">
            Lista klientów ({clients.length})
          </h3>
          {clientsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg border flex items-center gap-4">
                  <Skeleton className="w-[60px] h-[60px] rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : clients.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-4 mb-3">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Brak klientów. Dodaj pierwszego klienta powyżej.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="p-4 bg-[var(--app-card-alt)] rounded-lg border border-[var(--app-border)] flex items-center gap-4"
                >
                  {editingClient === client.id ? (
                    <>
                      <div className="relative shrink-0">
                        {editingClientLogo ? (
                          <img
                            src={assetUrl(editingClientLogo)}
                            alt="Preview"
                            className="w-[60px] h-[60px] rounded object-cover border-2 border-[var(--app-accent)]"
                          />
                        ) : (
                          <div className="w-[60px] h-[60px] rounded bg-[var(--app-card)] flex items-center justify-center border-2 border-dashed border-[var(--app-border)]">
                            <User size={24} className="text-[var(--app-text-muted)]" />
                          </div>
                        )}
                        <label className="absolute -bottom-2 -right-2 bg-[var(--app-accent)] rounded-full w-6 h-6 flex items-center justify-center cursor-pointer border-2 border-[var(--app-bg)]">
                          <Upload size={12} className="text-[var(--app-accent-foreground)]" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleUploadLogo(file, true)
                            }}
                          />
                        </label>
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <Input
                          type="text"
                          value={editingClientName}
                          onChange={(e) => setEditingClientName(e.target.value)}
                          className="text-sm border-[var(--app-accent)]"
                        />
                        <Input
                          type="url"
                          value={editingClientWebsite}
                          onChange={(e) => setEditingClientWebsite(e.target.value)}
                          placeholder="Adres strony www (opcjonalnie)..."
                          className="text-sm border-[var(--app-accent)]"
                        />
                      </div>
                      <button
                        onClick={() => handleUpdateClient(client.id)}
                        className="p-1.5 px-3 bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer flex items-center"
                      >
                        <Check size={14} color="#ffffff" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="p-1.5 px-3 bg-transparent text-red-500 border border-red-500 rounded text-xs font-semibold cursor-pointer flex items-center"
                      >
                        <X size={14} color="#EF4444" />
                      </button>
                    </>
                  ) : (
                    <>
                      {client.logo ? (
                        <img
                          src={assetUrl(client.logo)}
                          alt={client.name}
                          className="w-[60px] h-[60px] rounded object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-[60px] h-[60px] rounded bg-[var(--app-accent)] flex items-center justify-center text-xl font-semibold text-[var(--app-accent-foreground)] shrink-0">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-[var(--app-text)]">{client.name}</div>
                      </div>
                      <button
                        onClick={() => handleEdit(client)}
                        className="px-3 py-1.5 bg-transparent text-[var(--app-accent)] border border-[var(--app-accent)] rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-[var(--app-accent)] hover:text-[var(--app-accent-foreground)] transition-colors"
                      >
                        <Edit2 size={14} className="shrink-0" />
                        Edytuj
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="px-3 py-1.5 bg-transparent text-red-500 border border-red-500 rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-red-500 hover:text-white transition-colors"
                          >
                            <Trash2 size={14} className="shrink-0" />
                            Usuń
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Usunąć klienta?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Czy na pewno chcesz usunąć klienta <strong>{client.name}</strong>? Wszystkie powiązane dane zostaną usunięte. Ta operacja jest nieodwracalna.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Anuluj</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteClient(client.id)}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Usuń klienta
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
