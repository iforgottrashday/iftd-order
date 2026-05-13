// Per-bin pricing lookup — calls the get_zone_price_per_bin RPC, which
// applies the canonical IFTD formula against the highest disposal_cost
// among bin-accepting active disposal sites whose service areas include
// the given (state, county):
//
//   Price = ⌈ (MaxDumpCost + 3×ProcessingCharge + 3×Commission) / 3 ⌉₅
//
// When no qualifying site has a known disposal_cost, every field comes
// back null and the caller is expected to block the order with a clear
// "pricing not configured" message. We don't fall back to a default
// silently — at this stage we'd rather fail loudly than under-bill.

import { supabase } from './supabase'

export interface ZonePrice {
  pricePerBin:      number    // What the customer pays per bin in this county
  anchorSiteId:     string
  anchorSiteName:   string    // For admin diagnostics; not necessarily shown to customer
  dumpCostUsed:     number    // The MAX disposal cost the formula was evaluated against
  processingCharge: number
  commission:       number
  breakevenBins:    number
  roundingStep:     number
}

export type FetchZonePriceResult =
  | { status: 'priced';    zone: ZonePrice }
  | { status: 'no-data';   reason: 'No bin disposal site with a known cost serves this county yet.' }
  | { status: 'error';     message: string }

/**
 * Look up the per-bin price for a (state, county) zone.
 *
 * Fails open behaviorally to "no-data" rather than throwing — the customer
 * flow can render a friendly block message and the admin can act on it.
 */
export async function fetchZonePrice(
  state:  string,
  county: string,
): Promise<FetchZonePriceResult> {
  if (!state?.trim() || !county?.trim()) {
    return { status: 'no-data', reason: 'No bin disposal site with a known cost serves this county yet.' }
  }

  const { data, error } = await supabase.rpc('get_zone_price_per_bin', {
    p_state:  state,
    p_county: county,
  })

  if (error) {
    console.warn('[pricing] get_zone_price_per_bin failed:', error.message)
    return { status: 'error', message: error.message }
  }

  // The RPC returns SETOF — one row, even when anchor is NULL. Older PostgREST
  // versions sometimes hand back an object; tolerate both shapes.
  const row = Array.isArray(data) ? data[0] : data

  if (!row || row.price_per_bin == null) {
    return { status: 'no-data', reason: 'No bin disposal site with a known cost serves this county yet.' }
  }

  return {
    status: 'priced',
    zone: {
      pricePerBin:      Number(row.price_per_bin),
      anchorSiteId:     row.anchor_site_id,
      anchorSiteName:   row.anchor_site_name,
      dumpCostUsed:     Number(row.dump_cost_used),
      processingCharge: Number(row.processing_charge),
      commission:       Number(row.commission),
      breakevenBins:    Number(row.breakeven_bins),
      roundingStep:     Number(row.rounding_step),
    },
  }
}
