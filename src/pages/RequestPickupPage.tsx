import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus, Camera, ChevronDown } from 'lucide-react'

// Pricing constants
const TRASH_BASE = 15
const TRASH_PER_BAG = 3
const RECYCLING_FLAT = 10
const DISPOSAL_FEE = 5
const SERVICE_FEE_RATE = 0.15

const SERVICE_START = 8
const SERVICE_END = 17

function getDefaultDate(): string {
  const now = new Date()
  if (now.getHours() >= 14) {
    // After 2pm → tomorrow
    now.setDate(now.getDate() + 1)
  }
  return now.toISOString().split('T')[0]
}

function getHourLabel(h: number): string {
  if (h === 12) return '12:00 PM'
  if (h > 12) return `${h - 12}:00 PM`
  return `${h}:00 AM`
}

function isHourDisabled(hour: number, selectedDate: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  if (selectedDate !== today) return false
  return hour <= new Date().getHours()
}

interface Stepper {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}

function StepperControl({ label, value, min, max, onChange }: Stepper) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[#1A1A1A] flex-1">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-9 h-9 rounded-full border border-[#E0E0E0] flex items-center justify-center disabled:opacity-40 active:bg-[#F5F5F5]"
        >
          <Minus size={16} />
        </button>
        <span className="w-6 text-center font-semibold text-[#1A1A1A]">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-9 h-9 rounded-full border border-[#E0E0E0] flex items-center justify-center disabled:opacity-40 active:bg-[#F5F5F5]"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

export default function RequestPickupPage() {
  const navigate = useNavigate()
  const photoRef = useRef<HTMLInputElement>(null)

  const [address, setAddress] = useState('')
  const [trashQty, setTrashQty] = useState(0)
  const [trashBags, setTrashBags] = useState(1)
  const [recyclingQty, setRecyclingQty] = useState(0)
  const [scheduledDate, setScheduledDate] = useState(getDefaultDate())
  const [scheduledHour, setScheduledHour] = useState(8)
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Recalculate default hour when date changes
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    if (scheduledDate === today) {
      const currentHour = new Date().getHours()
      // Find next available hour
      const nextHour = Math.max(SERVICE_START, currentHour + 1)
      if (nextHour < SERVICE_END) {
        setScheduledHour(nextHour)
      } else {
        setScheduledHour(SERVICE_START)
      }
    } else {
      setScheduledHour(SERVICE_START)
    }
  }, [scheduledDate])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setPhotoFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPhotoPreview(url)
    } else {
      setPhotoPreview(null)
    }
  }

  // Pricing calculation
  const trashSubtotal = trashQty > 0 ? TRASH_BASE + trashBags * TRASH_PER_BAG * trashQty : 0
  const recyclingSubtotal = recyclingQty > 0 ? RECYCLING_FLAT : 0
  const subtotal = trashSubtotal + recyclingSubtotal
  const disposalFee = subtotal > 0 ? DISPOSAL_FEE : 0
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE * 100) / 100
  const total = subtotal + disposalFee + serviceFee

  const hasItems = trashQty > 0 || recyclingQty > 0

  const handleReview = () => {
    if (!address.trim()) {
      alert('Please enter a pickup address.')
      return
    }
    if (!hasItems) {
      alert('Please add at least one item.')
      return
    }

    const items = []
    if (trashQty > 0) {
      items.push({ product_id: 'trash', label: 'Residential Trash', quantity: trashQty, bags: trashBags })
    }
    if (recyclingQty > 0) {
      items.push({ product_id: 'recycling', label: 'Recycling', quantity: recyclingQty })
    }

    navigate('/checkout', {
      state: {
        address,
        items,
        scheduledDate,
        scheduledHour,
        notes,
        photoFile,
        pricing: { subtotal, disposalFee, serviceFee, total },
      },
    })
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="px-4 py-6 flex flex-col gap-6 pb-32">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Request a Pickup</h1>
        <p className="text-[#666666] text-sm mt-1">Fill in the details below</p>
      </div>

      {/* Address */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[#1A1A1A]">Pickup Address</h2>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, Cincinnati, OH 45202"
          className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
        />
      </section>

      {/* Items */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[#1A1A1A]">Items</h2>

        {/* Trash card */}
        <div className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1A1A1A] rounded-lg flex items-center justify-center">
              <span className="text-lg">🗑️</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#1A1A1A]">Residential Trash</p>
              <p className="text-xs text-[#666666]">$15 base + $3/bag per bin</p>
            </div>
          </div>
          <StepperControl
            label="Trash bins"
            value={trashQty}
            min={0}
            max={10}
            onChange={setTrashQty}
          />
          {trashQty > 0 && (
            <StepperControl
              label="Bags per bin"
              value={trashBags}
              min={1}
              max={10}
              onChange={setTrashBags}
            />
          )}
        </div>

        {/* Recycling card */}
        <div className="border border-[#E0E0E0] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#22C55E] rounded-lg flex items-center justify-center">
              <span className="text-lg">♻️</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#1A1A1A]">Recycling</p>
              <p className="text-xs text-[#666666]">$10 flat</p>
            </div>
          </div>
          <StepperControl
            label="Recycling bins"
            value={recyclingQty}
            min={0}
            max={10}
            onChange={setRecyclingQty}
          />
        </div>
      </section>

      {/* Schedule */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[#1A1A1A]">Schedule</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#666666]">Date</label>
            <input
              type="date"
              value={scheduledDate}
              min={todayStr}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#666666]">Time Slot</label>
            <div className="relative">
              <select
                value={scheduledHour}
                onChange={(e) => setScheduledHour(Number(e.target.value))}
                className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white appearance-none"
              >
                {Array.from({ length: SERVICE_END - SERVICE_START }, (_, i) => {
                  const h = SERVICE_START + i
                  const disabled = isHourDisabled(h, scheduledDate)
                  return (
                    <option key={h} value={h} disabled={disabled}>
                      {getHourLabel(h)}{disabled ? ' (past)' : ''}
                    </option>
                  )
                })}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666666] pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[#1A1A1A]">Notes for Hauler <span className="text-[#666666] font-normal text-sm">(optional)</span></h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Bins are on the left side of the house. Gate code is 1234."
          rows={3}
          className="w-full border border-[#E0E0E0] rounded-lg px-4 py-3 text-[#1A1A1A] text-base focus:outline-none focus:border-[#1A73E8] bg-white resize-none"
        />
      </section>

      {/* Photo */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[#1A1A1A]">Photo <span className="text-[#666666] font-normal text-sm">(optional)</span></h2>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />
        {photoPreview ? (
          <div className="relative">
            <img
              src={photoPreview}
              alt="Pickup photo"
              className="w-full rounded-xl object-cover max-h-48"
            />
            <button
              type="button"
              onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
              className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="flex items-center justify-center gap-2 border-2 border-dashed border-[#E0E0E0] rounded-xl py-6 text-[#666666] text-sm"
          >
            <Camera size={20} />
            Add a photo
          </button>
        )}
      </section>

      {/* Price summary sticky at bottom */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[#E0E0E0] px-4 py-4 flex flex-col gap-3">
        {hasItems && (
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between text-[#666666]">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[#666666]">
              <span>Disposal fee</span>
              <span>${disposalFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[#666666]">
              <span>Service fee (15%)</span>
              <span>${serviceFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-[#1A1A1A] text-base pt-1 border-t border-[#E0E0E0]">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleReview}
          disabled={!hasItems || !address.trim()}
          className="w-full bg-[#1A73E8] text-white font-semibold py-4 rounded-xl text-base disabled:opacity-50"
        >
          Review Order
        </button>
      </div>
    </div>
  )
}
