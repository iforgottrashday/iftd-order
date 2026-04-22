import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, Copy, Check } from 'lucide-react'

interface ProfileData {
  referral_code: string | null
  points_balance: number
  gift_card_balance: number
}

interface ActivityItem {
  id: string
  type: 'referral' | 'pickup' | 'redemption' | 'adjustment'
  description: string
  points: number
  date: string
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RewardsPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Load profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('referral_code, points_balance, gift_card_balance')
      .eq('id', user.id)
      .single()

    if (profileData) {
      setProfile(profileData as ProfileData)
    }

    // Load all three sources in parallel
    const [referralResult, ordersResult, ledgerResult] = await Promise.all([
      supabase
        .from('referral_events')
        .select('id, points_awarded, created_at')
        .eq('referrer_id', user.id),
      supabase
        .from('orders')
        .select('id, items, created_at')
        .eq('customer_id', user.id)
        .eq('status', 'completed'),
      supabase
        .from('points_ledger')
        .select('id, delta, reason, created_at')
        .eq('user_id', user.id)
        .neq('reason', 'order_complete') // exclude once award_order_points writes here
        .order('created_at', { ascending: false }),
    ])

    const items: ActivityItem[] = []

    for (const ref of referralResult.data ?? []) {
      items.push({
        id: `ref-${ref.id}`,
        type: 'referral',
        description: 'Referral bonus — friend placed first order',
        points: ref.points_awarded ?? 25,
        date: ref.created_at,
      })
    }

    for (const order of ordersResult.data ?? []) {
      const itemCount = (order.items as Array<{ quantity?: number; qty?: number }>).reduce(
        (sum, i) => sum + (i.quantity ?? i.qty ?? 0),
        0
      )
      const pts = itemCount * 5
      if (pts > 0) {
        items.push({
          id: `order-${order.id}`,
          type: 'pickup',
          description: `Pickup completed — ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
          points: pts,
          date: order.created_at,
        })
      }
    }

    for (const entry of ledgerResult.data ?? []) {
      items.push({
        id: `ledger-${entry.id}`,
        type: 'adjustment',
        description: entry.reason ?? 'Points adjustment',
        points: entry.delta,
        date: entry.created_at,
      })
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setActivity(items)
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  const copyCode = () => {
    if (!profile?.referral_code) return
    navigator.clipboard.writeText(profile.referral_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const points = profile?.points_balance ?? 0
  const freeItems = Math.floor(points / 100)
  const progressPoints = points % 100
  const progressPercent = progressPoints

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
      <div className="px-4 py-4 border-b border-[#E0E0E0] flex items-center gap-3">
        <Link to="/profile" className="text-[#1A73E8]">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold text-[#1A1A1A]">Rewards</h1>
      </div>

      {/* Blue stats banner */}
      <div className="bg-[#1A73E8] px-4 py-6">
        <div className="grid grid-cols-3 text-center gap-2">
          <div>
            <p className="text-white text-3xl font-bold leading-none">{points}</p>
            <p className="text-white/70 text-xs mt-1">Points Balance</p>
          </div>
          <div className="border-x border-white/20">
            <p className="text-white text-3xl font-bold leading-none">
              {activity.reduce((sum, a) => sum + (a.points > 0 ? a.points : 0), 0)}
            </p>
            <p className="text-white/70 text-xs mt-1">Lifetime Earned</p>
          </div>
          <div>
            <p className="text-white text-3xl font-bold leading-none">{freeItems}</p>
            <p className="text-white/70 text-xs mt-1">Free Items</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Progress bar — only when points > 0 and no free items yet */}
        {points > 0 && freeItems === 0 && (
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-[#1A1A1A]">Progress to next free item</p>
            <div className="w-full bg-[#F0F0F0] rounded-full h-3 overflow-hidden">
              <div
                className="bg-[#1A73E8] h-3 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-[#666666]">
              <span className="font-semibold text-[#1A73E8]">{progressPoints} / 100 pts</span>
              {' '}— {100 - progressPoints} more points needed
            </p>
          </div>
        )}

        {/* Referral code card */}
        {profile?.referral_code && (
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A]">Your Referral Code</p>
              <p className="text-xs text-[#666666] mt-1">
                Share your code with friends. You'll earn 25 points every time someone signs up and places their first order.
              </p>
            </div>
            <div className="border-2 border-dashed border-[#1A73E8] rounded-xl px-4 py-3 flex items-center justify-between bg-[#EBF3FD]">
              <span className="text-[#1A73E8] text-2xl font-mono font-bold tracking-widest">
                {profile.referral_code}
              </span>
              <button
                onClick={copyCode}
                className="flex items-center gap-1.5 bg-[#1A73E8] text-white text-sm font-semibold px-3 py-2 rounded-lg"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0F0F0]">
            <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider">How It Works</p>
          </div>
          <div className="divide-y divide-[#F0F0F0]">
            {[
              { emoji: '👥', text: 'Refer a friend', sub: '+25 pts when they place their first order' },
              { emoji: '🗑️', text: 'Complete a pickup', sub: '+5 pts per item picked up' },
              { emoji: '🎁', text: 'Earn bonus points', sub: 'Through promotions and events' },
              { emoji: '🏷️', text: 'Redeem 100 pts', sub: '1 free item at checkout' },
            ].map(({ emoji, text, sub }) => (
              <div key={text} className="flex items-start gap-3 px-4 py-3">
                <span className="text-xl leading-none mt-0.5">{emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-[#1A1A1A]">{text}</p>
                  <p className="text-xs text-[#666666] mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Points activity */}
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0F0F0]">
            <p className="text-xs font-semibold text-[#666666] uppercase tracking-wider">Points Activity</p>
          </div>

          {activity.length === 0 ? (
            <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
              <span className="text-3xl">🏆</span>
              <p className="text-sm font-semibold text-[#1A1A1A]">No activity yet</p>
              <p className="text-xs text-[#666666]">Earn points by completing pickups or referring friends</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F0F0F0]">
              {activity.map((item) => {
                const iconConfig = {
                  referral:   { bg: 'bg-green-100', text: 'text-green-700', emoji: '👥' },
                  pickup:     { bg: 'bg-blue-100',  text: 'text-blue-700',  emoji: '🗑️' },
                  redemption: { bg: 'bg-red-100',   text: 'text-red-600',   emoji: '🏷️' },
                  adjustment: { bg: 'bg-yellow-100',text: 'text-yellow-700',emoji: '⭐' },
                }[item.type]

                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconConfig.bg}`}>
                      <span className="text-base">{iconConfig.emoji}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">{item.description}</p>
                      <p className="text-xs text-[#666666] mt-0.5">{formatRelativeDate(item.date)}</p>
                    </div>
                    <span className={`text-sm font-bold shrink-0 ${item.points > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {item.points > 0 ? '+' : ''}{item.points} pts
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
