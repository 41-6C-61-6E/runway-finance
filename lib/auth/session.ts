import { auth } from "@/lib/auth";

export interface AuthenticatedUser {
  userId: string;
  dataUserId: string;
  dek?: string;
  email?: string | null;
}

export async function getAuthUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;
  const dataUserId = session.user.dataUserId || userId;
  const dek = session.user.dek;

  return {
    userId,
    dataUserId,
    dek,
    email: session.user.email,
  };
}
