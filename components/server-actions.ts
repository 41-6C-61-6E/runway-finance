'use server'

import { signIn, signOut } from 'auth'

export async function handleSignIn(formData: FormData) {
  const provider = formData.get('provider')?.toString()
  await signIn(provider || undefined)
}

export async function handleSignOut() {
  await signOut({ redirectTo: '/signin' })
}
