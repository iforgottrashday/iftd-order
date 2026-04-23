import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not set on server.' })

  const { amount, userId, email } = req.body || {}
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount.' })
  }

  try {
    const stripe = new Stripe(stripeKey)

    // ── Create or retrieve Stripe Customer ──────────────────────────────────
    let customerId = null
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (userId && email && supabaseUrl && serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey)
      const { data: profile } = await adminClient
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single()

      if (profile?.stripe_customer_id) {
        customerId = profile.stripe_customer_id
      } else {
        const customer = await stripe.customers.create({
          email,
          metadata: { supabase_user_id: userId },
        })
        customerId = customer.id
        await adminClient
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId)
      }
    }

    // ── Create PaymentIntent ─────────────────────────────────────────────────
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      ...(customerId ? { customer: customerId } : {}),
      payment_method_types: ['card'],
      metadata: {
        supabase_user_id: userId ?? '',
        source: 'iftd-order-web',
      },
    })

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId,
    })
  } catch (err) {
    console.error('create-payment-intent error:', err)
    return res.status(500).json({ error: err.message || 'Payment setup failed.' })
  }
}
