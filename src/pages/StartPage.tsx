import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Building2, CheckCircle2, MapPin, Search, Users, XCircle } from 'lucide-react'
import { initGoogleMaps, parseAddressComponents } from '@/lib/googleMaps'
import { resolveStartRoute, destinationUrl, type StartRouteResult } from '@/lib/startRouter'

/**
 * /start — public landing page that routes new customers to the right product
 * based on the address they enter.
 *
 *   commercial partnership  → local.iforgottrashday.com (with ?franchisee=)
 *   restricted area / no infra → "Service not available yet"
 *   otherwise               → order.iforgottrashday.com (this site)
 *
 * Three explicit "if you already know" cards live below the lookup, so a
 * customer arriving from a known marketing channel can self-route.
 */
export default function StartPage() {
  const [ready,    setReady]    = useState(false)
  const [query,    setQuery]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<StartRouteResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showSuggest, setShowSuggest] = useState(false)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  useEffect(() => {
    initGoogleMaps()
      .then(() => setReady(true))
      .catch(err => setError(err.message ?? 'Could not load Google Maps'))
  }, [])

  useEffect(() => {
    if (!ready || query.length < 3) { setSuggestions([]); return }
    const timer = setTimeout(() => {
      const service = new google.maps.places.AutocompleteService()
      sessionTokenRef.current ??= new google.maps.places.AutocompleteSessionToken()
      service.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'us' },
          types: ['address'],
          sessionToken: sessionTokenRef.current,
        },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setSuggestions(predictions)
          } else {
            setSuggestions([])
          }
        },
      )
    }, 250)
    return () => clearTimeout(timer)
  }, [query, ready])

  async function pickSuggestion(s: google.maps.places.AutocompletePrediction) {
    setShowSuggest(false)
    setQuery(s.description)
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const placesService = new google.maps.places.PlacesService(document.createElement('div'))
      placesService.getDetails(
        {
          placeId: s.place_id,
          fields: ['address_components', 'formatted_address'],
          sessionToken: sessionTokenRef.current ?? undefined,
        },
        async (place, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            setError('Could not resolve that address.')
            setLoading(false)
            return
          }
          const address = parseAddressComponents(
            place.address_components ?? [],
            place.formatted_address ?? s.description,
          )
          const r = await resolveStartRoute(address)
          setResult(r)
          setLoading(false)
          sessionTokenRef.current = null
        },
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lookup failed'
      setError(msg)
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (suggestions.length > 0) pickSuggestion(suggestions[0])
  }

  return (
    <div className="px-4 py-8 flex flex-col gap-8 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <img src="/logo.png" alt="iForgotTrashDay" className="h-16 object-contain" />
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A] leading-tight">
            Let's get you to the right place.
          </h1>
          <p className="text-[#666666] text-base mt-2">
            Enter your address and we'll send you to the right pickup option for your area.
          </p>
        </div>
      </div>

      {/* Address lookup */}
      <div className="rounded-2xl border border-[#E0E0E0] bg-white p-5">
        <h2 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
          <MapPin size={16} className="text-[#1A73E8]" /> Where do you need a pickup?
        </h2>

        <form onSubmit={handleSubmit} className="relative mt-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowSuggest(true); setResult(null) }}
            onFocus={() => setShowSuggest(true)}
            placeholder="Start typing your address…"
            autoComplete="street-address"
            className="w-full border border-[#E0E0E0] rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
          />
          {showSuggest && suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#E0E0E0] rounded-lg shadow-md max-h-64 overflow-y-auto">
              {suggestions.map(s => (
                <li
                  key={s.place_id}
                  onClick={() => pickSuggestion(s)}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-[#F5F5F5]"
                >{s.description}</li>
              ))}
            </ul>
          )}
        </form>

        {loading && (
          <div className="mt-3 flex items-center gap-2 text-sm text-[#666666]">
            <span className="w-3 h-3 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
            Checking your address…
          </div>
        )}

        {error && !loading && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}

        {result && !loading && <ResultCard result={result} />}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#E0E0E0]" />
        <span className="text-xs uppercase tracking-wider text-[#999999]">or pick one directly</span>
        <div className="flex-1 h-px bg-[#E0E0E0]" />
      </div>

      {/* Three explicit destination cards */}
      <div className="flex flex-col gap-3">
        <DirectCard
          icon={<Building2 size={20} className="text-white" />}
          iconBg="#1A73E8"
          title="I have a commercial pickup"
          subtitle="Business waste, construction debris, or large items handled by our franchise partner."
          href="https://local.iforgottrashday.com/"
        />
        <DirectCard
          icon={<Users size={20} className="text-white" />}
          iconBg="#FF6600"
          title="I missed my residential trash day"
          subtitle="Same-day or scheduled pickup by neighbors who care. No judgment — just help."
          href="https://order.iforgottrashday.com/"
        />
      </div>

      <p className="text-xs text-center text-[#999999] mt-2">
        Not sure? Use the address lookup above and we'll send you to the right one.
      </p>
    </div>
  )
}

