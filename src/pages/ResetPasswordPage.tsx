import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [done, setDone] = useState(false)

  // Supabase sends the user here with a recovery token in the URL.
  // The client SDK exchanges it automatically and fires PASSWORD_RECOVERY.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Also check if there's already an active session (e.g. page was refreshed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setDone(true)
    setTimeout(() => navigate('/sign-in', { replace: true }), 2500)
  }

  return (
    <div className="px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo-icon.png" alt="iForgotTrashDay" className="w-20 h-20 object-contain" />
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Set new password</h1>
          <p className="text-[#666666] text-sm mt-1">Choose something you'll remember</p>
        </div>
      </div>

      {done ? (
        <div className="bg-green-50 border border-green-300 text-green-800 text-sm px-4 py-3 rounded-lg text-center">
          Password updated! Redirecting you to sign in…
        </div>
      ) : !sessionReady ? (
        <div className="flex flex-col items-center gap-3 text-center text-[#666666] text-sm py-8">
          <div className="w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
          <p>Verifying your reset link…</p>
          <p className="text-xs text-[#999999]">
            If nothing happens, the link may have expired.{' '}
            <a href="/forgot-password" className="text-[#1A73E8] font-medium">
              Request a new one
            </a>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-red-50 border border-[#EF4444] text-[#EF4444] text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-[#1A1A1A]">
              New Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-[#1A1A1A]">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
              autoComplete="new-password"
              className={`w-full border rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none bg-white ${
                confirmPassword && confirmPassword !== password
                  ? 'border-[#EF4444] focus:border-[#EF4444]'
                  : 'border-[#E0E0E0] focus:border-[#1A73E8]'
              }`}
            />
            {confirmPassword && confirmPassword !== password && (
              <p className="text-xs text-[#EF4444] font-medium">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60 mt-1"
          >
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  )
}
