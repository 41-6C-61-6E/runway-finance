/**
 * Shared server-side password policy.
 *
 * SECURITY (M-2, 2026-08-27 security review): previously there was no
 * server-side policy — registration accepted any non-empty password and the
 * change-password action only enforced 4 characters. Every server path that
 * sets or changes a password MUST validate through `checkPasswordPolicy`.
 */

export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordPolicyResult {
  ok: boolean;
  message?: string;
}

/**
 * Minimum policy for user passwords:
 *  - at least 12 characters
 *  - at least 2 of the 3 common classes (lowercase, uppercase, digit)
 *    (special characters are NOT required — PIN-style and numeric-password
 *    users must keep working)
 */
export function checkPasswordPolicy(password: string | null | undefined): PasswordPolicyResult {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (classes < 2) {
    return { ok: false, message: 'Password must contain at least two of: lowercase, uppercase, digits' };
  }
  return { ok: true };
}
