import { useState } from 'react'
import { Check, X, Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface TimeSlot {
  start: string
  end: string
}

interface TimeEntryProps {
  date: string
  timeSlots: TimeSlot[]
  type: 'start' | 'end'
  onUpdate: (timeSlots: TimeSlot[]) => void
}

export default function TimeEntry({ date, timeSlots, type, onUpdate }: TimeEntryProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [newTime, setNewTime] = useState('')

  const handleAdd = () => {
    const newSlot: TimeSlot = {
      start: type === 'start' ? newTime : '',
      end: type === 'end' ? newTime : '',
    }

    if (type === 'start') {
      const emptySlotIndex = timeSlots.findIndex(slot => !slot.start)
      if (emptySlotIndex >= 0) {
        const updated = [...timeSlots]
        updated[emptySlotIndex] = { ...updated[emptySlotIndex], start: newTime }
        onUpdate(updated)
      } else {
        onUpdate([...timeSlots, newSlot])
      }
    } else {
      const emptySlotIndex = timeSlots.findIndex(slot => !slot.end)
      if (emptySlotIndex >= 0) {
        const updated = [...timeSlots]
        updated[emptySlotIndex] = { ...updated[emptySlotIndex], end: newTime }
        onUpdate(updated)
      } else {
        onUpdate([...timeSlots, newSlot])
      }
    }

    setNewTime('')
    setEditingIndex(null)
  }

  const handleEdit = (index: number, currentValue: string) => {
    setEditingIndex(index)
    setNewTime(currentValue)
  }

  const handleSave = (index: number) => {
    const updated = [...timeSlots]
    if (type === 'start') {
      updated[index] = { ...updated[index], start: newTime }
    } else {
      updated[index] = { ...updated[index], end: newTime }
    }
    onUpdate(updated)
    setEditingIndex(null)
    setNewTime('')
  }

  const handleDelete = (index: number) => {
    const updated = timeSlots.filter((_, i) => i !== index)
    onUpdate(updated)
  }

  const getDisplayValue = (slot: TimeSlot): string => {
    return type === 'start' ? (slot.start || '') : (slot.end || '')
  }

  return (
    <div className="flex flex-col gap-2">
      {timeSlots.map((slot, index) => {
        const value = getDisplayValue(slot)
        const isEditing = editingIndex === index

        return (
          <div key={index} className="flex items-center gap-2 flex-wrap">
            {isEditing ? (
              <>
                <Input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-[120px] h-8 text-sm"
                />
                <Button
                  size="icon"
                  variant="default"
                  className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 bg-emerald-500 hover:bg-emerald-600"
                  onClick={() => handleSave(index)}
                  aria-label="Zapisz czas"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  onClick={() => { setEditingIndex(null); setNewTime('') }}
                  aria-label="Anuluj edycję"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <span className={`text-sm min-w-[70px] ${value ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {value || '-'}
                </span>
                {value && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleEdit(index, value)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edytuj
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => handleDelete(index)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Usuń
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )
      })}

      {editingIndex === null && (
        <div className="flex items-center gap-2">
          <Input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="Dodaj czas"
            className="w-[120px] h-8 text-sm"
          />
          <Button size="icon" className="h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0" onClick={handleAdd} aria-label="Dodaj czas">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
