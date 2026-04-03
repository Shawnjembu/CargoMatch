// supabase/functions/activate-subscription/index.ts
// Activates or upgrades a carrier subscription after successful Google Pay payment.
// Uses service role key to bypass RLS and write subscription_tier server-side.
// Deploy: npx supabase functions deploy activate-subscription
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_TIERS = ['basic', 'pro', 'enterprise']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── Verify authorization header ───────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify the JWT and get user info
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      console.error('Token verification failed:', authError)
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Authenticated user:', user.id)

    const { carrier_id, plan, payment_token } = await req.json()

    // ── Validate inputs ────────────────────────────────────────────
    if (!carrier_id)                   throw new Error('carrier_id is required')
    if (!VALID_TIERS.includes(plan))   throw new Error(`Invalid plan: ${plan}`)
    if (!payment_token)                throw new Error('payment_token is required')

    // ── Basic payment token validation ─────────────────────────────
    // The Google Pay token is a JSON string. Parse it to verify it has the
    // expected shape. For production, send this token to your payment processor
    // (e.g. Stripe, DPO) to charge the card before activating the subscription.
    let parsedToken: Record<string, unknown>
    try {
      parsedToken = typeof payment_token === 'string'
        ? JSON.parse(payment_token)
        : payment_token
    } catch {
      throw new Error('Invalid payment_token: not valid JSON')
    }

    if (!parsedToken || typeof parsedToken !== 'object') {
      throw new Error('Invalid payment_token format')
    }

    // ── Activate subscription via service role ─────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const now    = new Date()
    const subEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const { data, error } = await supabaseAdmin
      .from('carrier_subscriptions')
      .update({
        subscription_tier:  plan,
        subscription_start: now.toISOString(),
        subscription_end:   subEnd.toISOString(),
        monthly_bid_count:  0,
        monthly_bid_reset:  subEnd.toISOString(),
        updated_at:         now.toISOString(),
      })
      .eq('carrier_id', carrier_id)
      .select('id, carrier_id')
      .single()

    if (error) throw new Error('Subscription update failed: ' + error.message)

    // ── Notify the carrier ─────────────────────────────────────────
    // Look up the user_id from the carriers table so we can write a notification
    const { data: carrier } = await supabaseAdmin
      .from('carriers')
      .select('user_id')
      .eq('id', carrier_id)
      .single()

    if (carrier?.user_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: carrier.user_id,
        type:    'subscription',
        title:   `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan activated!`,
        body:    `Your ${plan} subscription is active until ${subEnd.toLocaleDateString('en-BW')}.`,
        link:    '/carrier/subscription',
      })
    }

    return new Response(
      JSON.stringify({ success: true, tier: plan, subscription_end: subEnd.toISOString() }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
