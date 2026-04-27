import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Minus, Plus, Camera, MapPin, Search, Zap, CalendarDays, Clock, Lock, AlertCircle, X } from 'lucide-react'
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet'

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

interface RestoreState {
  address: string
  latitude: number | null
  longitude: number | null
  location_county: string
  location_state: string
  items: Array<{ product_id: string; quantity: number; unbagged_qty?: number }>
  pickupType: 'now' | 'later'
  scheduledDate: string | null
  scheduledHour: number | null
  notes: string
  privateNotes: string
  photoFile: File | null
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
          id="pickupAddress"
          name="pickupAddress"
          type="text"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="123 Main St, Cincinnati, OH 45202"
          autoComplete="street-address"
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

// ── Internal map helpers (must be children of MapContainer) ──────────────────
function MapMoveListener({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend(e) {
      const { lat, lng } = e.target.getCenter()
      onMove(lat, lng)
    },
  })
  return null
}

function MapFlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 17, { duration: 0.8 })
  }, [target])
  return null
}

function MyLocationButton({ onLocate }: { onLocate: (lat: number, lng: number) => void }) {
  const map = useMap()
  const [loading, setLoading] = useState(false)

  const handleClick = () => {
    setLoading(true)
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        map.flyTo([lat, lng], 17, { duration: 0.8 })
        onLocate(lat, lng)
        setLoading(false)
      },
      () => setLoading(false),
      { timeout: 8000 },
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="absolute bottom-4 right-4 z-[1000] bg-white border border-[#E0E0E0] rounded-full w-11 h-11 flex items-center justify-center shadow-md text-[#1A73E8]"
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
      ) : (
        <MapPin size={20} />
      )}
    </button>
  )
}

// ── Pin Drop Modal ────────────────────────────────────────────────────────────
const CINCINNATI: [number, number] = [39.1031, -84.512]

function PinDropModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (data: AddressData) => void
  onCancel: () => void
}) {
  const [initialCenter] = useState<[number, number]>(() => CINCINNATI)
  const [flyTarget, setFlyTarget]   = useState<[number, number] | null>(null)
  const [center, setCenter]         = useState({ lat: CINCINNATI[0], lng: CINCINNATI[1] })
  const [label, setLabel]           = useState('')
  const [geocoding, setGeocoding]   = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Search bar state
  const [searchQuery, setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [searching, setSearching]         = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveDebounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reverseGeocode = async (lat: number, lng: number) => {
    setGeocoding(true)
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data = await res.json()
      if (data?.address) {
        const { house_number, road, city, town, village, state, postcode } = data.address
        const street   = [house_number, road].filter(Boolean).join(' ')
        const cityName = city || town || village || ''
        setLabel([street, cityName, state, postcode].filter(Boolean).join(', ') || data.display_name || '')
      }
    } catch { /* ignore */ }
    finally { setGeocoding(false) }
  }

  const handleMove = (lat: number, lng: number) => {
    setCenter({ lat, lng })
    if (moveDebounceRef.current) clearTimeout(moveDebounceRef.current)
    moveDebounceRef.current = setTimeout(() => reverseGeocode(lat, lng), 700)
  }

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    setSearchResults([])
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (q.trim().length < 3) return
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=4&q=${encodeURIComponent(q)}&countrycodes=us`
        const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        setSearchResults(await res.json())
      } catch { /* ignore */ }
      finally { setSearching(false) }
    }, 500)
  }

  const handleSearchPick = (r: NominatimResult) => {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    setFlyTarget([lat, lng])
    setCenter({ lat, lng })
    setSearchQuery('')
    setSearchResults([])
    reverseGeocode(lat, lng)
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const url  = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${center.lat}&lon=${center.lng}&addressdetails=1`
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data = await res.json()
      const { county, state } = data?.address ?? {}
      const countyClean = (county ?? '').replace(/ County$| Parish$| Borough$/i, '')
      onConfirm({ address: label || 'Pinned location', lat: center.lat, lng: center.lng, county: countyClean, state: state ?? '' })
    } catch {
      onConfirm({ address: label || 'Pinned location', lat: center.lat, lng: center.lng, county: '', state: '' })
    } finally { setConfirming(false) }
  }

  return (
    // z-[9999] so it covers the sticky footer and bottom nav
    <div className="fixed inset-0 z-[9999] flex flex-col bg-white">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0E0E0] shrink-0">
        <button type="button" onClick={onCancel} className="p-1 text-[#666666]">
          <X size={20} />
        </button>
        <h2 className="font-bold text-[#1A1A1A]">Drop a pin</h2>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-[#E0E0E0] shrink-0 relative">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search for a street or area…"
            className="w-full border border-[#E0E0E0] rounded-lg pl-8 pr-3 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#1A73E8] bg-white"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-[#E0E0E0] rounded-xl shadow-lg z-10 overflow-hidden">
            {searchResults.map((r) => (
              <button
                key={r.place_id}
                type="button"
                onClick={() => handleSearchPick(r)}
                className="w-full text-left px-4 py-3 text-sm text-[#1A1A1A] hover:bg-[#F5F5F5] border-b border-[#E0E0E0] last:border-0"
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative overflow-hidden">
        <MapContainer
          center={initialCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapMoveListener onMove={handleMove} />
          <MapFlyTo target={flyTarget} />
          <MyLocationButton onLocate={(lat, lng) => { setCenter({ lat, lng }); reverseGeocode(lat, lng) }} />
        </MapContainer>

        {/* Crosshair pin — fixed center, map moves under it */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]"
             style={{ paddingBottom: '24px' }}>
          <div className="flex flex-col items-center drop-shadow-lg">
            <div className="w-5 h-5 rounded-full bg-white border-4 border-[#1A73E8]" />
            <div className="w-0.5 h-5 bg-[#1A73E8]" />
            <div className="w-2 h-0.5 bg-[#1A73E8] rounded-full opacity-40" />
          </div>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="px-4 pt-3 pb-5 border-t border-[#E0E0E0] bg-white shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-h-[24px]">
          <MapPin size={14} className="text-[#1A73E8] shrink-0" />
          <p className="text-sm text-[#1A1A1A] font-medium truncate">
            {geocoding ? 'Finding address…' : (label || 'Pan the map to your pickup spot')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || geocoding}
          className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60"
        >
          {confirming ? 'Confirming…' : 'Confirm Location'}
        </button>
      </div>
    </div>
  )
}

export default function RequestPickupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const restore = (location.state as { restore?: RestoreState } | null)?.restore ?? null
  const { user } = useAuth()
  const photoRef = useRef<HTMLInputElement>(null)
  // On first render with restored state we skip the auto-hour effect once
  const restoringRef = useRef(!!restore)

  const instantStatus = getInstantAvailability()

  const [pickupType, setPickupType] = useState<'now' | 'later'>(() => {
    if (restore?.pickupType) return restore.pickupType
    return instantStatus.available ? 'now' : 'later'
  })

  const [addressData, setAddressData] = useState<AddressData | null>(() => {
    if (restore?.address) {
      return {
        address: restore.address,
        lat: restore.latitude,
        lng: restore.longitude,
        county: restore.location_county,
        state: restore.location_state,
      }
    }
    return null
  })
  const [homeAddress, setHomeAddress] = useState(() => restore?.address ?? '')
  const [trashQty, setTrashQty] = useState(() =>
    restore?.items?.find(i => i.product_id === 'trash')?.quantity ?? 0
  )
  const [unbaggedTrashQty, setUnbaggedTrashQty] = useState(() =>
    restore?.items?.find(i => i.product_id === 'trash')?.unbagged_qty ?? 0
  )
  const [recyclingQty, setRecyclingQty] = useState(() =>
    restore?.items?.find(i => i.product_id === 'recycling')?.quantity ?? 0
  )
  const [unbaggedRecyclingQty, setUnbaggedRecyclingQty] = useState(() =>
    restore?.items?.find(i => i.product_id === 'recycling')?.unbagged_qty ?? 0
  )
  const [scheduledDate, setScheduledDate] = useState(() =>
    restore?.scheduledDate ?? getDefaultDate()
  )
  const [scheduledHour, setScheduledHour] = useState(() =>
    restore?.scheduledHour ?? SERVICE_START
  )
  const [notes, setNotes] = useState(() => restore?.notes ?? '')
  const [privateNotes, setPrivateNotes] = useState(() => restore?.privateNotes ?? '')
  const [photoFile, setPhotoFile] = useState<File | null>(() => restore?.photoFile ?? null)
  const [showPinDrop, setShowPinDrop] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(() => {
    if (!restore?.photoFile) return null
    try { return URL.createObjectURL(restore.photoFile) } catch { return null }
  })

  // Load home address from profile — skip if we're restoring a previous order
  useEffect(() => {
    if (!user || restore) return
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

  // Auto-set hour when date changes (skip the initial mount when restoring)
  useEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false
      return
    }
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

    // ── Serviceable area check ─────────────────────────────────────────────
    const { county } = finalAddressData
    // Nominatim returns full state names ("Florida"); DB stores abbreviations ("FL")
    const STATE_ABBREVS: Record<string, string> = {
      'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
      'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
      'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
      'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
      'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
      'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
      'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
      'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
      'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
      'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
      'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI',
      'Wyoming':'WY','District of Columbia':'DC',
    }
    const rawState = finalAddressData.state
    const state = /^[A-Z]{2}$/.test(rawState) ? rawState : (STATE_ABBREVS[rawState] ?? rawState)
    if (county && state) {
      try {
        const orderedMaterials: string[] = []
        if (trashQty > 0)     orderedMaterials.push('trash')
        if (recyclingQty > 0) orderedMaterials.push('recycling')

        const { data: serviceAreas } = await supabase
          .from('disposal_site_service_areas')
          .select('disposal_site_id')
          .eq('county', county)
          .eq('state', state)

        if (!serviceAreas?.length) {
          alert(
            `Service is not yet available in ${county} County, ${state}.\n\nVisit www.iforgottrashday.com to get on the waitlist and be notified when service comes to your area.`
          )
          return
        }

        const { data: sites } = await supabase
          .from('disposal_sites')
          .select('accepted_materials')
          .in('id', serviceAreas.map(sa => sa.disposal_site_id))
          .eq('is_active', true)

        const allAccepted = new Set<string>(
          (sites ?? []).flatMap(s => (s as any).accepted_materials ?? [])
        )
        const uncovered = orderedMaterials.filter(m => !allAccepted.has(m))

        if (uncovered.length > 0) {
          const labels = uncovered
            .map(m => m === 'trash' ? 'Residential Trash' : 'Recycling')
            .join(' and ')
          alert(
            `${labels} pickup is not yet available in ${county} County, ${state}.\n\nVisit www.iforgottrashday.com to get on the waitlist and be notified when service comes to your area.`
          )
          return
        }
      } catch {
        // Network error — allow order to proceed rather than block
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
          id="notes"
          name="notes"
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
            id="privateNotes"
            name="privateNotes"
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
        <AddressSearch initial={homeAddress} onSelect={(data) => { setAddressData(data); setHomeAddress(data.address) }} />
        {addressData && !addressData.lat && addressData.address && (
          <p className="text-xs text-[#F59E0B] px-1">Search and select your address to confirm location for pickup routing.</p>
        )}
        <button
          type="button"
          onClick={() => setShowPinDrop(true)}
          className="text-sm text-[#1A73E8] font-medium text-left px-1"
        >
          📍 New construction or can't find your address? Drop a pin instead
        </button>
      </section>

      {/* Pin drop modal */}
      {showPinDrop && (
        <PinDropModal
          onConfirm={(data) => {
            setAddressData(data)
            setHomeAddress(data.address)
            setShowPinDrop(false)
          }}
          onCancel={() => setShowPinDrop(false)}
        />
      )}

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
