import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

let _optionsSet = false
let _promise: Promise<void> | null = null

/**
 * Loads the Google Maps JavaScript API (maps + places + geocoding).
 * Safe to call multiple times — returns the same promise after the first call.
 */
export function initGoogleMaps(): Promise<void> {
  if (_promise) return _promise

  if (!API_KEY) {
    console.error('[Google Maps] VITE_GOOGLE_MAPS_API_KEY is not set')
    return Promise.reject(new Error('Google Maps API key not configured'))
  }

  if (!_optionsSet) {
    setOptions({ key: API_KEY, v: 'weekly' })
    _optionsSet = true
  }

  _promise = Promise.all([
    importLibrary('maps'),
    importLibrary('places'),
    importLibrary('geocoding'),
  ]).then(() => undefined)

  return _promise
}

export interface AddressComponents {
  formattedAddress: string
  city:     string    // e.g. "Cincinnati", "Norwood" — locality name
  township: string    // e.g. "Anderson Township" — admin level 3, often blank
  county:   string    // e.g. "Hamilton"
  state:    string    // short code: "OH"
}

/** Extract structured fields from a Google address_components array */
export function parseAddressComponents(
  components: google.maps.GeocoderAddressComponent[],
  formatted: string,
): AddressComponents {
  const get = (type: string, short = false) =>
    components.find(c => c.types.includes(type))?.[short ? 'short_name' : 'long_name'] ?? ''

  const city      = get('locality')
  // administrative_area_level_3 is occasionally a city, more often a township.
  // We keep it separate so the coverage matcher can try it as a fallback.
  const township  = get('administrative_area_level_3')
  const countyRaw = get('administrative_area_level_2')
  const county    = countyRaw.replace(/ County$| Parish$| Borough$/i, '')
  const state     = get('administrative_area_level_1', true) // "OH"

  return { formattedAddress: formatted, city, township, county, state }
}
