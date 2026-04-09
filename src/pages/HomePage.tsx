import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, Package, ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export default function HomePage() {
  const { user } = useAuth()
  const [firstName, setFirstName] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('first_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.first_name) setFirstName(data.first_name)
      })
  }, [user])

  return (
    <div className="px-4 py-8 flex flex-col gap-8">
      {/* Hero */}
      <div className="flex flex-col items-center text-center gap-4 pt-2">
        <img src="/logo.png" alt="iForgotTrashDay" className="h-20 object-contain" />
        <div>
          {user && firstName ? (
            <>
              <h1 className="text-2xl font-bold text-[#1A1A1A]">
                Hey, {firstName}!
              </h1>
              <p className="text-[#666666] text-base mt-1">Ready to schedule a pickup?</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-[#1A1A1A] leading-tight">
                Missed trash day?
              </h1>
              <p className="text-xl text-[#FF6600] font-semibold mt-1">
                We've got you.
              </p>
              <p className="text-[#666666] text-base mt-2 max-w-xs mx-auto">
                On-demand trash pickup by neighbors who care. No judgment — just help.
              </p>
            </>
          )}
        </div>

        <Link
          to="/request"
          className="w-full bg-[#1A73E8] text-white font-semibold text-lg py-4 rounded-xl flex items-center justify-center gap-2 mt-2"
        >
          Request a Pickup
          <ArrowRight size={20} />
        </Link>
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[#666666] uppercase tracking-wider">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/request"
            className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2"
          >
            <div className="w-10 h-10 bg-[#1A73E8] rounded-lg flex items-center justify-center">
              <Trash2 size={20} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-[#1A1A1A] text-sm">Request Pickup</p>
              <p className="text-[#666666] text-xs mt-0.5">Schedule same-day or ahead</p>
            </div>
          </Link>

          <Link
            to="/orders"
            className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-2"
          >
            <div className="w-10 h-10 bg-[#FF6600] rounded-lg flex items-center justify-center">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-[#1A1A1A] text-sm">Track Order</p>
              <p className="text-[#666666] text-xs mt-0.5">View your pickups</p>
            </div>
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[#666666] uppercase tracking-wider">
          How It Works
        </h2>
        <div className="flex flex-col gap-2">
          {[
            { step: '1', title: 'Request a pickup', desc: 'Tell us what you need hauled and when.' },
            { step: '2', title: 'A neighbor accepts', desc: 'A local hauler picks up your order.' },
            { step: '3', title: 'Trash is gone', desc: 'Hauler disposes responsibly. Done.' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F5F5]">
              <div className="w-7 h-7 bg-[#1A73E8] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">{item.step}</span>
              </div>
              <div>
                <p className="font-semibold text-[#1A1A1A] text-sm">{item.title}</p>
                <p className="text-[#666666] text-xs mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
