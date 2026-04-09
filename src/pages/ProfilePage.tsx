import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { User, Save } from 'lucide-react'

interface Profile {
  first_name: string
  last_name: string
  phone: string
  home_address: string
  city: string
  state: string
  zip: string
}

export default function ProfilePage() {
  const { user } = useAuth()
  const [form, setForm] = useState<Profile>({
    first_name: '',
    last_name: '',
    phone: '',
    home_address: '',
    city: '',
    state: '',
    zip: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return

    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, home_address, city, state, zip')
        .eq('id', user.id)
        .single()

      if (data) {
        setForm({
          first_name: data.first_name ?? '',
          last_name: data.last_name ?? '',
          phone: data.phone ?? '',
          home_address: data.home_address ?? '',
          city: data.city ?? '',
          state: data.state ?? '',
          zip: data.zip ?? '',
        })
      }
      setLoading(false)
    }

    fetchProfile()
  }, [user])

  const update = (field: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

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
        state: form.state || null,
        zip: form.zip || null,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-[#1A73E8] rounded-full flex items-center justify-center">
          <User size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">Profile</h1>
          <p className="text-[#666666] text-sm">{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
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
                className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
              />
            </div>
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
    </div>
  )
}
