import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { query, getConfigFromEnvOrFile } from '@/lib/db'

function getUserId(request: NextRequest): number | null {
  const token = request.cookies.get('auth_token')?.value
  if (!token) return null
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: number }
    return decoded.userId
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { clientId } = body

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }

    // Sprawdź czy MySQL jest dostępne
    const config = getConfigFromEnvOrFile()
    if (!config) {
      return NextResponse.json({ error: 'MySQL configuration not found' }, { status: 500 })
    }

    // Pobierz wszystkie work_days z grudnia 2025 dla danego klienta
    const workDays = await query(
      `SELECT id, date, user_id, client_id 
       FROM work_days 
       WHERE user_id = ? 
       AND client_id = ? 
       AND date >= '2025-12-01' 
       AND date <= '2025-12-31'
       ORDER BY date ASC`,
      [userId, clientId]
    ) as any[]

    if (!workDays || workDays.length === 0) {
      return NextResponse.json({ 
        message: 'No work days found for December 2025',
        updated: 0 
      })
    }

    console.log(`[FIX DECEMBER] Found ${workDays.length} work days to update`)

    let updatedCount = 0
    const errors: string[] = []

    // Przesuń każdy dzień o 2 dni do przodu
    for (const workDay of workDays) {
      // Parsuj datę jako lokalną (unika problemów ze strefami czasowymi)
      const dateStr = workDay.date.toString()
      const [year, month, day] = dateStr.split('-').map(Number)
      const oldDate = new Date(year, month - 1, day) // month jest 0-indexed
      const newDate = new Date(oldDate)
      newDate.setDate(newDate.getDate() + 2)
      
      // Użyj lokalnej daty zamiast UTC, aby uniknąć przesunięcia
      const newYear = newDate.getFullYear()
      const newMonth = String(newDate.getMonth() + 1).padStart(2, '0')
      const newDay = String(newDate.getDate()).padStart(2, '0')
      const newDateStr = `${newYear}-${newMonth}-${newDay}` // Format: YYYY-MM-DD
      
      // Sprawdź czy nowa data nie przekracza grudnia (dla dni 30 i 31)
      if (newDate.getMonth() !== 11 || newDate.getFullYear() !== 2025) { // 11 = grudzień (0-indexed)
        console.warn(`[FIX DECEMBER] Skipping ${workDay.date} -> ${newDateStr} (out of December 2025 range)`)
        errors.push(`Date ${workDay.date} would move to ${newDateStr} (outside December 2025)`)
        continue
      }

      try {
        // Sprawdź czy już istnieje work_day z nową datą
        const existing = await query(
          `SELECT id FROM work_days 
           WHERE user_id = ? 
           AND client_id = ? 
           AND date = ?`,
          [userId, clientId, newDateStr]
        ) as any[]

        if (existing && existing.length > 0) {
          // Jeśli istnieje, przenieś zadania i time_slots do istniejącego work_day
          const existingWorkDayId = existing[0].id
          
          // Przenieś zadania
          await query(
            `UPDATE tasks SET work_day_id = ? WHERE work_day_id = ?`,
            [existingWorkDayId, workDay.id]
          )
          
          // Przenieś time_slots
          await query(
            `UPDATE time_slots SET work_day_id = ? WHERE work_day_id = ?`,
            [existingWorkDayId, workDay.id]
          )
          
          // Usuń stary work_day
          await query(
            `DELETE FROM work_days WHERE id = ?`,
            [workDay.id]
          )
          
          console.log(`[FIX DECEMBER] Merged ${workDay.date} -> ${newDateStr} (existing work_day)`)
        } else {
          // Zaktualizuj datę work_day
          await query(
            `UPDATE work_days SET date = ? WHERE id = ?`,
            [newDateStr, workDay.id]
          )
          
          console.log(`[FIX DECEMBER] Updated ${workDay.date} -> ${newDateStr}`)
        }
        
        updatedCount++
      } catch (error: any) {
        console.error(`[FIX DECEMBER] Error updating ${workDay.date}:`, error)
        errors.push(`Error updating ${workDay.date}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} work days`,
      updated: updatedCount,
      total: workDays.length,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    console.error('[FIX DECEMBER] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

