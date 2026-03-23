import { useEffect, useState } from 'react'
import { basePath, assetUrl } from '@/lib/apiBase'
import { useToast } from '@/contexts/ToastContext'
import { Plus, Edit2, Trash2, Upload, X, Check, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

export default function AssignersTab() {
  const { showToast } = useToast()

  const [assigners, setAssigners] = useState<any[]>([])
  const [assignersLoading, setAssignersLoading] = useState(false)
  const [editingAssigner, setEditingAssigner] = useState<any | null>(null)
  const [newAssignerName, setNewAssignerName] = useState('')
  const [newAssignerAvatar, setNewAssignerAvatar] = useState<string | undefined>(undefined)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadAssigners()
  }, [])

  const loadAssigners = async () => {
    setAssignersLoading(true)
    try {
      const response = await fetch(`${basePath}/api/assigners`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setAssigners(data)
      }
    } catch (error) {
      console.error('Error loading assigners:', error)
    } finally {
      setAssignersLoading(false)
    }
  }

  const handleUploadAvatar = async (file: File, assignerId?: string) => {
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${basePath}/api/assigners/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        return data.avatar
      } else {
        const error = await response.json()
        showToast(`Błąd uploadowania: ${error.error}`, 'error')
        return null
      }
    } catch (error) {
      showToast('Błąd podczas uploadowania awatara', 'error')
      return null
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleCreateAssigner = async () => {
    if (!newAssignerName.trim()) {
      showToast('Podaj nazwę osoby zlecającej', 'warning')
      return
    }

    try {
      const response = await fetch(`${basePath}/api/assigners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newAssignerName, avatar: newAssignerAvatar })
      })

      if (response.ok) {
        await loadAssigners()
        setNewAssignerName('')
        setNewAssignerAvatar(undefined)
        window.dispatchEvent(new Event('assignerUpdated'))
      } else {
        const error = await response.json()
        showToast(`Błąd: ${error.error}${error.details ? '\nSzczegóły: ' + error.details : ''}`, 'error')
      }
    } catch (error: any) {
      console.error('Error creating assigner:', error)
      showToast(`Błąd podczas tworzenia osoby zlecającej: ${error.message || 'Nieznany błąd'}`, 'error')
    }
  }

  const handleUpdateAssigner = async (id: string, name: string, avatar?: string) => {
    try {
      const response = await fetch(`${basePath}/api/assigners`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, name, avatar })
      })

      if (response.ok) {
        await loadAssigners()
        setEditingAssigner(null)
        window.dispatchEvent(new Event('assignerUpdated'))
      } else {
        const error = await response.json()
        showToast(`Błąd: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Błąd podczas aktualizacji osoby zlecającej', 'error')
    }
  }

  const handleDeleteAssigner = async (id: string) => {
    try {
      const response = await fetch(`${basePath}/api/assigners?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        await loadAssigners()
        window.dispatchEvent(new Event('assignerUpdated'))
      } else {
        const error = await response.json()
        showToast(`Błąd: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Błąd podczas usuwania osoby zlecającej', 'error')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl tracking-tight">Osoby zlecające</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Add form */}
        <Card className="bg-[var(--app-card-alt)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dodaj nową osobę zlecającą</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-start">
              {/* Avatar preview/upload */}
              <div className="relative shrink-0">
                {newAssignerAvatar ? (
                  <img
                    src={assetUrl(newAssignerAvatar)}
                    alt="Preview"
                    className="w-[60px] h-[60px] rounded-full object-cover border-2 border-[#d22f27]"
                    onError={() => setFailedAvatars(prev => new Set(prev).add(newAssignerAvatar!))}
                  />
                ) : (
                  <div className="w-[60px] h-[60px] rounded-full bg-[#d22f27] flex items-center justify-center text-white text-2xl font-semibold">
                    ?
                  </div>
                )}
                <label
                  className="absolute -bottom-1 -right-1 bg-[#d22f27] rounded-full w-6 h-6 flex items-center justify-center cursor-pointer border-2 border-[var(--app-bg)]"
                  title="Dodaj awatar"
                >
                  <Upload size={12} color="white" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const avatar = await handleUploadAvatar(file)
                        if (avatar) {
                          setNewAssignerAvatar(avatar)
                        }
                      }
                    }}
                  />
                </label>
                {newAssignerAvatar && (
                  <button
                    onClick={() => setNewAssignerAvatar(undefined)}
                    className="absolute -top-1 -right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer border-2 border-[var(--app-bg)] p-0"
                    title="Usuń awatar"
                  >
                    <X size={10} color="white" />
                  </button>
                )}
              </div>

              {/* Form */}
              <div className="flex-1 flex flex-col gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Nazwa</Label>
                  <Input
                    type="text"
                    value={newAssignerName}
                    onChange={(e) => setNewAssignerName(e.target.value)}
                    placeholder="np. Jan Kowalski"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateAssigner()
                      }
                    }}
                    className="text-sm"
                  />
                </div>
                <Button
                  onClick={handleCreateAssigner}
                  disabled={uploadingAvatar}
                  className={cn(
                    'self-start flex items-center gap-1.5 text-sm font-semibold',
                    uploadingAvatar
                      ? 'bg-gray-500 cursor-not-allowed'
                      : 'bg-[#d22f27] hover:bg-[#b0251f]'
                  )}
                >
                  {uploadingAvatar ? (
                    <>⏳ Uploadowanie...</>
                  ) : (
                    <>
                      <Plus size={16} />
                      Dodaj
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        {assignersLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 rounded-lg border flex items-center gap-4">
                <Skeleton className="w-[60px] h-[60px] rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : assigners.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center bg-[var(--app-card-alt)] rounded-lg border border-[var(--app-border)]">
            <div className="rounded-full bg-muted p-4 mb-3">
              <UserX className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Brak osób zlecających. Dodaj pierwszą osobę powyżej.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {assigners.map((assigner) => (
              <div
                key={assigner.id}
                className="p-4 bg-[var(--app-card-alt)] rounded-lg border border-[var(--app-border)] flex items-center gap-4"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {assigner.avatar && !failedAvatars.has(assigner.avatar) ? (
                    <img
                      src={assetUrl(assigner.avatar)}
                      alt={assigner.name}
                      className="w-[60px] h-[60px] rounded-full object-cover border-2 border-[#d22f27]"
                      onError={() => setFailedAvatars(prev => new Set(prev).add(assigner.avatar))}
                    />
                  ) : (
                    <div className="w-[60px] h-[60px] rounded-full bg-[#d22f27] flex items-center justify-center text-white text-2xl font-semibold">
                      {assigner.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {editingAssigner?.id === assigner.id && (
                    <label className="absolute -bottom-1 -right-1 bg-[#d22f27] rounded-full w-6 h-6 flex items-center justify-center cursor-pointer border-2 border-[var(--app-bg)]">
                      <Upload size={12} color="white" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const avatar = await handleUploadAvatar(file, assigner.id)
                            if (avatar) {
                              handleUpdateAssigner(assigner.id, editingAssigner.name, avatar)
                            }
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Name / Edit */}
                {editingAssigner?.id === assigner.id ? (
                  <div className="flex-1 flex gap-2 items-center">
                    <Input
                      type="text"
                      value={editingAssigner.name}
                      onChange={(e) => setEditingAssigner({ ...editingAssigner, name: e.target.value })}
                      className="flex-1 text-sm border-[#d22f27]"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateAssigner(assigner.id, editingAssigner.name, editingAssigner.avatar)}
                      className="p-1.5 px-3 bg-emerald-500 text-white rounded flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingAssigner(null)}
                      className="p-1.5 px-3 bg-red-500 text-white rounded flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="text-base font-semibold text-[var(--app-text)] mb-1">{assigner.name}</div>
                      <div className="text-xs text-gray-500">
                        Utworzono: {new Date(assigner.createdAt).toLocaleDateString('pl-PL')}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingAssigner({ ...assigner })}
                        className="px-3 py-2 bg-transparent text-[#d22f27] border border-[#d22f27] rounded-md cursor-pointer flex items-center gap-1.5 text-xs font-medium hover:bg-[#d22f27] hover:text-white transition-colors"
                      >
                        <Edit2 size={14} />
                        Edytuj
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="px-3 py-2 bg-transparent text-red-500 border border-red-500 rounded-md cursor-pointer flex items-center gap-1.5 text-xs font-medium hover:bg-red-500 hover:text-white transition-colors"
                          >
                            <Trash2 size={14} />
                            Usuń
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Usunąć osobę zlecającą?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Czy na pewno chcesz usunąć <strong>{assigner.name}</strong>? Ta operacja jest nieodwracalna.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Anuluj</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteAssigner(assigner.id)}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Usuń
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
