import fs from 'fs'
import path from 'path'

const DATA_FILE = path.join(process.cwd(), 'data', 'work-time.json')

export interface Task {
  text: string
  assignedBy: string[]  // Kto zlecił zadanie (może być wiele osób)
  startTime: string  // Format: HH:MM
  endTime: string    // Format: HH:MM
  completed?: boolean // Czy zadanie zostało wykonane (deprecated - użyj status)
  status?: string    // Status zadania: 'wykonano' | 'w trakcie' | 'do zrobienia' | 'anulowane'
}

export interface DayData {
  date: string
  tasks: Task[]
  totalHours: string
}

// Helper function to convert old string[] tasks to Task[]
function normalizeTasks(tasks: any): Task[] {
  if (!tasks) return []
  if (Array.isArray(tasks)) {
    return tasks.map(task => {
      if (typeof task === 'string') {
        return { text: task, assignedBy: [], startTime: '08:00', endTime: '16:00', status: 'do zrobienia' }
      }
      // Konwertuj completed na status jeśli status nie istnieje
      let status = task.status
      if (!status && task.completed !== undefined) {
        status = task.completed ? 'wykonano' : 'do zrobienia'
      }
      if (!status) {
        status = 'do zrobienia'
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
        status: status,
        completed: task.completed || false // Zachowaj dla kompatybilności wstecznej
      }
    })
  }
  return []
}

// Oblicz całkowite godziny na podstawie zadań (union przedziałów czasowych)
function calculateTotalHours(tasks: Task[]): string {
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

// Inicjalizacja pliku danych jeśli nie istnieje
function ensureDataFile() {
  const dataDir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf-8')
  }
}

// Pobierz dane dla miesiąca (JSON)
export function getMonthDataJSON(userId: number, monthKey: string, clientId: number): Record<string, DayData> {
  ensureDataFile()
  try {
    const fileContent = fs.readFileSync(DATA_FILE, 'utf-8')
    const data = fileContent ? JSON.parse(fileContent) : {}
    const dataTyped = data as Record<string | number, Record<string | number, Record<string, Record<string, any>>>>
    const userData = dataTyped[userId] || {}
    const clientData = userData[clientId] || {}
    const monthData = clientData[monthKey] || {}
    
    // Normalizuj zadania dla każdego dnia i oblicz godziny
    const normalizedData: Record<string, DayData> = {}
    for (const [dateKey, dayData] of Object.entries(monthData)) {
      const normalizedTasks = normalizeTasks(dayData.tasks || [])
      normalizedData[dateKey] = {
        ...dayData,
        tasks: normalizedTasks,
        totalHours: calculateTotalHours(normalizedTasks)
      } as DayData
    }
    
    return normalizedData
  } catch (error) {
    return {}
  }
}

// Zapisz dane dla miesiąca (JSON)
export function saveMonthDataJSON(userId: number, monthKey: string, daysData: Record<string, DayData>, clientId: number): void {
  ensureDataFile()
  
  let data = {}
  try {
    const fileContent = fs.readFileSync(DATA_FILE, 'utf-8')
    data = fileContent ? JSON.parse(fileContent) : {}
  } catch (error) {
    data = {}
  }
  
  // Merge new data with existing data
  const dataTyped = data as Record<string | number, Record<string | number, Record<string, any>>>
  if (!dataTyped[userId]) {
    dataTyped[userId] = {}
  }
  if (!dataTyped[userId][clientId]) {
    dataTyped[userId][clientId] = {}
  }
  dataTyped[userId][clientId] = { ...dataTyped[userId][clientId], [monthKey]: daysData }
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(dataTyped, null, 2), 'utf-8')
}

