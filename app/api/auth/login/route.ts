import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email i hasło są wymagane' },
        { status: 400 }
      )
    }

    try {
      // Sprawdź czy używasz MySQL czy JSON
      const useMySQL = process.env.DB_HOST && process.env.DB_NAME
      
      if (useMySQL) {
        // Użyj MySQL
        const users = await query(
          'SELECT id, email, password FROM users WHERE email = ?',
          [email]
        ) as any[]

        if (users.length === 0) {
          return NextResponse.json(
            { error: 'Nieprawidłowy email lub hasło' },
            { status: 401 }
          )
        }

        const user = users[0]
        const isValidPassword = await bcrypt.compare(password, user.password)

        if (!isValidPassword) {
          return NextResponse.json(
            { error: 'Nieprawidłowy email lub hasło' },
            { status: 401 }
          )
        }

        const token = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET || 'your-secret-key-change-in-production',
          { expiresIn: '7d' }
        )

        return NextResponse.json({ token })
      } else {
        // Fallback do prostego sprawdzenia (dla JSON)
        if (email === 'admin@wtt.pl' && password === 'admin123') {
          const token = jwt.sign(
            { userId: 1, email },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
          )

          return NextResponse.json({ token })
        }

        return NextResponse.json(
          { error: 'Nieprawidłowy email lub hasło' },
          { status: 401 }
        )
      }
    } catch (dbError) {
      console.error('Database error:', dbError)
      // Fallback do prostego sprawdzenia jeśli baza nie działa
      if (email === 'admin@wtt.pl' && password === 'admin123') {
        const token = jwt.sign(
          { userId: 1, email },
          process.env.JWT_SECRET || 'your-secret-key-change-in-production',
          { expiresIn: '7d' }
        )

        return NextResponse.json({ token })
      }

      return NextResponse.json(
        { error: 'Nieprawidłowy email lub hasło' },
        { status: 401 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Wystąpił błąd podczas logowania' },
      { status: 500 }
    )
  }
}
