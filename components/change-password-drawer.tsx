'use client'

import { useState, useCallback, useEffect } from 'react'
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ChangePasswordDrawerProps {
  open: boolean
  onClose: () => void
}

export default function ChangePasswordDrawer({ open, onClose }: ChangePasswordDrawerProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const resetForm = useCallback(() => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setSuccess(false)
  }, [])

  useEffect(() => {
    if (!open) {
      resetForm()
    }
  }, [open, resetForm])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.set('currentPassword', currentPassword)
      formData.set('newPassword', newPassword)
      formData.set('confirmPassword', confirmPassword)

      const { handleChangePassword } = await import('@/components/server-actions')
      const result = await handleChangePassword(formData)

      if (result.success) {
        setSuccess(true)
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setError(result.error || 'Failed to change password')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px] bg-gray-950/95 border-white/10">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-white">
            <KeyRound className="h-5 w-5" />
            Change Password
          </SheetTitle>
        </SheetHeader>

        {success && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span className="text-sm text-emerald-300">Password changed successfully</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-300">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-sm text-gray-300">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
              className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-sm text-gray-300">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm text-gray-300">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              className="bg-white/10 border-white/20 text-white placeholder:text-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg border border-blue-500 shadow-md hover:shadow-lg transition-all duration-200"
          >
            {loading ? 'Updating...' : 'Change Password'}
          </button>
        </form>

        <SheetClose asChild>
          <button className="mt-4 w-full text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  )
}
