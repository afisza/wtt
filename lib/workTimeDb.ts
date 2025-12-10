import { query } from './db'

export interface Task {
  text: string
  assignedBy: string
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
        return { text: task, assignedBy: '', startTime: '08:00', endTime: '16:00', status: 'do zrobienia' }
      }
      // Konwertuj completed na status jeśli status nie istnieje
      let status = task.status
      if (!status && task.completed !== undefined) {
        status = task.completed ? 'wykonano' : 'do zrobienia'
      }
      if (!status) {
        status = 'do zrobienia'
      }
      return {
        text: task.text || '',
        assignedBy: task.assignedBy || '',
        startTime: task.startTime || '08:00',
        endTime: task.endTime || '16:00',
        status: status,
        completed: task.completed || false // Zachowaj dla kompatybilności wstecznej
      }
    })
  }
  return []
}

// Sprawdź czy MySQL jest dostępny
function isMySQLAvailable(): boolean {
  return !!(process.env.DB_HOST && process.env.DB_NAME)
}

// Pobierz dane dla miesiąca
export async function getMonthData(userId: number, monthKey: string): Promise<Record<string, DayData>> {
  if (!isMySQLAvailable()) {
    return {}
  }

  // Upewnij się, że kolumna status istnieje przed odczytem
  await ensureStatusColumnExists()

  try {
    const [year, month] = monthKey.split('-').map(Number)
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    // Ostatni dzień miesiąca
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    // Pobierz wszystkie dni pracy dla miesiąca
    const workDays = await query(
      `SELECT id, date FROM work_days 
       WHERE user_id = ? AND date >= ? AND date <= ?`,
      [userId, startDate, endDate]
    ) as any[]

    const result: Record<string, DayData> = {}

    for (const workDay of workDays) {
      // MySQL zwraca datę jako string lub Date object
      let dateKey: string
      if (workDay.date instanceof Date) {
        dateKey = workDay.date.toISOString().split('T')[0]
      } else {
        // Jeśli to string, użyj go bezpośrednio
        dateKey = workDay.date.toString().substring(0, 10)
      }

      // Pobierz zadania (obsługa przypadku gdy kolumny mogą nie istnieć)
      let tasks: any[] = []
      try {
        // Spróbuj pobrać wszystkie kolumny (start_time, end_time, assigned_by, status, completed)
        tasks = await query(
          `SELECT description, assigned_by, start_time, end_time, status, completed FROM tasks 
           WHERE work_day_id = ? ORDER BY created_at`,
          [workDay.id]
        ) as any[]
      } catch (error: any) {
        // Jeśli kolumny nie istnieją, spróbuj pobrać bez status/completed
        try {
          tasks = await query(
            `SELECT description, assigned_by, start_time, end_time, status FROM tasks 
             WHERE work_day_id = ? ORDER BY created_at`,
            [workDay.id]
          ) as any[]
          tasks = tasks.map((t: any) => ({
            description: t.description,
            assigned_by: t.assigned_by || '',
            start_time: t.start_time || null,
            end_time: t.end_time || null,
            status: t.status || 'do zrobienia',
            completed: false
          }))
        } catch (innerError: any) {
          // Jeśli tylko description istnieje
          try {
            const tasksDescriptionOnly = await query(
              `SELECT description FROM tasks 
               WHERE work_day_id = ? ORDER BY created_at`,
              [workDay.id]
            ) as any[]
            tasks = tasksDescriptionOnly.map((t: any) => ({
              description: t.description,
              assigned_by: '',
              start_time: null,
              end_time: null,
              status: t.status || 'do zrobienia',
              completed: false
            }))
          } catch (finalError) {
            // Jeśli tabela nie istnieje, zwróć pustą tablicę
            tasks = []
          }
        }
      }

      // Oblicz całkowite godziny na podstawie zadań (union przedziałów czasowych)
      const intervals: Array<{ start: number; end: number }> = []
      
      const formattedTasks = tasks.map((t: any) => {
        let startTime = '08:00'
        let endTime = '16:00'
        
        if (t.start_time) {
          startTime = t.start_time.toString().substring(0, 5) // HH:MM
        }
        if (t.end_time) {
          endTime = t.end_time.toString().substring(0, 5) // HH:MM
        }
        
        // Zbierz przedziały czasowe dla union
        const [startHours, startMinutes] = startTime.split(':').map(Number)
        const [endHours, endMinutes] = endTime.split(':').map(Number)
        const startTotal = startHours * 60 + startMinutes
        const endTotal = endHours * 60 + endMinutes
        
        if (endTotal > startTotal) {
          intervals.push({ start: startTotal, end: endTotal })
        }
        
        // Określ status - preferuj kolumnę status, jeśli nie ma to konwertuj completed
        let status = t.status || 'do zrobienia'
        if (!t.status && t.completed !== undefined && t.completed !== null) {
          status = (t.completed === 1 || t.completed === true) ? 'wykonano' : 'do zrobienia'
        }
        
        return {
          text: t.description || '',
          assignedBy: t.assigned_by || '',
          startTime,
          endTime,
          status: status,
          completed: t.completed === 1 || t.completed === true || false // Zachowaj dla kompatybilności
        }
      })

      // Sortuj przedziały po czasie rozpoczęcia
      intervals.sort((a, b) => a.start - b.start)

      // Połącz nakładające się przedziały
      const mergedIntervals: Array<{ start: number; end: number }> = []
      if (intervals.length > 0) {
        let currentInterval = intervals[0]

        for (let i = 1; i < intervals.length; i++) {
          const nextInterval = intervals[i]
          
          // Jeśli przedziały się nakładają lub stykają
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
      }

      // Oblicz całkowitą długość wszystkich połączonych przedziałów
      let totalMinutes = 0
      mergedIntervals.forEach(interval => {
        totalMinutes += interval.end - interval.start
      })

      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      const totalHours = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`

      result[dateKey] = {
        date: dateKey,
        tasks: normalizeTasks(formattedTasks),
        totalHours,
      }
    }

    return result
  } catch (error) {
    console.error('Error loading data from MySQL:', error)
    return {}
  }
}

// Funkcja pomocnicza do sprawdzania i dodawania kolumny status jeśli nie istnieje
async function ensureStatusColumnExists(): Promise<void> {
  try {
    // Sprawdź czy kolumna status istnieje
    const [columns]: any[] = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'tasks' 
       AND COLUMN_NAME = 'status'`
    ) as any[]
    
    if (!columns || columns.length === 0) {
      // Dodaj kolumnę status
      await query(
        `ALTER TABLE tasks ADD COLUMN status VARCHAR(50) DEFAULT 'do zrobienia' AFTER assigned_by`
      )
      
      // Zaktualizuj istniejące rekordy - konwertuj completed na status
      await query(
        `UPDATE tasks 
         SET status = CASE 
           WHEN completed = 1 THEN 'wykonano'
           WHEN completed = 0 THEN 'do zrobienia'
           ELSE 'do zrobienia'
         END
         WHERE status IS NULL OR status = ''`
      )
      
      console.log('Column status added to tasks table')
    }
  } catch (error: any) {
    // Jeśli tabela nie istnieje lub jest inny błąd, zignoruj
    if (error.code !== 'ER_NO_SUCH_TABLE' && !error.message?.includes("doesn't exist")) {
      console.error('Error checking/adding status column:', error)
    }
  }
}

// Zapisz dane dla miesiąca
export async function saveMonthData(userId: number, monthKey: string, daysData: Record<string, DayData>): Promise<void> {
  if (!isMySQLAvailable()) {
    throw new Error('MySQL not available')
  }

  // Upewnij się, że kolumna status istnieje przed zapisem
  await ensureStatusColumnExists()

  try {
    for (const [dateKey, dayData] of Object.entries(daysData)) {
      const date = new Date(dateKey)

      // Sprawdź czy dzień pracy istnieje, jeśli nie - utwórz
      let workDayResult = await query(
        `SELECT id FROM work_days WHERE user_id = ? AND date = ?`,
        [userId, dateKey]
      ) as any[]

      let workDayId: number

      if (workDayResult.length === 0) {
        const insertResult = await query(
          `INSERT INTO work_days (user_id, date) VALUES (?, ?)`,
          [userId, dateKey]
        ) as any
        workDayId = insertResult.insertId
      } else {
        workDayId = workDayResult[0].id
      }

      // Usuń stare zadania
      try {
        await query(`DELETE FROM tasks WHERE work_day_id = ?`, [workDayId])
      } catch (error: any) {
        // Jeśli tabela tasks nie istnieje, zignoruj błąd
        if (error.code === 'ER_NO_SUCH_TABLE' || error.message?.includes("doesn't exist")) {
          console.log('Table tasks does not exist, skipping delete')
        } else {
          throw error
        }
      }

      // Wstaw nowe zadania (obsługa przypadku gdy kolumny mogą nie istnieć)
      for (const task of dayData.tasks) {
        const normalizedTasks = normalizeTasks([task])
        if (normalizedTasks.length > 0 && normalizedTasks[0].text.trim()) {
          const taskData = normalizedTasks[0]
          try {
            // Spróbuj wstawić z wszystkimi kolumnami (start_time, end_time, assigned_by, status)
            const taskStatus = taskData.status || (taskData.completed ? 'wykonano' : 'do zrobienia')
            await query(
              `INSERT INTO tasks (work_day_id, description, assigned_by, start_time, end_time, status, completed) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [workDayId, taskData.text, taskData.assignedBy || '', taskData.startTime || '08:00', taskData.endTime || '16:00', taskStatus, taskData.completed ? 1 : 0]
            )
          } catch (error: any) {
            // Jeśli kolumna status nie istnieje, spróbuj z completed
            if (error.code === 'ER_BAD_FIELD_ERROR' && error.message?.includes('status')) {
              try {
                const taskStatus = taskData.status || (taskData.completed ? 'wykonano' : 'do zrobienia')
                await query(
                  `INSERT INTO tasks (work_day_id, description, assigned_by, start_time, end_time, completed) VALUES (?, ?, ?, ?, ?, ?)`,
                  [workDayId, taskData.text, taskData.assignedBy || '', taskData.startTime || '08:00', taskData.endTime || '16:00', taskStatus === 'wykonano' ? 1 : 0]
                )
              } catch (innerError: any) {
                // Jeśli kolumny start_time/end_time nie istnieją, spróbuj z assigned_by
                if (innerError.code === 'ER_BAD_FIELD_ERROR' && (innerError.message?.includes('start_time') || innerError.message?.includes('end_time'))) {
                  try {
                    await query(
                      `INSERT INTO tasks (work_day_id, description, assigned_by, completed) VALUES (?, ?, ?, ?)`,
                      [workDayId, taskData.text, taskData.assignedBy || '', taskData.status === 'wykonano' ? 1 : 0]
                    )
                  } catch (finalError: any) {
                    // Jeśli assigned_by też nie istnieje, wstaw tylko description
                    if (finalError.code === 'ER_BAD_FIELD_ERROR' || finalError.message?.includes('assigned_by')) {
                      await query(
                        `INSERT INTO tasks (work_day_id, description, completed) VALUES (?, ?, ?)`,
                        [workDayId, taskData.text, taskData.status === 'wykonano' ? 1 : 0]
                      )
                    } else {
                      throw finalError
                    }
                  }
                } else {
                  throw innerError
                }
              }
            } else if (error.code === 'ER_BAD_FIELD_ERROR' && (error.message?.includes('start_time') || error.message?.includes('end_time'))) {
              // Jeśli kolumny start_time/end_time nie istnieją, spróbuj z assigned_by i status
              try {
                const taskStatus = taskData.status || (taskData.completed ? 'wykonano' : 'do zrobienia')
                await query(
                  `INSERT INTO tasks (work_day_id, description, assigned_by, status) VALUES (?, ?, ?, ?)`,
                  [workDayId, taskData.text, taskData.assignedBy || '', taskStatus]
                )
              } catch (innerError: any) {
                // Jeśli status też nie istnieje, spróbuj z completed
                if (innerError.code === 'ER_BAD_FIELD_ERROR' && innerError.message?.includes('status')) {
                  try {
                    await query(
                      `INSERT INTO tasks (work_day_id, description, assigned_by, completed) VALUES (?, ?, ?, ?)`,
                      [workDayId, taskData.text, taskData.assignedBy || '', taskData.completed ? 1 : 0]
                    )
                  } catch (finalError: any) {
                    // Jeśli assigned_by też nie istnieje, wstaw tylko description
                    if (finalError.code === 'ER_BAD_FIELD_ERROR' || finalError.message?.includes('assigned_by')) {
                      await query(
                        `INSERT INTO tasks (work_day_id, description) VALUES (?, ?)`,
                        [workDayId, taskData.text]
                      )
                    } else {
                      throw finalError
                    }
                  }
                } else {
                  throw innerError
                }
              }
            } else if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('assigned_by')) {
              // Jeśli tylko assigned_by nie istnieje, ale start_time/end_time istnieją
              try {
                const taskStatus = taskData.status || (taskData.completed ? 'wykonano' : 'do zrobienia')
                await query(
                  `INSERT INTO tasks (work_day_id, description, start_time, end_time, status) VALUES (?, ?, ?, ?, ?)`,
                  [workDayId, taskData.text, taskData.startTime || '08:00', taskData.endTime || '16:00', taskStatus]
                )
              } catch (innerError: any) {
                if (innerError.code === 'ER_BAD_FIELD_ERROR' && innerError.message?.includes('status')) {
                  await query(
                    `INSERT INTO tasks (work_day_id, description, start_time, end_time, completed) VALUES (?, ?, ?, ?, ?)`,
                    [workDayId, taskData.text, taskData.startTime || '08:00', taskData.endTime || '16:00', taskData.completed ? 1 : 0]
                  )
                } else {
                  throw innerError
                }
              }
            } else {
              throw error
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error saving data to MySQL:', error)
    throw error
  }
}
