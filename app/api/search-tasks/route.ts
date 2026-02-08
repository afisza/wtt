import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { query } from '@/lib/db'
import { getStorageMode } from '@/lib/dbConfig'
import { getMonthDataJSON } from '@/lib/workTimeJson'
import fs from 'fs'
import path from 'path'

function getUserId(request: NextRequest): number | null {
  const token = request.cookies.get('auth_token')?.value
  
  console.log('[SEARCH] getUserId - Token from cookies:', token ? `present (length: ${token.length})` : 'missing')
  console.log('[SEARCH] getUserId - All cookies:', request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })))
  
  if (!token) {
    console.log('[SEARCH] getUserId - No token found')
    return null
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as { userId: number }
    console.log('[SEARCH] getUserId - Token verified, userId:', decoded.userId)
    return decoded.userId
  } catch (error: any) {
    console.error('[SEARCH] getUserId - Token verification failed:', error.message)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    // Debug: sprawdź czy cookies są przekazywane
    const allCookies = request.cookies.getAll()
    const authToken = request.cookies.get('auth_token')
    console.log('[SEARCH] GET /api/search-tasks - Cookies:', {
      allCookies: allCookies.map(c => ({ name: c.name, hasValue: !!c.value })),
      authToken: authToken ? 'present' : 'missing',
      authTokenValue: authToken?.value ? `has value (length: ${authToken.value.length})` : 'no value'
    })
    
    const userId = getUserId(request)
    console.log('[SEARCH] GET /api/search-tasks - userId:', userId)
    
    if (!userId) {
      console.log('[SEARCH] GET /api/search-tasks - Unauthorized, returning 401')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const queryText = searchParams.get('q') || ''
    const clientId = searchParams.get('clientId')

    if (!queryText.trim()) {
      return NextResponse.json({ results: [] })
    }

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    const storageMode = getStorageMode()
    const results: Array<{
      date: string
      task: {
        id?: string
        text: string
        assignedBy: string[]
        startTime: string
        endTime: string
        status: string
        attachments?: string[]
      }
    }> = []

    if (storageMode === 'mysql') {
      // Wyszukiwanie w MySQL
      try {
        const searchPattern = `%${queryText}%`
        
        console.log(`[SEARCH] Searching MySQL: userId=${userId}, clientId=${clientId}, query="${queryText}"`)
        
        // Wyszukaj zadania w bazie danych
        // assigned_by może być JSON array lub zwykłym stringiem
        // Używamy LIKE dla obu przypadków - dla JSON array szukamy w całym stringu JSON
        let tasks: any[]
        try {
          tasks = await query(
            `SELECT 
              t.id,
              t.task_uid,
              t.description,
              t.assigned_by,
              t.attachments,
              COALESCE(t.start_time, '08:00:00') as start_time,
              COALESCE(t.end_time, '16:00:00') as end_time,
              COALESCE(t.status, 'do zrobienia') as status,
              wd.date,
              wd.user_id,
              wd.client_id
            FROM tasks t
          INNER JOIN work_days wd ON t.work_day_id = wd.id
          WHERE wd.user_id = ? 
            AND wd.client_id = ?
            AND (
              t.description LIKE ? 
              OR t.assigned_by LIKE ?
            )
          ORDER BY wd.date DESC, COALESCE(t.start_time, '08:00:00') ASC
          LIMIT 100`,
          [userId, clientId, searchPattern, searchPattern]
        ) as any[]
        } catch (e: any) {
          if (e?.code === 'ER_BAD_FIELD_ERROR') {
            tasks = await query(
              `SELECT 
                t.id,
                t.description,
                t.assigned_by,
                COALESCE(t.start_time, '08:00:00') as start_time,
                COALESCE(t.end_time, '16:00:00') as end_time,
                COALESCE(t.status, 'do zrobienia') as status,
                wd.date,
                wd.user_id,
                wd.client_id
              FROM tasks t
              INNER JOIN work_days wd ON t.work_day_id = wd.id
              WHERE wd.user_id = ? AND wd.client_id = ?
              AND (t.description LIKE ? OR t.assigned_by LIKE ?)
              ORDER BY wd.date DESC, COALESCE(t.start_time, '08:00:00') ASC
              LIMIT 100`,
              [userId, clientId, searchPattern, searchPattern]
            ) as any[]
            tasks = tasks.map((t: any) => ({ ...t, task_uid: null, attachments: null }))
          } else {
            throw e
          }
        }

        console.log(`[SEARCH] Found ${tasks.length} tasks from MySQL`)

        for (const task of tasks) {
          // Parsuj assigned_by (może być JSON array lub string)
          let assignedBy: string[] = []
          if (task.assigned_by) {
            const assignedByStr = String(task.assigned_by).trim()
            if (assignedByStr) {
              // Sprawdź czy to JSON array
              if (assignedByStr.startsWith('[') && assignedByStr.endsWith(']')) {
                try {
                  const parsed = JSON.parse(assignedByStr)
                  if (Array.isArray(parsed)) {
                    assignedBy = parsed
                      .filter((item: any) => item !== null && item !== undefined)
                      .map((item: any) => String(item))
                      .filter((item: string) => item.trim().length > 0)
                  } else if (typeof parsed === 'string' && parsed.trim()) {
                    assignedBy = [parsed.trim()]
                  }
                } catch (e) {
                  // Jeśli parsowanie JSON się nie powiodło, traktuj jako zwykły string
                  assignedBy = [assignedByStr]
                }
              } else {
                // To zwykły string
                assignedBy = [assignedByStr]
              }
            }
          }
          
          // Sprawdź czy zadanie pasuje do zapytania (dodatkowe filtrowanie po stronie serwera)
          // ponieważ LIKE może znaleźć zadanie przez JSON string, ale chcemy pokazać tylko jeśli
          // rzeczywiście pasuje do tekstu zadania lub do jednej z osób z assignedBy
          const taskText = String(task.description || '').toLowerCase()
          const assignedByStr = assignedBy.join(' ').toLowerCase()
          const queryLower = queryText.toLowerCase()
          
          // Sprawdź czy pasuje do tekstu zadania lub do osób zlecających
          const matchesText = taskText.includes(queryLower)
          const matchesAssignedBy = assignedByStr.includes(queryLower)
          
          if (!matchesText && !matchesAssignedBy) {
            // Jeśli nie pasuje, sprawdź czy może pasuje przez JSON string w assigned_by
            const assignedByRaw = String(task.assigned_by || '').toLowerCase()
            if (!assignedByRaw.includes(queryLower)) {
              continue // Pomiń to zadanie, nie pasuje do zapytania
            }
          }

          // Formatuj czas
          const startTime = task.start_time ? String(task.start_time).substring(0, 5) : '08:00'
          const endTime = task.end_time ? String(task.end_time).substring(0, 5) : '16:00'

          // Formatuj datę (użyj lokalnej daty)
          let dateKey: string
          if (task.date instanceof Date) {
            const year = task.date.getFullYear()
            const month = String(task.date.getMonth() + 1).padStart(2, '0')
            const day = String(task.date.getDate()).padStart(2, '0')
            dateKey = `${year}-${month}-${day}`
          } else {
            const dateStr = task.date.toString()
            dateKey = dateStr.substring(0, 10)
          }

          let attachments: string[] = []
          if (task.attachments) {
            try {
              const a = typeof task.attachments === 'string' ? JSON.parse(task.attachments) : task.attachments
              if (Array.isArray(a)) attachments = a
            } catch (_) {}
          }
          results.push({
            date: dateKey,
            task: {
              id: task.task_uid ? String(task.task_uid) : String(task.id ?? ''),
              text: task.description || '',
              assignedBy: assignedBy,
              startTime: startTime,
              endTime: endTime,
              status: task.status || 'do zrobienia',
              attachments
            }
          })
        }
        
        console.log(`[SEARCH] Returning ${results.length} results from MySQL`)
      } catch (error: any) {
        console.error('[SEARCH] MySQL search error:', error)
        return NextResponse.json(
          { error: 'Search error', details: error.message },
          { status: 500 }
        )
      }
    } else {
      // Wyszukiwanie w JSON
      try {
        console.log(`[SEARCH] Searching JSON: userId=${userId}, clientId=${clientId}, query="${queryText}"`)
        
        const workTimeFile = path.join(process.cwd(), 'data', 'work-time.json')
        if (!fs.existsSync(workTimeFile)) {
          console.log('[SEARCH] work-time.json file not found')
          return NextResponse.json({ results: [] })
        }

        const workTimeData = JSON.parse(fs.readFileSync(workTimeFile, 'utf-8'))
        const userData = workTimeData[String(userId)]
        if (!userData) {
          console.log(`[SEARCH] No data for userId=${userId}`)
          return NextResponse.json({ results: [] })
        }

        const clientData = userData[String(clientId)]
        if (!clientData) {
          console.log(`[SEARCH] No data for clientId=${clientId}`)
          return NextResponse.json({ results: [] })
        }

        // Przeszukaj wszystkie miesiące
        const queryLower = queryText.toLowerCase().trim()
        for (const [monthKey, monthData] of Object.entries(clientData)) {
          if (!monthData || typeof monthData !== 'object') continue
          // Pomijamy klucze, które nie są w formacie YYYY-MM
          if (!/^\d{4}-\d{2}$/.test(monthKey)) continue

          for (const [dateKey, dayData] of Object.entries(monthData as Record<string, unknown>)) {
            if (!dayData || typeof dayData !== 'object') continue
            type JsonTask = { text?: string; assignedBy?: unknown; startTime?: string; endTime?: string; status?: string }
            const day = dayData as { tasks?: JsonTask[] }
            // Pomijamy klucze, które nie są w formacie YYYY-MM-DD
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue
            if (!day.tasks || !Array.isArray(day.tasks)) continue

            for (const task of day.tasks) {
              const taskText = String(task.text || '').toLowerCase()
              const assignedByArray = Array.isArray(task.assignedBy) 
                ? task.assignedBy 
                : (task.assignedBy ? [task.assignedBy] : [])
              const assignedByStr = assignedByArray
                .filter(Boolean)
                .map((item: any) => String(item).toLowerCase())
                .join(' ')

              // Sprawdź czy tekst zadania lub osoby zlecające zawierają zapytanie
              if (
                taskText.includes(queryLower) ||
                assignedByStr.includes(queryLower)
              ) {
                results.push({
                  date: dateKey,
                  task: {
                    text: task.text || '',
                    assignedBy: assignedByArray.filter(Boolean).map((item: any) => String(item)),
                    startTime: task.startTime || '08:00',
                    endTime: task.endTime || '16:00',
                    status: task.status || 'do zrobienia'
                  }
                })
              }
            }
          }
        }
        
        console.log(`[SEARCH] Returning ${results.length} results from JSON`)
      } catch (error: any) {
        console.error('[SEARCH] JSON search error:', error)
        console.error('[SEARCH] Error details:', {
          message: error.message,
          stack: error.stack
        })
        return NextResponse.json(
          { error: 'Search error', details: error.message },
          { status: 500 }
        )
      }
    }

    console.log(`[SEARCH] Total results: ${results.length}`)
    return NextResponse.json({ results })

  } catch (error: any) {
    console.error('[SEARCH] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
