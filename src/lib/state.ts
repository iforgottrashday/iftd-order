// US state-name normalization.
//
// disposal_site_service_areas, franchise_zones, and franchisee_service_areas
// all store state as a 2-letter code ("OH"). Address-extraction paths can
// produce either form depending on the source:
//   - Google Places parseAddressComponents() uses short_name -> "OH"
//   - Saved addresses, GPS reverse-geocode (Nominatim), and any user-typed
//     value can come through as the full name ("Ohio").
//
// Symptom when not normalized: coverage check returns out_of_area for an
// address that's actually covered, because `.eq('state', 'Ohio')` returns
// zero rows against an "OH" column. Re-typing through Google Places fixes
// it temporarily.
//
// This helper accepts either form and always returns the 2-letter code
// (uppercased), or passes through unrecognized strings unchanged so we
// never silently corrupt input we don't understand.

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

export function normalizeStateAbbrev(state: string | null | undefined): string {
  if (!state) return ''
  const trimmed = state.trim()
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed                    // already abbrev
  if (/^[a-z]{2}$/.test(trimmed)) return trimmed.toUpperCase()      // lowercase abbrev
  return STATE_ABBREVS[trimmed] ?? trimmed                          // map full name → abbrev (or pass through)
}
