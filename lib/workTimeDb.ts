import { query } from './db'
import { getDbConfig } from './dbConfig'

// Ustaw domyślną strefę czasową na Europe/Warsaw dla Node.js
if (typeof process !== 'undefined' && !process.env.TZ) {
  process.env.TZ = 'Europe/Warsaw'
}

export interface Task {
  id?: string        // Unikalny 6-cyfrowy task_uid
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

// Helper function to convert old string[] tasks to Task[]
function normalizeTasks(tasks: any): Task[] {
  if (!tasks) return []
  if (Array.isArray(tasks)) {
    return tasks.map(task => {
      if (typeof task === 'string') {
        return { text: task, assignedBy: [], startTime: '08:00', endTime: '16:00', status: 'do zrobienia', attachments: [] }
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
        id: task.id,
        text: task.text || '',
        assignedBy: assignedBy,
        startTime: task.startTime || '08:00',
        endTime: task.endTime || '16:00',
        status: status,
        completed: task.completed || false,
        attachments: task.attachments || []
      }
    })
  }
  return []
}

// Sprawdź czy MySQL jest dostępny
function isMySQLAvailable(): boolean {
  // Sprawdź zmienne środowiskowe
  if (process.env.DB_HOST && process.env.DB_NAME) {
    return true
  }
  
  // Sprawdź plik konfiguracyjny
  const config = getDbConfig()
  return !!(config && config.host && config.database)
}

// Pobierz dane dla miesiąca
export async function getMonthData(userId: number, monthKey: string, clientId: number): Promise<Record<string, DayData>> {
  if (!isMySQLAvailable()) {
    console.log('[getMonthData] MySQL not available, returning empty object')
    return {}
  }

  await ensureStatusColumnExists()
  await ensureTaskUidAndAttachmentsColumnsExist()

  try {
    const existingTaskUids = new Set<string>()
    try {
      const existing = await query(`SELECT task_uid FROM tasks WHERE task_uid IS NOT NULL`) as any[]
      existing.forEach((r: any) => { if (r?.task_uid) existingTaskUids.add(String(r.task_uid)) })
    } catch (_) { /* kolumna task_uid może nie istnieć w starych bazach */ }
    const [year, month] = monthKey.split('-').map(Number)
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    // Ostatni dzień miesiąca
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    console.log(`[getMonthData] Fetching data for userId=${userId}, clientId=${clientId}, monthKey=${monthKey}, startDate=${startDate}, endDate=${endDate}`)

    // Pobierz wszystkie dni pracy dla miesiąca i klienta
    const workDays = await query(
      `SELECT id, date FROM work_days 
       WHERE user_id = ? AND client_id = ? AND date >= ? AND date <= ?`,
      [userId, clientId, startDate, endDate]
    ) as any[]

    console.log(`[getMonthData] Found ${workDays.length} work days`)

    const result: Record<string, DayData> = {}

    console.log(`[getMonthData] Processing ${workDays.length} work days`)

    for (const workDay of workDays) {
      // MySQL zwraca datę jako string lub Date object
      let dateKey: string
      if (workDay.date instanceof Date) {
        // Użyj lokalnej daty zamiast UTC, aby uniknąć przesunięcia o jeden dzień
        const year = workDay.date.getFullYear()
        const month = String(workDay.date.getMonth() + 1).padStart(2, '0')
        const day = String(workDay.date.getDate()).padStart(2, '0')
        dateKey = `${year}-${month}-${day}`
      } else {
        // Jeśli to string, użyj go bezpośrednio (usuń czas jeśli jest)
        const dateStr = workDay.date.toString()
        dateKey = dateStr.substring(0, 10)
        // Upewnij się, że format jest poprawny (yyyy-MM-dd)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          // Jeśli format jest inny, spróbuj sparsować
          const parsed = new Date(dateStr)
          if (!isNaN(parsed.getTime())) {
            const year = parsed.getFullYear()
            const month = String(parsed.getMonth() + 1).padStart(2, '0')
            const day = String(parsed.getDate()).padStart(2, '0')
            dateKey = `${year}-${month}-${day}`
          }
        }
      }

      let tasks: any[] = []
      try {
        tasks = await query(
          `SELECT id, task_uid, description, assigned_by, start_time, end_time, status, completed, attachments FROM tasks 
           WHERE work_day_id = ? ORDER BY created_at`,
          [workDay.id]
        ) as any[]
      } catch (error: any) {
        try {
        tasks = await query(
          `SELECT id, description, assigned_by, start_time, end_time, status, completed FROM tasks 
           WHERE work_day_id = ? ORDER BY created_at`,
          [workDay.id]
        ) as any[]
        tasks = tasks.map((t: any) => ({ ...t, task_uid: null, attachments: null }))
      } catch (fallbackErr: any) {
        // Jeśli kolumny nie istnieją, spróbuj pobrać bez status/completed
        try {
          tasks = await query(
            `SELECT description, assigned_by, start_time, end_time, status FROM tasks 
             WHERE work_day_id = ? ORDER BY created_at`,
            [workDay.id]
          ) as any[]
          tasks = tasks.map((t: any) => ({
            id: null,
            task_uid: null,
            attachments: null,
            description: t.description,
            assigned_by: t.assigned_by || '',
            start_time: t.start_time || null,
            end_time: t.end_time || null,
            status: t.status || 'do zrobienia',
            completed: false
          }))
        } catch (innerError: any) {
          try {
            const tasksDescriptionOnly = await query(
              `SELECT description FROM tasks 
               WHERE work_day_id = ? ORDER BY created_at`,
              [workDay.id]
            ) as any[]
            tasks = tasksDescriptionOnly.map((t: any) => ({
              id: null,
              task_uid: null,
              attachments: null,
              description: t.description,
              assigned_by: '',
              start_time: null,
              end_time: null,
              status: 'do zrobienia',
              completed: false
            }))
          } catch (finalError) {
            tasks = []
          }
        }
      }

      for (const t of tasks) {
        if (!t.task_uid || t.task_uid === '') {
          const generated = generateTaskIdInDb(existingTaskUids)
          existingTaskUids.add(generated)
          if (t.id) {
            try {
              await query(`UPDATE tasks SET task_uid = ?, attachments = COALESCE(attachments, '[]') WHERE id = ?`, [generated, t.id])
            } catch (_) {
              await query(`UPDATE tasks SET task_uid = ? WHERE id = ?`, [generated, t.id])
            }
          }
          t.task_uid = generated
        }
      }

      console.log(`[getMonthData] Work day ${workDay.id} (${dateKey}) has ${tasks.length} tasks`)

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
        
        // Normalizuj assigned_by - może być string (stary format) lub JSON array (nowy format)
        let assignedBy: string[] = []
        if (t.assigned_by) {
          try {
            // Spróbuj sparsować jako JSON
            const parsed = JSON.parse(t.assigned_by)
            if (Array.isArray(parsed)) {
              assignedBy = parsed
            } else if (typeof parsed === 'string' && parsed.trim()) {
              assignedBy = [parsed]
            }
          } catch {
            // Jeśli nie jest JSON, traktuj jako string
            if (typeof t.assigned_by === 'string' && t.assigned_by.trim()) {
              assignedBy = [t.assigned_by]
            }
          }
        }
        
        let attachments: string[] = []
        if (t.attachments) {
          if (Array.isArray(t.attachments)) attachments = t.attachments
          else if (typeof t.attachments === 'string') {
            try {
              const parsed = JSON.parse(t.attachments)
              if (Array.isArray(parsed)) attachments = parsed
            } catch (_) {}
          }
        }
        return {
          id: String(t.task_uid || ''),
          text: t.description || '',
          assignedBy: assignedBy,
          startTime,
          endTime,
          status: status,
          completed: t.completed === 1 || t.completed === true || false,
          attachments
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

    console.log(`[getMonthData] Returning ${Object.keys(result).length} days with data`)
    return result
  } catch (error: any) {
    console.error('[getMonthData] Error loading data from MySQL:', error)
    console.error('[getMonthData] Error details:', {
      userId,
      clientId,
      monthKey,
      errorMessage: error.message,
      errorStack: error.stack
    })
    return {}
  }
}

// Funkcja pomocnicza do sprawdzania i dodawania kolumny status jeśli nie istnieje
async function ensureStatusColumnExists(): Promise<void> {
  try {
    const [columns]: any[] = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'tasks' 
       AND COLUMN_NAME = 'status'`
    ) as any[]
    if (!columns || columns.length === 0) {
      await query(
        `ALTER TABLE tasks ADD COLUMN status VARCHAR(50) DEFAULT 'do zrobienia' AFTER assigned_by`
      )
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
    if (error.code !== 'ER_NO_SUCH_TABLE' && !error.message?.includes("doesn't exist")) {
      console.error('Error checking/adding status column:', error)
    }
  }
}

// Dodaj task_uid i attachments jeśli nie istnieją
async function ensureTaskUidAndAttachmentsColumnsExist(): Promise<void> {
  try {
    const [cols]: any[] = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' 
       AND COLUMN_NAME IN ('task_uid', 'attachments')`
    ) as any[]
    const names = (cols || []).map((c: any) => c.COLUMN_NAME)
    if (!names.includes('task_uid')) {
      await query(`ALTER TABLE tasks ADD COLUMN task_uid VARCHAR(12) NULL AFTER id`)
      console.log('Column task_uid added to tasks table')
    }
    if (!names.includes('attachments')) {
      await query(`ALTER TABLE tasks ADD COLUMN attachments JSON NULL AFTER status`)
      console.log('Column attachments added to tasks table')
    }
  } catch (error: any) {
    if (error.code !== 'ER_NO_SUCH_TABLE' && !error.message?.includes("doesn't exist")) {
      console.error('Error ensuring task_uid/attachments columns:', error)
    }
  }
}

function generateTaskIdInDb(existingIds: Set<string>): string {
  const min = 100000
  const max = 999999
  let id: string
  let attempts = 0
  do {
    id = (Math.floor(Math.random() * (max - min + 1)) + min).toString()
    attempts++
    if (attempts > 500) {
      id = (Date.now() % 900000 + 100000).toString()
      while (existingIds.has(id)) id = (parseInt(id, 10) + 1).toString()
      break
    }
  } while (existingIds.has(id))
  return id
}

// Zapisz dane dla miesiąca
export async function saveMonthData(userId: number, monthKey: string, daysData: Record<string, DayData>, clientId: number): Promise<void> {
  if (!isMySQLAvailable()) {
    throw new Error('MySQL not available')
  }

  await ensureStatusColumnExists()
  await ensureTaskUidAndAttachmentsColumnsExist()

  try {
    for (const [dateKey, dayData] of Object.entries(daysData)) {
      // dateKey jest już w formacie yyyy-MM-dd, nie trzeba konwertować przez new Date()
      // (unika problemów ze strefami czasowymi)

      // Sprawdź czy dzień pracy istnieje, jeśli nie - utwórz
      let workDayResult = await query(
        `SELECT id FROM work_days WHERE user_id = ? AND client_id = ? AND date = ?`,
        [userId, clientId, dateKey]
      ) as any[]

      let workDayId: number

      if (workDayResult.length === 0) {
        const insertResult = await query(
          `INSERT INTO work_days (user_id, client_id, date) VALUES (?, ?, ?)`,
          [userId, clientId, dateKey]
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
            const taskUid = (taskData as any).id || ''
            const attachmentsJson = JSON.stringify(Array.isArray((taskData as any).attachments) ? (taskData as any).attachments : [])
            try {
            const taskStatus = taskData.status || (taskData.completed ? 'wykonano' : 'do zrobienia')
            const assignedByJson = Array.isArray(taskData.assignedBy) && taskData.assignedBy.length > 0
              ? JSON.stringify(taskData.assignedBy)
              : ''
            await query(
              `INSERT INTO tasks (work_day_id, task_uid, description, assigned_by, start_time, end_time, status, completed, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [workDayId, taskUid, taskData.text, assignedByJson, taskData.startTime || '08:00', taskData.endTime || '16:00', taskStatus, taskData.completed ? 1 : 0, attachmentsJson]
            )
          } catch (error: any) {
            if (error.code === 'ER_BAD_FIELD_ERROR' && (error.message?.includes('task_uid') || error.message?.includes('attachments'))) {
              try {
                const taskStatus = taskData.status || (taskData.completed ? 'wykonano' : 'do zrobienia')
                const assignedByJson = Array.isArray(taskData.assignedBy) && taskData.assignedBy.length > 0 ? JSON.stringify(taskData.assignedBy) : ''
                await query(
                  `INSERT INTO tasks (work_day_id, description, assigned_by, start_time, end_time, status, completed) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [workDayId, taskData.text, assignedByJson, taskData.startTime || '08:00', taskData.endTime || '16:00', taskStatus, taskData.completed ? 1 : 0]
                )
              } catch (_) { throw error }
            } else if (error.code === 'ER_BAD_FIELD_ERROR' && error.message?.includes('status')) {
              try {
                const taskStatus = taskData.status || (taskData.completed ? 'wykonano' : 'do zrobienia')
                const assignedByJson = Array.isArray(taskData.assignedBy) && taskData.assignedBy.length > 0
                  ? JSON.stringify(taskData.assignedBy)
                  : ''
                await query(
                  `INSERT INTO tasks (work_day_id, description, assigned_by, start_time, end_time, completed) VALUES (?, ?, ?, ?, ?, ?)`,
                  [workDayId, taskData.text, assignedByJson, taskData.startTime || '08:00', taskData.endTime || '16:00', taskStatus === 'wykonano' ? 1 : 0]
                )
              } catch (innerError: any) {
                // Jeśli kolumny start_time/end_time nie istnieją, spróbuj z assigned_by
                if (innerError.code === 'ER_BAD_FIELD_ERROR' && (innerError.message?.includes('start_time') || innerError.message?.includes('end_time'))) {
                  try {
                    const assignedByJson = Array.isArray(taskData.assignedBy) && taskData.assignedBy.length > 0
                      ? JSON.stringify(taskData.assignedBy)
                      : ''
                    await query(
                      `INSERT INTO tasks (work_day_id, description, assigned_by, completed) VALUES (?, ?, ?, ?)`,
                      [workDayId, taskData.text, assignedByJson, taskData.status === 'wykonano' ? 1 : 0]
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
                const assignedByJson = Array.isArray(taskData.assignedBy) && taskData.assignedBy.length > 0
                  ? JSON.stringify(taskData.assignedBy)
                  : ''
                await query(
                  `INSERT INTO tasks (work_day_id, description, assigned_by, status) VALUES (?, ?, ?, ?)`,
                  [workDayId, taskData.text, assignedByJson, taskStatus]
                )
              } catch (innerError: any) {
                // Jeśli status też nie istnieje, spróbuj z completed
                if (innerError.code === 'ER_BAD_FIELD_ERROR' && innerError.message?.includes('status')) {
                  try {
                    const assignedByJson = Array.isArray(taskData.assignedBy) && taskData.assignedBy.length > 0
                      ? JSON.stringify(taskData.assignedBy)
                      : ''
                    await query(
                      `INSERT INTO tasks (work_day_id, description, assigned_by, completed) VALUES (?, ?, ?, ?)`,
                      [workDayId, taskData.text, assignedByJson, taskData.completed ? 1 : 0]
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
