import { auth } from "@/lib/auth";

export interface AuthenticatedUser {
  userId: string;
  email?: string | null;
}

export async function getAuthUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  return {
    userId: session.user.id,
    email: session.user.email,
  };
}
