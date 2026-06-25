import { auth } from '@/lib/auth';
import { sendPushNotification } from '@/lib/services/notifications';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendPushNotification(
      session.user.id,
      'Test Notification',
      'It works! This is a test notification from Runway Finance.',
      '/settings?tab=notifications'
    );

    if (!result.sent) {
      return Response.json({ success: false, reason: result.reason }, { status: 200 });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
