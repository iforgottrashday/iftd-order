import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { User, LogOut, Package, Settings, Bell, Star } from 'lucide-react'

export default function AppHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const loadUnreadCount = useCallback(async () => {
    if (!user) return
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)
      .eq('dismissed', false)
    setUnreadCount(count ?? 0)
  }, [user])

  useEffect(() => {
    loadUnreadCount()
  }, [loadUnreadCount])

  const handleSignOut = async () => {
    await signOut()
    setMenuOpen(false)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#E0E0E0] shadow-sm">
      <div className="max-w-[480px] mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center">
          <img src="/logo-full.png" alt="iForgotTrashDay" className="h-9 object-contain" />
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {/* Bell icon with badge */}
              <Link
                to="/notifications"
                className="relative flex items-center justify-center w-9 h-9 rounded-full text-[#666666] hover:bg-[#F5F5F5]"
                aria-label="Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>

              {/* Account menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1A73E8] text-white"
                  aria-label="Account menu"
                >
                  <User size={18} />
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-11 z-20 bg-white border border-[#E0E0E0] rounded-xl shadow-lg w-52 overflow-hidden">
                      <Link
                        to="/orders"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-[#1A1A1A] hover:bg-[#F5F5F5] text-sm"
                      >
                        <Package size={16} />
                        My Orders
                      </Link>
                      <Link
                        to="/rewards"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-[#1A1A1A] hover:bg-[#F5F5F5] text-sm"
                      >
                        <Star size={16} />
                        Rewards &amp; Points
                      </Link>
                      <Link
                        to="/notifications"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-[#1A1A1A] hover:bg-[#F5F5F5] text-sm"
                      >
                        <Bell size={16} />
                        Notifications
                        {unreadCount > 0 && (
                          <span className="ml-auto min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </Link>
                      <Link
                        to="/profile"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-[#1A1A1A] hover:bg-[#F5F5F5] text-sm"
                      >
                        <Settings size={16} />
                        Profile
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 px-4 py-3 text-[#EF4444] hover:bg-[#F5F5F5] text-sm w-full text-left"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/sign-in"
                className="text-[#1A73E8] text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-[#F5F5F5]"
              >
                Sign In
              </Link>
              <Link
                to="/sign-up"
                className="bg-[#1A73E8] text-white text-sm font-medium px-3 py-1.5 rounded-lg"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
