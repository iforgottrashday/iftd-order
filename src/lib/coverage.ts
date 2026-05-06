// Coverage check — can IFTD serve this address? Two independent gates,
// both must pass:
//
//   1. Disposal-site coverage — at least one disposal site in
//      `disposal_site_service_areas` must serve this county+state. Otherwise
//      we have no infrastructure to drop the trash off, regardless of
//      ordinance. This is the "outside service area" case.
//
//   2. Franchise-zone restriction — `franchise_zones` lists jurisdictions
//      where a local ordinance grants exclusive trash-pickup rights to a
//      single contracted hauler. If the address falls inside one, IFTD's
//      crowdsourced model is illegal there. Some rows map to a known
//      partner (e.g. Rumpke for Cincinnati); others have no known partner.
//
// Result hierarchy: out_of_area > restricted > available. (out_of_area is
// checked first since a county we don't serve at all is the bigger blocker.)

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
  | { status: 'available';   address: AddressComponents }
  | { status: 'restricted';  address: AddressComponents; zone: FranchiseZone }
  | { status: 'out_of_area'; address: AddressComponents }
  | { status: 'unknown';     address: AddressComponents }

/**
 * Look up an address against both gates.
 *
 * Order of checks:
 *   1. disposal_site_service_areas — if county+state has zero rows, return
 *      out_of_area immediately. Without disposal infrastructure we can't
 *      operate regardless of ordinance.
 *   2. franchise_zones — match priority: city → township → county-wide.
 *
 * `unknown` is returned only when we can't establish county+state from the
 * address (incomplete geocoding).
 *
 * Both queries fail open (return `available`) on network/RLS errors so a
 * misfire never blocks a legit order. Real errors surface in the console.
 */
export async function checkCoverage(address: AddressComponents): Promise<CoverageResult> {
  if (!address.county || !address.state) {
    return { status: 'unknown', address }
  }

  // ── Gate 1: do we have disposal sites serving this county? ─────────────
  const { count: serviceAreaCount, error: areaErr } = await supabase
    .from('disposal_site_service_areas')
    .select('disposal_site_id', { count: 'exact', head: true })
    .eq('state', address.state)
    .eq('county', address.county)

  if (areaErr) {
    console.warn('[coverage] service-area lookup failed:', areaErr.message)
    // Fall open — better to let a legit order through than block on a hiccup.
  } else if ((serviceAreaCount ?? 0) === 0) {
    return { status: 'out_of_area', address }
  }

  // ── Gate 2: is the address inside a franchise / restricted zone? ───────
  const { data: zoneRows, error: zoneErr } = await supabase
    .from('franchise_zones')
    .select('id, franchisee_id, city, township, county, state, notes')
    .eq('state', address.state)
    .eq('county', address.county)
    .eq('is_active', true)

  if (zoneErr) {
    console.warn('[coverage] franchise-zone lookup failed:', zoneErr.message)
    return { status: 'available', address }
  }

  const zones = (zoneRows ?? []) as FranchiseZone[]
  if (zones.length === 0) return { status: 'available', address }

  // Match priority: city → township → county-wide
  if (address.city) {
    const cityMatch = zones.find(z =>
      z.city && z.city.toLowerCase() === address.city.toLowerCase(),
    )
    if (cityMatch) return { status: 'restricted', address, zone: cityMatch }
  }
  if (address.township) {
    const townshipMatch = zones.find(z =>
      z.township && z.township.toLowerCase() === address.township.toLowerCase(),
    )
    if (townshipMatch) return { status: 'restricted', address, zone: townshipMatch }
  }
  const countyWide = zones.find(z => !z.city && !z.township)
  if (countyWide) return { status: 'restricted', address, zone: countyWide }

  return { status: 'available', address }
}
