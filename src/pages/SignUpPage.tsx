import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function SignUpPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    const userId = data.user?.id
    if (userId) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone || null,
        account_type: 'customer',
      })

      if (profileError) {
        // Profile row may already exist from trigger — not fatal
        console.warn('Profile insert warning:', profileError.message)
      }
    }

    navigate('/request', { replace: true })
  }

  return (
    <div className="px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo-icon.png" alt="iForgotTrashDay" className="w-20 h-20 object-contain" />
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Create an account</h1>
          <p className="text-[#666666] text-sm mt-1">Get started in seconds</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="bg-red-50 border border-[#EF4444] text-[#EF4444] text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="firstName" className="text-sm font-medium text-[#1A1A1A]">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              value={form.firstName}
              onChange={update('firstName')}
              placeholder="Jane"
              required
              autoComplete="given-name"
              className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lastName" className="text-sm font-medium text-[#1A1A1A]">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              value={form.lastName}
              onChange={update('lastName')}
              placeholder="Doe"
              required
              autoComplete="family-name"
              className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-[#1A1A1A]">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={update('email')}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-[#1A1A1A]">
            Phone <span className="text-[#666666] font-normal">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={update('phone')}
            placeholder="(513) 555-0100"
            autoComplete="tel"
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
            value={form.password}
            onChange={update('password')}
            placeholder="At least 6 characters"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-[#1A1A1A]">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            placeholder="Re-enter your password"
            required
            autoComplete="new-password"
            className={`w-full border rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none bg-white ${
              form.confirmPassword && form.confirmPassword !== form.password
                ? 'border-[#EF4444] focus:border-[#EF4444]'
                : 'border-[#E0E0E0] focus:border-[#1A73E8]'
            }`}
          />
          {form.confirmPassword && form.confirmPassword !== form.password && (
            <p className="text-xs text-[#EF4444] font-medium">Passwords do not match</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60 mt-1"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="text-center text-sm text-[#666666]">
        Already have an account?{' '}
        <Link to="/sign-in" className="text-[#1A73E8] font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