// ── Result card ────────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: StartRouteResult }) {
  if (result.destination === 'unknown') {
    return (
      <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
        <MapPin size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-amber-800">We couldn't pinpoint that address.</p>
          <p className="text-amber-700 text-xs mt-0.5">Try a more specific street address.</p>
        </div>
      </div>
    )
  }

  if (result.destination === 'commercial') {
    const url = destinationUrl(result)!
    return (
      <a
        href={url}
        className="mt-3 block rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors px-4 py-3.5"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="text-[#1A73E8] mt-0.5 shrink-0" />
          <div className="text-sm flex-1">
            <p className="font-semibold text-[#1A1A1A]">
              {result.franchisee.displayName} serves your area.
            </p>
            <p className="text-[#666666] text-xs mt-1">
              {result.address.formattedAddress}
            </p>
            <p className="text-[#1A73E8] text-sm font-medium mt-2 flex items-center gap-1">
              Continue to {result.franchisee.displayName.toLowerCase()} pickup
              <ArrowRight size={14} />
            </p>
          </div>
        </div>
      </a>
    )
  }

  if (result.destination === 'consumer') {
    const url = destinationUrl(result)!
    return (
      <a
        href={url}
        className="mt-3 block rounded-lg bg-green-50 border border-green-200 hover:bg-green-100 transition-colors px-4 py-3.5"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="text-green-600 mt-0.5 shrink-0" />
          <div className="text-sm flex-1">
            <p className="font-semibold text-[#1A1A1A]">We service this address.</p>
            <p className="text-[#666666] text-xs mt-1">
              {result.address.formattedAddress}
            </p>
            <p className="text-green-700 text-sm font-medium mt-2 flex items-center gap-1">
              Continue to residential pickup
              <ArrowRight size={14} />
            </p>
          </div>
        </div>
      </a>
    )
  }

  // unserved
  const reasonCopy = result.reason === 'restricted'
    ? "Local ordinance reserves trash pickup for an exclusive contracted hauler here, and we don't have a partner in that area yet."
    : "We haven't arranged disposal sites near you yet."
  return (
    <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3.5 flex items-start gap-3">
      <XCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold text-red-800">
          Service isn't available in {result.address.county} County, {result.address.state} yet.
        </p>
        <p className="text-red-700 text-xs mt-1">{reasonCopy}</p>
        <p className="text-red-700 text-xs mt-2">
          Visit{' '}
          <a href="https://www.iforgottrashday.com" className="underline">www.iforgottrashday.com</a>
          {' '}to join the waitlist for when we expand.
        </p>
      </div>
    </div>
  )
}

// ── Direct destination card ────────────────────────────────────────────────────

function DirectCard({
  icon, iconBg, title, subtitle, href,
}: {
  icon: React.ReactNode
  iconBg: string
  title: string
  subtitle: string
  href: string
}) {
  return (
    <a
      href={href}
      className="bg-[#F5F5F5] border border-[#E0E0E0] hover:bg-[#EEEEEE] transition-colors rounded-xl p-4 flex items-start gap-3"
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-[#1A1A1A] text-sm">{title}</p>
        <p className="text-[#666666] text-xs mt-1">{subtitle}</p>
      </div>
      <ArrowRight size={16} className="text-[#999999] mt-2 shrink-0" />
    </a>
  )
}
