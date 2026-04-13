import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Send, Paperclip, X, MessageCircle } from 'lucide-react'

interface ChatMessage {
  id: string
  order_id: string
  sender_id: string
  sender_role: 'customer' | 'hauler'
  content: string | null
  image_url: string | null
  read_at: string | null
  created_at: string
}

interface Order {
  id: string
  status: string
  customer_id: string
  hauler_id: string | null
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function getDateLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function getDayKey(iso: string): string {
  return new Date(iso).toDateString()
}

export default function ChatPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [order, setOrder] = useState<Order | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!orderId) return

    let channel: ReturnType<typeof supabase.channel> | null = null

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setCurrentUserId(session.user.id)

      // Inject the JWT into the realtime connection — required in Supabase JS v2.x+
      // for postgres_changes to fire on RLS-protected tables
      supabase.realtime.setAuth(session.access_token)

      // Load order
      const { data: orderData } = await supabase
        .from('orders')
        .select('id, status, customer_id, hauler_id')
        .eq('id', orderId)
        .single()

      if (orderData) setOrder(orderData as Order)

      // Load messages
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })

      setMessages((msgs ?? []) as ChatMessage[])
      setLoading(false)

      // Mark hauler messages as read
      await supabase
        .from('chat_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .eq('sender_role', 'hauler')
        .is('read_at', null)

      // Set up real-time subscription after JWT is injected
      channel = supabase
        .channel(`chat-${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `order_id=eq.${orderId}`,
          },
          (payload) => {
            const newMsg = payload.new as ChatMessage
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
          }
        )
        .subscribe()
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [orderId])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSend = async () => {
    if (!orderId || !currentUserId || (!text.trim() && !imageFile)) return
    setSending(true)

    try {
      let imageUrl: string | null = null

      if (imageFile) {
        const ext = imageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const fileName = `${orderId}/${Date.now()}.${ext}`
        const contentType = imageFile.type || (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`)

        const { error: uploadError } = await supabase.storage
          .from('chat-images')
          .upload(fileName, imageFile, { contentType, upsert: false })

        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`)

        const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(fileName)
        imageUrl = urlData?.publicUrl ?? null
      }

      const { data: inserted, error } = await supabase.from('chat_messages').insert({
        order_id: orderId,
        sender_id: currentUserId,
        sender_role: 'customer',
        content: text.trim() || ' ',
        image_url: imageUrl,
      }).select().single()

      if (error) throw new Error(error.message)

      if (inserted) {
        setMessages(prev =>
          prev.some(m => m.id === (inserted as ChatMessage).id)
            ? prev
            : [...prev, inserted as ChatMessage]
        )
      }

      setText('')
      clearImage()
    } catch (e: any) {
      alert(e.message ?? 'Could not send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isClosed =
    order?.status === 'completed' || order?.status === 'cancelled'

  const canChat =
    order?.status === 'accepted' ||
    order?.status === 'in_progress' ||
    order?.status === 'completed' ||
    order?.status === 'cancelled'

  // Group messages by day
  const seenDays = new Set<string>()
  const messagesWithSeparators: Array<{ type: 'separator'; label: string } | { type: 'message'; msg: ChatMessage }> = []

  for (const msg of messages) {
    const dayKey = getDayKey(msg.created_at)
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey)
      messagesWithSeparators.push({ type: 'separator', label: getDateLabel(msg.created_at) })
    }
    messagesWithSeparators.push({ type: 'message', msg })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#1A73E8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#E0E0E0] flex items-center gap-3 bg-white shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-[#1A73E8]"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-[#1A1A1A]">Chat with Hauler</h1>
          {order && (
            <p className="text-xs text-[#666666]">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </p>
          )}
        </div>
      </div>

      {/* Closed banner */}
      {isClosed && (
        <div className="mx-4 mt-3 bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl px-4 py-3 shrink-0">
          <p className="text-sm text-[#666666] text-center">
            {order?.status === 'completed'
              ? 'This order is complete. The chat is now closed.'
              : 'This order has been cancelled.'}
          </p>
        </div>
      )}

      {/* No hauler yet */}
      {!canChat && !order?.hauler_id && (
        <div className="mx-4 mt-3 bg-[#FFF8ED] border border-amber-200 rounded-xl px-4 py-3 shrink-0">
          <p className="text-sm text-amber-700 text-center">
            Chat will be available once a hauler accepts your order.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-14 h-14 bg-[#F5F5F5] rounded-full flex items-center justify-center">
              <MessageCircle size={24} className="text-[#999]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-[#1A1A1A]">No messages yet</p>
              <p className="text-xs text-[#666666] mt-1">Send a message to your hauler</p>
            </div>
          </div>
        ) : (
          messagesWithSeparators.map((item, idx) => {
            if (item.type === 'separator') {
              return (
                <div key={`sep-${idx}`} className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-[#E0E0E0]" />
                  <span className="text-xs text-[#999] font-medium shrink-0">{item.label}</span>
                  <div className="flex-1 h-px bg-[#E0E0E0]" />
                </div>
              )
            }

            const { msg } = item
            const isMine = msg.sender_id === currentUserId

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} mb-1`}
              >
                {!isMine && (
                  <p className="text-xs text-[#999] font-medium mb-1 px-1">
                    {msg.sender_role === 'hauler' ? 'Hauler' : 'Customer'}
                  </p>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                    isMine
                      ? 'bg-[#1A73E8] text-white rounded-br-md'
                      : 'bg-white border border-[#E0E0E0] text-[#1A1A1A] rounded-bl-md'
                  }`}
                >
                  {msg.image_url && (
                    <img
                      src={msg.image_url}
                      alt="Attachment"
                      className="rounded-xl mb-1 max-w-full max-h-48 object-cover"
                    />
                  )}
                  {msg.content && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                  <p className="text-xs text-[#999]">{formatMessageTime(msg.created_at)}</p>
                  {isMine && msg.read_at && (
                    <p className="text-xs text-[#1A73E8] font-medium">✓ Read</p>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      {!isClosed && canChat && (
        <div className="shrink-0 border-t border-[#E0E0E0] bg-white px-3 py-2">
          {/* Image preview */}
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={imagePreview}
                alt="Attachment preview"
                className="h-16 w-16 rounded-xl object-cover border border-[#E0E0E0]"
              />
              <button
                onClick={clearImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#666666] rounded-full flex items-center justify-center"
                aria-label="Remove image"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Image attach */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 text-[#666666] hover:text-[#1A73E8] p-2 rounded-lg hover:bg-[#F5F5F5]"
              aria-label="Attach image"
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />

            {/* Text input */}
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              className="flex-1 border border-[#E0E0E0] rounded-full px-4 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#1A73E8] bg-[#F5F5F5]"
            />

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={sending || (!text.trim() && !imageFile)}
              className="shrink-0 w-10 h-10 bg-[#1A73E8] rounded-full flex items-center justify-center disabled:opacity-40"
              aria-label="Send message"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send size={16} className="text-white" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
