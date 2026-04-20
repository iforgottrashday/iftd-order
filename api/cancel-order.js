import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey = process.env.STRIPE_SECRET_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error.' })
  }

  // ── Verify the caller is authenticated ────────────────────────────────────
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated.' })

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Invalid session.' })

  // ── Validate input ────────────────────────────────────────────────────────
  const { orderId } = req.body || {}
  if (!orderId) return res.status(400).json({ error: 'orderId is required.' })

  // ── Fetch order with service role ─────────────────────────────────────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: order, error: fetchError } = await adminClient
    .from('orders')
    .select('id, customer_id, status, payment_result')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) return res.status(404).json({ error: 'Order not found.' })

  // ── Verify ownership ──────────────────────────────────────────────────────
  if (order.customer_id !== user.id) return res.status(403).json({ error: 'Not authorized.' })

  // ── Only pending orders can be cancelled by the customer ──────────────────
  if (order.status !== 'pending') {
    return res.status(400).json({
      error: order.status === 'cancelled'
        ? 'This order is already cancelled.'
        : `Orders in "${order.status}" status cannot be cancelled. Please contact support.`,
    })
  }

  // ── Process Stripe refund if real payment ─────────────────────────────────
  const paymentIntentId = order.payment_result?.transactionId
  let refundId = null

  if (paymentIntentId && stripeKey &&
      !paymentIntentId.toLowerCase().startsWith('mock') &&
      !paymentIntentId.toLowerCase().startsWith('mock-')) {
    try {
      const stripe = new Stripe(stripeKey)
      const refund = await stripe.refunds.create({ payment_intent: paymentIntentId })
      refundId = refund.id
    } catch (stripeErr) {
      console.error('Stripe refund failed:', stripeErr.message)
      // Still cancel the order — admin can process refund manually in Stripe
    }
  }

  // ── Cancel the order ──────────────────────────────────────────────────────
  const { error: updateError } = await adminClient
    .from('orders')
    .update({
      status: 'cancelled',
      cancellation_reason: 'Cancelled by customer.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  if (updateError) {
    return res.status(500).json({ error: `Failed to cancel order: ${updateError.message}` })
  }

  return res.status(200).json({ ok: true, refundId })
}
