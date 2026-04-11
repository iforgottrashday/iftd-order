/*
 * ScalehousePage.tsx — Scalehouse operator portal for iForgotTrashDay
 *
 * SQL migration required in Supabase before this page is functional:
 *
 * ALTER TABLE public.order_disposal_stops
 *   ADD COLUMN IF NOT EXISTS gross_weight_lbs numeric,
 *   ADD COLUMN IF NOT EXISTS yardage          numeric,
 *   ADD COLUMN IF NOT EXISTS rejection_reason text;
 *
 * -- RLS policies for scalehouse portal (anon access via load_number token)
 * CREATE POLICY "scalehouse_select" ON public.order_disposal_stops
 *   FOR SELECT TO anon, authenticated USING (true);
 * CREATE POLICY "scalehouse_update" ON public.order_disposal_stops
 *   FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Step = 'enter' | 'review' | 'reject_modal' | 'success' | 'rejected'

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
  disposal_site: DisposalSiteRow | null
  pickup: OrderRow | null
}

const REJECT_REASONS = [
  'Code not found or expired',
  'Wrong material type',
  'Facility at capacity',
  'Safety concern',
  'Other',
]

function formatItems(items: OrderRow['items']): string {
  if (!items || items.length === 0) return 'No items'
  return items
    .map(item => {
      const label = item.label ?? item.product_id ?? item.id ?? 'Item'
      const qty = item.quantity ?? item.qty ?? 1
      return `${qty}x ${label}`
    })
    .join(', ')
}

export default function ScalehousePage() {
  const [step, setStep] = useState<Step>('enter')
  const [loadNumber, setLoadNumber] = useState('')
  const [stop, setStop] = useState<StopRow | null>(null)
  const [grossWeight, setGrossWeight] = useState('')
  const [yardage, setYardage] = useState('')
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0])
  const [rejectNotes, setRejectNotes] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successWeight, setSuccessWeight] = useState<string | null>(null)
  const [successYardage, setSuccessYardage] = useState<string | null>(null)

  const reset = () => {
    setStep('enter')
    setLoadNumber('')
    setStop(null)
    setGrossWeight('')
    setYardage('')
    setRejectReason(REJECT_REASONS[0])
    setRejectNotes('')
    setLookupError(null)
    setSubmitting(false)
    setSuccessWeight(null)
    setSuccessYardage(null)
  }

  const handleLookup = async () => {
    setLookupError(null)
    if (!loadNumber.trim()) {
      setLookupError('Please enter a load number.')
      return
    }
    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('order_disposal_stops')
        .select(`
          *,
          disposal_site:disposal_sites(id, name, address),
          pickup:orders(id, location, items)
        `)
        .eq('load_number', loadNumber.trim().toUpperCase())
        .in('status', ['pending', 'checked_in'])
        .maybeSingle()

      if (error) throw error
      if (!data) {
        setLookupError('Load number not found or already processed.')
        return
      }
      setStop(data as unknown as StopRow)
      setStep('review')
    } catch (err: unknown) {
      setLookupError(err instanceof Error ? err.message : 'An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckIn = async () => {
    if (!stop) return
    setSubmitting(true)
    try {
      // Update ALL stops sharing this load number — all orders comingled at this
      // facility are one physical load and should be confirmed together.
      const { error } = await supabase
        .from('order_disposal_stops')
        .update({
          status: 'checked_in',
          confirmed_at: new Date().toISOString(),
          gross_weight_lbs: grossWeight ? parseFloat(grossWeight) : null,
          yardage: yardage ? parseFloat(yardage) : null,
        })
        .eq('load_number', stop.load_number)

      if (error) throw error
      setSuccessWeight(grossWeight || null)
      setSuccessYardage(yardage || null)
      setStep('success')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Check-in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-navy-900 bg-[#0f1f3d] text-white px-6 py-4 shadow-md">
        <div className="max-w-2xl mx-auto">
          <span className="text-lg font-bold tracking-tight">iForgotTrashDay</span>
          <span className="mx-2 text-gray-400">—</span>
          <span className="text-sm text-gray-300 font-medium">Scalehouse Portal</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        {/* ── Step: Enter ─────────────────────────────────────────── */}
        {step === 'enter' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">iForgotTrashDay</h1>
            <p className="text-gray-500 mb-8 text-sm">Scalehouse Check-In Portal</p>

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

        {/* ── Step: Review ─────────────────────────────────────────── */}
        {(step === 'review' || step === 'reject_modal') && stop && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Load Details</h2>
            <p className="text-xs text-gray-400 font-mono mb-6 tracking-widest">
              #{stop.load_number}
            </p>

            {/* Facility */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Facility</p>
              <p className="text-base font-semibold text-gray-800">
                {stop.disposal_site?.name ?? 'Unknown Facility'}
              </p>
              {stop.disposal_site?.address && (
                <p className="text-sm text-gray-500">{stop.disposal_site.address}</p>
              )}
            </div>

            {/* Materials */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Materials</p>
              <div className="flex flex-wrap gap-2">
                {stop.materials.map(m => (
                  <span
                    key={m}
                    className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full capitalize"
                  >
                    {m.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>

            {/* Pickup address */}
            {stop.pickup?.location && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Pickup Address</p>
                <p className="text-sm text-gray-700">{stop.pickup.location}</p>
              </div>
            )}

            {/* Items */}
            {stop.pickup?.items && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Items</p>
                <p className="text-sm text-gray-700">{formatItems(stop.pickup.items)}</p>
              </div>
            )}

            <hr className="border-gray-100 mb-6" />

            {/* Weight input */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Gross Weight (lbs)
              </label>
              <input
                type="number"
                value={grossWeight}
                onChange={e => setGrossWeight(e.target.value)}
                placeholder="Enter weight"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:border-blue-500"
                min="0"
              />
            </div>

            {/* Yardage input */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">
                Yardage (cubic yards, optional)
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

            {/* Check In button */}
            <button
              onClick={handleCheckIn}
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg mb-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Processing…' : '✓ Check In'}
            </button>

            {/* Reject button */}
            <button
              onClick={() => setStep('reject_modal')}
              disabled={submitting}
              className="w-full border-2 border-red-400 text-red-600 hover:bg-red-50 font-semibold py-3 rounded-xl text-base transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cannot Process This Load
            </button>
          </div>
        )}

        {/* ── Step: Reject Modal (overlay on review) ───────────────── */}
        {step === 'reject_modal' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
              <h3 className="text-lg font-bold text-gray-900 mb-5">
                Why can't this load be processed?
              </h3>

              <div className="space-y-2 mb-4">
                {REJECT_REASONS.map(reason => (
                  <label
                    key={reason}
                    className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50"
                  >
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
                  onClick={() => setStep('review')}
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

        {/* ── Step: Success ────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Load Checked In!</h2>

            {successWeight && (
              <p className="text-gray-600 text-sm mb-1">
                Gross weight: <strong>{parseFloat(successWeight).toLocaleString()} lbs</strong>
              </p>
            )}
            {successYardage && (
              <p className="text-gray-600 text-sm mb-1">
                Yardage: <strong>{parseFloat(successYardage)} yd³</strong>
              </p>
            )}

            <p className="text-gray-500 text-sm mt-4 mb-8">
              The hauler has been notified. Thank you.
            </p>

            <button
              onClick={reset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition"
            >
              Check In Another Load
            </button>
          </div>
        )}

        {/* ── Step: Rejected ───────────────────────────────────────── */}
        {step === 'rejected' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Load Flagged</h2>
            <p className="text-gray-500 text-sm mb-8">
              The hauler has been notified.
            </p>

            <button
              onClick={reset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition"
            >
              Check In Another Load
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
