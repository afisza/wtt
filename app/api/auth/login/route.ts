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

    try {
      // Sprawdź tryb przechowywania danych
      const storageMode = getStorageMode()
      const dbConfig = getConfigFromEnvOrFile()
      const useMySQL = storageMode === 'mysql' && dbConfig !== null
      
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

        // Zapisz token w cookie przez Next.js Response
        const response = NextResponse.json({ token, success: true })
        response.cookies.set('auth_token', token, {
          httpOnly: false, // Musi być false, aby js-cookie mógł odczytać
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7, // 7 dni
          domain: undefined // Nie ustawiaj domain, aby działało na localhost
        })
        
        console.log('Login API - Cookie set in response:', token ? 'yes' : 'no')
        return response
      } else {
        // Fallback do prostego sprawdzenia (dla JSON)
        if (email === 'admin@wtt.pl' && password === 'admin123') {
          const token = jwt.sign(
            { userId: 1, email },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
          )

          // Zapisz token w cookie przez Next.js Response
          const response = NextResponse.json({ token, success: true })
          response.cookies.set('auth_token', token, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 7 dni
          })
          
          return response
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

        // Zapisz token w cookie przez Next.js Response
        const response = NextResponse.json({ token, success: true })
        response.cookies.set('auth_token', token, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7 // 7 dni
        })
        
        return response
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
