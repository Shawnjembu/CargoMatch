// @ts-nocheck — Deno runtime; Node/browser tsconfig doesn't know Deno globals.
// Supabase Edge Function — send-notification-email
// Deploy: supabase functions deploy send-notification-email
// Requires env vars (Supabase Dashboard → Settings → Edge Functions):
//   RESEND_API_KEY        — from resend.com
//   SUPABASE_URL          — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
//
// Accepts:
//   { userId, subject, body, html? }   — looks up email from auth.users
//   { to,     subject, body, html? }   — uses provided email directly

import { serve }       from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API = 'https://api.resend.com/emails'
const FROM       = 'CargoMatch <noreply@cargomatch.co.bw>'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return json({ error: 'RESEND_API_KEY not configured' }, 500)
    }

    const payload = await req.json()
    const { userId, subject, body, html } = payload
    let to: string = payload.to ?? ''

    // If userId supplied instead of direct email, look up via service role
    if (userId && !to) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (error || !user?.email) {
        return json({ error: 'Could not resolve email for userId' }, 400)
      }
      to = user.email
    }

    if (!to || !subject || !body) {
      return json({ error: 'Missing required fields: to/userId, subject, body' }, 400)
    }

    const emailHtml = html ?? buildDefaultHtml(subject, body)

    const res = await fetch(RESEND_API, {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, text: body, html: emailHtml }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[send-notification-email] Resend error:', data)
      return json({ error: data }, res.status)
    }

    return json({ ok: true, id: data.id }, 200)
  } catch (err) {
    console.error('[send-notification-email] Unexpected error:', err)
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function buildDefaultHtml(subject: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr>
          <td style="background:#1a5c3a;padding:24px 32px;">
            <span style="font-size:20px;font-weight:800;color:#ffffff;">CargoMatch</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1c1917;">${subject}</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#78716c;line-height:1.6;">
              ${body.replace(/\n/g, '<br/>')}
            </p>
            <a href="https://cargo-match-gold.vercel.app"
               style="display:inline-block;background:#1a5c3a;color:#ffffff;text-decoration:none;
                      font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">
              Open CargoMatch →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f5f5f4;">
            <p style="margin:0;font-size:12px;color:#a8a29e;">
              CargoMatch · Gaborone, Botswana · support@cargomatch.co.bw<br/>
              You received this because you have an active CargoMatch account.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
