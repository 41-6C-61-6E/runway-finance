import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { subscription, userAgent } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return Response.json({ error: 'Invalid subscription payload' }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, session.user.id),
          eq(pushSubscriptions.endpoint, subscription.endpoint)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(pushSubscriptions)
        .set({
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
          userAgent: userAgent || null,
        })
        .where(eq(pushSubscriptions.id, existing.id));
    } else {
      await db.insert(pushSubscriptions).values({
        userId: session.user.id,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        userAgent: userAgent || null,
      });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { endpoint } = await request.json();
    if (!endpoint) {
      return Response.json({ error: 'Endpoint is required' }, { status: 400 });
    }

    const db = getDb();
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, session.user.id),
          eq(pushSubscriptions.endpoint, endpoint)
        )
      );

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cleanEnv = (val?: string) => {
    if (!val) return null;
    const trimmed = val.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };

  return Response.json({
    publicKey: cleanEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  });
}
