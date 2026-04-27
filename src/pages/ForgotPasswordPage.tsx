import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSent(true)
  }

  return (
    <div className="px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo-icon.png" alt="iForgotTrashDay" className="w-20 h-20 object-contain" />
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Reset your password</h1>
          <p className="text-[#666666] text-sm mt-1">
            {sent ? 'Check your email for a reset link' : "We'll send you a link to reset it"}
          </p>
        </div>
      </div>

      {sent ? (
        <div className="flex flex-col gap-4">
          <div className="bg-green-50 border border-green-300 text-green-800 text-sm px-4 py-3 rounded-lg text-center">
            Email sent to <span className="font-semibold">{email}</span>. Check your inbox and
            click the link to set a new password.
          </div>
          <p className="text-center text-sm text-[#666666]">
            Didn't get it? Check your spam folder or{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-[#1A73E8] font-medium"
            >
              try again
            </button>
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
            <label htmlFor="email" className="text-sm font-medium text-[#1A1A1A]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60 mt-1"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-[#666666]">
        Remember it?{' '}
        <Link to="/sign-in" className="text-[#1A73E8] font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
