import { auth } from "@/lib/auth";

export interface AuthenticatedUser {
  userId: string;
  dataUserId: string;
  email?: string | null;
}

export async function getAuthUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId || userId;

  return {
    userId,
    dataUserId,
    email: session.user.email,
  };
}
