import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

export async function GET(request: NextRequest) {
  try {
    const allCookies = request.cookies.getAll()
    const authCookie = request.cookies.get('auth_token')
    const token = authCookie?.value

    console.log('GET /api/auth/verify - Cookies:', {
      allCookies: allCookies.map(c => ({ name: c.name, hasValue: !!c.value })),
      authCookie: authCookie ? 'present' : 'missing',
      token: token ? `present (length: ${token.length})` : 'missing'
    })

    if (!token) {
      console.log('GET /api/auth/verify - No token found')
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production')
      console.log('GET /api/auth/verify - Token verified successfully:', { userId: (decoded as any).userId })
      return NextResponse.json({ authenticated: true })
    } catch (error: any) {
      console.error('GET /api/auth/verify - Token verification failed:', error.message)
      return NextResponse.json({ authenticated: false, error: error.message }, { status: 401 })
    }
  } catch (error: any) {
    console.error('GET /api/auth/verify - Error:', error.message)
    return NextResponse.json({ authenticated: false, error: error.message }, { status: 500 })
  }
}



