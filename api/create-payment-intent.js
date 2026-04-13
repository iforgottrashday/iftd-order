import Stripe from 'stripe'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not set on server.' })
  }

  const { amount } = req.body || {}
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount.' })
  }

  try {
    const stripe = new Stripe(key)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    })
    return res.status(200).json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Payment setup failed.' })
  }
}
