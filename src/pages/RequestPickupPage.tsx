import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Minus, Plus, Camera, MapPin, Search, Zap, CalendarDays, Clock, Lock, AlertCircle } from 'lucide-react'

// Pricing constants
const ITEM_PRICE         = 20   // $20 per item (all types)
const UNBAGGED_SURCHARGE = 5    // +$5 for unbagged trash option

const SERVICE_START = 7   // 7am
const SERVICE_END   = 15  // generates slots up to and including 2pm

const INSTANT_START = SERVICE_START
const INSTANT_END   = 14  // instant unavailable at or after 2pm

// ── Federal holiday helpers ──────────────────────────────────────────────────

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  // Returns the nth occurrence (1-based) of weekday (0=Sun…6=Sat) in given month
  const d = new Date(year, month, 1)
  const diff = (weekday - d.getDay() + 7) % 7
  d.setDate(1 + diff + (n - 1) * 7)
  return d
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const d = new Date(year, month + 1, 0) // last day of month
  const diff = (d.getDay() - weekday + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

function observedDate(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day)
  if (d.getDay() === 0) return new Date(year, month, day + 1) // Sunday → Monday
  if (d.getDay() === 6) return new Date(year, month, day - 1) // Saturday → Friday
  return d
}

function getFederalHolidays(year: number): Set<string> {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const holidays = [
    observedDate(year, 0,  1),   // New Year's Day
    nthWeekday(year, 0, 1, 3),   // MLK Jr. Day — 3rd Mon Jan
    nthWeekday(year, 1, 1, 3),   // Presidents' Day — 3rd Mon Feb
    lastWeekday(year, 4, 1),     // Memorial Day — last Mon May
    observedDate(year, 5, 19),   // Juneteenth
    observedDate(year, 6, 4),    // Independence Day
    nthWeekday(year, 8, 1, 1),   // Labor Day — 1st Mon Sep
    nthWeekday(year, 9, 1, 2),   // Columbus Day — 2nd Mon Oct
    observedDate(year, 10, 11),  // Veterans Day
    nthWeekday(year, 10, 4, 4),  // Thanksgiving — 4th Thu Nov
    observedDate(year, 11, 25),  // Christmas
  ]
  return new Set(holidays.map(fmt))
}

function isFederalHoliday(date: Date): boolean {
  const year = date.getFullYear()
  const holidays = getFederalHolidays(year)
  const key = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return holidays.has(key)
}

function getInstantAvailability(): { available: boolean; reason?: string } {
  const now = new Date()
  const hour = now.getHours()
  if (isFederalHoliday(now)) {
    return { available: false, reason: 'Not available on federal holidays' }
  }
  if (hour < INSTANT_START) {
    return { available: false, reason: `Available from ${INSTANT_START > 12 ? INSTANT_START - 12 : INSTANT_START}${INSTANT_START >= 12 ? 'pm' : 'am'} today` }
  }
  if (hour >= INSTANT_END) {
    return { available: false, reason: 'Today\'s instant window has closed (available 7am–2pm)' }
  }
  return { available: true }
}

const PRODUCT_IMAGES: Record<string, string> = {
  trash: '/products/trash.png',
  recycling: '/products/recycling.png',
  yardwaste: '/products/yardwaste.png',
  paint: '/products/paint.png',
  gas: '/products/gas.png',
}

/** Returns a YYYY-MM-DD string using local (device) time, not UTC. */
function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDefaultDate(): string {
  const now = new Date()
  if (now.getHours() >= INSTANT_END) now.setDate(now.getDate() + 1)
  return localDateStr(now)
}

function getHourLabel(h: number): string {
  if (h === 12) return '12:00 PM'
  if (h > 12) return `${h - 12}:00 PM`
  return `${h}:00 AM`
}


interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address: {
    house_number?: string
    road?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    county?: string
    state?: string
    postcode?: string
  }
}

interface AddressData {
  address: string
  lat: number | null
  lng: number | null
  county: string
  state: string
}

function BigStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-5 py-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-12 h-12 rounded-full flex items-center justify-center disabled:bg-[#E0E0E0] bg-[#1A73E8]"
      >
        <Minus size={20} className="text-white" />
      </button>
      <span className="w-10 text-center text-2xl font-bold text-[#1A1A1A]">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-12 h-12 rounded-full flex items-center justify-center bg-[#1A73E8] disabled:bg-[#E0E0E0]"
      >
        <Plus size={20} className="text-white" />
      </button>
    </div>
  )
}


function SmallStepper({ label, desc, value, min, max, onChange }: {
  label: string; desc?: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3 pt-3 border-t border-[#E0E0E0]">
      <div className="flex-1">
        <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
        {desc && <p className="text-xs text-[#666666] mt-0.5">{desc}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          className="w-10 h-10 rounded-full flex items-center justify-center disabled:bg-[#E0E0E0] bg-[#1A73E8]">
          <Minus size={16} className="text-white" />
        </button>
        <span className="w-6 text-center font-bold text-[#1A1A1A]">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1A73E8] disabled:bg-[#E0E0E0]">
          <Plus size={16} className="text-white" />
        </button>
      </div>
    </div>
  )
}

function AddressSearch({
  initial,
  onSelect,
}: {
  initial: string
  onSelect: (data: AddressData) => void
}) {
  const [query, setQuery] = useState(initial)
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [confirmed, setConfirmed] = useState(!!initial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQuery(initial)
    setConfirmed(!!initial)
  }, [initial])

  const search = (q: string) => {
    setQuery(q)
    setConfirmed(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 5) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}&countrycodes=us`
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        const data: NominatimResult[] = await res.json()
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 500)
  }

  const pick = (r: NominatimResult) => {
    const { house_number, road, city, town, village, county, state, postcode } = r.address
    const street = [house_number, road].filter(Boolean).join(' ')
    const cityName = city || town || village || ''
    const fullAddress = [street, cityName, state, postcode].filter(Boolean).join(', ')
    const countyClean = (county ?? '').replace(/ County$| Parish$| Borough$/i, '')
    setQuery(fullAddress)
    setResults([])
    setConfirmed(true)
    onSelect({
      address: fullAddress,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      county: countyClean,
      state: state ?? '',
    })
  }

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
        <input
          type="text"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="123 Main St, Cincinnati, OH 45202"
          className={`w-full border rounded-lg pl-9 pr-4 py-3 text-[#1A1A1A] text-base focus:outline-none bg-white ${
            confirmed ? 'border-[#22C55E]' : 'border-[#E0E0E0] focus:border-[#1A73E8]'
          }`}
        />
        {confirmed && (
          <MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#22C55E]" />
        )}
      </div>
      {searching && (
        <p className="text-xs text-[#999] px-1">Searching...</p>
      )}
      {results.length > 0 && (
        <div className="border border-[#E0E0E0] rounded-xl overflow-hidden shadow-md bg-white absolute top-full left-0 right-0 z-30 mt-1">
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => pick(r)}
              className="w-full text-left px-4 py-3 text-sm text-[#1A1A1A] hover:bg-[#F5F5F5] border-b border-[#E0E0E0] last:border-0"
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RequestPickupPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const photoRef = useRef<HTMLInputElement>(null)

  const instantStatus = getInstantAvailability()
  const [pickupType, setPickupType] = useState<'now' | 'later'>(
    instantStatus.available ? 'now' : 'later'
  )

  const [addressData, setAddressData] = useState<AddressData | null>(null)
  const [homeAddress, setHomeAddress] = useState('')
  const [trashQty, setTrashQty] = useState(0)
  const [unbaggedTrashQty, setUnbaggedTrashQty] = useState(0)
  const [recyclingQty, setRecyclingQty] = useState(0)
  const [unbaggedRecyclingQty, setUnbaggedRecyclingQty] = useState(0)
  const [scheduledDate, setScheduledDate] = useState(getDefaultDate())
  const [scheduledHour, setScheduledHour] = useState(SERVICE_START)
  const [notes, setNotes] = useState('')
  const [privateNotes, setPrivateNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Load home address from profile
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('home_address, city, state, zip, home_lat, home_lng, county')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!data?.home_address) return
        setHomeAddress(data.home_address)
        setAddressData({
          address: data.home_address,
          lat: data.home_lat ? Number(data.home_lat) : null,
          lng: data.home_lng ? Number(data.home_lng) : null,
          county: data.county ?? '',
          state: data.state ?? '',
        })
      })
  }, [user])

  // Auto-set hour when date changes
  useEffect(() => {
    const today = localDateStr()
    if (scheduledDate === today) {
      const currentHour = new Date().getHours()
      const nextHour = Math.max(SERVICE_START, currentHour + 1)
      setScheduledHour(nextHour < SERVICE_END ? nextHour : SERVICE_START)
    } else {
      setScheduledHour(SERVICE_START)
    }
  }, [scheduledDate])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setPhotoFile(file)
    setPhotoPreview(file ? URL.createObjectURL(file) : null)
  }

  const handleTrashQtyChange = (v: number) => {
    setTrashQty(v)
    if (unbaggedTrashQty > v) setUnbaggedTrashQty(v)
  }
  const handleRecyclingQtyChange = (v: number) => {
    setRecyclingQty(v)
    if (unbaggedRecyclingQty > v) setUnbaggedRecyclingQty(v)
  }

  // Pricing: $20/item + $5 per unbagged item (trash or recycling)
  const trashSubtotal     = ITEM_PRICE * trashQty + UNBAGGED_SURCHARGE * unbaggedTrashQty
  const recyclingSubtotal = ITEM_PRICE * recyclingQty + UNBAGGED_SURCHARGE * unbaggedRecyclingQty
  const total    = trashSubtotal + recyclingSubtotal
  const hasItems = trashQty > 0 || recyclingQty > 0

  const handleReview = async () => {
    if (!addressData || !addressData.address.trim()) {
      alert('Please enter and select a pickup address.')
      return
    }
    if (!hasItems) {
      alert('Please add at least one item.')
      return
    }
    if (!photoFile) {
      alert('Please add a photo of the items before continuing.')
      return
    }

    // Ensure we have coordinates — geocode now if still missing
    let finalAddressData = addressData
    if (!finalAddressData.lat || !finalAddressData.lng) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(finalAddressData.address)}&countrycodes=us`
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        const results: NominatimResult[] = await res.json()
        if (results.length > 0) {
          const r = results[0]
          const countyRaw = r.address.county ?? ''
          const countyClean = countyRaw.replace(/ County$| Parish$| Borough$/i, '')
          finalAddressData = {
            address: finalAddressData.address,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            county: countyClean || finalAddressData.county,
            state: r.address.state ?? finalAddressData.state,
          }
          setAddressData(finalAddressData)
        } else {
          alert('Could not confirm the location for this address. Please search and select it from the dropdown.')
          return
        }
      } catch {
        alert('Could not confirm the location for this address. Please search and select it from the dropdown.')
        return
      }
    }

    const items = []
    if (trashQty > 0) {
      items.push({ product_id: 'trash', label: 'Residential Trash', quantity: trashQty, unbagged_qty: unbaggedTrashQty })
    }
    if (recyclingQty > 0) {
      items.push({ product_id: 'recycling', label: 'Recycling', quantity: recyclingQty, unbagged_qty: unbaggedRecyclingQty })
    }

    navigate('/checkout', {
      state: {
        address: finalAddressData.address,
        latitude: finalAddressData.lat,
        longitude: finalAddressData.lng,
        location_county: finalAddressData.county,
        location_state: finalAddressData.state,
        items,
        pickupType,
        scheduledDate: pickupType === 'now' ? null : scheduledDate,
        scheduledHour: pickupType === 'now' ? null : scheduledHour,
        notes,
        privateNotes,
        photoFile,
        pricing: { subtotal: total, disposalFee: 0, serviceFee: 0, total },
      },
    })
  }

  const todayStr = localDateStr()
  const isToday = scheduledDate === todayStr
  const currentHour = new Date().getHours()

  return (
    <div className="px-4 py-6 flex flex-col gap-6 pb-36">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Order Trash Pickup</h1>
      </div>

      {/* Step 1: Pickup time */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-[#1A1A1A]">Step 1: Choose a pickup time</h2>

        {/* NOW / Schedule toggle */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!instantStatus.available}
            onClick={() => instantStatus.available && setPickupType('now')}
            className={`flex flex-col items-center gap-1 py-4 rounded-xl border-2 font-semibold text-sm transition-colors ${
              pickupType === 'now'
                ? 'border-[#1A73E8] bg-[#EBF3FD] text-[#1A73E8]'
                : instantStatus.available
                ? 'border-[#E0E0E0] bg-white text-[#1A1A1A]'
                : 'border-[#E0E0E0] bg-[#F5F5F5] text-[#BDBDBD]'
            }`}
          >
            <Zap size={22} />
            NOW
            <span className="text-xs font-normal">
              {instantStatus.available ? '7am – 2pm today' : 'Unavailable'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPickupType('later')}
            className={`flex flex-col items-center gap-1 py-4 rounded-xl border-2 font-semibold text-sm transition-colors ${
              pickupType === 'later'
                ? 'border-[#1A73E8] bg-[#EBF3FD] text-[#1A73E8]'
                : 'border-[#E0E0E0] bg-white text-[#1A1A1A]'
            }`}
          >
            <CalendarDays size={22} />
            Schedule
            <span className="text-xs font-normal">Pick a date &amp; time</span>
          </button>
        </div>

        {/* Reason instant is unavailable */}
        {!instantStatus.available && (
          <p className="text-xs text-[#F59E0B] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2">
            <AlertCircle size={14} className="inline mr-1 shrink-0" />{instantStatus.reason}
          </p>
        )}

        {/* Date + time picker — only when Schedule selected */}
        {pickupType === 'later' && (
          <div className="flex flex-col gap-3 border border-[#E0E0E0] rounded-xl p-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-[#666666] shrink-0" />
              <input
                type="date"
                value={scheduledDate}
                min={todayStr}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="text-base font-semibold text-[#1A1A1A] border-none bg-transparent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[#666666] flex items-center gap-1.5">
                <Clock size={14} /> Select an arrival window
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: SERVICE_END - SERVICE_START }, (_, i) => {
                  const h = SERVICE_START + i
                  const disabled = isToday && h <= currentHour
                  const selected = scheduledHour === h
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={disabled}
                      onClick={() => setScheduledHour(h)}
                      className={`px-3 py-2 rounded-full border text-sm font-medium transition-colors ${
                        selected
                          ? 'bg-[#1A73E8] text-white border-[#1A73E8]'
                          : disabled
                          ? 'bg-[#F5F5F5] text-[#BDBDBD] border-[#E0E0E0]'
                          : 'bg-white text-[#1A1A1A] border-[#E0E0E0]'
                      }`}
                    >
                      {getHourLabel(h).replace(':00', '')}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Items */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-[#1A1A1A]">Step 2: What are you disposing of?</h2>

        {/* Trash */}
        <div className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <img src={PRODUCT_IMAGES.trash} alt="Trash" className="w-12 h-12 rounded-lg object-contain bg-[#F5F5F5] p-1" />
            <div className="flex-1">
              <p className="font-semibold text-[#1A1A1A]">Residential Trash</p>
              <p className="text-xs text-[#666666]">$20/item · 96 gal max</p>
            </div>
            <p className="text-[#1A73E8] font-bold text-base">${trashSubtotal > 0 ? trashSubtotal.toFixed(0) : '0'}</p>
          </div>
          <BigStepper value={trashQty} min={0} max={10} onChange={handleTrashQtyChange} />
          {trashQty > 0 && (
            <SmallStepper
              label={`Unbagged (+$5 each)`}
              desc="How many have loose/unbagged contents?"
              value={unbaggedTrashQty}
              min={0}
              max={trashQty}
              onChange={setUnbaggedTrashQty}
            />
          )}
        </div>

        {/* Recycling */}
        <div className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <img src={PRODUCT_IMAGES.recycling} alt="Recycling" className="w-12 h-12 rounded-lg object-contain bg-[#F5F5F5] p-1" />
            <div className="flex-1">
              <p className="font-semibold text-[#1A1A1A]">Recycling</p>
              <p className="text-xs text-[#666666]">$20/item · 96 gal max</p>
            </div>
            <p className="text-[#1A73E8] font-bold text-base">${recyclingSubtotal > 0 ? recyclingSubtotal.toFixed(0) : '0'}</p>
          </div>
          <BigStepper value={recyclingQty} min={0} max={10} onChange={handleRecyclingQtyChange} />
          {recyclingQty > 0 && (
            <SmallStepper
              label={`Unbagged (+$5 each)`}
              desc="How many have loose/unbagged contents?"
              value={unbaggedRecyclingQty}
              min={0}
              max={recyclingQty}
              onChange={setUnbaggedRecyclingQty}
            />
          )}
        </div>
      </section>

      {/* Step 3: Photo */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-[#1A1A1A]">
          Step 3: Photo of items <span className="text-[#EF4444] font-normal text-sm">*required</span>
        </h2>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="hidden"
        />
        {photoPreview ? (
          <div className="relative">
            <img src={photoPreview} alt="Pickup photo" className="w-full rounded-xl object-cover max-h-48" />
            <button
              type="button"
              onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
              className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="border-2 border-dashed border-[#E0E0E0] rounded-xl py-8 flex flex-col items-center gap-2 text-[#666666]"
          >
            <Camera size={28} />
            <span className="font-medium text-sm">Tap to add photo</span>
            <span className="text-xs">Take a photo or choose from library</span>
          </button>
        )}
      </section>

      {/* Step 4: Notes */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-[#1A1A1A]">Step 4: Notes for your hauler <span className="font-normal text-[#666666] text-sm">(optional)</span></h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Cans are on the left side of the driveway..."
          rows={3}
          className="w-full border border-[#E0E0E0] rounded-xl px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white resize-none"
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-1.5">
            <Lock size={14} /> Gate code / access info <span className="font-normal text-[#666666]">(optional)</span>
          </p>
          <p className="text-xs text-[#666666]">Only visible to your hauler after they accept</p>
          <textarea
            value={privateNotes}
            onChange={(e) => setPrivateNotes(e.target.value)}
            placeholder="e.g. Gate code: 1234, ring doorbell on arrival..."
            rows={2}
            className="w-full border border-[#E0E0E0] rounded-xl px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white resize-none"
          />
        </div>
      </section>

      {/* Step 5: Address */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-[#1A1A1A]">Step 5: Pickup location</h2>
        <AddressSearch initial={homeAddress} onSelect={setAddressData} />
        {addressData && !addressData.lat && addressData.address && (
          <p className="text-xs text-[#F59E0B] px-1">Search and select your address to confirm location for pickup routing.</p>
        )}
      </section>

      {/* Sticky footer */}
      <div className="fixed bottom-[52px] left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[#E0E0E0] px-4 py-4 flex items-center justify-between gap-4 z-50">
        <div>
          <p className="text-xs text-[#666666]">Estimated Total</p>
          <p className="text-2xl font-bold text-[#1A73E8]">${total.toFixed(2)}</p>
        </div>
        <button
          type="button"
          onClick={handleReview}
          disabled={!hasItems || !addressData || !photoFile}
          className="flex-1 bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
