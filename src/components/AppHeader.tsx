import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { User, LogOut, Package, Settings } from 'lucide-react'

export default function AppHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    setMenuOpen(false)
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#E0E0E0] shadow-sm">
      <div className="max-w-[480px] mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="text-[#1A73E8] font-bold text-lg tracking-tight">
          iForgotTrashDay
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {user ? (
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
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  {/* Dropdown */}
                  <div className="absolute right-0 top-11 z-20 bg-white border border-[#E0E0E0] rounded-xl shadow-lg w-48 overflow-hidden">
                    <Link
                      to="/orders"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-[#1A1A1A] hover:bg-[#F5F5F5] text-sm"
                    >
                      <Package size={16} />
                      My Orders
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
