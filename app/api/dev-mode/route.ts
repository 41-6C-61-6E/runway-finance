import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { logger, setDevMode } from '@/lib/logger';
import { cookies } from 'next/headers';
import { apiNotFound, apiUnauthorized, handleApiError } from '@/lib/api/response';

const DEV_MODE_COOKIE = 'finance_dev_mode';

async function getDevModeFromCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(DEV_MODE_COOKIE);
  return cookie?.value === 'true';
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return apiNotFound('Not found');
  }

  const session = await auth();
  if (!session?.user) {
    return apiUnauthorized();
  }

  const devMode = await getDevModeFromCookie();

  return NextResponse.json({ devMode });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return apiNotFound('Not found');
  }

  const session = await auth();
  if (!session?.user) {
    return apiUnauthorized();
  }

  try {
    const { enabled } = await request.json();

    const forwardedProto = request.headers.get('x-forwarded-proto');
    const isSecure = request.url.startsWith('https://') || forwardedProto === 'https';

    logger.info('POST /api/dev-mode', { enabled });

    setDevMode(enabled);

    const response = NextResponse.json({ devMode: enabled });
    response.cookies.set(DEV_MODE_COOKIE, String(enabled), {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
