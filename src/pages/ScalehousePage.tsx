/*
 * ScalehousePage.tsx — Scalehouse operator portal for iForgotTrashDay
 *
 * SQL migration required in Supabase before this page is functional:
 *
 * ALTER TABLE public.order_disposal_stops
 *   ADD COLUMN IF NOT EXISTS gross_weight_lbs  numeric,
 *   ADD COLUMN IF NOT EXISTS tare_weight_lbs   numeric,
 *   ADD COLUMN IF NOT EXISTS yardage           numeric,
 *   ADD COLUMN IF NOT EXISTS disposal_price    numeric,
 *   ADD COLUMN IF NOT EXISTS rejection_reason  text,
 *   ADD COLUMN IF NOT EXISTS checked_out_at    timestamptz;
 *
 * -- RLS policies
 * CREATE POLICY "scalehouse_select" ON public.order_disposal_stops
 *   FOR SELECT TO anon, authenticated USING (true);
 * CREATE POLICY "scalehouse_update" ON public.order_disposal_stops
 *   FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
 * CREATE POLICY "authenticated_insert_stops" ON public.order_disposal_stops
 *   FOR INSERT TO authenticated WITH CHECK (true);
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Step = 'enter' | 'checkin_form' | 'checkout_form' | 'reject_modal' | 'checkin_success' | 'checkout_success' | 'rejected'

interface DisposalSiteRow {
  id: string
  name: string
  address: string
}

interface OrderRow {
  id: string
  location: string
  items: Array<{ id?: string; product_id?: string; label?: string; qty?: number; quantity?: number }>
}

interface StopRow {
  id: string
  order_id: string
  disposal_site_id: string
  materials: string[]
  status: string
  load_number: string | null
  gross_weight_lbs: number | null
  tare_weight_lbs: number | null
  yardage: number | null
  disposal_price: number | null
  disposal_site: DisposalSiteRow | null
  pickup: OrderRow | null
}

const REJECT_REASONS = [
  'Wrong material type',
  'Facility at capacity',
  'Safety concern',
  'Code not found or expired',
  'Other',
]

function formatItems(items: OrderRow['items']): string {
  if (!items || items.length === 0) return 'No items'
  return items
    .map(item => {
      const label = item.label ?? item.product_id ?? item.id ?? 'Item'
      const qty = item.quantity ?? item.qty ?? 1
      return `${qty}× ${label}`
    })
    .join(', ')
}

export default function ScalehousePage() {
  const [step, setStep]               = useState<Step>('enter')
  const [loadNumber, setLoadNumber]   = useState('')
  const [stop, setStop]               = useState<StopRow | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [submitting, setSubmitting]   = useState(false)

  // Check-in fields
  const [grossWeight, setGrossWeight] = useState('')
  const [yardage, setYardage]         = useState('')
  const [price, setPrice]             = useState('')

  // Check-out fields
  const [tareWeight, setTareWeight] = useState('')

  // Reject fields
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0])
  const [rejectNotes, setRejectNotes]   = useState('')

  const reset = () => {
    setStep('enter')
    setLoadNumber('')
    setStop(null)
    setLookupError(null)
    setSubmitting(false)
    setGrossWeight('')
    setYardage('')
    setPrice('')
    setTareWeight('')
    setRejectReason(REJECT_REASONS[0])
    setRejectNotes('')
  }

  // ── Lookup ──────────────────────────────────────────────────────────────
  const handleLookup = async () => {
    setLookupError(null)
    if (!loadNumber.trim()) { setLookupError('Please enter a load number.'); return }
    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('order_disposal_stops')
        .select('*, disposal_site:disposal_sites(id, name, address), pickup:orders(id, location, items)')
        .eq('load_number', loadNumber.trim().toUpperCase())
        .in('status', ['pending', 'checked_in'])
        .maybeSingle()

      if (error) throw error
      if (!data) { setLookupError('Load number not found or already processed.'); return }

      setStop(data as unknown as StopRow)
      setStep(data.status === 'checked_in' ? 'checkout_form' : 'checkin_form')
    } catch (err: unknown) {
      setLookupError(err instanceof Error ? err.message : 'An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Check-In ─────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!stop) return
    if (!grossWeight) { alert('Please enter gross weight before checking in.'); return }
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('order_disposal_stops')
        .update({
          status:           'checked_in',
          confirmed_at:     new Date().toISOString(),
          gross_weight_lbs: parseFloat(grossWeight),
          yardage:          yardage ? parseFloat(yardage) : null,
          disposal_price:   price   ? parseFloat(price)   : null,
        })
        .eq('load_number', stop.load_number)

      if (error) throw error
      setStep('checkin_success')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Check-in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Check-Out ─────────────────────────────────────────────────────────────
  const handleCheckOut = async () => {
    if (!stop) return
    if (!tareWeight) { alert('Please enter tare weight before checking out.'); return }
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('order_disposal_stops')
        .update({
          status:          'completed',
          tare_weight_lbs: parseFloat(tareWeight),
          checked_out_at:  new Date().toISOString(),
        })
        .eq('load_number', stop.load_number)

      if (error) throw error
      setStep('checkout_success')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Check-out failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!stop) return
    setSubmitting(true)
    try {
      const reason = `${rejectReason}${rejectNotes ? ': ' + rejectNotes : ''}`
      const { error } = await supabase
        .from('order_disposal_stops')
        .update({ rejection_reason: reason })
        .eq('load_number', stop.load_number)

      if (error) throw error
      setStep('rejected')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not submit rejection. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Net weight helper ─────────────────────────────────────────────────────
  const grossLbs = stop?.gross_weight_lbs ?? (grossWeight ? parseFloat(grossWeight) : null)
  const tareLbs  = tareWeight ? parseFloat(tareWeight) : null
  const netLbs   = grossLbs && tareLbs ? grossLbs - tareLbs : null

  // ── Shared load details card ──────────────────────────────────────────────
  const LoadCard = () => (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-left">
      <p className="text-xs font-mono text-gray-400 tracking-widest mb-2">#{stop?.load_number}</p>
      <p className="text-sm font-bold text-gray-800 mb-0.5">
        {stop?.disposal_site?.name ?? 'Unknown Facility'}
      </p>
      {stop?.disposal_site?.address && (
        <p className="text-xs text-gray-500 mb-2">{stop.disposal_site.address}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {stop?.materials.map(m => (
          <span key={m} className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full capitalize">
            {m.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
      {stop?.pickup?.items && (
        <p className="text-xs text-gray-600">{formatItems(stop.pickup.items)}</p>
      )}
      {stop?.pickup?.location && (
        <p className="text-xs text-gray-400 mt-1">📍 {stop.pickup.location}</p>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-[#0f1f3d] text-white px-6 py-4 shadow-md">
        <div className="max-w-2xl mx-auto">
          <span className="text-lg font-bold tracking-tight">iForgotTrashDay</span>
          <span className="mx-2 text-gray-400">—</span>
          <span className="text-sm text-gray-300 font-medium">Scalehouse Portal</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">

        {/* ── Enter load number ─────────────────────────────────────────── */}
        {step === 'enter' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Scalehouse Check-In</h1>
            <p className="text-gray-500 mb-8 text-sm">Enter the hauler's load number to begin</p>

            <label className="block text-left text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
              Load Number
            </label>
            <input
              type="text"
              value={loadNumber}
              onChange={e => setLoadNumber(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              placeholder="e.g. AB3DEFGH"
              className="w-full text-center text-3xl font-mono font-bold tracking-widest border-2 border-gray-300 rounded-xl px-4 py-4 focus:outline-none focus:border-blue-500 uppercase mb-4"
              maxLength={12}
              autoFocus
              spellCheck={false}
            />

            {lookupError && (
              <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                {lookupError}
              </p>
            )}

            <button
              onClick={handleLookup}
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Looking up…' : 'Look Up Load'}
            </button>
          </div>
        )}

        {/* ── Check-In form ─────────────────────────────────────────────── */}
        {(step === 'checkin_form' || step === 'reject_modal') && stop && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Check-In
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-5">Incoming Load</h2>

            <LoadCard />

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Gross Weight (lbs) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={grossWeight}
                onChange={e => setGrossWeight(e.target.value)}
                placeholder="Total weight of vehicle + load"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-blue-500"
                min="0"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Yardage (cubic yards)
              </label>
              <input
                type="number"
                value={yardage}
                onChange={e => setYardage(e.target.value)}
                placeholder="Optional"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-blue-500"
                min="0"
                step="0.1"
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Price ($)
              </label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="Optional — disposal fee charged"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-blue-500"
                min="0"
                step="0.01"
              />
            </div>

            <button
              onClick={handleCheckIn}
              disabled={submitting || !grossWeight}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg mb-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Processing…' : '✓ Check In'}
            </button>

            <button
              onClick={() => setStep('reject_modal')}
              disabled={submitting}
              className="w-full border-2 border-red-400 text-red-600 hover:bg-red-50 font-semibold py-3 rounded-xl text-base transition disabled:opacity-50"
            >
              Cannot Process This Load
            </button>
          </div>
        )}

        {/* ── Check-Out form ────────────────────────────────────────────── */}
        {step === 'checkout_form' && stop && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Check-Out
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-5">Outgoing Load</h2>

            <LoadCard />

            {/* Gross weight reminder */}
            {stop.gross_weight_lbs && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4 flex justify-between text-sm">
                <span className="text-gray-500">Gross weight recorded</span>
                <span className="font-bold text-gray-800">{stop.gross_weight_lbs.toLocaleString()} lbs</span>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Tare Weight (lbs) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={tareWeight}
                onChange={e => setTareWeight(e.target.value)}
                placeholder="Empty vehicle weight"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-blue-500"
                min="0"
                autoFocus
              />
            </div>

            {/* Net weight preview */}
            {netLbs !== null && netLbs > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 flex justify-between text-sm">
                <span className="text-blue-600 font-semibold">Net weight (load only)</span>
                <span className="font-bold text-blue-800">{netLbs.toLocaleString()} lbs</span>
              </div>
            )}

            <button
              onClick={handleCheckOut}
              disabled={submitting || !tareWeight}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Processing…' : '✓ Check Out'}
            </button>
          </div>
        )}

        {/* ── Reject Modal ──────────────────────────────────────────────── */}
        {step === 'reject_modal' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
              <h3 className="text-lg font-bold text-gray-900 mb-5">
                Why can't this load be processed?
              </h3>
              <div className="space-y-2 mb-4">
                {REJECT_REASONS.map(reason => (
                  <label key={reason} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                    <input
                      type="radio"
                      name="rejectReason"
                      value={reason}
                      checked={rejectReason === reason}
                      onChange={() => setRejectReason(reason)}
                      className="accent-red-600 w-4 h-4"
                    />
                    <span className="text-sm text-gray-800">{reason}</span>
                  </label>
                ))}
              </div>
              <div className="mb-6">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                  Additional notes (optional)
                </label>
                <textarea
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  placeholder="Any additional details…"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-400 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('checkin_form')}
                  disabled={submitting}
                  className="flex-1 border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={submitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Check-In Success ─────────────────────────────────────────── */}
        {step === 'checkin_success' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Load Checked In</h2>
            <p className="text-gray-500 text-sm mb-6">Hauler has been notified. Return when vehicle is empty for check-out.</p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Gross weight</span>
                <span className="font-bold text-gray-800">{parseFloat(grossWeight).toLocaleString()} lbs</span>
              </div>
              {yardage && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Yardage</span>
                  <span className="font-bold text-gray-800">{parseFloat(yardage)} yd³</span>
                </div>
              )}
              {price && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Disposal price</span>
                  <span className="font-bold text-gray-800">${parseFloat(price).toFixed(2)}</span>
                </div>
              )}
            </div>

            <button
              onClick={reset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition"
            >
              Check In Another Load
            </button>
          </div>
        )}

        {/* ── Check-Out Success ────────────────────────────────────────── */}
        {step === 'checkout_success' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
            <div className="text-6xl mb-4">🏁</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Load Checked Out</h2>
            <p className="text-gray-500 text-sm mb-6">Transaction complete.</p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left mb-6 space-y-2">
              {stop?.gross_weight_lbs && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Gross weight</span>
                  <span className="font-bold text-gray-800">{stop.gross_weight_lbs.toLocaleString()} lbs</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tare weight</span>
                <span className="font-bold text-gray-800">{parseFloat(tareWeight).toLocaleString()} lbs</span>
              </div>
              {stop?.gross_weight_lbs && (
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                  <span className="text-gray-700 font-semibold">Net weight</span>
                  <span className="font-bold text-gray-900">
                    {(stop.gross_weight_lbs - parseFloat(tareWeight)).toLocaleString()} lbs
                  </span>
                </div>
              )}
              {stop?.yardage && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Yardage</span>
                  <span className="font-bold text-gray-800">{stop.yardage} yd³</span>
                </div>
              )}
              {stop?.disposal_price && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Disposal price</span>
                  <span className="font-bold text-gray-800">${stop.disposal_price.toFixed(2)}</span>
                </div>
              )}
            </div>

            <button
              onClick={reset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition"
            >
              Process Another Load
            </button>
          </div>
        )}

        {/* ── Rejected ─────────────────────────────────────────────────── */}
        {step === 'rejected' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Load Flagged</h2>
            <p className="text-gray-500 text-sm mb-8">The hauler has been notified.</p>
            <button
              onClick={reset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition"
            >
              Process Another Load
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
