import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ChevronRight, Package, Plus, RefreshCw } from 'lucide-react'

type OrderStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'

interface Order {
  id: string
  status: OrderStatus
  location: string
  scheduled_date: string | null
  scheduled_hour: number | null
  items: Array<{ product_id?: string; id?: string; label: string; quantity?: number; qty?: number }>
  pricing: { total: number } | null
  total: number | null
  created_at: string
}

function getHourLabel(h: number): string {
  if (h === 12) return '12 PM'
  if (h > 12) return `${h - 12} PM`
  return `${h} AM`
}

function formatDate(dateStr: string): string {
  const datePart = (dateStr ?? '').split('T')[0]
  const [year, month, day] = datePart.split('-').map(Number)
  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return 'Scheduled'
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; classes: string }> = {
    pending: { label: 'Pending', classes: 'bg-yellow-100 text-yellow-700' },
    accepted: { label: 'Accepted', classes: 'bg-blue-100 text-blue-700' },
    in_progress: { label: 'In Progress', classes: 'bg-blue-100 text-blue-700' },
    completed: { label: 'Completed', classes: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', classes: 'bg-gray-100 text-gray-500' },
  }
  const { label, classes } = map[status] ?? { label: status, classes: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${classes}`}>
      {label}
    </span>
  )
}

function OrderRow({ order }: { order: Order }) {
  const itemSummary = order.items.map((i) => `${i.label} ×${i.quantity ?? i.qty ?? 0}`).join(', ')

  return (
    <Link
      to={`/order-status/${order.id}`}
      className="flex items-center gap-3 p-4 border-b border-[#E0E0E0] last:border-0 active:bg-[#F5F5F5]"
    >
      <div className="w-10 h-10 bg-[#F5F5F5] rounded-lg flex items-center justify-center shrink-0">
        <Package size={20} className="text-[#666666]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#1A1A1A]">
            {order.scheduled_date && order.scheduled_hour != null
              ? `${formatDate(order.scheduled_date)} at ${getHourLabel(order.scheduled_hour)}`
              : 'Scheduled'}
          </span>
          <StatusBadge status={order.status} />
        </div>
        <p className="text-xs text-[#666666] mt-0.5 truncate">{itemSummary}</p>
        <p className="text-xs text-[#1A1A1A] font-medium mt-0.5">${(order.pricing?.total ?? order.total ?? 0).toFixed(2)}</p>
      </div>
      <ChevronRight size={16} className="text-[#999] shrink-0" />
    </Link>
  )
}

export default function OrdersPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrders = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('orders')
      .select('id, status, location, scheduled_date, scheduled_hour, items, pricing, total, created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
    setOrders((data ?? []) as Order[])
  }, [user])

  useEffect(() => {
    fetchOrders().then(() => setLoading(false))
  }, [fetchOrders])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }

  const activeOrders = orders.filter((o) => ['pending', 'accepted', 'in_progress'].includes(o.status))
  const pastOrders = orders.filter((o) => ['completed', 'cancelled'].includes(o.status))

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 py-5 border-b border-[#E0E0E0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-[#1A1A1A]">My Orders</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh orders"
            className="text-[#999999] hover:text-[#1A73E8] disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <Link
          to="/request"
          className="flex items-center gap-1 text-[#1A73E8] text-sm font-medium"
        >
          <Plus size={16} />
          New
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="px-4 py-16 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 bg-[#F5F5F5] rounded-full flex items-center justify-center">
            <Package size={28} className="text-[#999]" />
          </div>
          <div>
            <p className="font-semibold text-[#1A1A1A]">No orders yet</p>
            <p className="text-[#666666] text-sm mt-1">Request your first pickup below</p>
          </div>
          <Link
            to="/request"
            className="bg-[#1A73E8] text-white font-semibold px-6 py-3 rounded-xl text-sm"
          >
            Request a Pickup
          </Link>
        </div>
      ) : (
        <>
          {activeOrders.length > 0 && (
            <div>
              <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider">Active</p>
              </div>
              <div className="border border-[#E0E0E0] rounded-xl mx-4 overflow-hidden">
                {activeOrders.map((o) => <OrderRow key={o.id} order={o} />)}
              </div>
            </div>
          )}

          {pastOrders.length > 0 && (
            <div className="mt-4">
              <div className="px-4 pt-2 pb-2">
                <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider">Past Orders</p>
              </div>
              <div className="border border-[#E0E0E0] rounded-xl mx-4 overflow-hidden">
                {pastOrders.map((o) => <OrderRow key={o.id} order={o} />)}
              </div>
            </div>
          )}

          <div className="h-6" />
        </>
      )}
    </div>
  )
}
