import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { MapPin, Clock, Package, CreditCard, Camera, Zap, ArrowLeft, Star, Minus, Plus, X, Lock } from 'lucide-react'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)

const POINTS_PER_FREE_ITEM = 100
const POINTS_PER_ITEM_EARNED = 5

interface OrderItem {
  product_id: string
  label: string
  quantity: number
  unbagged_qty?: number
}

interface OrderState {
  address: string
  latitude: number | null
  longitude: number | null
  location_county: string
  location_state: string
  items: OrderItem[]
  pickupType: 'now' | 'later'
  scheduledDate: string | null
  scheduledHour: number | null
  notes: string
  privateNotes: string
  photoFile: File | null
  pricing: {
    subtotal: number
    disposalFee: number
    serviceFee: number
    total: number
  }
}

// ── Load number generation ────────────────────────────────────────────────────
const LOAD_NUMBER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateLoadNumber(): string {
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += LOAD_NUMBER_CHARS[Math.floor(Math.random() * LOAD_NUMBER_CHARS.length)]
  }
  return result
}

// ── Disposal stop generation ──────────────────────────────────────────────────
async function generateDisposalStops(
  orderId: string,
  county: string,
  state: string,
  items: OrderItem[],
): Promise<void> {
  const materialTypes = items.filter(i => i.quantity > 0).map(i => i.product_id)
  if (materialTypes.length === 0) return

  let sites: { id: string; accepted_materials: string[] }[] | null = null

  if (county && state) {
    const { data: serviceAreas } = await supabase
      .from('disposal_site_service_areas')
      .select('disposal_site_id')
      .eq('county', county)
      .eq('state', state)

    if (serviceAreas?.length) {
      const { data } = await supabase
        .from('disposal_sites')
        .select('id, accepted_materials')
        .in('id', serviceAreas.map((sa: { disposal_site_id: string }) => sa.disposal_site_id))
        .eq('is_active', true)
      sites = data
    }
  }

  if (!sites?.length) {
    const { data } = await supabase
      .from('disposal_sites')
      .select('id, accepted_materials')
      .eq('is_active', true)
    sites = data
  }

  if (!sites?.length) return

  const sorted = [...sites].sort(
    (a, b) => b.accepted_materials.length - a.accepted_materials.length,
  )

  const siteToMaterials: Record<string, string[]> = {}
  for (const material of materialTypes) {
    let assigned = false
    for (const siteId of Object.keys(siteToMaterials)) {
      const site = sites!.find(s => s.id === siteId)
      if (site?.accepted_materials.includes(material)) {
        siteToMaterials[siteId].push(material)
        assigned = true
        break
      }
    }
    if (!assigned) {
      const best = sorted.find(
        s => s.accepted_materials.includes(material) && !siteToMaterials[s.id],
      )
      if (best) siteToMaterials[best.id] = [material]
    }
  }

  const stops = Object.entries(siteToMaterials).map(([siteId, mats]) => ({
    order_id: orderId,
    disposal_site_id: siteId,
    materials: mats,
    status: 'pending',
    load_number: generateLoadNumber(),
  }))

  if (stops.length > 0) {
    const { error: stopsError } = await supabase
      .from('order_disposal_stops')
      .insert(stops)
    if (stopsError) {
      console.warn('[CheckoutPage] disposal stops insert failed:', stopsError)
    }
  }
}

