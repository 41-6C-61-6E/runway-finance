import { vi } from 'vitest';

export interface MockSessionOptions {
  userId?: string;
  dataUserId?: string;
  revoked?: boolean;
  dek?: string;
  email?: string;
  name?: string;
}

export function makeSession(options: MockSessionOptions = {}) {
  if (options.revoked) {
    return { user: undefined };
  }
  const id = options.userId ?? 'test-user-id';
  const dataUserId = options.dataUserId ?? id;
  return {
    user: {
      id,
      name: options.name ?? id,
      email: options.email ?? `${id}@example.com`,
      dataUserId,
      dek: options.dek ?? 'a'.repeat(64),
    },
  };
}

export const unauthed = () => vi.fn().mockResolvedValue(null);
export const revokedSession = () => vi.fn().mockResolvedValue(makeSession({ revoked: true }));
export const sharedSession = (ownerId: string, memberId = 'member-user-id') =>
  vi.fn().mockResolvedValue(makeSession({ userId: memberId, dataUserId: ownerId }));
export const standardSession = (userId = 'test-user-id') =>
  vi.fn().mockResolvedValue(makeSession({ userId, dataUserId: userId }));
