'use client'

import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { pl } from 'date-fns/locale'
import TaskList, { Task, TaskStatus } from './TaskList'
import { useTheme } from '@/contexts/ThemeContext'
import { useToast } from '@/contexts/ToastContext'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FileText } from 'lucide-react'

interface DayData {
  date: string
  tasks: Task[]
  totalHours: string
}

export default function CalendarTable() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [daysData, setDaysData] = useState<Record<string, DayData>>({})
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const { showToast } = useToast()
  const [hourlyRate, setHourlyRate] = useState<string>('')
  const [assigners, setAssigners] = useState<any[]>([])
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
    
    // Listen for assigner updates
    const handleAssignerUpdate = () => {
      loadAssigners()
    }
    window.addEventListener('assignerUpdated', handleAssignerUpdate)
    return () => window.removeEventListener('assignerUpdated', handleAssignerUpdate)
  }, [])
  
  const getAssignerByName = (name: string) => {
    return assigners.find(a => a.name === name)
  }

  useEffect(() => {
    // Load hourly rate from localStorage
    const loadHourlyRate = () => {
      const savedRate = localStorage.getItem('hourlyRate')
      if (savedRate) {
        setHourlyRate(savedRate)
      } else {
        setHourlyRate('')
      }
    }
    
    loadHourlyRate()
    
    // Listen for custom event when rate is updated in settings (same window)
    const handleRateUpdate = () => {
      loadHourlyRate()
    }
    window.addEventListener('hourlyRateUpdated', handleRateUpdate)
    
    // Also listen for storage changes (when rate is updated in other tabs/windows)
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

  useEffect(() => {
    loadData()
  }, [currentMonth])

  const loadData = async () => {
    try {
      const monthKey = format(currentMonth, 'yyyy-MM')
      const response = await fetch(`/api/work-time?month=${monthKey}`)
      if (response.ok) {
        const data = await response.json()
        const monthData = data[monthKey] || {}
        
        // Upewnij się, że wszystkie dni mają poprawne dane
        const days = getDaysInMonth()
        const initializedData: Record<string, DayData> = {}
        
        days.forEach(day => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayData = monthData[dateKey] || {
            date: dateKey,
            tasks: [],
            totalHours: '00:00',
          }
          
          // Normalizuj zadania - konwertuj stare string[] do Task[]
          let normalizedTasks: Task[] = []
          if (dayData.tasks && Array.isArray(dayData.tasks)) {
            normalizedTasks = dayData.tasks.map((task: any) => {
              if (typeof task === 'string') {
                return { text: task, assignedBy: '', startTime: '08:00', endTime: '16:00', status: 'do zrobienia' as const }
              }
              return {
                text: task.text || '',
                assignedBy: task.assignedBy || '',
                startTime: task.startTime || '08:00',
                endTime: task.endTime || '16:00',
                status: task.status || (task.completed ? 'wykonano' : 'do zrobienia') as const
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
  
  const getDaysInMonth = () => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    return eachDayOfInterval({ start, end })
  }

  const saveData = async (updatedData: Record<string, DayData>) => {
    try {
      const monthKey = format(currentMonth, 'yyyy-MM')
      
      // Pobierz istniejące dane
      const existingResponse = await fetch('/api/work-time')
      let existingData = {}
      if (existingResponse.ok) {
        existingData = await existingResponse.json()
      }
      
      // Zaktualizuj dane dla bieżącego miesiąca
      const updatedMonthData = {
        ...existingData,
        [monthKey]: updatedData,
      }
      
      const response = await fetch('/api/work-time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedMonthData),
      })
      if (response.ok) {
        setDaysData(updatedData)
        showToast('Dane zostały zapisane', 'success')
      } else {
        throw new Error('Failed to save data')
      }
    } catch (error) {
      console.error('Error saving data:', error)
      showToast('Błąd podczas zapisywania danych', 'error')
    }
  }

  const calculateTotalHours = (tasks: Task[]): string => {
    if (tasks.length === 0) return '00:00'

    // Zbierz wszystkie przedziały czasowe i konwertuj na minuty od początku dnia
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

    // Sortuj przedziały po czasie rozpoczęcia
    intervals.sort((a, b) => a.start - b.start)

    // Połącz nakładające się przedziały
    const mergedIntervals: Array<{ start: number; end: number }> = []
    let currentInterval = intervals[0]

    for (let i = 1; i < intervals.length; i++) {
      const nextInterval = intervals[i]
      
      // Jeśli przedziały się nakładają lub stykają (nextInterval.start <= currentInterval.end)
      if (nextInterval.start <= currentInterval.end) {
        // Połącz przedziały - rozszerz koniec do maksimum
        currentInterval.end = Math.max(currentInterval.end, nextInterval.end)
      } else {
        // Przedziały się nie nakładają - zapisz obecny i przejdź do następnego
        mergedIntervals.push(currentInterval)
        currentInterval = nextInterval
      }
    }
    // Dodaj ostatni przedział
    mergedIntervals.push(currentInterval)

    // Oblicz całkowitą długość wszystkich połączonych przedziałów
    let totalMinutes = 0
    mergedIntervals.forEach(interval => {
      totalMinutes += interval.end - interval.start
    })

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  const updateDayData = (date: string, updates: Partial<DayData>) => {
    const dateKey = format(new Date(date), 'yyyy-MM-dd')
    const currentDayData = daysData[dateKey] || {
      date: dateKey,
      tasks: [],
      totalHours: '00:00',
    }

    const updatedDayData: DayData = {
      ...currentDayData,
      ...updates,
    }

    // Recalculate total hours
    updatedDayData.totalHours = calculateTotalHours(updatedDayData.tasks)

    const updatedDaysData = {
      ...daysData,
      [dateKey]: updatedDayData,
    }

    saveData(updatedDaysData)
  }

  const getDayName = (date: Date): string => {
    const dayNames = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']
    return dayNames[getDay(date)]
  }

  const changeMonth = (direction: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1))
  }

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

  const generatePDF = () => {
    const doc = new jsPDF()
    // Format miesiąca: "Listopad 2025" zamiast "listopada 2025"
    const monthNameRaw = format(currentMonth, 'MMMM yyyy', { locale: pl })
    // Usuń końcówkę "a" z miesiąca (np. "listopada" -> "listopad", "grudnia" -> "grudzień")
    const monthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1).replace(/(\w+)a\s/, '$1 ')
    const monthYear = format(currentMonth, 'yyyy-MM')
    
    // Ustaw ciemne tło dla całej strony
    doc.setFillColor(20, 20, 20) // #141414
    doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, 'F')
    
    // Funkcja pomocnicza do konwersji polskich znaków na ASCII
    // Standardowe czcionki jsPDF nie obsługują polskich znaków diakrytycznych
    const encodePolish = (text: string): string => {
      const polishMap: Record<string, string> = {
        'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
        'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
      }
      return text.split('').map(char => polishMap[char] || char).join('')
    }
    
    // Nagłówek - minimalistyczny
    doc.setFontSize(14)
    doc.setTextColor(210, 47, 39) // #d22f27
    doc.setFont('helvetica', 'bold')
    // Używamy metody text z opcją UTF-8
    try {
      doc.text(encodePolish('Work Time Tracker - Best Market / Foodex24 / RSA'), 14, 18, { encoding: 'UTF8' })
    } catch (e) {
      doc.text('Work Time Tracker - Best Market / Foodex24 / RSA', 14, 18)
    }
    
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255) // Biały tekst na ciemnym tle
    doc.setFont('helvetica', 'normal')
    try {
      doc.text(encodePolish(monthName), 14, 26, { encoding: 'UTF8' })
    } catch (e) {
      doc.text(monthName, 14, 26)
    }
    
    // Przygotuj dane do tabeli - zgodnie z obecną strukturą
    const tableData: any[] = []
    const days = getDaysInMonth()
    const sortedDays = days.sort((a, b) => a.getTime() - b.getTime())
    
    sortedDays.forEach((day) => {
      const dateKey = format(day, 'yyyy-MM-dd')
      const dayData = daysData[dateKey] || {
        date: dateKey,
        tasks: [],
        totalHours: '00:00',
      }
      
      const dayName = getDayName(day) // Pełna nazwa dnia
      const dateStr = format(day, 'dd.MM.yyyy') // Format: 01.11.2025
      
      // Format daty z pełną nazwą dnia pod spodem - kodujemy polskie znaki
      const dateWithDay = `${dateStr}\n${encodePolish(dayName)}`
      
      // Zbierz wszystkich unikalnych osób zlecających dla tego dnia
      const dayAssigners = [...new Set(dayData.tasks.map(t => t.assignedBy).filter(Boolean))]
      const assignersText = dayAssigners.length > 0 
        ? dayAssigners.map(name => encodePolish(name)).join('\n')
        : '-'
      
      if (dayData.tasks.length === 0) {
        tableData.push([
          dateWithDay,
          dayData.totalHours,
          assignersText,
          '-',
          '-'
        ])
      } else {
        dayData.tasks.forEach((task, index) => {
          const taskNumber = index + 1
          const taskText = task.text.length > 40 
            ? task.text.substring(0, 37) + '...' 
            : task.text
          const timeRange = `${task.startTime}-${task.endTime}`
          const status = encodePolish(task.status)
          // Format zadania: numer zadania, tekst i czas
          const taskInfo = `${taskNumber}. ${encodePolish(taskText)}\n${timeRange}`
          
          // Status z numerem zadania
          const statusWithNumber = `${taskNumber}. ${status}`
          
          if (index === 0) {
            tableData.push([
              dateWithDay,
              dayData.totalHours,
              assignersText,
              taskInfo,
              statusWithNumber
            ])
          } else {
            // Dla kolejnych zadań tego samego dnia - pokazuj tylko zadanie i status
            tableData.push(['', '', '', taskInfo, statusWithNumber])
          }
        })
      }
    })
    
    // Dodaj wiersz z sumą - kodujemy polskie znaki
    const monthTotal = calculateMonthTotal()
    const totalAmount = calculateTotalAmount()
    tableData.push([
      encodePolish('RAZEM'),
      monthTotal,
      '',
      '',
      totalAmount ? `${totalAmount} ${encodePolish('zl')}` : ''
    ])
    
    // Generuj tabelę - kompaktowa i minimalistyczna
    // Wszystkie dane są już zakodowane przez encodePolish
    autoTable(doc, {
      head: [[encodePolish('Dzien'), encodePolish('Godziny'), encodePolish('Kto zlecil'), encodePolish('Zadania'), encodePolish('Status')]],
      body: tableData,
      startY: 32,
      theme: 'plain',
      styles: {
        fontSize: 7,
        cellPadding: 2,
        textColor: [255, 255, 255], // Biały tekst
        fillColor: [20, 20, 20], // Ciemne tło #141414
        lineColor: [50, 50, 50], // Subtelne linie
        lineWidth: 0.1,
        font: 'helvetica',
        fontStyle: 'normal',
      },
      headStyles: {
        fillColor: [210, 47, 39], // #d22f27
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
        font: 'helvetica',
      },
      columnStyles: {
        0: { cellWidth: 30, halign: 'left' }, // Dzień
        1: { cellWidth: 20, halign: 'center' }, // Godziny
        2: { cellWidth: 30, halign: 'left' }, // Kto zlecił
        3: { cellWidth: 'auto', halign: 'left' }, // Zadania
        4: { cellWidth: 30, halign: 'left' }, // Status
      },
      alternateRowStyles: {
        fillColor: [25, 25, 25], // Nieco jaśniejsze dla alternatywnych wierszy
      },
      margin: { top: 32, right: 14, bottom: 20, left: 14 },
      didDrawPage: (data: any) => {
        // Dodaj kwotę do opłaty na ostatniej stronie (jeśli istnieje)
        if (totalAmount && data.pageNumber === data.pageCount) {
          doc.setFontSize(10)
          doc.setTextColor(210, 47, 39) // #d22f27
          doc.setFont('helvetica', 'bold')
          try {
          doc.text(
            encodePolish(`Kwota do oplaty: ${totalAmount} zl`),
            14,
            data.cursor.y + 8
          )
        } catch (e) {
          doc.text(
            encodePolish(`Kwota do oplaty: ${totalAmount} zl`),
            14,
            data.cursor.y + 8
          )
        }
        }
      },
    })
    
    // Zapisz PDF
    const fileName = `work-time-${monthYear}.pdf`
    doc.save(fileName)
  }

  if (loading) {
    return <div style={{ color: '#888', fontSize: '12px' }}>Ładowanie...</div>
  }

  const days = getDaysInMonth()
  const monthTotal = calculateMonthTotal()

  return (
    <div>
      {/* Month Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', background: '#141414', padding: '6px 10px', border: '1px solid #2a2a2a', flexWrap: 'wrap', gap: '8px' }}>
        <button
          onClick={() => changeMonth(-1)}
          style={{ 
            padding: '4px 10px', 
            background: 'transparent',
            color: '#d22f27',
            border: '1px solid #d22f27',
            borderRadius: '3px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#d22f27'
            e.currentTarget.style.color = '#ffffff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#d22f27'
          }}
        >
          <span style={{ display: isMobile ? 'none' : 'inline' }}>← </span>Poprzedni
        </button>
        <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', textAlign: 'center', flex: 1, minWidth: '160px' }}>
          {(() => {
            const monthNameRaw = format(currentMonth, 'MMMM yyyy', { locale: pl })
            const monthMap: Record<string, string> = {
              'stycznia': 'Styczeń',
              'lutego': 'Luty',
              'marca': 'Marzec',
              'kwietnia': 'Kwiecień',
              'maja': 'Maj',
              'czerwca': 'Czerwiec',
              'lipca': 'Lipiec',
              'sierpnia': 'Sierpień',
              'września': 'Wrzesień',
              'października': 'Październik',
              'listopada': 'Listopad',
              'grudnia': 'Grudzień'
            }
            const lowerMonth = monthNameRaw.toLowerCase()
            for (const [key, value] of Object.entries(monthMap)) {
              if (lowerMonth.includes(key)) {
                return lowerMonth.replace(key, value)
              }
            }
            return monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1)
          })()}
        </h2>
        <button
          onClick={() => changeMonth(1)}
          style={{ 
            padding: '4px 10px', 
            background: 'transparent',
            color: '#d22f27',
            border: '1px solid #d22f27',
            borderRadius: '3px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#d22f27'
            e.currentTarget.style.color = '#ffffff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#d22f27'
          }}
        >
          Następny<span style={{ display: isMobile ? 'none' : 'inline' }}> →</span>
        </button>
      </div>

      {/* Calendar Table */}
      <div style={{ overflowX: 'auto', background: '#141414', border: '1px solid #2a2a2a' }}>
        <table style={{ minWidth: isMobile ? '100%' : '900px', width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '90px', fontSize: '13px', padding: '6px 8px', background: '#d22f27', color: '#ffffff', fontWeight: '600', textAlign: 'left' }}>Dzień</th>
              <th style={{ width: '70px', fontSize: '13px', padding: '6px 8px', background: '#d22f27', color: '#ffffff', fontWeight: '600', textAlign: 'center' }}>Godziny</th>
              <th style={{ width: '120px', fontSize: '13px', padding: '6px 8px', background: '#d22f27', color: '#ffffff', fontWeight: '600', textAlign: 'left' }}>Kto zlecił</th>
              <th style={{ minWidth: '300px', fontSize: '13px', padding: '6px 8px', background: '#d22f27', color: '#ffffff', fontWeight: '600', textAlign: 'left' }}>Zadania</th>
              <th style={{ width: '120px', fontSize: '13px', padding: '6px 8px', background: '#d22f27', color: '#ffffff', fontWeight: '600', textAlign: 'left' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd')
              const dayData = daysData[dateKey] || {
                date: dateKey,
                tasks: [],
                totalHours: '00:00',
              }

              // Zbierz wszystkich, którzy zlecili zadania dla tego dnia
              const dayAssigners = [...new Set(dayData.tasks.map(t => t.assignedBy).filter(Boolean))]

              return (
                <tr key={dateKey} style={{ background: days.indexOf(day) % 2 === 0 ? '#141414' : '#1a1a1a' }}>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #2a2a2a', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: '500', color: '#ffffff', marginBottom: '2px', fontSize: '13px', lineHeight: '1.2' }}>
                      {format(day, 'dd.MM.yyyy')}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', textTransform: 'lowercase', lineHeight: '1.2' }}>
                      {getDayName(day)}
                    </div>
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #2a2a2a', textAlign: 'center', fontWeight: '600', color: '#d22f27', fontSize: '13px', verticalAlign: 'top' }}>
                    {dayData.totalHours}
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #2a2a2a', verticalAlign: 'top' }}>
                    {dayAssigners.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {dayAssigners.map((assignerName, idx) => {
                          const assigner = getAssignerByName(assignerName)
                          return (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                color: '#ffffff',
                                lineHeight: '1.3'
                              }}
                            >
                              {assigner?.avatar ? (
                                <img
                                  src={assigner.avatar}
                                  alt={assigner.name}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    flexShrink: 0
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: '#d22f27',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '9px',
                                    fontWeight: '600',
                                    color: '#ffffff',
                                    flexShrink: 0
                                  }}
                                >
                                  {assignerName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span>{assignerName}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: '#888' }}>-</div>
                    )}
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #2a2a2a', verticalAlign: 'top' }}>
                    <TaskList
                      date={dateKey}
                      tasks={dayData.tasks}
                      onUpdate={(tasks) => updateDayData(dateKey, { tasks })}
                    />
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #2a2a2a', verticalAlign: 'top' }}>
                    {dayData.tasks.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                        {dayData.tasks.map((task, idx) => {
                          const taskNumber = idx + 1
                          const statusColors: Record<TaskStatus, string> = {
                            'wykonano': '#10B981',
                            'w trakcie': '#3B82F6',
                            'do zrobienia': '#EAB308',
                            'anulowane': '#6B7280'
                          }
                          return (
                            <div 
                              key={idx}
                              style={{
                                marginBottom: idx < dayData.tasks.length - 1 ? '2px' : '0px',
                                minHeight: '22px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '0px'
                              }}
                            >
                              {/* Numer zadania */}
                              <div style={{ minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#d22f27', color: '#ffffff', borderRadius: '2px', fontSize: '10px', fontWeight: '600', flexShrink: 0 }}>
                                {taskNumber}
                              </div>
                              <select
                                value={task.status}
                                onChange={(e) => {
                                  const updatedTasks = [...dayData.tasks]
                                  updatedTasks[idx] = { ...updatedTasks[idx], status: e.target.value as Task['status'] }
                                  updateDayData(dateKey, { tasks: updatedTasks })
                                }}
                                style={{
                                  padding: '3px 6px',
                                  borderRadius: '3px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  background: statusColors[task.status],
                                  color: '#ffffff',
                                  fontWeight: '500',
                                  flex: 1,
                                  outline: 'none',
                                  height: '22px',
                                  lineHeight: '16px',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                                onFocus={(e) => {
                                  e.target.style.boxShadow = '0 0 0 2px rgba(210, 47, 39, 0.5)'
                                }}
                                onBlur={(e) => {
                                  e.target.style.boxShadow = 'none'
                                }}
                              >
                                <option value="wykonano" style={{ background: '#10B981' }}>wykonano</option>
                                <option value="w trakcie" style={{ background: '#3B82F6' }}>w trakcie</option>
                                <option value="do zrobienia" style={{ background: '#EAB308' }}>do zrobienia</option>
                                <option value="anulowane" style={{ background: '#6B7280' }}>anulowane</option>
                              </select>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: '#888' }}>-</div>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr style={{ background: '#d22f27', fontWeight: '600', color: '#ffffff' }}>
              <td colSpan={1} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '13px' }}>
                RAZEM:
              </td>
              <td style={{ textAlign: 'center', padding: '6px 8px', fontSize: '13px' }}>
                {monthTotal}
              </td>
              <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontSize: '13px' }}>
                {calculateTotalAmount() && (
                  <span style={{ fontWeight: '600' }}>
                    {calculateTotalAmount()} zł
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* PDF Generation Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button
          onClick={generatePDF}
          style={{
            padding: '6px 12px',
            background: '#d22f27',
            color: '#ffffff',
            border: 'none',
            borderRadius: '3px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#b0251f'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#d22f27'
          }}
        >
          <FileText size={14} color="#ffffff" />
          Generuj PDF
        </button>
      </div>
    </div>
  )
}

