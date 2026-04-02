// supabase/functions/dpo-verify-token/index.ts
// Verifies a DPO Pay transaction token after the user returns from the payment page.
// Also finalises the bid: creates shipment, updates escrow, notifies parties.
// Deploy: supabase functions deploy dpo-verify-token
// Env vars: DPO_COMPANY_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DPO_API = Deno.env.get('DPO_SANDBOX') === 'true'
  ? 'https://sandbox.3gdirectpay.com/API/v6/'
  : 'https://secure.3gdirectpay.com/API/v6/'
const CORS    = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { token, bidId, loadId, carrierId, carrierUserId, shipperId, amount } = await req.json()

    const companyToken = Deno.env.get('DPO_COMPANY_TOKEN')
    if (!companyToken) throw new Error('DPO_COMPANY_TOKEN not configured')

    // 1. Verify token with DPO
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${companyToken}</CompanyToken>
  <Request>verifyToken</Request>
  <TransactionToken>${token}</TransactionToken>
</API3G>`

    const res  = await fetch(DPO_API, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml })
    const text = await res.text()

    const result       = text.match(/<Result>(.*?)<\/Result>/)?.[1]
    const dpoReference = text.match(/<TransactionRef>(.*?)<\/TransactionRef>/)?.[1] ?? token
    const expl         = text.match(/<ResultExplanation>(.*?)<\/ResultExplanation>/)?.[1]

    if (result !== '000') {
      return new Response(JSON.stringify({ success: false, error: expl ?? 'Payment verification failed' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 2. Finalise in Supabase using service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Accept this bid, reject all others for the same load
    await supabase.from('load_bids').update({ status: 'accepted' }).eq('id', bidId)
    await supabase.from('load_bids').update({ status: 'rejected' }).eq('load_id', loadId).neq('id', bidId)

    // Mark load as matched
    await supabase.from('loads').update({ status: 'matched' }).eq('id', loadId)

    // Create shipment
    const ref = 'CM-' + Date.now().toString(36).toUpperCase()
    const { data: shipment, error: shipErr } = await supabase.from('shipments').insert({
      load_id:    loadId,
      carrier_id: carrierId,
      shipper_id: shipperId,
      price:      amount,
      status:     'confirmed',
      reference:  ref,
    }).select().single()
    if (shipErr) throw new Error('Shipment creation failed: ' + shipErr.message)

    // Record escrow
    await supabase.from('escrow_transactions').insert({
      shipment_id:   shipment.id,
      amount,
      currency:      'BWP',
      status:        'held',
      dpo_token:     token,
      dpo_reference: dpoReference,
      paid_at:       new Date().toISOString(),
    })

    // Notify both parties
    await supabase.from('notifications').insert([
      {
        user_id: shipperId,
        type:    'match',
        title:   'Payment received — carrier confirmed!',
        body:    `Your shipment ${ref} is confirmed. Payment held in escrow.`,
        link:    `/track/${ref}`,
      },
      {
        user_id: carrierUserId,
        type:    'match',
        title:   'Bid accepted & payment secured!',
        body:    `Your bid was accepted. Payment of P ${Number(amount).toLocaleString()} is held in escrow.`,
        link:    '/carrier',
      },
    ])

    return new Response(JSON.stringify({ success: true, shipmentId: shipment.id, reference: ref }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
