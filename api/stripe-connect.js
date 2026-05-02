import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server configuration error.' })
  }

  const { action, hauler_id, return_url, refresh_url } = req.body || {}
  if (!action || !hauler_id) {
    return res.status(400).json({ error: 'action and hauler_id are required.' })
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const stripe = new Stripe(STRIPE_SECRET_KEY)

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Read the stored Stripe Connect account ID from hauler_profiles */
  async function getStoredAccountId() {
    const { data } = await adminClient
      .from('hauler_profiles')
      .select('stripe_connect_account_id')
      .eq('profile_id', hauler_id)
      .single()
    return data?.stripe_connect_account_id ?? null
  }

  /** Persist the Stripe account ID to the DB */
  async function saveAccountId(accountId) {
    await adminClient
      .from('hauler_profiles')
      .update({ stripe_connect_account_id: accountId })
      .eq('profile_id', hauler_id)
  }

  /**
   * Check that the stored account ID still exists in Stripe.
   * If it's stale (wrong mode, deleted account), clear the DB field and return null.
   */
  async function verifyOrClearAccount(accountId) {
    if (!accountId) return null
    try {
      await stripe.accounts.retrieve(accountId)
      return accountId
    } catch (err) {
      const code = err?.raw?.code ?? err?.code ?? ''
      const msg  = err?.message ?? ''
      // These codes/messages indicate the account doesn't belong to this platform
      if (
        code === 'account_invalid'          ||
        msg.includes('No such account')     ||
        msg.includes('not connected to your platform') ||
        msg.includes('does not exist')
      ) {
        console.warn(`[stripe-connect] Clearing stale account ID ${accountId}:`, msg)
        await saveAccountId(null)
      }
      return null
    }
  }

  // ── action: account_status ────────────────────────────────────────────────────

  if (action === 'account_status') {
    try {
      const storedId  = await getStoredAccountId()
      const accountId = await verifyOrClearAccount(storedId)

      if (!accountId) {
        return res.status(200).json({ status: 'not_started' })
      }

      const account = await stripe.accounts.retrieve(accountId)
      const isActive =
        account.details_submitted &&
        account.charges_enabled   &&
        account.payouts_enabled
      return res.status(200).json({
        status:           isActive ? 'active' : 'pending',
        accountId,
        detailsSubmitted: account.details_submitted,
        chargesEnabled:   account.charges_enabled,
        payoutsEnabled:   account.payouts_enabled,
      })
    } catch (err) {
      console.error('[stripe-connect] account_status error:', err)
      return res.status(500).json({ error: err?.message ?? 'Could not retrieve account status.' })
    }
  }

  // ── action: create_account (start or continue onboarding) ────────────────────

  if (action === 'create_account') {
    if (!return_url || !refresh_url) {
      return res.status(400).json({ error: 'return_url and refresh_url are required.' })
    }

    try {
      // Verify or create a Stripe Express account
      let accountId = await getStoredAccountId()
      accountId = await verifyOrClearAccount(accountId)

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          metadata: { hauler_id },
        })
        accountId = account.id
        await saveAccountId(accountId)
      }

      // Generate the hosted onboarding link
      const accountLink = await stripe.accountLinks.create({
        account:     accountId,
        return_url,
        refresh_url,
        type:        'account_onboarding',
      })

      return res.status(200).json({ url: accountLink.url })
    } catch (err) {
      console.error('[stripe-connect] create_account error:', err)
      return res.status(500).json({ error: err?.message ?? 'Could not create Stripe Connect account.' })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
