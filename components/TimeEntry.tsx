'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'

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

  const getDisplayValue = (slot: TimeSlot, index: number): string => {
    if (type === 'start') {
      return slot.start || ''
    } else {
      return slot.end || ''
    }
  }

  const buttonStyle = {
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: 'none'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {timeSlots.map((slot, index) => {
        const value = getDisplayValue(slot, index)
        const isEditing = editingIndex === index

        return (
          <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {isEditing ? (
              <>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  style={{ 
                    padding: '8px 12px', 
                    border: '2px solid #8B5CF6', 
                    borderRadius: '6px', 
                    fontSize: '13px',
                    background: 'white',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  onClick={() => handleSave(index)}
                  style={{
                    ...buttonStyle,
                    background: '#10B981',
                    color: 'white'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#059669'
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#10B981'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <Check size={14} color="white" />
                </button>
                <button
                  onClick={() => {
                    setEditingIndex(null)
                    setNewTime('')
                  }}
                  style={{
                    ...buttonStyle,
                    background: '#EF4444',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#DC2626'
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#EF4444'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <X size={14} color="white" />
                </button>
              </>
            ) : (
              <>
                <span style={{ 
                  fontSize: '13px', 
                  minWidth: '70px',
                  color: value ? '#1F2937' : '#9CA3AF',
                  fontWeight: value ? '500' : '400'
                }}>
                  {value || '-'}
                </span>
                {value && (
                  <>
                    <button
                      onClick={() => handleEdit(index, value)}
                      style={{
                        ...buttonStyle,
                        background: '#8B5CF6',
                        color: 'white'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#7C3AED'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#8B5CF6'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      Edytuj
                    </button>
                    <button
                      onClick={() => handleDelete(index)}
                      style={{
                        ...buttonStyle,
                        background: '#EF4444',
                        color: 'white'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#DC2626'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#EF4444'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      Usuń
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )
      })}
      
      {editingIndex === null && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="Dodaj czas"
            style={{ 
              padding: '8px 12px', 
              border: '2px solid #E5E7EB', 
              borderRadius: '6px', 
              fontSize: '13px',
              width: '120px',
              background: '#F9FAFB',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#8B5CF6'
              e.target.style.background = 'white'
              e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E5E7EB'
              e.target.style.background = '#F9FAFB'
              e.target.style.boxShadow = 'none'
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              ...buttonStyle,
              background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
              color: 'white',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '600'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(139, 92, 246, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}
