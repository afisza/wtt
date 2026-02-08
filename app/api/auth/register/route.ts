import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '@/lib/db'
import { getStorageMode } from '@/lib/dbConfig'
import { getConfigFromEnvOrFile } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email i hasło są wymagane' },
        { status: 400 }
      )
    }

    // Walidacja emaila
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Nieprawidłowy format emaila' },
        { status: 400 }
      )
    }

    // Walidacja hasła (minimum 6 znaków)
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Hasło musi mieć minimum 6 znaków' },
        { status: 400 }
      )
    }

    try {
      // Sprawdź tryb przechowywania danych
      const storageMode = getStorageMode()
      const dbConfig = getConfigFromEnvOrFile()
      const useMySQL = storageMode === 'mysql' && dbConfig !== null
      
      if (useMySQL) {
        // Sprawdź czy użytkownik już istnieje
        const existingUsers = await query(
          'SELECT id FROM users WHERE email = ?',
          [email]
        ) as any[]

        if (existingUsers.length > 0) {
          return NextResponse.json(
            { error: 'Użytkownik o tym adresie email już istnieje' },
            { status: 409 }
          )
        }

        // Hash hasła
        const hashedPassword = await bcrypt.hash(password, 10)

        // Utwórz użytkownika w MySQL
        const result = await query(
          'INSERT INTO users (email, password) VALUES (?, ?)',
          [email, hashedPassword]
        ) as any

        const userId = result.insertId

        // Utwórz token JWT
        const token = jwt.sign(
          { userId, email },
          process.env.JWT_SECRET || 'your-secret-key-change-in-production',
          { expiresIn: '7d' }
        )

        // Zapisz token w cookie przez Next.js Response
        const response = NextResponse.json({ 
          token,
          user: { id: userId, email },
          success: true
        })
        response.cookies.set('auth_token', token, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7 // 7 dni
        })
        
        return response
      } else {
        // W trybie JSON nie obsługujemy rejestracji - tylko domyślny użytkownik
        return NextResponse.json(
          { error: 'Rejestracja jest dostępna tylko w trybie MySQL. Skonfiguruj bazę danych w ustawieniach.' },
          { status: 400 }
        )
      }
    } catch (dbError: any) {
      console.error('Database error:', dbError)
      
      // Sprawdź czy błąd wynika z duplikatu emaila
      if (dbError.code === 'ER_DUP_ENTRY' || dbError.code === 1062) {
        return NextResponse.json(
          { error: 'Użytkownik o tym adresie email już istnieje' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: 'Wystąpił błąd podczas rejestracji. Sprawdź konfigurację bazy danych.' },
        { status: 500 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Wystąpił błąd podczas rejestracji' },
      { status: 500 }
    )
  }
}


