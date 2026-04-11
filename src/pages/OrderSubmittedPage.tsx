import { Link, useParams } from 'react-router-dom'
import { CheckCircle, Package, ArrowRight } from 'lucide-react'

export default function OrderSubmittedPage() {
  const { orderId } = useParams<{ orderId: string }>()

  return (
    <div className="px-4 py-12 flex flex-col items-center gap-6 text-center">
      {/* Success icon */}
      <div className="w-20 h-20 bg-[#22C55E]/10 rounded-full flex items-center justify-center">
        <CheckCircle size={48} className="text-[#22C55E]" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Your pickup is booked!</h1>
        <p className="text-[#666666] text-base mt-2">
          A hauler in your area will accept your order shortly.
        </p>
      </div>

      {orderId && (
        <div className="bg-[#F5F5F5] rounded-xl px-4 py-3 w-full">
          <p className="text-xs text-[#666666] font-medium uppercase tracking-wider">Order Reference</p>
          <p className="text-xl font-bold font-mono text-[#1A1A1A] mt-1 tracking-widest">
            #{orderId.slice(0, 8).toUpperCase()}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full mt-2">
        {orderId && (
          <Link
            to={`/order-status/${orderId}`}
            className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base flex items-center justify-center gap-2"
          >
            Track your order
            <ArrowRight size={18} />
          </Link>
        )}
        <Link
          to="/orders"
          className="w-full border border-[#E0E0E0] text-[#1A1A1A] font-medium py-4 rounded-xl text-base flex items-center justify-center gap-2"
        >
          <Package size={18} />
          View all orders
        </Link>
        <Link
          to="/"
          className="text-[#666666] text-sm"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
