import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Trash2 } from 'lucide-react'

export default function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/request'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <div className="px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 bg-[#1A73E8] rounded-2xl flex items-center justify-center">
          <Trash2 size={28} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Welcome back</h1>
          <p className="text-[#666666] text-sm mt-1">Sign in to your account</p>
        </div>
      </div>

      {/* Form */}
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
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-[#1A1A1A]">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60 mt-1"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="text-center text-sm text-[#666666]">
        Don't have an account?{' '}
        <Link to="/sign-up" className="text-[#1A73E8] font-medium">
          Sign up
        </Link>
      </p>
    </div>
  )
}
