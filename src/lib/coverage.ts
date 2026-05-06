// Coverage check — does IFTD's crowdsourced consumer model serve this address?
//
// A "restricted" zone is a jurisdiction (city / township / county) where a
// local ordinance grants exclusive trash-pickup rights to a single hauler,
// blocking the IFTD model. Some restricted zones map to a known franchisee
// partner (e.g. Rumpke for Cincinnati); others have no known partner yet.
//
// Lookup goes against the shared `franchise_zones` table — same table that
// drives the iftd-commercial flow.

import { supabase } from './supabase'
import type { AddressComponents } from './googleMaps'

export interface FranchiseZone {
  id:            string
  franchisee_id: string | null
  city:          string | null
  township:      string | null
  county:        string
  state:         string
  notes:         string | null
}

export type CoverageResult =
  | { status: 'available'; address: AddressComponents }
  | { status: 'restricted'; address: AddressComponents; zone: FranchiseZone }
  | { status: 'unknown'; address: AddressComponents }

/**
 * Look up an address against the franchise_zones table.
 *
 * Match priority — most specific first:
 *   1. city + county + state
 *   2. township + county + state
 *   3. county + state (county-wide ordinance — uncommon but possible)
 *
 * If anything matches, the address is restricted. Otherwise available.
 *
 * `unknown` is returned only when we can't establish county+state from the
 * address (incomplete geocoding) — rare; treat as "needs manual review."
 */
export async function checkCoverage(address: AddressComponents): Promise<CoverageResult> {
  if (!address.county || !address.state) {
    return { status: 'unknown', address }
  }

  const { data, error } = await supabase
    .from('franchise_zones')
    .select('id, franchisee_id, city, township, county, state, notes')
    .eq('state', address.state)
    .eq('county', address.county)
    .eq('is_active', true)

  if (error) {
    // Network / RLS / DB issue — fail open so a misfire doesn't block legit
    // orders. Real errors surface in the console; UI shows "available".
    console.warn('[coverage] lookup failed:', error.message)
    return { status: 'available', address }
  }

  const zones = (data ?? []) as FranchiseZone[]
  if (zones.length === 0) return { status: 'available', address }

  // 1. Exact city match
  if (address.city) {
    const cityMatch = zones.find(z =>
      z.city && z.city.toLowerCase() === address.city.toLowerCase(),
    )
    if (cityMatch) return { status: 'restricted', address, zone: cityMatch }
  }

  // 2. Township match (Google sometimes returns the township in admin_level_3)
  if (address.township) {
    const townshipMatch = zones.find(z =>
      z.township && z.township.toLowerCase() === address.township.toLowerCase(),
    )
    if (townshipMatch) return { status: 'restricted', address, zone: townshipMatch }
  }

  // 3. County-wide row (city + township both null on the row)
  const countyWide = zones.find(z => !z.city && !z.township)
  if (countyWide) return { status: 'restricted', address, zone: countyWide }

  return { status: 'available', address }
}
