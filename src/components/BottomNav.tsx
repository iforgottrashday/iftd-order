import { Link, useLocation } from 'react-router-dom'
import { Home, Trash2, Package, Star } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const TABS = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/request', label: 'Request', Icon: Trash2, requiresAuth: true },
  { to: '/orders', label: 'Orders', Icon: Package, requiresAuth: true },
  { to: '/rewards', label: 'Rewards', Icon: Star, requiresAuth: true },
]

export default function BottomNav() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[#E0E0E0] z-40">
      <div className="flex">
        {TABS.map(({ to, label, Icon, requiresAuth }) => {
          const active = pathname === to || (to !== '/' && pathname.startsWith(to))
          const dest = requiresAuth && !user ? '/sign-in' : to
          return (
            <Link
              key={to}
              to={dest}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                active ? 'text-[#1A73E8]' : 'text-[#999999]'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
