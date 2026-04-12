import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Save, Copy, Check, ChevronRight, Lock, Eye, EyeOff } from 'lucide-react'

interface Profile {
  first_name: string
  last_name: string
  phone: string
  home_address: string
  city: string
  county: string
  state: string
  zip: string
  wants_deals: boolean
  wants_sms: boolean
  points_balance: number
  referral_code: string
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [form, setForm] = useState<Profile>({
    first_name: '',
    last_name: '',
    phone: '',
    home_address: '',
    city: '',
    county: '',
    state: '',
    zip: '',
    wants_deals: true,
    wants_sms: true,
    points_balance: 0,
    referral_code: '',
  })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')
  const [copied, setCopied]     = useState(false)

  // Change password state
  const [showPwForm, setShowPwForm]   = useState(false)
  const [newPw, setNewPw]             = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [showNewPw, setShowNewPw]     = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [pwSaving, setPwSaving]       = useState(false)
  const [pwError, setPwError]         = useState('')
  const [pwSuccess, setPwSuccess]     = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('first_name, last_name, phone, home_address, city, county, state, zip, wants_deals, wants_sms, points_balance, referral_code')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setForm({
            first_name: data.first_name ?? '',
            last_name: data.last_name ?? '',
            phone: data.phone ?? '',
            home_address: data.home_address ?? '',
            city: data.city ?? '',
            county: data.county ?? '',
            state: data.state ?? '',
            zip: data.zip ?? '',
            wants_deals: data.wants_deals ?? true,
            wants_sms: data.wants_sms ?? true,
            points_balance: data.points_balance ?? 0,
            referral_code: data.referral_code ?? '',
          })
        }
        setLoading(false)
      })
  }, [user])

  const update = (field: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const toggle = (field: keyof Profile) => () =>
    setForm((prev) => ({ ...prev, [field]: !prev[field] }))

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError('')
    setSuccess(false)
    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || null,
        home_address: form.home_address || null,
        city: form.city || null,
        county: form.county || null,
        state: form.state || null,
        zip: form.zip || null,
        wants_deals: form.wants_deals,
        wants_sms: form.wants_sms,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
    setSaving(false)
  }

  const copyReferralCode = () => {
    if (!form.referral_code) return
    navigator.clipboard.writeText(form.referral_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handlePasswordChange = async () => {
    setPwError('')
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      setPwError(error.message)
    } else {
      setPwSuccess(true)
      setNewPw('')
      setConfirmPw('')
      setShowPwForm(false)
      setTimeout(() => setPwSuccess(false), 4000)
    }
    setPwSaving(false)
  }

  const initials = [form.first_name[0], form.last_name[0]].filter(Boolean).join('').toUpperCase() || '?'
  const displayName = [form.first_name, form.last_name].filter(Boolean).join(' ') || (user?.email ?? '')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Avatar header */}
      <div className="bg-[#1A73E8] px-4 py-6 flex flex-col items-center gap-2">
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
          <span className="text-white text-2xl font-bold">{initials}</span>
        </div>
        <p className="text-white font-semibold text-lg">{displayName}</p>
        <p className="text-white/70 text-sm">{user?.email}</p>
      </div>

      {/* Rewards banner */}
      {(form.points_balance > 0 || form.referral_code) && (
        <Link to="/rewards" className="block">
          <div className="bg-[#EBF3FD] border-b border-[#E0E0E0] px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-[#1A73E8] text-2xl font-bold">{form.points_balance} pts</p>
              <p className="text-[#666666] text-xs mt-0.5">Earn 25 pts per referral · 100 pts = 1 free item</p>
            </div>
            <div className="flex items-center gap-2">
              {form.referral_code && (
                <button
                  onClick={(e) => { e.preventDefault(); copyReferralCode() }}
                  className="flex items-center gap-1.5 bg-white border border-[#1A73E8] text-[#1A73E8] text-sm font-semibold px-3 py-2 rounded-xl"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {form.referral_code}
                </button>
              )}
              <ChevronRight size={18} className="text-[#1A73E8] shrink-0" />
            </div>
          </div>
        </Link>
      )}

      <form onSubmit={handleSave} className="px-4 py-6 flex flex-col gap-4">
        {error && (
          <div className="bg-red-50 border border-[#EF4444] text-[#EF4444] text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-[#22C55E] text-[#22C55E] text-sm px-4 py-3 rounded-lg">
            Profile saved successfully.
          </div>
        )}

        {/* Name */}
        <div>
          <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider mb-2">Name</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="firstName" className="text-sm font-medium text-[#1A1A1A]">First</label>
              <input
                id="firstName"
                type="text"
                value={form.first_name}
                onChange={update('first_name')}
                className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lastName" className="text-sm font-medium text-[#1A1A1A]">Last</label>
              <input
                id="lastName"
                type="text"
                value={form.last_name}
                onChange={update('last_name')}
                className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
              />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider mb-2">Contact</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Email</label>
              <input
                type="email"
                value={user?.email ?? ''}
                disabled
                className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#999] text-base bg-[#F5F5F5]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-sm font-medium text-[#1A1A1A]">Phone</label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={update('phone')}
                placeholder="(513) 555-0100"
                className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
              />
            </div>
          </div>
        </div>

        {/* Address */}
        <div>
          <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider mb-2">Home Address</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="homeAddress" className="text-sm font-medium text-[#1A1A1A]">Street</label>
              <input
                id="homeAddress"
                type="text"
                value={form.home_address}
                onChange={update('home_address')}
                placeholder="123 Main St"
                className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="city" className="text-sm font-medium text-[#1A1A1A]">City</label>
                <input
                  id="city"
                  type="text"
                  value={form.city}
                  onChange={update('city')}
                  placeholder="Cincinnati"
                  className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="county" className="text-sm font-medium text-[#1A1A1A]">County</label>
                <input
                  id="county"
                  type="text"
                  value={form.county}
                  onChange={update('county')}
                  placeholder="Hamilton"
                  className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="state" className="text-sm font-medium text-[#1A1A1A]">State</label>
                <input
                  id="state"
                  type="text"
                  value={form.state}
                  onChange={update('state')}
                  placeholder="OH"
                  maxLength={2}
                  className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white uppercase"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="zip" className="text-sm font-medium text-[#1A1A1A]">ZIP</label>
                <input
                  id="zip"
                  type="text"
                  value={form.zip}
                  onChange={update('zip')}
                  placeholder="45202"
                  maxLength={10}
                  className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div>
          <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider mb-2">Preferences</p>
          <div className="flex flex-col divide-y divide-[#F0F0F0] border border-[#E0E0E0] rounded-xl overflow-hidden bg-white">
            {/* Email toggle */}
            <button
              type="button"
              onClick={toggle('wants_deals')}
              className="flex items-center justify-between px-4 py-4 text-left"
            >
              <div className="flex-1 pr-4">
                <p className="text-sm font-semibold text-[#1A1A1A]">Email deals &amp; alerts</p>
                <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">
                  Receive promotions and service updates from I Forgot Trash Day, LLC.
                </p>
              </div>
              <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
                form.wants_deals ? 'bg-[#1A73E8]' : 'bg-[#D1D5DB]'
              }`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.wants_deals ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
            </button>
            {/* SMS toggle */}
            <button
              type="button"
              onClick={toggle('wants_sms')}
              className="flex items-center justify-between px-4 py-4 text-left"
            >
              <div className="flex-1 pr-4">
                <p className="text-sm font-semibold text-[#1A1A1A]">Text message (SMS) alerts</p>
                <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">
                  Marketing texts from I Forgot Trash Day, LLC. Msg &amp; data rates may apply. Reply STOP to unsubscribe.
                </p>
              </div>
              <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
                form.wants_sms ? 'bg-[#1A73E8]' : 'bg-[#D1D5DB]'
              }`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  form.wants_sms ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60 flex items-center justify-center gap-2 mt-1"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Security section — outside the profile form */}
      <div className="px-4 pb-10">
        <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider mb-2">Security</p>
        <div className="border border-[#E0E0E0] rounded-xl overflow-hidden bg-white">
          {!showPwForm ? (
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <Lock size={16} className="text-[#666666]" />
                <p className="text-sm font-medium text-[#1A1A1A]">Password</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowPwForm(true); setPwError(''); setPwSuccess(false) }}
                className="bg-[#1A73E8] text-white text-sm font-semibold px-4 py-2 rounded-lg"
              >
                Change Password
              </button>
            </div>
          ) : (
            <div className="px-4 py-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-[#1A1A1A]">Change Password</p>

              {pwError && (
                <div className="bg-red-50 border border-[#EF4444] text-[#EF4444] text-xs px-3 py-2 rounded-lg">
                  {pwError}
                </div>
              )}

              {/* New password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#666666]">New password</label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 pr-10 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#1A73E8] bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999]"
                  >
                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#666666]">Confirm new password</label>
                <div className="relative">
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full border border-[#E0E0E0] rounded-lg px-3 py-3 pr-10 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#1A73E8] bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999]"
                  >
                    {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => { setShowPwForm(false); setNewPw(''); setConfirmPw(''); setPwError('') }}
                  className="flex-1 border border-[#E0E0E0] text-[#666666] text-sm font-semibold py-3 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePasswordChange}
                  disabled={pwSaving || !newPw || !confirmPw}
                  className="flex-1 bg-[#1A73E8] text-white text-sm font-semibold py-3 rounded-lg disabled:opacity-50"
                >
                  {pwSaving ? 'Saving…' : 'Update Password'}
                </button>
              </div>
            </div>
          )}
        </div>

        {pwSuccess && (
          <div className="mt-3 bg-green-50 border border-[#22C55E] text-[#22C55E] text-sm px-4 py-3 rounded-lg">
            Password updated successfully.
          </div>
        )}
      </div>
    </div>
  )
}
