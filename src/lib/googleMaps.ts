import { Loader } from '@googlemaps/js-api-loader'

let _initPromise: Promise<void> | null = null

/**
 * Loads the Google Maps JavaScript API (places library) once.
 * Subsequent calls return the same promise.
 */
export function initGoogleMaps(): Promise<void> {
  if (_initPromise) return _initPromise

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!apiKey) {
    console.error('[Google Maps] VITE_GOOGLE_MAPS_API_KEY is not set')
    return Promise.reject(new Error('Google Maps API key not configured'))
  }

  const loader = new Loader({
    apiKey,
    version: 'weekly',
    libraries: ['places'],
  })

  _initPromise = loader.load().then(() => undefined)
  return _initPromise
}

export interface AddressComponents {
  formattedAddress: string
  county: string   // e.g. "Hamilton"
  state: string    // short: "OH"
}

/** Extract structured fields from a Google address_components array */
export function parseAddressComponents(
  components: google.maps.GeocoderAddressComponent[],
  formatted: string,
): AddressComponents {
  const get = (type: string, short = false) =>
    components.find(c => c.types.includes(type))?.[short ? 'short_name' : 'long_name'] ?? ''

  const countyRaw = get('administrative_area_level_2')
  const county    = countyRaw.replace(/ County$| Parish$| Borough$/i, '')
  const state     = get('administrative_area_level_1', true) // "OH"

  return { formattedAddress: formatted, county, state }
}
