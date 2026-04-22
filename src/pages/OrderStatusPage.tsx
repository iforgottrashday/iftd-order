import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { MapPin, Clock, Package, ArrowLeft, CheckCircle, Circle, MessageCircle, XCircle, RefreshCw } from 'lucide-react'

type OrderStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'

interface Order {
  id: string
  status: OrderStatus
  location: string
  scheduled_date: string | null
  scheduled_hour: number | null
  hauler_id: string | null
  items: Array<{ product_id?: string; id?: string; label: string; quantity?: number; qty?: number; bags?: number; unbagged_qty?: number }>
  pricing: { subtotal: number; disposalFee: number; serviceFee: number; total: number } | null
  total: number | null
  photo_url: string | null
  private_notes: string | null
  created_at: string
}

const ITEM_PRICE       = 20
const UNBAGGED_SURCHARGE = 5

function getHourLabel(h: number): string {
  if (h === 12) return '12:00 PM'
  if (h > 12) return `${h - 12}:00 PM`
  return `${h}:00 AM`
}

function formatDate(dateStr: string): string {
  // Handle both YYYY-MM-DD and full ISO timestamps (stored by mobile app)
  const datePart = (dateStr ?? '').split('T')[0]
  const [year, month, day] = datePart.split('-').map(Number)
  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return 'Scheduled'
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const STATUS_STEPS: { key: OrderStatus | 'in_progress'; label: string; desc: string }[] = [
  { key: 'pending', label: 'Order Placed', desc: 'Waiting for a hauler to accept' },
  { key: 'accepted', label: 'Accepted', desc: 'A hauler is on their way' },
  { key: 'in_progress', label: 'In Progress', desc: 'Your trash is being picked up' },
  { key: 'completed', label: 'Completed', desc: 'All done!' },
]

const STATUS_ORDER: OrderStatus[] = ['pending', 'accepted', 'in_progress', 'completed']

function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; classes: string }> = {
    pending: { label: 'Pending', classes: 'bg-yellow-100 text-yellow-800' },
    accepted: { label: 'Accepted', classes: 'bg-blue-100 text-blue-800' },
    in_progress: { label: 'In Progress', classes: 'bg-blue-100 text-blue-800' },
    completed: { label: 'Completed', classes: 'bg-green-100 text-green-800' },
    cancelled: { label: 'Cancelled', classes: 'bg-gray-100 text-gray-600' },
  }
  const { label, classes } = map[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${classes}`}>
      {label}
    </span>
  )
}

export default function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrder = useCallback(async () => {
    if (!orderId) return
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, location, scheduled_date, scheduled_hour, hauler_id, items, pricing, total, photo_url, private_notes, created_at')
      .eq('id', orderId)
      .single()
    if (error) {
      setError('Order not found.')
    } else {
      setOrder(data as Order)
    }
  }, [orderId])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchOrder()
    setRefreshing(false)
  }

  useEffect(() => {
    if (!orderId) return
    fetchOrder().then(() => setLoading(false))

    // Subscribe to status changes
    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      }, (payload) => {
        setOrder((prev) => prev ? { ...prev, status: payload.new.status as OrderStatus } : prev)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [orderId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[#666666]">{error || 'Order not found.'}</p>
        <Link to="/orders" className="mt-4 text-[#1A73E8] font-medium block">
          View all orders
        </Link>
      </div>
    )
  }

  const currentStatusIndex = STATUS_ORDER.indexOf(order.status)

  async function handleCancelOrder() {
    if (!session?.access_token) { setCancelError('Not signed in.'); return }
    setCancelling(true)
    setCancelError('')
    try {
      const res = await fetch('/api/cancel-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId: order!.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not cancel order.')
      setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev)
      setShowCancelModal(false)
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'Could not cancel order.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-6">
      {/* Back nav */}
      <Link to="/orders" className="flex items-center gap-1 text-[#1A73E8] text-sm font-medium">
        <ArrowLeft size={16} />
        My Orders
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#1A1A1A]">Order Status</h1>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh order status"
              className="text-[#999999] hover:text-[#1A73E8] disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-base font-bold font-mono text-[#666666] mt-0.5 tracking-widest">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Status timeline */}
      {order.status !== 'cancelled' && (
        <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-0">
          {STATUS_STEPS.map((step, i) => {
            const stepIndex = STATUS_ORDER.indexOf(step.key as OrderStatus)
            const done = currentStatusIndex > stepIndex
            const active = currentStatusIndex === stepIndex

            return (
              <div key={step.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    done ? 'bg-[#22C55E]' : active ? 'bg-[#1A73E8]' : 'bg-[#E0E0E0]'
                  }`}>
                    {done ? (
                      <CheckCircle size={16} className="text-white" />
                    ) : (
                      <Circle size={16} className={active ? 'text-white' : 'text-[#999]'} />
                    )}
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`w-0.5 h-8 mt-1 ${done ? 'bg-[#22C55E]' : 'bg-[#E0E0E0]'}`} />
                  )}
                </div>
                <div className="pb-4">
                  <p className={`text-sm font-semibold ${active ? 'text-[#1A73E8]' : done ? 'text-[#1A1A1A]' : 'text-[#999]'}`}>
                    {step.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${active ? 'text-[#666666]' : 'text-[#999]'}`}>
                    {step.desc}
                  </p>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* Chat with Hauler */}
      {(order.status === 'accepted' || order.status === 'in_progress') && order.hauler_id && (
        <button
          onClick={() => navigate(`/chat/${order.id}`)}
          className="flex items-center justify-center gap-2 w-full border border-[#1A73E8] text-[#1A73E8] font-semibold py-3 rounded-xl text-sm hover:bg-[#EBF3FD] transition-colors"
        >
          <MessageCircle size={18} />
          Chat with Hauler
        </button>
      )}

      {/* Address */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[#666666] text-sm font-medium">
          <MapPin size={16} />
          Pickup Address
        </div>
        <p className="text-[#1A1A1A] font-medium text-sm">{order.location}</p>
      </section>

      {/* Schedule */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[#666666] text-sm font-medium">
          <Clock size={16} />
          Scheduled
        </div>
        <p className="text-[#1A1A1A] font-medium text-sm">
          {order.scheduled_date && order.scheduled_hour != null
            ? `${formatDate(order.scheduled_date)} at ${getHourLabel(order.scheduled_hour)}`
            : 'Scheduled'}
        </p>
      </section>

      {/* Items */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-0">
        <div className="flex items-center gap-2 text-[#666666] text-sm font-medium mb-3">
          <Package size={16} />
          Items
        </div>
        {order.items.map((item, i) => {
          const qty      = item.quantity ?? item.qty ?? 0
          const unbagged = item.unbagged_qty ?? 0
          const itemTotal = qty * ITEM_PRICE + unbagged * UNBAGGED_SURCHARGE
          return (
            <div key={i} className={`flex justify-between items-start py-2.5 ${i > 0 ? 'border-t border-[#F0F0F0]' : ''}`}>
              <div className="flex flex-col gap-0.5">
                <p className="text-[#1A1A1A] text-sm font-semibold">{item.label}</p>
                <p className="text-[#666666] text-xs">
                  {qty} bin{qty !== 1 ? 's' : ''} × ${ITEM_PRICE.toFixed(2)}
                </p>
                {unbagged > 0 && (
                  <p className="text-amber-700 text-xs font-medium">
                    ⚠ {unbagged} unbagged × ${UNBAGGED_SURCHARGE.toFixed(2)} bagging fee
                  </p>
                )}
              </div>
              <p className="text-[#1A1A1A] text-sm font-semibold">${itemTotal.toFixed(2)}</p>
            </div>
          )
        })}
      </section>

      {/* Access / gate info */}
      {order.private_notes && (
        <section className="border border-amber-200 bg-amber-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-700 mb-1">🔒 Access / gate info</p>
          <p className="text-sm text-amber-900">{order.private_notes}</p>
        </section>
      )}

      {/* Photo */}
      {order.photo_url && !order.photo_url.startsWith('file://') && (
        <section className="border border-[#E0E0E0] rounded-xl overflow-hidden">
          <img
            src={order.photo_url}
            alt="Pickup area"
            className="w-full object-cover max-h-64"
          />
        </section>
      )}

      {/* Total */}
      <section className="border border-[#E0E0E0] rounded-xl p-4">
        <div className="flex justify-between font-bold text-[#1A1A1A] text-base">
          <span>Total</span>
          <span>${(order.pricing?.total ?? order.total ?? 0).toFixed(2)}</span>
        </div>
      </section>

      {/* Cancel Order (pending only) */}
      {order.status === 'pending' && (
        <button
          onClick={() => { setCancelError(''); setShowCancelModal(true) }}
          className="flex items-center justify-center gap-2 w-full border border-[#EF4444] text-[#EF4444] font-semibold py-3 rounded-xl text-sm hover:bg-red-50 transition-colors"
        >
          <XCircle size={18} />
          Cancel Order
        </button>
      )}

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[480px] flex flex-col gap-4 shadow-xl">
            <h2 className="text-lg font-bold text-[#1A1A1A]">Cancel this order?</h2>
            <p className="text-sm text-[#666666]">
              Your order will be cancelled and a full refund of{' '}
              <span className="font-semibold text-[#1A1A1A]">
                ${(order.pricing?.total ?? order.total ?? 0).toFixed(2)}
              </span>{' '}
              will be returned to your original payment method within 3–5 business days.
            </p>
            {cancelError && (
              <p className="text-xs font-medium text-[#EF4444]">{cancelError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
                className="flex-1 border border-[#E0E0E0] text-[#1A1A1A] font-semibold py-3 rounded-xl text-sm hover:bg-[#F5F5F5] transition-colors disabled:opacity-50"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="flex-1 bg-[#EF4444] text-white font-semibold py-3 rounded-xl text-sm hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancelling ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
