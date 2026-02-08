'use client'

import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { pl } from 'date-fns/locale'
import TaskList, { Task, TaskStatus } from './TaskList'
import { useTheme } from '@/contexts/ThemeContext'
import { useToast } from '@/contexts/ToastContext'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FileText, Loader2 } from 'lucide-react'
import { robotoFontBase64, robotoFontName } from '@/lib/roboto-font'

interface DayData {
  date: string
  tasks: Task[]
  totalHours: string
}

interface CalendarTableProps {
  clientId: number | null
  clientName?: string
  clientLogo?: string
  highlightDate?: string | null
}

export default function CalendarTable({ clientId, clientName, clientLogo, highlightDate }: CalendarTableProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [daysData, setDaysData] = useState<Record<string, DayData>>({})
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set())
  const { showToast } = useToast()
  const [hourlyRate, setHourlyRate] = useState<string>('')
  const [assigners, setAssigners] = useState<any[]>([])
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [draggedTask, setDraggedTask] = useState<{ task: Task; sourceDate: string; taskIndex: number } | null>(null)

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
        const response = await fetch('/api/assigners', {
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
    if (clientId === null) {
      setDaysData({})
      setLoading(false)
      return
    }
    loadData()
  }, [currentMonth, clientId])

  const loadData = async () => {
    if (clientId === null) return
    
    setLoading(true)
    try {
      const monthKey = format(currentMonth, 'yyyy-MM')
      const response = await fetch(`/api/work-time?month=${monthKey}&clientId=${clientId}`, {
        credentials: 'include',
      })
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
                return { text: task, assignedBy: [], startTime: '08:00', endTime: '16:00', status: 'do zrobienia' as const }
              }
              // Normalizuj assignedBy - może być string (stary format) lub string[] (nowy format)
              let assignedBy: string[] = []
              if (task.assignedBy) {
                if (Array.isArray(task.assignedBy)) {
                  assignedBy = task.assignedBy
                } else if (typeof task.assignedBy === 'string' && task.assignedBy.trim()) {
                  assignedBy = [task.assignedBy]
                }
              }
              return {
                text: task.text || '',
                assignedBy: assignedBy,
                startTime: task.startTime || '08:00',
                endTime: task.endTime || '16:00',
                status: task.status || (task.completed ? 'wykonano' : 'do zrobienia')
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
    if (clientId === null) return

    try {
      const monthKey = format(currentMonth, 'yyyy-MM')
      
      // Pobierz istniejące dane dla tego klienta
      const existingResponse = await fetch(`/api/work-time?clientId=${clientId}`, {
        credentials: 'include',
      })
      let existingData = {}
      if (existingResponse.ok) {
        existingData = await existingResponse.json()
      }
      
      // Zaktualizuj dane dla bieżącego miesiąca i klienta
      const updatedMonthData = {
        ...existingData,
        [monthKey]: updatedData,
      }
      
      const response = await fetch('/api/work-time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ ...updatedMonthData, clientId }),
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
    // Jeśli date jest już w formacie yyyy-MM-dd, użyj go bezpośrednio (unika problemów ze strefami czasowymi)
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : format(new Date(date), 'yyyy-MM-dd')
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

  // Funkcja do przenoszenia zadania między dniami (drag & drop)
  const moveTask = (sourceDate: string, targetDate: string, taskIndex: number) => {
    // Jeśli daty są już w formacie yyyy-MM-dd, użyj ich bezpośrednio (unika problemów ze strefami czasowymi)
    const sourceDateKey = /^\d{4}-\d{2}-\d{2}$/.test(sourceDate) ? sourceDate : format(new Date(sourceDate), 'yyyy-MM-dd')
    const targetDateKey = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : format(new Date(targetDate), 'yyyy-MM-dd')

    if (sourceDateKey === targetDateKey) {
      return // Nie przenoś jeśli to ten sam dzień
    }

    const sourceDayData = daysData[sourceDateKey]
    if (!sourceDayData || !sourceDayData.tasks[taskIndex]) {
      return
    }

    const taskToMove = sourceDayData.tasks[taskIndex]

    // Usuń zadanie z źródłowego dnia
    const updatedSourceTasks = sourceDayData.tasks.filter((_, idx) => idx !== taskIndex)
    const updatedSourceDayData: DayData = {
      ...sourceDayData,
      tasks: updatedSourceTasks,
      totalHours: calculateTotalHours(updatedSourceTasks),
    }

    // Dodaj zadanie do docelowego dnia
    const targetDayData = daysData[targetDateKey] || {
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

    // Zaktualizuj stan
    const updatedDaysData = {
      ...daysData,
      [sourceDateKey]: updatedSourceDayData,
      [targetDateKey]: updatedTargetDayData,
    }

    setDaysData(updatedDaysData)
    saveData(updatedDaysData)
    showToast(`Zadanie przeniesione z ${sourceDateKey} do ${targetDateKey}`, 'success')
  }

  // Handlery dla drag & drop
  const handleDragStart = (e: React.DragEvent, date: string, taskIndex: number) => {
    // Jeśli date jest już w formacie yyyy-MM-dd, użyj go bezpośrednio (unika problemów ze strefami czasowymi)
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : format(new Date(date), 'yyyy-MM-dd')
    const dayData = daysData[dateKey]
    if (dayData && dayData.tasks[taskIndex]) {
      setDraggedTask({
        task: dayData.tasks[taskIndex],
        sourceDate: dateKey,
        taskIndex,
      })
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', '') // Wymagane dla niektórych przeglądarek
      // Dodaj wizualną wskazówkę podczas przeciągania
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '0.5'
      }
    }
  }

  const handleDragEnd = (e: React.DragEvent) => {
    // Przywróć pełną widoczność
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    setDraggedTask(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // Dodaj wizualną wskazówkę podczas przeciągania nad komórką
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.backgroundColor = draggedTask ? 'rgba(210, 47, 39, 0.1)' : ''
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Przywróć normalne tło gdy opuszczamy komórkę
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.backgroundColor = ''
    }
  }

  const handleDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault()
    
    // Przywróć normalne tło
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.backgroundColor = ''
    }
    
    if (!draggedTask) {
      return
    }

    // Jeśli targetDate jest już w formacie yyyy-MM-dd, użyj go bezpośrednio (unika problemów ze strefami czasowymi)
    const targetDateKey = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : format(new Date(targetDate), 'yyyy-MM-dd')
    
    if (draggedTask.sourceDate === targetDateKey) {
      setDraggedTask(null)
      return // Nie przenoś jeśli to ten sam dzień
    }

    moveTask(draggedTask.sourceDate, targetDateKey, draggedTask.taskIndex)
    setDraggedTask(null)
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

  const generatePDF = async () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    })
    
    // Załaduj czcionkę Roboto z obsługą polskich znaków
    // Używamy skonwertowanej czcionki z pliku
    let useRobotoFont = false
    try {
      // Dodaj czcionkę do jsPDF z pliku
      doc.addFileToVFS(robotoFontName, robotoFontBase64)
      doc.addFont(robotoFontName, 'Roboto', 'normal')
      doc.addFont(robotoFontName, 'Roboto', 'bold') // Dodaj również wersję bold
      
      // Ustaw czcionkę jako domyślną
      doc.setFont('Roboto', 'normal')
      useRobotoFont = true
      console.log('Czcionka Roboto została załadowana pomyślnie')
    } catch (error) {
      console.warn('Nie udało się załadować czcionki Roboto, używam domyślnej czcionki:', error)
      // Kontynuuj z domyślną czcionką
    }
    
    const pdfFont = useRobotoFont ? 'Roboto' : 'helvetica'
    console.log('Używana czcionka PDF:', pdfFont)
    
    // Załaduj logotyp aplikacji dla footera
    let appLogoImg: HTMLImageElement | null = null
    try {
      const logoImg = new Image()
      logoImg.crossOrigin = 'anonymous'
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('App logo load timeout'))
        }, 3000)
        
        logoImg.onload = () => {
          clearTimeout(timeout)
          appLogoImg = logoImg
          resolve()
        }
        
        logoImg.onerror = () => {
          clearTimeout(timeout)
          resolve() // Kontynuuj bez logo
        }
        
        logoImg.src = '/logo.png'
      })
    } catch (err) {
      console.warn('Nie udało się załadować logotypu aplikacji dla footera:', err)
    }
    
    // Format miesiąca: "Listopad 2025" zamiast "listopada 2025"
    const monthNameRaw = format(currentMonth, 'MMMM yyyy', { locale: pl })
    // Usuń końcówkę "a" z miesiąca (np. "listopada" -> "listopad", "grudnia" -> "grudzień")
    const monthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1).replace(/(\w+)a\s/, '$1 ')
    const monthYear = format(currentMonth, 'yyyy-MM')
    
    // Ustaw ciemne tło dla całej strony
    doc.setFillColor(20, 20, 20) // #141414
    doc.rect(0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, 'F')
    
    // Nagłówek z logo i nazwą klienta
    let startY = 18
    
    // Jeśli jest logo klienta, wyświetl je
    if (clientLogo) {
      try {
        // Sprawdź czy to SVG (nie można bezpośrednio wstawić SVG do jsPDF)
        const isSvg = clientLogo.toLowerCase().endsWith('.svg') || clientLogo.toLowerCase().includes('data:image/svg+xml')
        
        if (!isSvg) {
          // Dla obrazów PNG/JPG, załaduj i wyświetl
          const img = new Image()
          img.crossOrigin = 'anonymous'
          
          // Użyj Promise do asynchronicznego ładowania obrazu
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Image load timeout'))
            }, 5000)
            
            img.onload = () => {
              clearTimeout(timeout)
              try {
                const logoSize = 20
                doc.addImage(img, 'PNG', 14, startY, logoSize, logoSize)
                startY += logoSize + 10 // Zwiększono odstęp pod logotypem z 4 na 10
                resolve()
              } catch (err) {
                reject(err)
              }
            }
            img.onerror = () => {
              clearTimeout(timeout)
              reject(new Error('Failed to load image'))
            }
            
            img.src = clientLogo
          })
        }
        // Dla SVG pomijamy logo (jsPDF nie obsługuje SVG bezpośrednio)
      } catch (err) {
        console.error('Error loading client logo:', err)
        // Kontynuuj bez logo
      }
    }
    
    // Wyświetl nazwę klienta jeśli jest dostępna
    if (clientName) {
      doc.setFontSize(16)
      doc.setTextColor(255, 255, 255) // Biały tekst
      doc.setFont(pdfFont, 'bold')
      doc.text(clientName, 14, startY)
      startY += 8
    }
    
    // Tytuł aplikacji - mniejszy, poniżej nazwy klienta
    doc.setFontSize(12)
    doc.setTextColor(210, 47, 39) // #d22f27
    doc.setFont(pdfFont, 'bold')
    doc.text('Afisza Time Tracker', 14, startY)
    startY += 6
    
    // Miesiąc i rok
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255) // Biały tekst na ciemnym tle
    doc.setFont(pdfFont, 'normal')
    doc.text(monthName, 14, startY)
    startY += 8
    
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
      
      // Format daty z pełną nazwą dnia pod spodem - zachowujemy polskie znaki
      const dateWithDay = `${dateStr}\n${dayName}`
      
      // Zbierz wszystkich unikalnych osób zlecających dla tego dnia (flatten arrays)
      const dayAssigners = Array.from(new Set(dayData.tasks.flatMap(t => Array.isArray(t.assignedBy) ? t.assignedBy : (t.assignedBy ? [t.assignedBy] : [])).filter(Boolean)))
      const assignersText = dayAssigners.length > 0 
        ? dayAssigners.join('\n')
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
          const status = task.status
          // Format zadania: numer zadania, tekst i czas - zachowujemy polskie znaki
          const taskInfo = `${taskNumber}. ${taskText}\n${timeRange}`
          
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
    
    // Dodaj wiersz z sumą - zachowujemy polskie znaki
    const monthTotal = calculateMonthTotal()
    const totalAmount = calculateTotalAmount()
    tableData.push([
      'RAZEM',
      monthTotal,
      '',
      '',
      totalAmount ? `${totalAmount} zł` : ''
    ])
    
    // Ustaw czcionkę przed generowaniem tabeli
    if (useRobotoFont) {
      doc.setFont('Roboto', 'normal')
    }
    
    // Generuj tabelę - kompaktowa i minimalistyczna
    // Wszystkie dane zachowują polskie znaki
    // Użyj opcji które wspierają UTF-8
    autoTable(doc, {
      head: [['Dzień', 'Godziny', 'Kto zlecił', 'Zadania', 'Status']],
      body: tableData,
      startY: startY,
      theme: 'plain',
      styles: {
        fontSize: 7,
        cellPadding: 2,
        textColor: [255, 255, 255], // Biały tekst
        fillColor: [20, 20, 20], // Ciemne tło #141414
        lineColor: [50, 50, 50], // Subtelne linie
        lineWidth: 0.1,
        font: pdfFont, // Użyj czcionki Roboto z obsługą polskich znaków lub domyślnej
        fontStyle: 'normal',
        overflow: 'linebreak',
        halign: 'left',
      },
      headStyles: {
        fillColor: [210, 47, 39], // #d22f27
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
        font: pdfFont,
      },
      bodyStyles: {
        font: pdfFont,
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
        const pageHeight = doc.internal.pageSize.height
        const pageWidth = doc.internal.pageSize.width
        
        // Dodaj footer na każdej stronie
        const footerLogoSize = 8
        const footerY = pageHeight - 15
        const footerX = 14
        
        try {
          // Dodaj logotyp aplikacji (jeśli został załadowany)
          if (appLogoImg) {
            doc.addImage(appLogoImg, 'PNG', footerX, footerY, footerLogoSize, footerLogoSize)
            
            // Dodaj nazwę "Afisza" obok logotypu
            doc.setFontSize(8)
            doc.setTextColor(210, 47, 39) // #d22f27
            doc.setFont(pdfFont, 'bold')
            doc.text('Afisza', footerX + footerLogoSize + 4, footerY + footerLogoSize / 2 + 2)
          } else {
            // Jeśli logo się nie załadowało, dodaj tylko nazwę
            doc.setFontSize(8)
            doc.setTextColor(210, 47, 39) // #d22f27
            doc.setFont(pdfFont, 'bold')
            doc.text('Afisza', footerX, footerY + 4)
          }
          
          // Dodaj napis "wygenerowano automatycznie z aplikacji." po prawej stronie
          doc.setFontSize(7)
          doc.setTextColor(200, 200, 200) // Szary tekst
          doc.setFont(pdfFont, 'normal')
          const footerText = 'wygenerowano automatycznie z aplikacji.'
          const textWidth = doc.getTextWidth(footerText)
          doc.text(footerText, pageWidth - textWidth - 14, footerY + (appLogoImg ? footerLogoSize / 2 + 2 : 4))
        } catch (err) {
          console.error('Error adding footer:', err)
        }
        
        // Dodaj kwotę do opłaty na ostatniej stronie (jeśli istnieje)
        if (totalAmount && data.pageNumber === data.pageCount) {
          doc.setFontSize(10)
          doc.setTextColor(210, 47, 39) // #d22f27
          doc.setFont(pdfFont, 'bold')
          doc.text(
            `Kwota do opłaty: ${totalAmount} zł`,
            14,
            data.cursor.y + 8
          )
        }
      },
    })
    
    // Zapisz PDF z nazwą klienta
    // Przygotuj bezpieczną nazwę klienta dla pliku (usunąć znaki specjalne, spacje zamienić na podkreślenia)
    const safeClientName = clientName 
      ? clientName
          .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]/g, '') // Usuń znaki specjalne, zostaw polskie znaki
          .replace(/\s+/g, '-') // Zamień spacje na myślniki
          .toLowerCase()
          .substring(0, 50) // Ogranicz długość
      : 'default'
    const fileName = `work-time-${safeClientName}-${monthYear}.pdf`
    doc.save(fileName)
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        minHeight: '400px',
        background: 'var(--app-bg)',
      }}>
        <Loader2 
          size={48} 
          style={{
            color: 'var(--app-accent)',
            animation: 'spin-loader 1s linear infinite',
          }}
        />
        <div style={{
          marginTop: '20px',
          color: 'var(--app-text-muted)',
          fontSize: '14px',
          fontWeight: '500',
        }}>
          Ładowanie zadań z bazy danych...
        </div>
      </div>
    )
  }

  const days = getDaysInMonth()
  const monthTotal = calculateMonthTotal()

  return (
    <div>
      {/* Month Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', background: 'var(--app-bg)', padding: '6px 10px', border: '1px solid var(--app-border)', flexWrap: 'wrap', gap: '8px' }}>
        <button
          onClick={() => changeMonth(-1)}
          style={{ 
            padding: '4px 10px', 
            background: 'transparent',
            color: 'var(--app-accent)',
            border: '1px solid var(--app-accent)',
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
            e.currentTarget.style.background = 'var(--app-accent)'
            e.currentTarget.style.color = 'var(--app-accent-foreground)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--app-accent)'
          }}
        >
          <span style={{ display: isMobile ? 'none' : 'inline' }}>← </span>Poprzedni
        </button>
        <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-text)', textAlign: 'center', flex: 1, minWidth: '160px' }}>
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
            color: 'var(--app-accent)',
            border: '1px solid var(--app-accent)',
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
            e.currentTarget.style.background = 'var(--app-accent)'
            e.currentTarget.style.color = 'var(--app-accent-foreground)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--app-accent)'
          }}
        >
          Następny<span style={{ display: isMobile ? 'none' : 'inline' }}> →</span>
        </button>
      </div>

      {/* Calendar Table */}
      <div style={{ overflowX: 'auto', background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
        <table style={{ minWidth: isMobile ? '100%' : '900px', width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '90px', fontSize: '13px', padding: '6px 8px', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', fontWeight: '600', textAlign: 'left' }}>Dzień</th>
              <th style={{ width: '70px', fontSize: '13px', padding: '6px 8px', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', fontWeight: '600', textAlign: 'center' }}>Godziny</th>
              <th style={{ width: '120px', fontSize: '13px', padding: '6px 8px', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', fontWeight: '600', textAlign: 'left' }}>Kto zlecił</th>
              <th style={{ minWidth: '300px', fontSize: '13px', padding: '6px 8px', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', fontWeight: '600', textAlign: 'left' }}>Zadania</th>
              <th style={{ width: '120px', fontSize: '13px', padding: '6px 8px', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', fontWeight: '600', textAlign: 'left' }}>Status</th>
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
              const dayAssigners = Array.from(new Set(dayData.tasks.flatMap(t => Array.isArray(t.assignedBy) ? t.assignedBy : (t.assignedBy ? [t.assignedBy] : [])).filter(Boolean)))

              const isHighlighted = highlightDate === dateKey
              
              return (
                <tr 
                  key={dateKey}
                  data-day={dateKey}
                  style={{ 
                    background: isHighlighted 
                      ? '#2a1a1a' 
                      : (days.indexOf(day) % 2 === 0 ? 'var(--app-bg)' : 'var(--app-card)'),
                    borderLeft: isHighlighted ? '3px solid var(--app-accent)' : 'none',
                    transition: 'all 0.3s ease'
                  }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, dateKey)}
                >
                  <td 
                    style={{ 
                      padding: '4px 6px', 
                      borderBottom: '1px solid var(--app-border)', 
                      verticalAlign: 'top',
                      fontWeight: isHighlighted ? '600' : 'normal'
                    }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateKey)}
                  >
                    <div style={{ fontWeight: isHighlighted ? '600' : '500', color: isHighlighted ? 'var(--app-accent)' : 'var(--app-text)', marginBottom: '2px', fontSize: '13px', lineHeight: '1.2' }}>
                      {format(day, 'dd.MM.yyyy')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--app-text-muted)', textTransform: 'lowercase', lineHeight: '1.2' }}>
                      {getDayName(day)}
                    </div>
                  </td>
                  <td 
                    style={{ padding: '4px 6px', borderBottom: '1px solid var(--app-border)', textAlign: 'center', fontWeight: '600', color: 'var(--app-accent)', fontSize: '13px', verticalAlign: 'top' }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateKey)}
                  >
                    {dayData.totalHours}
                  </td>
                  <td 
                    style={{ padding: '4px 6px', borderBottom: '1px solid var(--app-border)', verticalAlign: 'top' }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateKey)}
                  >
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
                                color: 'var(--app-text)',
                                lineHeight: '1.3'
                              }}
                            >
                              {assigner?.avatar && !failedAvatars.has(assigner.avatar) ? (
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
                                  onError={() => {
                                    if (assigner?.avatar) {
                                      setFailedAvatars(prev => new Set(prev).add(assigner.avatar))
                                    }
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: 'var(--app-accent)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '9px',
                                    fontWeight: '600',
                                    color: 'var(--app-accent-foreground)',
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
                      <div style={{ fontSize: '13px', color: 'var(--app-text-muted)' }}>-</div>
                    )}
                  </td>
                  <td 
                    style={{ padding: '4px 6px', borderBottom: '1px solid var(--app-border)', verticalAlign: 'top' }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateKey)}
                  >
                    <TaskList
                      date={dateKey}
                      tasks={dayData.tasks}
                      onUpdate={(tasks) => updateDayData(dateKey, { tasks })}
                      onDragStart={(e, taskIndex) => handleDragStart(e, dateKey, taskIndex)}
                      onDragEnd={handleDragEnd}
                    />
                  </td>
                  <td 
                    style={{ 
                      padding: '4px 6px', 
                      borderBottom: '1px solid var(--app-border)', 
                      verticalAlign: 'top',
                      position: 'relative'
                    }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateKey)}
                  >
                    {dayData.tasks.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
                        {dayData.tasks.map((task, idx) => {
                          const taskNumber = idx + 1
                          const statusColors: Record<TaskStatus, string> = {
                            'wykonano': '#10B981',
                            'w trakcie': '#3B82F6',
                            'do zrobienia': '#EAB308',
                            'anulowane': '#6B7280',
                            'zaplanowano': '#8B5CF6'
                          }
                          return (
                            <div 
                              key={idx}
                              draggable
                              onDragStart={(e) => handleDragStart(e, dateKey, idx)}
                              onDragEnd={handleDragEnd}
                              style={{
                                marginBottom: idx < dayData.tasks.length - 1 ? '2px' : '0px',
                                minHeight: '22px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '0px',
                                cursor: 'grab',
                                transition: 'opacity 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (e.currentTarget instanceof HTMLElement) {
                                  e.currentTarget.style.cursor = 'grab'
                                  e.currentTarget.style.opacity = '0.9'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (e.currentTarget instanceof HTMLElement) {
                                  e.currentTarget.style.opacity = '1'
                                }
                              }}
                            >
                              {/* Numer zadania */}
                              <div style={{ minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-accent)', color: 'var(--app-accent-foreground)', borderRadius: '2px', fontSize: '10px', fontWeight: '600', flexShrink: 0 }}>
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
                                  color: 'var(--app-accent-foreground)',
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
                                <option value="zaplanowano" style={{ background: '#8B5CF6' }}>zaplanowano</option>
                              </select>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--app-text-muted)' }}>-</div>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr style={{ background: 'var(--app-accent)', fontWeight: '600', color: 'var(--app-accent-foreground)' }}>
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
            background: 'var(--app-accent)',
            color: 'var(--app-accent-foreground)',
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
            e.currentTarget.style.filter = 'brightness(0.9)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none'
          }}
        >
          <FileText size={14} style={{ color: 'var(--app-accent-foreground)' }} />
          Generuj PDF
        </button>
      </div>
    </div>
  )
}

