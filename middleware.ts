import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Strony publiczne i API - nie blokuj
  if (
    pathname === '/' || 
    pathname.startsWith('/api/') || 
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/logo.png') ||
    pathname.startsWith('/avatars/') ||
    pathname.startsWith('/fonts/') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i)
  ) {
    return NextResponse.next()
  }

  // Dla strony settings - pozwól przejść, weryfikacja będzie w komponencie
  if (pathname === '/settings') {
    return NextResponse.next()
  }

  // Dla innych stron - sprawdź autentykację
  const token = request.cookies.get('auth_token')?.value
  
  if (!token) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Weryfikuj token
  try {
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production')
    return NextResponse.next()
  } catch (error: any) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}



