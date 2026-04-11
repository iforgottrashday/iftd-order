import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { MapPin, Clock, Package, CreditCard, Camera, Zap, ArrowLeft } from 'lucide-react'

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
// Mirrors the logic in mobile orderService.generateDisposalStops.
// Groups ordered materials into the fewest facility stops (greedy, most
// versatile sites first). One stop per facility, one shared load number.
async function generateDisposalStops(
  orderId: string,
  county: string,
  state: string,
  items: OrderItem[],
): Promise<void> {
  const materialTypes = items.filter(i => i.quantity > 0).map(i => i.product_id)
  if (materialTypes.length === 0) return

  // Try county-specific sites first; fall back to all active sites
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

  // Sort most-versatile sites first
  const sorted = [...sites].sort(
    (a, b) => b.accepted_materials.length - a.accepted_materials.length,
  )

  // Greedy assignment: reuse already-selected sites before opening new ones
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

  // One stop per facility
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

  const handlePlaceOrder = async () => {
    if (!user) { setError('Not signed in.'); return }
    setError('')
    setLoading(true)

    try {
      // Step 1: Mock payment authorization (always approves — replace with Stripe when ready)
      const transactionId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const paymentResult = { authorized: true, transactionId }

      const dbItems = items.map((item) => ({
        product_id: item.product_id,
        label: item.label,
        quantity: item.quantity,
        unbagged_qty: item.unbagged_qty ?? 0,
      }))

      // Upload photo to Supabase Storage if provided
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
        pricing: pricing,
        total: pricing.total,
        payment_result: paymentResult,
      }
      console.log('[CheckoutPage] inserting order payload:', payload)

      // Step 1: insert the order
      const { error: insertError } = await supabase
        .from('orders')
        .insert(payload)

      if (insertError) {
        console.error('[CheckoutPage] insert error:', insertError)
        throw new Error(insertError.message)
      }

      console.log('[CheckoutPage] insert succeeded, fetching order id...')

      // Step 2: fetch the order we just created (avoids RLS read-back issues)
      const { data: newOrder, error: fetchError } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (fetchError || !newOrder) {
        console.warn('[CheckoutPage] fetch-back failed, going to /orders:', fetchError)
        navigate('/orders', { replace: true })
        return
      }

      // Step 3: generate disposal stops (required for hauler routing)
      await generateDisposalStops(
        newOrder.id,
        location_county ?? '',
        location_state ?? '',
        items,
      )

      console.log('[CheckoutPage] navigating to order-submitted:', newOrder.id)
      navigate(`/order-submitted/${newOrder.id}`, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to place order. Please try again.'
      console.error('[CheckoutPage] caught error:', err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-6 pb-44">
      <div>
        <button
          onClick={() => navigate(-1)}
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

      {/* Total */}
      <section className="border border-[#E0E0E0] rounded-xl p-4">
        <div className="flex justify-between font-bold text-[#1A1A1A] text-base">
          <span>Total</span>
          <span>${pricing.total.toFixed(2)}</span>
        </div>
      </section>

      {/* Payment note */}
      <section className="bg-[#F5F5F5] rounded-xl p-4 flex items-start gap-3">
        <CreditCard size={20} className="text-[#666666] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[#1A1A1A]">Payment</p>
          <p className="text-xs text-[#666666] mt-0.5">
            Your payment is authorized when you place your order. You will not be charged until your pickup is completed.
          </p>
        </div>
      </section>

      {/* Place Order sticky footer — sits above the bottom nav (z-40) */}
      <div className="fixed bottom-[52px] left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[#E0E0E0] px-4 py-3 z-50">
        {error && (
          <p className="text-[#EF4444] text-xs font-medium mb-2 text-center">{error}</p>
        )}
        <button
          onClick={handlePlaceOrder}
          disabled={loading}
          className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-60"
        >
          {loading ? 'Placing order...' : `Place Order — $${pricing.total.toFixed(2)}`}
        </button>
      </div>
    </div>
  )
}