function getHourLabel(h: number): string {
  if (h === 12) return '12:00 PM'
  if (h > 12) return `${h - 12}:00 PM`
  return `${h}:00 AM`
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// ── Payment sheet inner form (must be inside <Elements>) ──────────────────────
interface PaymentSheetFormProps {
  amount: number
  onSuccess: (paymentIntentId: string) => Promise<void>
  onClose: () => void
}

function PaymentSheetForm({ amount, onSuccess, onClose }: PaymentSheetFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  const handlePay = async () => {
    if (!stripe || !elements) return
    setError('')
    setPaying(true)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message ?? 'Card error.')
      setPaying(false)
      return
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/orders`,
      },
    })

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed. Please try again.')
      setPaying(false)
      return
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'requires_capture') {
      await onSuccess(paymentIntent.id)
    } else {
      setError('Payment could not be confirmed. Please try again.')
      setPaying(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">Payment</h2>
          <p className="text-sm text-[#666666] mt-0.5">Charged securely now</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center"
        >
          <X size={16} className="text-[#666666]" />
        </button>
      </div>

      {/* Amount */}
      <div className="bg-[#F5F5F5] rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-[#666666] font-medium">Order total</span>
        <span className="text-lg font-bold text-[#1A1A1A]">${amount.toFixed(2)}</span>
      </div>

      {/* Stripe Payment Element */}
      <PaymentElement />

      {error && (
        <p className="text-[#EF4444] text-sm font-medium text-center">{error}</p>
      )}

      {/* Pay button */}
      <button
        onClick={handlePay}
        disabled={paying || !stripe || !elements}
        className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {paying ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Lock size={15} />
            Pay ${amount.toFixed(2)}
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-[#999999]">
        <Lock size={11} />
        Secured by Stripe
      </div>
    </div>
  )
}

// ── Main checkout page ────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const state = location.state as OrderState | undefined

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photoPreview] = useState<string | null>(() => {
    if (!state?.photoFile) return null
    try { return URL.createObjectURL(state.photoFile) } catch { return null }
  })
  const [pointsBalance, setPointsBalance] = useState(0)
  const [freeItemsToRedeem, setFreeItemsToRedeem] = useState(0)

  // Payment sheet state
  const [showPaymentSheet, setShowPaymentSheet] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('points_balance')
      .single()
      .then(({ data }) => {
        if (data?.points_balance != null) setPointsBalance(data.points_balance)
      })
  }, [])

  if (!state) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[#666666]">No order data found.</p>
        <button
          onClick={() => navigate('/request')}
          className="mt-4 text-[#1A73E8] font-medium"
        >
          Start a new request
        </button>
      </div>
    )
  }

  const { address, latitude, longitude, location_county, location_state, items, pickupType, scheduledDate, scheduledHour, notes, privateNotes, pricing } = state

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const freeItemsAvailable = Math.floor(pointsBalance / POINTS_PER_FREE_ITEM)
  const maxRedeemable = Math.min(freeItemsAvailable, totalItems)
  const discountAmount = freeItemsToRedeem * 20
  const discountedTotal = Math.max(0, pricing.total - discountAmount)
  const paidItems = Math.max(0, totalItems - freeItemsToRedeem)
  const pointsEarned = paidItems * POINTS_PER_ITEM_EARNED

  // ── Insert order after payment succeeds ────────────────────────────────────
  const insertOrder = async (paymentIntentId: string) => {
    if (!user) return
    try {
      const dbItems = items.map(item => ({
        product_id: item.product_id,
        label: item.label,
        quantity: item.quantity,
        unbagged_qty: item.unbagged_qty ?? 0,
      }))

      let photoUrl: string | null = null
      const photoFile = state.photoFile
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() ?? 'jpg'
        const path = `orders/${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('order-photos')
          .upload(path, photoFile, { upsert: true })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('order-photos').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }

      const payload = {
        customer_id: user.id,
        status: 'pending',
        pickup_time: pickupType,
        items: dbItems,
        scheduled_date: pickupType === 'now' ? null : scheduledDate,
        scheduled_hour: pickupType === 'now' ? null : scheduledHour,
        location: address,
        latitude: latitude || null,
        longitude: longitude || null,
        location_county: location_county || null,
        location_state: location_state || null,
        notes: notes || '',
        private_notes: privateNotes || '',
        photo_url: photoUrl,
        pricing,
        total: discountedTotal,
        points_redeemed: freeItemsToRedeem > 0 ? freeItemsToRedeem * POINTS_PER_FREE_ITEM : null,
        payment_result: { authorized: true, transactionId: paymentIntentId },
      }

      const { error: insertError } = await supabase.from('orders').insert(payload)
      if (insertError) throw new Error(insertError.message)

      const { data: newOrder, error: fetchError } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (fetchError || !newOrder) {
        navigate('/orders', { replace: true })
        return
      }

      await generateDisposalStops(newOrder.id, location_county ?? '', location_state ?? '', items)
      navigate(`/order-submitted/${newOrder.id}`, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to place order. Please try again.'
      setError(msg)
      setShowPaymentSheet(false)
    }
  }

  // ── Open payment sheet: create PaymentIntent first ─────────────────────────
  const handlePlaceOrder = async () => {
    if (!user) { setError('Not signed in.'); return }
    setError('')
    setLoading(true)

    // Free order — skip Stripe entirely
    if (discountedTotal === 0) {
      try {
        await insertOrder('points_redemption')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to place order. Please try again.'
        setError(msg)
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const res = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: discountedTotal, userId: user.id, email: user.email }),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) throw new Error(data.error ?? 'Could not initialize payment.')

      setClientSecret(data.clientSecret)
      setShowPaymentSheet(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not initialize payment.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-6 pb-44">
      <div>
        <button
          onClick={() => navigate('/request', { state: { restore: state } })}
          className="flex items-center gap-1 text-[#1A73E8] text-sm font-medium mb-3"
        >
          <ArrowLeft size={16} />
          Edit Order
        </button>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Review Order</h1>
        <p className="text-[#666666] text-sm mt-1">Confirm your details before placing</p>
      </div>

      {/* Address */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[#666666] text-sm font-medium">
          <MapPin size={16} />
          Pickup Address
        </div>
        <p className="text-[#1A1A1A] font-medium">{address}</p>
      </section>

      {/* Schedule */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[#666666] text-sm font-medium">
          <Clock size={16} />
          Pickup Time
        </div>
        <p className="text-[#1A1A1A] font-medium">
          {pickupType === 'now'
            ? <span className="flex items-center gap-1.5"><Zap size={15} className="text-[#1A73E8]" /> Instant Pickup</span>
            : scheduledDate && scheduledHour != null
              ? `${formatDate(scheduledDate)} at ${getHourLabel(scheduledHour)}`
              : 'Scheduled'}
        </p>
      </section>

      {/* Items */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-0">
        <div className="flex items-center gap-2 text-[#666666] text-sm font-medium mb-3">
          <Package size={16} />
          Items
        </div>
        {items.map((item, i) => {
          const unbagged  = item.unbagged_qty ?? 0
          const itemTotal = item.quantity * 20 + unbagged * 5
          return (
            <div key={i} className={`flex justify-between items-start py-2.5 ${i > 0 ? 'border-t border-[#F0F0F0]' : ''}`}>
              <div className="flex flex-col gap-0.5">
                <p className="text-[#1A1A1A] font-semibold text-sm">{item.label}</p>
                <p className="text-[#666666] text-xs">
                  {item.quantity} bin{item.quantity !== 1 ? 's' : ''} × $20.00
                </p>
                {unbagged > 0 && (
                  <p className="text-amber-700 text-xs font-medium">
                    ⚠ {unbagged} unbagged × $5.00 bagging fee
                  </p>
                )}
              </div>
              <p className="text-[#1A1A1A] text-sm font-semibold">${itemTotal.toFixed(2)}</p>
            </div>
          )
        })}

        {notes ? (
          <div className="pt-2 border-t border-[#E0E0E0]">
            <p className="text-xs text-[#666666]"><span className="font-semibold">Note:</span> {notes}</p>
          </div>
        ) : null}
        {privateNotes ? (
          <div className={`pt-2 border-t border-[#E0E0E0]${notes ? '' : ' mt-0'}`}>
            <p className="text-xs font-semibold text-amber-700">🔒 Access / gate info:</p>
            <p className="text-xs text-amber-900 mt-0.5">{privateNotes}</p>
          </div>
        ) : null}
      </section>

      {/* Photo */}
      {photoPreview && (
        <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[#666666] text-sm font-medium">
            <Camera size={16} />
            Photo
          </div>
          <img
            src={photoPreview}
            alt="Pickup area"
            className="w-full rounded-lg object-cover max-h-48"
          />
        </section>
      )}

      {/* Rewards redemption */}
      {pointsBalance >= POINTS_PER_FREE_ITEM && (
        <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[#666666] text-sm font-medium">
            <Star size={16} className="text-amber-500" />
            Apply Savings
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#1A1A1A] text-sm font-semibold">Redeem Points</p>
              <p className="text-[#666666] text-xs mt-0.5">
                {pointsBalance} pts · {freeItemsAvailable} free item{freeItemsAvailable !== 1 ? 's' : ''} available
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFreeItemsToRedeem(v => Math.max(0, v - 1))}
                disabled={freeItemsToRedeem === 0}
                className="w-8 h-8 rounded-full border border-[#E0E0E0] flex items-center justify-center disabled:opacity-30"
              >
                <Minus size={14} />
              </button>
              <span className="text-[#1A1A1A] font-bold text-base w-4 text-center">{freeItemsToRedeem}</span>
              <button
                onClick={() => setFreeItemsToRedeem(v => Math.min(maxRedeemable, v + 1))}
                disabled={freeItemsToRedeem >= maxRedeemable}
                className="w-8 h-8 rounded-full border border-[#E0E0E0] flex items-center justify-center disabled:opacity-30"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          {freeItemsToRedeem > 0 && (
            <p className="text-xs text-green-700 font-medium bg-green-50 rounded-lg px-3 py-2">
              🎉 {freeItemsToRedeem * POINTS_PER_FREE_ITEM} points will be redeemed — saving ${discountAmount.toFixed(2)}
            </p>
          )}
        </section>
      )}

      {/* Total */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-1.5">
        {freeItemsToRedeem > 0 && (
          <>
            <div className="flex justify-between text-[#666666] text-sm">
              <span>Subtotal</span>
              <span>${pricing.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-green-700 text-sm font-medium">
              <span>Points discount ({freeItemsToRedeem} free item{freeItemsToRedeem !== 1 ? 's' : ''})</span>
              <span>−${discountAmount.toFixed(2)}</span>
            </div>
            <div className="border-t border-[#E0E0E0] my-0.5" />
          </>
        )}
        <div className="flex justify-between font-bold text-[#1A1A1A] text-base">
          <span>Total</span>
          <span>${discountedTotal.toFixed(2)}</span>
        </div>
        {pointsEarned > 0 && (
          <p className="text-xs text-[#888888] mt-1">
            You'll earn <span className="font-semibold text-[#1A73E8]">{pointsEarned} point{pointsEarned !== 1 ? 's' : ''}</span> when this order is completed.
          </p>
        )}
      </section>

      {/* Payment note */}
      <section className="bg-[#F5F5F5] rounded-xl p-4 flex items-start gap-3">
        <CreditCard size={20} className="text-[#666666] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[#1A1A1A]">Payment</p>
          <p className="text-xs text-[#666666] mt-0.5">
            {discountedTotal === 0
              ? 'This order is fully covered by your reward points — no card charge.'
              : "Your card is charged when you place your order. If no hauler claims your pickup, you'll receive a full refund automatically."
            }
          </p>
        </div>
      </section>

      {/* Place Order sticky footer */}
      <div className="fixed bottom-[52px] left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[#E0E0E0] px-4 py-3 z-50">
        {error && (
          <p className="text-[#EF4444] text-xs font-medium mb-2 text-center">{error}</p>
        )}
        <button
          onClick={handlePlaceOrder}
          disabled={loading}
          className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {discountedTotal === 0 ? 'Placing order…' : 'Setting up payment…'}</>
            : discountedTotal === 0
              ? 'Place Order — FREE 🎉'
              : `Place Order — $${discountedTotal.toFixed(2)}`
          }
        </button>
      </div>

      {/* ── Payment Sheet Overlay ────────────────────────────────────────────── */}
      {showPaymentSheet && clientSecret && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowPaymentSheet(false)}
          />
          {/* Sheet */}
          <div className="relative w-full max-w-[480px] bg-white rounded-t-2xl px-6 pt-6 pb-10 shadow-2xl">
            {/* Drag handle */}
            <div className="w-10 h-1 bg-[#E0E0E0] rounded-full mx-auto mb-5" />
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#1A73E8',
                    borderRadius: '10px',
                    fontFamily: 'system-ui, sans-serif',
                  },
                },
              }}
            >
              <PaymentSheetForm
                amount={discountedTotal}
                onSuccess={insertOrder}
                onClose={() => setShowPaymentSheet(false)}
              />
            </Elements>
          </div>
        </div>
      )}
    </div>
  )
}
