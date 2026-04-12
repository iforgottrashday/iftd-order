import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Bell, RefreshCw, X } from 'lucide-react'

interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, string> | null
  read: boolean
  dismissed: boolean
  created_at: string
}

function getIcon(type: string): string {
  const map: Record<string, string> = {
    order_status: '🚛',
    message: '💬',
    points_earned: '⭐',
    gift_card: '🎁',
    kudos_confirmed: '✓',
  }
  return map[type] ?? '🔔'
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (!user) return
    if (isRefresh) setRefreshing(true)

    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, read, dismissed, created_at')
      .eq('user_id', user.id)
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(50)

    setNotifications((data ?? []) as AppNotification[])
    setLoading(false)
    setRefreshing(false)
  }, [user])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  const dismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await supabase.from('notifications').update({ dismissed: true, read: true }).eq('id', id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const markAllRead = async () => {
    if (!user) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleClick = async (notif: AppNotification) => {
    if (!notif.read) await markRead(notif.id)
    if (notif.data?.orderId) {
      navigate(`/order-status/${notif.data.orderId}`)
    } else if (notif.type === 'points_earned') {
      navigate('/rewards')
    }
  }

  const unread = notifications.filter((n) => !n.read)
  const read = notifications.filter((n) => n.read)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-8">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#E0E0E0] flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1A1A1A]">Notifications</h1>
        <button
          onClick={() => loadNotifications(true)}
          className="text-[#1A73E8] p-1.5 rounded-lg hover:bg-[#F5F5F5]"
          aria-label="Refresh notifications"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Mark all read */}
      {unread.length > 0 && (
        <div className="px-4 py-2 flex justify-end border-b border-[#F0F0F0]">
          <button
            onClick={markAllRead}
            className="text-xs text-[#1A73E8] font-semibold py-1 px-2 rounded hover:bg-[#EBF3FD]"
          >
            Mark all read
          </button>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="px-4 py-16 flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 bg-[#F5F5F5] rounded-full flex items-center justify-center">
            <Bell size={28} className="text-[#999]" />
          </div>
          <div>
            <p className="font-semibold text-[#1A1A1A]">No notifications</p>
            <p className="text-sm text-[#666666] mt-1">You're all caught up!</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {unread.length > 0 && (
            <div>
              <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider">
                  New ({unread.length})
                </p>
              </div>
              <div className="mx-4 border border-[#E0E0E0] rounded-xl overflow-hidden">
                {unread.map((notif, i) => (
                  <NotifCard
                    key={notif.id}
                    notif={notif}
                    isLast={i === unread.length - 1}
                    onClick={handleClick}
                    onDismiss={dismiss}
                  />
                ))}
              </div>
            </div>
          )}

          {read.length > 0 && (
            <div className="mt-4">
              <div className="px-4 pt-2 pb-2">
                <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider">Earlier</p>
              </div>
              <div className="mx-4 border border-[#E0E0E0] rounded-xl overflow-hidden">
                {read.map((notif, i) => (
                  <NotifCard
                    key={notif.id}
                    notif={notif}
                    isLast={i === read.length - 1}
                    onClick={handleClick}
                    onDismiss={dismiss}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NotifCard({
  notif,
  isLast,
  onClick,
  onDismiss,
}: {
  notif: AppNotification
  isLast: boolean
  onClick: (n: AppNotification) => void
  onDismiss: (id: string, e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={() => onClick(notif)}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F5F5F5] active:bg-[#EBF3FD] ${
        !isLast ? 'border-b border-[#F0F0F0]' : ''
      } ${!notif.read ? 'bg-[#EEF4FF]' : 'bg-white'} relative`}
    >
      {/* Unread indicator bar */}
      {!notif.read && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1A73E8] rounded-l-xl" />
      )}

      {/* Icon */}
      <div className="w-9 h-9 bg-[#F5F5F5] rounded-full flex items-center justify-center shrink-0 text-lg leading-none">
        {getIcon(notif.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1A1A1A] leading-snug">{notif.title}</p>
        <p className="text-xs text-[#666666] mt-0.5 leading-relaxed">{notif.body}</p>
        <p className="text-xs text-[#999] mt-1">{relativeTime(notif.created_at)}</p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={(e) => onDismiss(notif.id, e)}
        className="shrink-0 text-[#999] hover:text-[#666666] p-1 -mr-1 rounded"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </button>
  )
}
