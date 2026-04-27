import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl     = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey       = process.env.STRIPE_SECRET_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error.' })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated.' })

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const anonKey = supabaseAnonKey || serviceRoleKey
  const authClient = createClient(supabaseUrl, anonKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' })

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // ── Validate input ────────────────────────────────────────────────────────
  const { orderId, newItems, unbaggedQty = 0, phase, paymentIntentId } = req.body || {}
  if (!orderId || !Array.isArray(newItems) || !phase) {
    return res.status(400).json({ error: 'orderId, newItems, and phase are required.' })
  }
  if (!['prepare', 'confirm'].includes(phase)) {
    return res.status(400).json({ error: 'phase must be "prepare" or "confirm".' })
  }

  // ── Fetch order ───────────────────────────────────────────────────────────
  const { data: order, error: fetchError } = await adminClient
    .from('orders')
    .select('id, customer_id, status, payment_result, pricing, total, items, unbagged_qty, points_redeemed')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) return res.status(404).json({ error: 'Order not found.' })
  if (order.customer_id !== user.id) return res.status(403).json({ error: 'Not authorized.' })
  if (order.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending orders can be modified.' })
  }
  if (newItems.length === 0) {
    return res.status(400).json({ error: 'Cannot remove all items. Cancel the order instead.' })
  }

  // ── Calculate totals ──────────────────────────────────────────────────────
  const newTotal     = newItems.reduce((s, i) => s + (i.qty || 0) * (i.unitPrice || i.unit_price || 0), 0)
                     + (unbaggedQty * 5)
  const oldTotal     = order.total || 0
  const priceDiffCents = Math.round((newTotal - oldTotal) * 100) // positive = charge more, negative = refund

  const originalPaymentId = order.payment_result?.transactionId ?? ''
  const isMockPayment = !originalPaymentId
    || originalPaymentId === 'points_redemption'
    || originalPaymentId.toLowerCase().startsWith('mock')

  // ── PHASE: prepare ────────────────────────────────────────────────────────
  if (phase === 'prepare') {

    if (priceDiffCents > 0) {
      // ── Additional charge required ──────────────────────────────────────
      if (isMockPayment || !stripeKey) {
        // Mock orders: no real Stripe, just confirm immediately
        await _updateOrderItems(adminClient, orderId, newItems, unbaggedQty, newTotal, order, null)
        return res.status(200).json({ needsPayment: false, refundAmount: 0, newTotal })
      }
      const stripe = new Stripe(stripeKey)
      const pi = await stripe.paymentIntents.create({
        amount: priceDiffCents,
        currency: 'usd',
        metadata: { orderId, type: 'modification', userId: user.id },
      })
      return res.status(200).json({
        needsPayment:    true,
        clientSecret:    pi.client_secret,
        paymentIntentId: pi.id,
        amountDue:       priceDiffCents / 100,
      })
    }

    if (priceDiffCents < 0) {
      // ── Partial refund required ───────────────────────────────────────────
      const refundAmountCents = Math.abs(priceDiffCents)
      let refundId = null

      if (!isMockPayment && stripeKey) {
        try {
          const stripe = new Stripe(stripeKey)
          // Cap refund to what was actually charged (points discount may have reduced it)
          const chargedCents = Math.round((order.pricing?.chargedAmount ?? oldTotal) * 100)
          const refundable   = Math.min(refundAmountCents, chargedCents)
          if (refundable > 0) {
            const refund = await stripe.refunds.create({
              payment_intent: originalPaymentId,
              amount: refundable,
            })
            refundId = refund.id
          }
        } catch (stripeErr) {
          console.error('[modify-order] Stripe partial refund failed:', stripeErr.message)
          // Non-fatal — continue; admin can process in Stripe dashboard
        }
      }

      // Restore points proportionally if they were used
      const pointsToRestore = await _restorePointsProportionally(adminClient, order, newTotal)

      await _updateOrderItems(adminClient, orderId, newItems, unbaggedQty, newTotal, order, refundId)

      return res.status(200).json({
        needsPayment:  false,
        refundAmount:  refundAmountCents / 100,
        refundId,
        pointsRestored: pointsToRestore,
        newTotal,
      })
    }

    // ── No price change — just update items ───────────────────────────────
    await _updateOrderItems(adminClient, orderId, newItems, unbaggedQty, newTotal, order, null)
    return res.status(200).json({ needsPayment: false, refundAmount: 0, newTotal })
  }

  // ── PHASE: confirm (called after Stripe sheet succeeds on client) ─────────
  if (phase === 'confirm') {
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'paymentIntentId required for confirm phase.' })
    }
    const additionalCharged = (order.pricing?.additionalCharged || 0) + (newTotal - oldTotal)
    await _updateOrderItems(adminClient, orderId, newItems, unbaggedQty, newTotal, order, null, {
      additionalCharged,
      additionalPaymentId: paymentIntentId,
    })
    return res.status(200).json({ ok: true, newTotal })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _updateOrderItems(adminClient, orderId, newItems, unbaggedQty, newTotal, order, refundId, extraPricing = {}) {
  await adminClient
    .from('orders')
    .update({
      items:        newItems,
      total:        newTotal,
      unbagged:     unbaggedQty > 0,
      unbagged_qty: unbaggedQty,
      pricing: {
        ...(order.pricing || {}),
        total: newTotal,
        ...(refundId ? { lastModifiedRefundId: refundId } : {}),
        ...extraPricing,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
}

async function _restorePointsProportionally(adminClient, order, newTotal) {
  const pointsRedeemed = order.pricing?.pointsRedeemed ?? order.points_redeemed ?? 0
  if (pointsRedeemed <= 0) return 0
  const oldTotal = order.total || 0
  if (oldTotal <= 0) return 0

  // Refund points proportional to how much the price dropped
  const proportion = Math.max(0, Math.min(1, (oldTotal - newTotal) / oldTotal))
  const pointsToRestore = Math.round(pointsRedeemed * proportion)
  if (pointsToRestore <= 0) return 0

  const { data: profile } = await adminClient
    .from('profiles')
    .select('points_balance')
    .eq('id', order.customer_id)
    .single()

  if (profile) {
    await adminClient
      .from('profiles')
      .update({ points_balance: (profile.points_balance ?? 0) + pointsToRestore })
      .eq('id', order.customer_id)
  }
  return pointsToRestore
}
