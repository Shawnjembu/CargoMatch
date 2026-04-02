// supabase/functions/dpo-create-token/index.ts
// Creates a DPO Pay transaction token and returns the hosted payment URL.
// Deploy: supabase functions deploy dpo-create-token
// Env vars required: DPO_COMPANY_TOKEN, DPO_SERVICE_TYPE (default 5525)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const DPO_API   = Deno.env.get('DPO_SANDBOX') === 'true'
  ? 'https://sandbox.3gdirectpay.com/API/v6/'
  : 'https://secure.3gdirectpay.com/API/v6/'
const CORS      = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const {
      amount,
      currency    = 'BWP',
      reference,        // your internal ID (bid_id or load_id)
      redirectUrl,      // where DPO sends the user after payment
      backUrl,          // where DPO sends the user on cancel
      description = 'CargoMatch Freight Payment',
    } = await req.json()

    const companyToken  = Deno.env.get('DPO_COMPANY_TOKEN')
    const serviceType   = Deno.env.get('DPO_SERVICE_TYPE') ?? '5525'
    const serviceDate   = new Date().toISOString().slice(0, 10).replace(/-/g, '/') + ' 00:00'

    if (!companyToken) {
      return new Response(JSON.stringify({ error: 'DPO_COMPANY_TOKEN not configured' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${companyToken}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${Number(amount).toFixed(2)}</PaymentAmount>
    <PaymentCurrency>${currency}</PaymentCurrency>
    <CompanyRef>${reference}</CompanyRef>
    <RedirectURL>${redirectUrl}</RedirectURL>
    <BackURL>${backUrl}</BackURL>
    <CompanyRefUnique>1</CompanyRefUnique>
    <PTL>30</PTL>
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${serviceType}</ServiceType>
      <ServiceDescription>${description}</ServiceDescription>
      <ServiceDate>${serviceDate}</ServiceDate>
    </Service>
  </Services>
</API3G>`

    const res  = await fetch(DPO_API, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml })
    const text = await res.text()

    const result = text.match(/<Result>(.*?)<\/Result>/)?.[1]
    const token  = text.match(/<TransToken>(.*?)<\/TransToken>/)?.[1]
    const expl   = text.match(/<ResultExplanation>(.*?)<\/ResultExplanation>/)?.[1]

    if (result === '000' && token) {
      return new Response(JSON.stringify({
        token,
        payUrl: `https://secure.3gdirectpay.com/payv2.php?ID=${token}`,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: expl ?? 'DPO token creation failed', result }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
