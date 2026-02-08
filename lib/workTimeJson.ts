import fs from 'fs'
import path from 'path'
import { generateTaskId } from './taskId'

const DATA_FILE = path.join(process.cwd(), 'data', 'work-time.json')

export interface Task {
  id?: string
  text: string
  assignedBy: string[]
  startTime: string
  endTime: string
  completed?: boolean
  status?: string
  attachments?: string[]
}

export interface DayData {
  date: string
  tasks: Task[]
  totalHours: string
}

function normalizeTasks(tasks: any, existingIds?: Set<string>): Task[] {
  if (!tasks) return []
  const ids = existingIds ?? new Set<string>()
  if (Array.isArray(tasks)) {
    return tasks.map(task => {
      if (typeof task === 'string') {
        const id = generateTaskId(ids)
        ids.add(id)
        return { id, text: task, assignedBy: [], startTime: '08:00', endTime: '16:00', status: 'do zrobienia', attachments: [] }
      }
      let status = task.status
      if (!status && task.completed !== undefined) {
        status = task.completed ? 'wykonano' : 'do zrobienia'
      }
      if (!status) status = 'do zrobienia'
      let assignedBy: string[] = []
      if (task.assignedBy) {
        if (Array.isArray(task.assignedBy)) assignedBy = task.assignedBy
        else if (typeof task.assignedBy === 'string' && task.assignedBy.trim()) assignedBy = [task.assignedBy]
      }
      let id = task.id && String(task.id).replace(/\D/g, '').length >= 6 ? String(task.id) : ''
      if (!id) {
        id = generateTaskId(ids)
        ids.add(id)
      }
      return {
        id,
        text: task.text || '',
        assignedBy,
        startTime: task.startTime || '08:00',
        endTime: task.endTime || '16:00',
        status,
        completed: task.completed || false,
        attachments: Array.isArray(task.attachments) ? task.attachments : []
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
    
    const existingIds = new Set<string>()
    for (const dayData of Object.values(monthData)) {
      const tasks = dayData.tasks || []
      tasks.forEach((t: any) => { if (t?.id && String(t.id).replace(/\D/g, '').length >= 6) existingIds.add(String(t.id)) })
    }
    const normalizedData: Record<string, DayData> = {}
    for (const [dateKey, dayData] of Object.entries(monthData)) {
      const normalizedTasks = normalizeTasks(dayData.tasks || [], existingIds)
      normalizedTasks.forEach(t => { if (t.id) existingIds.add(t.id) })
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

