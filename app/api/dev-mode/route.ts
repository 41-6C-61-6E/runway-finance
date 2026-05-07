import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const DEV_MODE_COOKIE = 'runway_dev_mode'

async function getDevModeFromCookie(): Promise<boolean> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(DEV_MODE_COOKIE)
  return cookie?.value === 'true'
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const devMode = await getDevModeFromCookie()

  return NextResponse.json({ devMode })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { enabled } = await request.json()

  const response = NextResponse.json({ devMode: enabled })
  response.cookies.set(DEV_MODE_COOKIE, String(enabled), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })

  return response
}
