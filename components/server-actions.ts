'use server'

import { signIn, signOut } from 'auth'
import { updatePassword } from '@/lib/users'

export async function handleSignIn(formData: FormData) {
  const provider = formData.get('provider')?.toString()
  await signIn(provider || undefined)
}

export async function handleSignOut() {
  await signOut({ redirectTo: '/signin' })
}

export async function handleChangePassword(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const currentPassword = formData.get('currentPassword')?.toString()
  const newPassword = formData.get('newPassword')?.toString()
  const confirmPassword = formData.get('confirmPassword')?.toString()

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, error: 'All fields are required' }
  }

  if (newPassword.length < 4) {
    return { success: false, error: 'New password must be at least 4 characters' }
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: 'New passwords do not match' }
  }

  if (newPassword === currentPassword) {
    return { success: false, error: 'New password must differ from current password' }
  }

  // Get username from session
  const { auth } = await import('auth')
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'Not authenticated' }
  }

  const result = await updatePassword(session.user.id, currentPassword, newPassword)
  return result
}
