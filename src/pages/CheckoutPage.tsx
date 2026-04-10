import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { MapPin, Clock, Package, CreditCard } from 'lucide-react'

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
  scheduledDate: string
  scheduledHour: number
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

  const { address, latitude, longitude, location_county, location_state, items, scheduledDate, scheduledHour, notes, privateNotes, pricing } = state

  const handlePlaceOrder = async () => {
    if (!user) { setError('Not signed in.'); return }
    setError('')
    setLoading(true)

    try {
      const dbItems = items.map((item) => ({
        product_id: item.product_id,
        label: item.label,
        quantity: item.quantity,
        unbagged_qty: item.unbagged_qty ?? 0,
      }))

      const mockPayment = { authorized: true, transactionId: `mock_${Date.now()}` }

      // Step 1: insert the order
      const { error: insertError } = await supabase
        .from('orders')
        .insert({
          customer_id: user.id,
          status: 'pending',
          items: dbItems,
          scheduled_date: scheduledDate,
          scheduled_hour: scheduledHour,
          location: address,
          latitude: latitude || null,
          longitude: longitude || null,
          location_county: location_county || null,
          location_state: location_state || null,
          private_notes: [notes, privateNotes].filter(Boolean).join('\n\n') || null,
          pricing: pricing,
          payment_result: mockPayment,
        })

      if (insertError) throw new Error(insertError.message)

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
        // Insert succeeded but couldn't read back — go to orders list
        navigate('/orders', { replace: true })
        return
      }

      navigate(`/order-submitted/${newOrder.id}`, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to place order. Please try again.'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-6 pb-44">
      <div>
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
          Schedule
        </div>
        <p className="text-[#1A1A1A] font-medium">
          {formatDate(scheduledDate)} at {getHourLabel(scheduledHour)}
        </p>
      </section>

      {/* Items */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[#666666] text-sm font-medium">
          <Package size={16} />
          Items
        </div>
        {items.map((item, i) => (
          <div key={i}>
            <p className="text-[#1A1A1A] font-medium text-sm">{item.label}</p>
            <p className="text-[#666666] text-xs">
              Qty: {item.quantity}
              {item.product_id === 'trash' && item.unbagged_qty ? ' · Unbagged' : ''}
            </p>
          </div>
        ))}

        {notes ? (
          <div className="pt-2 border-t border-[#E0E0E0]">
            <p className="text-xs text-[#666666]">Notes: {notes}</p>
          </div>
        ) : null}
      </section>

      {/* Pricing */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2">
        {items.map((item, i) => (
          <React.Fragment key={i}>
            <div className="flex justify-between text-sm text-[#666666]">
              <span>{item.label}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
              <span>${(20 * item.quantity).toFixed(2)}</span>
            </div>
            {(item.unbagged_qty ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-[#666666] pl-3">
                <span>↳ Unbagged ×{item.unbagged_qty}</span>
                <span>+${(5 * item.unbagged_qty!).toFixed(2)}</span>
              </div>
            )}
          </React.Fragment>
        ))}
        <div className="flex justify-between font-bold text-[#1A1A1A] text-base pt-2 border-t border-[#E0E0E0]">
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
            Payment will be collected by your hauler at time of pickup. No charges are made online at this time.
          </p>
        </div>
      </section>

      {/* Place Order sticky footer — sits above the bottom nav (z-40) */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[#E0E0E0] px-4 py-3 z-50">
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
