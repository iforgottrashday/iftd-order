// Start-page router — given an address, return which IFTD product the
// customer should be sent to:
//
//   commercial  → local.iforgottrashday.com  (a franchisee operates here;
//                                              we hand off, including the
//                                              franchisee id in the URL)
//   consumer    → order.iforgottrashday.com  (P2P haulers; no franchisee
//                                              and no ordinance restriction)
//   unserved    → "Service not available yet" message
//
// Decision order:
//   1. franchisee_service_areas — match on (state, county) and optionally city.
//      If matched, route to commercial regardless of restriction status:
//      restriction means we can't run P2P, but the franchisee can still serve.
//   2. franchise_zones (is_active = true) — match priority city → township →
//      county-wide. If matched, route to unserved (restricted with no partner).
//   3. disposal_site_service_areas — at least one ACTIVE disposal site for
//      this county. If yes, route to consumer. If no, route to unserved.
//
// Both queries fail open conservatively: a hiccup falls back to the safest
// known route rather than blocking.

import { supabase } from './supabase'
import type { AddressComponents } from './googleMaps'

export interface RouterFranchisee {
  id:          string
  displayName: string
}

export type StartRouteResult =
  | { destination: 'commercial'; address: AddressComponents; franchisee: RouterFranchisee }
  | { destination: 'consumer';   address: AddressComponents }
  | { destination: 'unserved';   address: AddressComponents; reason: 'restricted' | 'no_disposal_sites' }
  | { destination: 'unknown';    address: AddressComponents }

interface FranchiseeAreaRow {
  franchisee_id: string
  city:          string | null
  franchisees:   { display_name: string } | { display_name: string }[] | null
}

interface FranchiseZoneRow {
  city:     string | null
  township: string | null
}

export async function resolveStartRoute(address: AddressComponents): Promise<StartRouteResult> {
  if (!address.county || !address.state) {
    return { destination: 'unknown', address }
  }

  // ── Step 1: any franchisee covering this county? ───────────────────────────
  const { data: areaRows, error: areaErr } = await supabase
    .from('franchisee_service_areas')
    .select('franchisee_id, city, franchisees!inner(display_name)')
    .eq('state', address.state)
    .eq('county', address.county)
    .eq('is_active', true)

  if (areaErr) {
    console.warn('[startRouter] franchisee_service_areas lookup failed:', areaErr.message)
    // Fall through — we'll try the other gates rather than block.
  } else {
    const rows = (areaRows ?? []) as unknown as FranchiseeAreaRow[]
    // Prefer a city-specific match if one matches the resolved locality;
    // otherwise take any county-wide row (city IS NULL).
    const cityMatch = address.city
      ? rows.find(r => r.city && r.city.toLowerCase() === address.city.toLowerCase())
      : undefined
    const match = cityMatch ?? rows.find(r => !r.city)
    if (match) {
      const fr = Array.isArray(match.franchisees) ? match.franchisees[0] : match.franchisees
      return {
        destination: 'commercial',
        address,
        franchisee: {
          id:          match.franchisee_id,
          displayName: fr?.display_name ?? match.franchisee_id,
        },
      }
    }
  }

  // ── Step 2: is the address inside an active franchise / restricted zone? ──
  const { data: zoneRows, error: zoneErr } = await supabase
    .from('franchise_zones')
    .select('city, township')
    .eq('state', address.state)
    .eq('county', address.county)
    .eq('is_active', true)

  if (zoneErr) {
    console.warn('[startRouter] franchise_zones lookup failed:', zoneErr.message)
  } else {
    const zones = (zoneRows ?? []) as FranchiseZoneRow[]
    const cityHit = address.city
      ? zones.some(z => z.city && z.city.toLowerCase() === address.city.toLowerCase())
      : false
    const townshipHit = address.township
      ? zones.some(z => z.township && z.township.toLowerCase() === address.township.toLowerCase())
      : false
    const countyWide = zones.some(z => !z.city && !z.township)
    if (cityHit || townshipHit || countyWide) {
      return { destination: 'unserved', address, reason: 'restricted' }
    }
  }

  // ── Step 3: do we have active disposal sites here? ─────────────────────────
  const { count: siteCount, error: siteErr } = await supabase
    .from('disposal_site_service_areas')
    .select('disposal_site_id, disposal_sites!inner(id)', { count: 'exact', head: true })
    .eq('state', address.state)
    .eq('county', address.county)
    .eq('disposal_sites.is_active', true)

  if (siteErr) {
    console.warn('[startRouter] disposal-site lookup failed:', siteErr.message)
    // Fall open — better to route to consumer than wrongly block.
    return { destination: 'consumer', address }
  }
  if ((siteCount ?? 0) === 0) {
    return { destination: 'unserved', address, reason: 'no_disposal_sites' }
  }

  return { destination: 'consumer', address }
}

/** Build the absolute URL for the resolved destination, including franchisee hand-off. */
export function destinationUrl(result: StartRouteResult): string | null {
  if (result.destination === 'commercial') {
    const u = new URL('https://local.iforgottrashday.com/')
    u.searchParams.set('franchisee', result.franchisee.id)
    return u.toString()
  }
  if (result.destination === 'consumer') {
    return 'https://order.iforgottrashday.com/'
  }
  return null
}
