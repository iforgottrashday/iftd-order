import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { MapPin, Clock, Package, ArrowLeft, CheckCircle, Circle } from 'lucide-react'

type OrderStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'

interface Order {
  id: string
  status: OrderStatus
  location: string
  scheduled_date: string | null
  scheduled_hour: number | null
  items: Array<{ product_id?: string; id?: string; label: string; quantity?: number; qty?: number; bags?: number }>
  pricing: { subtotal: number; disposalFee: number; serviceFee: number; total: number } | null
  total: number | null
  private_notes: string | null
  created_at: string
}

function getHourLabel(h: number): string {
  if (h === 12) return '12:00 PM'
  if (h > 12) return `${h - 12}:00 PM`
  return `${h}:00 AM`
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
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
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!orderId) return

    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, location, scheduled_date, scheduled_hour, items, pricing, total, private_notes, created_at')
        .eq('id', orderId)
        .single()

      if (error) {
        setError('Order not found.')
      } else {
        setOrder(data as Order)
      }
      setLoading(false)
    }

    fetchOrder()

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
          <h1 className="text-xl font-bold text-[#1A1A1A]">Order Status</h1>
          <p className="text-xs text-[#666666] mt-0.5 font-mono break-all">{order.id.slice(0, 8)}...</p>
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
          {formatDate(order.scheduled_date)} at {getHourLabel(order.scheduled_hour)}
        </p>
      </section>

      {/* Items */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[#666666] text-sm font-medium">
          <Package size={16} />
          Items
        </div>
        {order.items.map((item, i) => {
          const qty = item.quantity ?? item.qty ?? 0
          return (
            <div key={i} className="flex justify-between items-center">
              <div>
                <p className="text-[#1A1A1A] text-sm font-medium">{item.label}</p>
                {item.bags !== undefined ? (
                  <p className="text-[#666666] text-xs">{qty} bin{qty !== 1 ? 's' : ''} × {item.bags} bag{item.bags !== 1 ? 's' : ''}</p>
                ) : (
                  <p className="text-[#666666] text-xs">Qty: {qty}</p>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* Pricing */}
      <section className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2">
        {order.pricing ? (
          <>
            <div className="flex justify-between text-sm text-[#666666]">
              <span>Subtotal</span>
              <span>${order.pricing.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-[#666666]">
              <span>Disposal fee</span>
              <span>${order.pricing.disposalFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-[#666666]">
              <span>Service fee</span>
              <span>${order.pricing.serviceFee.toFixed(2)}</span>
            </div>
          </>
        ) : null}
        <div className="flex justify-between font-bold text-[#1A1A1A] text-base pt-2 border-t border-[#E0E0E0]">
          <span>Total</span>
          <span>${(order.pricing?.total ?? order.total ?? 0).toFixed(2)}</span>
        </div>
      </section>
    </div>
  )
}
