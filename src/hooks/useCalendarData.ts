import { useState, useEffect, useRef, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { pl } from 'date-fns/locale'
import { useToast } from '@/contexts/ToastContext'
import { basePath } from '@/lib/apiBase'
import type { Task } from '@/components/tasks/types'

export interface DayData {
  date: string
  tasks: Task[]
  totalHours: string
}

export function useCalendarData(clientId: number | null) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (typeof window === 'undefined') return new Date()
    const saved = localStorage.getItem('wttCalendarMonth')
    if (saved) {
      const [y, m] = saved.split('-').map(Number)
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) return new Date(y, m - 1, 1)
    }
    return new Date()
  })
  const [daysData, setDaysData] = useState<Record<string, DayData>>({})
  const [loading, setLoading] = useState(true)
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set())
  const [hourlyRate, setHourlyRate] = useState<string>('')
  const [assigners, setAssigners] = useState<any[]>([])
  const { showToast } = useToast()

  // Ref always holds the latest daysData — avoids stale closures
  const daysDataRef = useRef(daysData)
  daysDataRef.current = daysData

  // Save queue — serializes saves to prevent concurrent overwrites
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  // Load assigners
  useEffect(() => {
    const loadAssigners = async () => {
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
      }
    }
    loadAssigners()

    const handleAssignerUpdate = () => {
      loadAssigners()
    }
    window.addEventListener('assignerUpdated', handleAssignerUpdate)
    return () => window.removeEventListener('assignerUpdated', handleAssignerUpdate)
  }, [])

  // Load hourly rate
  useEffect(() => {
    const loadHourlyRate = () => {
      const savedRate = localStorage.getItem('hourlyRate')
      if (savedRate) {
        setHourlyRate(savedRate)
      } else {
        setHourlyRate('')
      }
    }

    loadHourlyRate()

    const handleRateUpdate = () => {
      loadHourlyRate()
    }
    window.addEventListener('hourlyRateUpdated', handleRateUpdate)

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'hourlyRate') {
        setHourlyRate(e.newValue || '')
      }
    }
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('hourlyRateUpdated', handleRateUpdate)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  // Load data on month/client change
  useEffect(() => {
    if (clientId === null) {
      setDaysData({})
      setLoading(false)
      return
    }
    loadData()
  }, [currentMonth, clientId])

  // Keyboard navigation for months
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        changeMonth(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        changeMonth(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentMonth])

  const getDaysInMonth = () => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    return eachDayOfInterval({ start, end })
  }

  const calculateTotalHours = (tasks: Task[]): string => {
    if (tasks.length === 0) return '00:00'

    const intervals: Array<{ start: number; end: number }> = []

    tasks.forEach(task => {
      if (task.startTime && task.endTime) {
        const [startHours, startMinutes] = task.startTime.split(':').map(Number)
        const [endHours, endMinutes] = task.endTime.split(':').map(Number)

        const startTotal = startHours * 60 + startMinutes
        const endTotal = endHours * 60 + endMinutes

        if (endTotal > startTotal) {
          intervals.push({ start: startTotal, end: endTotal })
        }
      }
    })

    if (intervals.length === 0) return '00:00'

    intervals.sort((a, b) => a.start - b.start)

    const mergedIntervals: Array<{ start: number; end: number }> = []
    let currentInterval = intervals[0]

    for (let i = 1; i < intervals.length; i++) {
      const nextInterval = intervals[i]

      if (nextInterval.start <= currentInterval.end) {
        currentInterval.end = Math.max(currentInterval.end, nextInterval.end)
      } else {
        mergedIntervals.push(currentInterval)
        currentInterval = nextInterval
      }
    }
    mergedIntervals.push(currentInterval)

    let totalMinutes = 0
    mergedIntervals.forEach(interval => {
      totalMinutes += interval.end - interval.start
    })

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  const loadData = async () => {
    if (clientId === null) return

    setLoading(true)
    try {
      const monthKey = format(currentMonth, 'yyyy-MM')
      const response = await fetch(`${basePath}/api/work-time?month=${monthKey}&clientId=${clientId}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (response.ok) {
        const data = await response.json()
        const monthData = data[monthKey] || {}

        const days = getDaysInMonth()
        const initializedData: Record<string, DayData> = {}

        days.forEach(day => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayData = monthData[dateKey] || {
            date: dateKey,
            tasks: [],
            totalHours: '00:00',
          }

          let normalizedTasks: Task[] = []
          if (dayData.tasks && Array.isArray(dayData.tasks)) {
            normalizedTasks = dayData.tasks.map((task: any) => {
              if (typeof task === 'string') {
                return { id: '', text: task, assignedBy: [], startTime: '08:00', endTime: '16:00', status: 'do zrobienia' as const, attachments: [] }
              }
              let assignedBy: string[] = []
              if (task.assignedBy) {
                if (Array.isArray(task.assignedBy)) assignedBy = task.assignedBy
                else if (typeof task.assignedBy === 'string' && task.assignedBy.trim()) assignedBy = [task.assignedBy]
              }
              return {
                id: task.id ?? '',
                text: task.text || '',
                assignedBy,
                startTime: task.startTime || '08:00',
                endTime: task.endTime || '16:00',
                status: (task.status || (task.completed ? 'wykonano' : 'do zrobienia')) as Task['status'],
                attachments: Array.isArray(task.attachments) ? task.attachments : []
              }
            })
          }

          initializedData[dateKey] = {
            ...dayData,
            tasks: normalizedTasks,
            totalHours: calculateTotalHours(normalizedTasks)
          }
        })

        setDaysData(initializedData)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveData = useCallback(async (updatedData: Record<string, DayData>) => {
    if (clientId === null) return

    // Enqueue: wait for any in-flight save to finish, then run ours
    const doSave = async () => {
      try {
        const monthKey = format(currentMonth, 'yyyy-MM')

        const response = await fetch(`${basePath}/api/work-time`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ [monthKey]: updatedData, clientId }),
        })
        if (response.ok) {
          setDaysData(updatedData)
          daysDataRef.current = updatedData
          showToast('Dane zostały zapisane', 'success')
        } else {
          const errData = await response.json().catch(() => ({}))
          const msg = errData?.error || errData?.details || 'Zapis do bazy nie powiódł się.'
          throw new Error(msg)
        }
      } catch (error: any) {
        console.error('Error saving data:', error)
        showToast(error?.message || 'Błąd podczas zapisywania danych', 'error')
      }
    }

    saveQueueRef.current = saveQueueRef.current.then(doSave, doSave)
    return saveQueueRef.current
  }, [clientId, currentMonth, showToast])

  const updateDayData = useCallback(async (date: string, updates: Partial<DayData>) => {
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : format(new Date(date), 'yyyy-MM-dd')

    // Always read from ref to get the latest state (not stale closure)
    const latestData = daysDataRef.current
    const currentDayData = latestData[dateKey] || {
      date: dateKey,
      tasks: [],
      totalHours: '00:00',
    }

    const updatedDayData: DayData = {
      ...currentDayData,
      ...updates,
    }

    updatedDayData.totalHours = calculateTotalHours(updatedDayData.tasks)

    const updatedDaysData = {
      ...latestData,
      [dateKey]: updatedDayData,
    }

    // Optimistically update ref + state so next call sees fresh data immediately
    daysDataRef.current = updatedDaysData
    setDaysData(updatedDaysData)

    await saveData(updatedDaysData)
  }, [saveData])

  const moveTask = useCallback(async (sourceDate: string, targetDate: string, taskIndex: number) => {
    const sourceDateKey = /^\d{4}-\d{2}-\d{2}$/.test(sourceDate) ? sourceDate : format(new Date(sourceDate), 'yyyy-MM-dd')
    const targetDateKey = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : format(new Date(targetDate), 'yyyy-MM-dd')

    if (sourceDateKey === targetDateKey) return

    const latestData = daysDataRef.current
    const sourceDayData = latestData[sourceDateKey]
    if (!sourceDayData || !sourceDayData.tasks[taskIndex]) return

    const taskToMove = sourceDayData.tasks[taskIndex]

    const updatedSourceTasks = sourceDayData.tasks.filter((_, idx) => idx !== taskIndex)
    const updatedSourceDayData: DayData = {
      ...sourceDayData,
      tasks: updatedSourceTasks,
      totalHours: calculateTotalHours(updatedSourceTasks),
    }

    const targetDayData = latestData[targetDateKey] || {
      date: targetDateKey,
      tasks: [],
      totalHours: '00:00',
    }
    const updatedTargetTasks = [...targetDayData.tasks, taskToMove]
    const updatedTargetDayData: DayData = {
      ...targetDayData,
      tasks: updatedTargetTasks,
      totalHours: calculateTotalHours(updatedTargetTasks),
    }

    const updatedDaysData = {
      ...latestData,
      [sourceDateKey]: updatedSourceDayData,
      [targetDateKey]: updatedTargetDayData,
    }

    daysDataRef.current = updatedDaysData
    setDaysData(updatedDaysData)
    try {
      await saveData(updatedDaysData)
      showToast(`Zadanie przeniesione z ${sourceDateKey} do ${targetDateKey}`, 'success')
    } catch {
      showToast('Błąd zapisu po przeniesieniu', 'error')
    }
  }, [saveData, showToast])

  const calculateMonthTotal = (): string => {
    let totalMinutes = 0
    Object.values(daysData).forEach(day => {
      const [hours, minutes] = day.totalHours.split(':').map(Number)
      totalMinutes += hours * 60 + minutes
    })
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }

  const calculateTotalAmount = (): string => {
    if (!hourlyRate || parseFloat(hourlyRate) <= 0) {
      return ''
    }

    let totalMinutes = 0
    Object.values(daysData).forEach(day => {
      const [hours, minutes] = day.totalHours.split(':').map(Number)
      totalMinutes += hours * 60 + minutes
    })

    const totalHours = totalMinutes / 60
    const amount = totalHours * parseFloat(hourlyRate)
    return amount.toFixed(2)
  }

  const changeMonth = (direction: number) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1)
    setCurrentMonth(next)
    try {
      localStorage.setItem('wttCalendarMonth', format(next, 'yyyy-MM'))
    } catch (_) {}
  }

  const getAssignerByName = (name: string) => {
    return assigners.find(a => a.name === name)
  }

  const getMonthDisplayName = (): string => {
    const monthNameRaw = format(currentMonth, 'MMMM yyyy', { locale: pl })
    const monthMap: Record<string, string> = {
      'stycznia': 'Styczeń', 'lutego': 'Luty', 'marca': 'Marzec',
      'kwietnia': 'Kwiecień', 'maja': 'Maj', 'czerwca': 'Czerwiec',
      'lipca': 'Lipiec', 'sierpnia': 'Sierpień', 'września': 'Wrzesień',
      'października': 'Październik', 'listopada': 'Listopad', 'grudnia': 'Grudzień'
    }
    const lowerMonth = monthNameRaw.toLowerCase()
    for (const [key, value] of Object.entries(monthMap)) {
      if (lowerMonth.includes(key)) {
        return lowerMonth.replace(key, value)
      }
    }
    return monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1)
  }

  return {
    // State
    daysData,
    loading,
    currentMonth,
    hourlyRate,
    assigners,
    failedAvatars,
    setFailedAvatars,
    // Functions
    loadData,
    saveData,
    calculateTotalHours,
    updateDayData,
    moveTask,
    calculateMonthTotal,
    calculateTotalAmount,
    changeMonth,
    getDaysInMonth,
    getAssignerByName,
    getMonthDisplayName,
  }
}
