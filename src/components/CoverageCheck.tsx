import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, MapPin, Search, XCircle } from 'lucide-react'
import { initGoogleMaps, parseAddressComponents } from '@/lib/googleMaps'
import { checkCoverage, type CoverageResult } from '@/lib/coverage'

/**
 * Public, login-free coverage lookup. Lives on the home page so anyone can
 * check whether their address is serviceable before signing up.
 */
export default function CoverageCheck() {
  const [ready,   setReady]   = useState(false)
  const [query,   setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<CoverageResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showSuggest, setShowSuggest] = useState(false)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  useEffect(() => {
    initGoogleMaps()
      .then(() => setReady(true))
      .catch(err => setError(err.message ?? 'Could not load Google Maps'))
  }, [])

  // Debounced autocomplete
  useEffect(() => {
    if (!ready || query.length < 3) { setSuggestions([]); return }
    const timer = setTimeout(async () => {
      try {
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
      } catch (e) {
        console.warn('[coverage] autocomplete failed:', e)
      }
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
          const r = await checkCoverage(address)
          setResult(r)
          setLoading(false)
          // Reset session token after a completed lookup
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
    // If user just hits enter without picking a suggestion, do nothing —
    // free-text geocoding is too unreliable to base a coverage decision on.
    if (suggestions.length > 0) pickSuggestion(suggestions[0])
  }

  return (
    <div className="rounded-2xl border border-[#E0E0E0] bg-white p-5">
      <h2 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
        <MapPin size={16} className="text-[#1A73E8]" /> Check coverage
      </h2>
      <p className="text-sm text-[#666666] mt-1">
        Some cities have exclusive contracts that block our model. Make sure we can serve your address before you sign up.
      </p>

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

      {result && !loading && (
        <ResultBanner result={result} />
      )}
    </div>
  )
}

function ResultBanner({ result }: { result: CoverageResult }) {
  if (result.status === 'available') {
    return (
      <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 flex items-start gap-2">
        <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-green-800">We service this address.</p>
          <p className="text-green-700 text-xs mt-0.5">{result.address.formattedAddress}</p>
        </div>
      </div>
    )
  }
  if (result.status === 'unknown') {
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
  if (result.status === 'out_of_area') {
    return (
      <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
        <MapPin size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-amber-800">
            Service isn't available in {result.address.county} County, {result.address.state} yet.
          </p>
          <p className="text-amber-700 text-xs mt-0.5">
            We don't have disposal sites arranged in your area.
            Visit www.iforgottrashday.com to join the waitlist for when we expand.
          </p>
        </div>
      </div>
    )
  }
  // Restricted
  const where = result.zone.city ?? result.zone.township ?? result.zone.county
  return (
    <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2">
      <XCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold text-red-800">Sorry — we can't serve {where} yet.</p>
        <p className="text-red-700 text-xs mt-0.5">
          Local ordinance reserves trash pickup for an exclusive contracted hauler in this area.
          {result.zone.franchisee_id && ` Look for "${result.zone.franchisee_id}" in your local listings.`}
        </p>
      </div>
    </div>
  )
}
