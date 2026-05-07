import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getLogs, clearLogs, patchConsole } from '@/lib/dev-logs'

const DEV_MODE_COOKIE = 'runway_dev_mode'

async function isDevMode(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get(DEV_MODE_COOKIE)?.value === 'true'
}

export async function GET(request: Request) {
  // Only available in dev mode
  if (!(await isDevMode())) {
    return NextResponse.json({ error: 'dev_mode_not_enabled' }, { status: 501 })
  }

  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level') as 'info' | 'warn' | 'error' | 'debug' | null
  const limit = parseInt(searchParams.get('limit') || '100', 10)
  const afterId = searchParams.get('afterId') || undefined

  const logs = getLogs({ level: level || undefined, limit, afterId })

  return NextResponse.json({ logs })
}

export async function DELETE() {
  if (!(await isDevMode())) {
    return NextResponse.json({ error: 'dev_mode_not_enabled' }, { status: 501 })
  }

  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  clearLogs()
  return new Response(null, { status: 204 })
}

// Patch console on every request in dev mode
patchConsole()
