'use client'

import { useState, useEffect } from 'react'
import { Edit2, Trash2, Plus, X, Check, Clock } from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'

// Funkcja do wykrywania i renderowania linków w tekście
const renderTextWithLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g
  
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match
  let keyCounter = 0
  
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }
    
    let url = match[0]
    if (url.startsWith('www.')) {
      url = 'https://' + url
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    
    parts.push(
      <a
        key={`link-${keyCounter++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#d22f27', textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#b0251f'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#d22f27'
        }}
      >
        {match[0]}
      </a>
    )
    
    lastIndex = match.index + match[0].length
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }
  
  return parts.length > 0 ? <>{parts}</> : text
}

export type TaskStatus = 'wykonano' | 'w trakcie' | 'do zrobienia' | 'anulowane'

export interface Task {
  text: string
  assignedBy: string  // Kto zlecił zadanie
  startTime: string   // Format: HH:MM
  endTime: string     // Format: HH:MM
  status: TaskStatus  // Status zadania
}

interface TaskListProps {
  date: string
  tasks: Task[]
  onUpdate: (tasks: Task[]) => void
}

const statusOptions: TaskStatus[] = ['wykonano', 'w trakcie', 'do zrobienia', 'anulowane']

export default function TaskList({ date, tasks, onUpdate }: TaskListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [inlineEditingIndex, setInlineEditingIndex] = useState<number | null>(null)
  const [inlineEditingText, setInlineEditingText] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [newAssignedBy, setNewAssignedBy] = useState('')
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  const [newStatus, setNewStatus] = useState<TaskStatus>('do zrobienia')
  const [editingTask, setEditingTask] = useState('')
  const [editingAssignedBy, setEditingAssignedBy] = useState('')
  const [editingStartTime, setEditingStartTime] = useState('')
  const [editingEndTime, setEditingEndTime] = useState('')
  const [editingStatus, setEditingStatus] = useState<TaskStatus>('do zrobienia')
  const [assigners, setAssigners] = useState<any[]>([])
  const [showAssignerDropdown, setShowAssignerDropdown] = useState<number | null>(null)
  const [showNewAssignerDropdown, setShowNewAssignerDropdown] = useState(false)
  const [assignerSearchQuery, setAssignerSearchQuery] = useState('')
  const [editingAssignerSearchQuery, setEditingAssignerSearchQuery] = useState<Record<number, string>>({})
  const { showToast } = useToast()

  useEffect(() => {
    const loadAssigners = async () => {
      try {
        const response = await fetch('/api/assigners')
        if (response.ok) {
          const data = await response.json()
          setAssigners(data)
        }
      } catch (error) {
        console.error('Error loading assigners:', error)
      }
    }
    loadAssigners()
  }, [])
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-assigner-dropdown]')) {
        setShowAssignerDropdown(null)
        setShowNewAssignerDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])
  
  const getAssignerByName = (name: string) => {
    return assigners.find(a => a.name === name)
  }
  
  const getFilteredAssigners = (query: string) => {
    if (!query || query.length < 2) {
      return []
    }
    const lowerQuery = query.toLowerCase()
    return assigners.filter(a => 
      a.name.toLowerCase().includes(lowerQuery)
    )
  }

  const handleAdd = () => {
    if (newTask.trim()) {
      onUpdate([...tasks, { 
        text: newTask.trim(), 
        assignedBy: newAssignedBy.trim(),
        startTime: newStartTime.trim() || '08:00',
        endTime: newEndTime.trim() || '16:00',
        status: newStatus
      }])
      showToast('Zadanie zostało dodane', 'success')
      setNewTask('')
      setNewAssignedBy('')
      setNewStartTime('')
      setNewEndTime('')
      setNewStatus('do zrobienia')
      setShowAddForm(false)
    }
  }

  const handleCancelAdd = () => {
    setNewTask('')
    setNewAssignedBy('')
    setNewStartTime('')
    setNewEndTime('')
    setNewStatus('do zrobienia')
    setShowAddForm(false)
  }

  const handleInlineEdit = (index: number) => {
    setInlineEditingIndex(index)
    setInlineEditingText(tasks[index].text)
  }

  const handleInlineSave = (index: number) => {
    if (inlineEditingText.trim()) {
      const updated = [...tasks]
      updated[index] = { ...updated[index], text: inlineEditingText.trim() }
      onUpdate(updated)
      showToast('Zadanie zostało zaktualizowane', 'success')
    }
    setInlineEditingIndex(null)
    setInlineEditingText('')
  }

  const handleInlineCancel = () => {
    setInlineEditingIndex(null)
    setInlineEditingText('')
  }

  const handleEdit = (index: number) => {
    setEditingIndex(index)
    setEditingTask(tasks[index].text)
    setEditingAssignedBy(tasks[index].assignedBy)
    setEditingStartTime(tasks[index].startTime || '')
    setEditingEndTime(tasks[index].endTime || '')
    setEditingStatus(tasks[index].status)
  }

  const handleSave = (index: number) => {
    if (editingTask.trim()) {
      const updated = [...tasks]
      updated[index] = { 
        text: editingTask.trim(), 
        assignedBy: editingAssignedBy.trim(),
        startTime: editingStartTime.trim() || '08:00',
        endTime: editingEndTime.trim() || '16:00',
        status: editingStatus
      }
      onUpdate(updated)
      showToast('Zadanie zostało zaktualizowane', 'success')
    }
    setEditingIndex(null)
    setEditingTask('')
    setEditingAssignedBy('')
    setEditingStartTime('')
    setEditingEndTime('')
    setEditingStatus('do zrobienia')
  }

  const handleDelete = (index: number) => {
    const updated = tasks.filter((_, i) => i !== index)
    onUpdate(updated)
    showToast('Zadanie zostało usunięte', 'success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {tasks.length === 0 && !showAddForm && (
        <div style={{ fontSize: '13px', color: '#888', padding: '4px 0' }}>-</div>
      )}
      {tasks.map((task, index) => {
        const isEditing = editingIndex === index
        const isInlineEditing = inlineEditingIndex === index
        const taskNumber = index + 1

        return (
          <div key={index} style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '3px', background: '#1a1a1a', borderRadius: '3px', border: '1px solid #2a2a2a', marginBottom: index < tasks.length - 1 ? '2px' : '0px', minHeight: '22px' }}>
            {/* Numer zadania */}
            <div style={{ minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#d22f27', color: '#ffffff', borderRadius: '2px', fontSize: '10px', fontWeight: '600', flexShrink: 0 }}>
              {taskNumber}
            </div>

            {isInlineEditing ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  value={inlineEditingText}
                  onChange={(e) => setInlineEditingText(e.target.value)}
                  onBlur={() => handleInlineSave(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleInlineSave(index)
                    } else if (e.key === 'Escape') {
                      handleInlineCancel()
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '3px 6px',
                    fontSize: '13px',
                    background: '#1f1f1f',
                    color: '#ffffff',
                    border: '1px solid #d22f27',
                    borderRadius: '3px',
                    outline: 'none'
                  }}
                  autoFocus
                />
                <button
                  onClick={() => handleInlineSave(index)}
                  style={{ padding: '2px', color: '#10B981', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  title="Zapisz"
                >
                    <Check size={12} color="#10B981" />
                </button>
                <button
                  onClick={handleInlineCancel}
                  style={{ padding: '2px', color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  title="Anuluj"
                >
                  <X size={12} color="#EF4444" />
                </button>
              </div>
            ) : isEditing ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <textarea
                  value={editingTask}
                  onChange={(e) => setEditingTask(e.target.value)}
                  placeholder="Treść zadania..."
                  style={{ 
                    width: '100%', 
                    padding: '4px 6px', 
                    border: '1px solid #d22f27', 
                    borderRadius: '3px', 
                    fontSize: '13px',
                    minHeight: '35px',
                    resize: 'vertical',
                    background: '#1a1a1a',
                    color: '#ffffff',
                    fontFamily: 'inherit',
                    outline: 'none'
                  }}
                />
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#888', marginBottom: '2px', fontWeight: '600' }}>
                      <Clock size={10} color="#888" />
                      Czas OD
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="time"
                        value={editingStartTime}
                        onChange={(e) => setEditingStartTime(e.target.value)}
                        style={{ 
                          width: '100%', 
                          padding: '3px 6px 3px 24px', 
                          border: '1px solid #d22f27', 
                          borderRadius: '3px', 
                          fontSize: '11px',
                          background: '#1a1a1a',
                          color: '#ffffff',
                          fontFamily: 'inherit',
                          outline: 'none'
                        }}
                      />
                      <div style={{ position: 'absolute', left: '6px', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                        <Clock size={12} color="#888" />
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#888', marginBottom: '2px', fontWeight: '600' }}>
                      <Clock size={10} color="#888" />
                      Czas DO
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="time"
                        value={editingEndTime}
                        onChange={(e) => setEditingEndTime(e.target.value)}
                        style={{ 
                          width: '100%', 
                          padding: '3px 6px 3px 24px', 
                          border: '1px solid #d22f27', 
                          borderRadius: '3px', 
                          fontSize: '11px',
                          background: '#1a1a1a',
                          color: '#ffffff',
                          fontFamily: 'inherit',
                          outline: 'none'
                        }}
                      />
                      <div style={{ position: 'absolute', left: '6px', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                        <Clock size={12} color="#888" />
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ position: 'relative' }} data-assigner-dropdown>
                  {editingAssignedBy && !showAssignerDropdown ? (
                    <div
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        border: '1px solid #d22f27',
                        borderRadius: '3px',
                        fontSize: '13px',
                        background: '#1a1a1a',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        minHeight: '32px'
                      }}
                    >
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowAssignerDropdown(editingIndex)
                          setEditingAssignerSearchQuery({ ...editingAssignerSearchQuery, [editingIndex]: '' })
                        }}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        {getAssignerByName(editingAssignedBy)?.avatar ? (
                          <img
                            src={getAssignerByName(editingAssignedBy)!.avatar}
                            alt={editingAssignedBy}
                            style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#d22f27', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600' }}>
                            {editingAssignedBy.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{editingAssignedBy}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingAssignedBy('')
                          setShowAssignerDropdown(null)
                          setEditingAssignerSearchQuery({ ...editingAssignerSearchQuery, [editingIndex]: '' })
                        }}
                        style={{
                          padding: '2px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#888',
                          transition: 'color 0.2s ease',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#EF4444'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#888'
                        }}
                        title="Usuń przypisanie"
                      >
                        <X size={14} color="currentColor" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={editingAssignerSearchQuery[editingIndex] || ''}
                        onChange={(e) => {
                          const query = e.target.value
                          setEditingAssignerSearchQuery({ ...editingAssignerSearchQuery, [editingIndex]: query })
                          if (query.length >= 2) {
                            setShowAssignerDropdown(editingIndex)
                          } else {
                            setShowAssignerDropdown(null)
                          }
                        }}
                        placeholder="Wpisz minimum 2 litery aby wyszukać..."
                        onClick={(e) => {
                          e.stopPropagation()
                          if ((editingAssignerSearchQuery[editingIndex] || '').length >= 2) {
                            setShowAssignerDropdown(editingIndex)
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #d22f27',
                          borderRadius: '3px',
                          fontSize: '13px',
                          background: '#1a1a1a',
                          color: '#ffffff',
                          outline: 'none'
                        }}
                        autoFocus
                      />
                      {showAssignerDropdown === editingIndex && (editingAssignerSearchQuery[editingIndex] || '').length >= 2 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: '#1a1a1a',
                            border: '1px solid #2a2a2a',
                            borderRadius: '3px',
                            marginTop: '4px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            zIndex: 1000,
                            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                          }}
                        >
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingAssignedBy('')
                              setShowAssignerDropdown(null)
                              setEditingAssignerSearchQuery({ ...editingAssignerSearchQuery, [editingIndex]: '' })
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              color: '#888',
                              fontSize: '12px',
                              borderBottom: '1px solid #2a2a2a'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#2a2a2a'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            -- Brak --
                          </div>
                          {getFilteredAssigners(editingAssignerSearchQuery[editingIndex] || '').length === 0 ? (
                            <div style={{ padding: '8px 12px', color: '#888', fontSize: '12px' }}>
                              Brak wyników
                            </div>
                          ) : (
                            getFilteredAssigners(editingAssignerSearchQuery[editingIndex] || '').map((assigner) => (
                              <div
                                key={assigner.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingAssignedBy(assigner.name)
                                  setShowAssignerDropdown(null)
                                  setEditingAssignerSearchQuery({ ...editingAssignerSearchQuery, [editingIndex]: '' })
                                }}
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  borderBottom: '1px solid #2a2a2a'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#2a2a2a'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent'
                                }}
                              >
                                {assigner.avatar ? (
                                  <img
                                    src={assigner.avatar}
                                    alt={assigner.name}
                                    style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#d22f27', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: 'white' }}>
                                    {assigner.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span style={{ fontSize: '13px', color: '#ffffff' }}>{assigner.name}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <select
                  value={editingStatus}
                  onChange={(e) => setEditingStatus(e.target.value as TaskStatus)}
                  style={{ 
                    width: '100%', 
                    padding: '3px 6px', 
                    border: '1px solid #d22f27', 
                    borderRadius: '3px', 
                    fontSize: '13px',
                    background: '#1a1a1a',
                    color: '#ffffff',
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {statusOptions.map(status => (
                    <option key={status} value={status} style={{ background: '#1a1a1a' }}>{status}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => handleSave(index)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      background: '#10B981',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#059669'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#10B981'
                    }}
                  >
                    <Check size={11} color="#ffffff" />
                    Zapisz
                  </button>
                  <button
                    onClick={() => {
                      setEditingIndex(null)
                      setEditingTask('')
                      setEditingAssignedBy('')
                      setEditingStartTime('')
                      setEditingEndTime('')
                      setEditingStatus('do zrobienia')
                    }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      background: '#EF4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#DC2626'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#EF4444'
                    }}
                  >
                    <X size={9} color="#ffffff" />
                    Anuluj
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div 
                  style={{ flex: 1, cursor: 'text' }}
                  onClick={() => handleInlineEdit(index)}
                  title="Kliknij aby edytować"
                >
                  <div style={{ fontSize: '13px', color: '#ffffff', wordBreak: 'break-word', lineHeight: '1.3', marginBottom: '2px' }}>
                    {renderTextWithLinks(task.text)}
                  </div>
                  <div style={{ fontSize: '10px', color: '#888', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Clock size={11} color="#888" />
                    {task.startTime || '08:00'} - {task.endTime || '16:00'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(index)
                    }}
                    style={{ padding: '2px', color: '#d22f27', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Edytuj szczegóły"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2a2a2a'
                      e.currentTarget.style.borderRadius = '2px'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <Edit2 size={11} color="#d22f27" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(index)
                    }}
                    style={{ padding: '2px', color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Usuń"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2a2a2a'
                      e.currentTarget.style.borderRadius = '2px'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <Trash2 size={11} color="#EF4444" />
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}
      
      {editingIndex === null && (
        <>
          {!showAddForm ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'transparent',
                  color: '#d22f27',
                  border: '1px solid #d22f27',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: '300',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#d22f27'
                  e.currentTarget.style.color = '#ffffff'
                  e.currentTarget.style.transform = 'scale(1.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#d22f27'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
                title="Dodaj zadanie"
              >
                <Plus size={12} color="#d22f27" />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px', background: '#1a1a1a', borderRadius: '3px', border: '1px dashed #2a2a2a', marginTop: '4px' }}>
              <textarea
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Dodaj zadanie..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    handleAdd()
                  }
                }}
                style={{ 
                  width: '100%', 
                  padding: '4px 6px', 
                  border: '1px solid #2a2a2a', 
                  borderRadius: '3px', 
                  fontSize: '13px',
                  minHeight: '40px',
                  resize: 'vertical',
                  background: '#1a1a1a',
                  color: '#ffffff',
                  fontFamily: 'inherit',
                  outline: 'none'
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#888', marginBottom: '2px', fontWeight: '600' }}>
                    <Clock size={10} color="#888" />
                    Czas OD
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="time"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '3px 6px 3px 24px', 
                        border: '1px solid #2a2a2a', 
                        borderRadius: '3px', 
                        fontSize: '11px',
                        background: '#1a1a1a',
                        color: '#ffffff',
                        fontFamily: 'inherit',
                        outline: 'none'
                      }}
                    />
                    <div style={{ position: 'absolute', left: '6px', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      <Clock size={12} color="#888" />
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#888', marginBottom: '2px', fontWeight: '600' }}>
                    <Clock size={10} color="#888" />
                    Czas DO
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '3px 6px 3px 24px', 
                        border: '1px solid #2a2a2a', 
                        borderRadius: '3px', 
                        fontSize: '11px',
                        background: '#1a1a1a',
                        color: '#ffffff',
                        fontFamily: 'inherit',
                        outline: 'none'
                      }}
                    />
                    <div style={{ position: 'absolute', left: '6px', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      <Clock size={12} color="#888" />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ position: 'relative' }} data-assigner-dropdown>
                {newAssignedBy && !showNewAssignerDropdown ? (
                  <div
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: '1px solid #2a2a2a',
                      borderRadius: '3px',
                      fontSize: '13px',
                      background: '#1a1a1a',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      minHeight: '32px'
                    }}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowNewAssignerDropdown(true)
                        setAssignerSearchQuery('')
                      }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      {getAssignerByName(newAssignedBy)?.avatar ? (
                        <img
                          src={getAssignerByName(newAssignedBy)!.avatar}
                          alt={newAssignedBy}
                          style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#d22f27', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600', color: 'white' }}>
                          {newAssignedBy.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>{newAssignedBy}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setNewAssignedBy('')
                        setShowNewAssignerDropdown(false)
                        setAssignerSearchQuery('')
                      }}
                      style={{
                        padding: '2px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#888',
                        transition: 'color 0.2s ease',
                        flexShrink: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#EF4444'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#888'
                      }}
                      title="Usuń przypisanie"
                    >
                      <X size={14} color="currentColor" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={assignerSearchQuery}
                      onChange={(e) => {
                        const query = e.target.value
                        setAssignerSearchQuery(query)
                        if (query.length >= 2) {
                          setShowNewAssignerDropdown(true)
                        } else {
                          setShowNewAssignerDropdown(false)
                        }
                      }}
                      placeholder="Wpisz minimum 2 litery aby wyszukać..."
                      onClick={(e) => {
                        e.stopPropagation()
                        if (assignerSearchQuery.length >= 2) {
                          setShowNewAssignerDropdown(true)
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        border: '1px solid #2a2a2a',
                        borderRadius: '3px',
                        fontSize: '13px',
                        background: '#1a1a1a',
                        color: '#ffffff',
                        outline: 'none'
                      }}
                      autoFocus
                    />
                    {showNewAssignerDropdown && assignerSearchQuery.length >= 2 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          background: '#1a1a1a',
                          border: '1px solid #2a2a2a',
                          borderRadius: '3px',
                          marginTop: '4px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 1000,
                          boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                        }}
                      >
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            setNewAssignedBy('')
                            setShowNewAssignerDropdown(false)
                            setAssignerSearchQuery('')
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            color: '#888',
                            fontSize: '12px',
                            borderBottom: '1px solid #2a2a2a'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#2a2a2a'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          -- Brak --
                        </div>
                        {getFilteredAssigners(assignerSearchQuery).length === 0 ? (
                          <div style={{ padding: '8px 12px', color: '#888', fontSize: '12px' }}>
                            Brak wyników
                          </div>
                        ) : (
                          getFilteredAssigners(assignerSearchQuery).map((assigner) => (
                            <div
                              key={assigner.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                setNewAssignedBy(assigner.name)
                                setShowNewAssignerDropdown(false)
                                setAssignerSearchQuery('')
                              }}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                borderBottom: '1px solid #2a2a2a'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#2a2a2a'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                              }}
                            >
                              {assigner.avatar ? (
                                <img
                                  src={assigner.avatar}
                                  alt={assigner.name}
                                  style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#d22f27', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: 'white' }}>
                                  {assigner.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span style={{ fontSize: '13px', color: '#ffffff' }}>{assigner.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                style={{ 
                  width: '100%', 
                  padding: '3px 6px', 
                  border: '1px solid #2a2a2a', 
                  borderRadius: '3px', 
                  fontSize: '13px',
                  background: '#1a1a1a',
                  color: '#ffffff',
                  fontFamily: 'inherit',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {statusOptions.map(status => (
                  <option key={status} value={status} style={{ background: '#1a1a1a', color: '#ffffff' }}>{status}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                <button
                  onClick={handleAdd}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: '#d22f27',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '600',
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
                    <Check size={12} color="#ffffff" />
                    Zapisz
                  </button>
                  <button
                    onClick={handleCancelAdd}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      background: '#EF4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#DC2626'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#EF4444'
                    }}
                  >
                    <X size={10} color="#ffffff" />
                    Anuluj
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
