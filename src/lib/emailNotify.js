// emailNotify.js — thin wrapper around the send-notification-email edge function.
//
// Usage:
//   import { sendEmailNotification } from '../lib/emailNotify'
//   await sendEmailNotification({ to: 'user@example.com', subject: '...', body: '...' })
//
// The call is fire-and-forget — it never throws so a failure won't break
// the calling flow.  Email is supplementary to in-app notifications.

import { supabase } from './supabase'

/**
 * @param {{ to?: string, userId?: string, subject: string, body: string, html?: string }} opts
 * Pass either `to` (email address) or `userId` (Supabase auth UID — edge function resolves the email).
 */
export async function sendEmailNotification({ to, userId, subject, body, html }) {
  if ((!to && !userId) || !subject || !body) return

  try {
    const { error } = await supabase.functions.invoke('send-notification-email', {
      body: { to, userId, subject, body, html },
    })
    if (error && import.meta.env.DEV) {
      console.warn('[emailNotify] Edge function error:', error.message)
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[emailNotify] Failed to send email notification:', err)
    }
    // Silent failure — email is supplementary to in-app notifications
  }
}

// ── Pre-built templates ────────────────────────────────────────────────────

// All templates accept `userId` (Supabase auth UID) — the edge function resolves the email.
// Optionally pass `to` (direct email) to bypass the lookup.

export function emailDisputeRaised({ userId, to, shipmentRef, reason, raisedBy }) {
  return sendEmailNotification({
    userId, to,
    subject: `Dispute raised on shipment ${shipmentRef}`,
    body: `A dispute has been raised on shipment ${shipmentRef} by ${raisedBy}.\n\nReason: ${reason}\n\nLog in to CargoMatch to view the dispute and respond.`,
  })
}

export function emailDisputeUpdated({ userId, to, shipmentRef, newStatus, note }) {
  const statusLabel = newStatus.replace(/_/g, ' ')
  return sendEmailNotification({
    userId, to,
    subject: `Dispute update: shipment ${shipmentRef} — ${statusLabel}`,
    body: `The dispute on shipment ${shipmentRef} has been updated to: ${statusLabel}.${note ? `\n\nAdmin note: ${note}` : ''}\n\nLog in to CargoMatch for details.`,
  })
}

export function emailBidReceived({ userId, to, shipmentRef, carrierName, bidAmount }) {
  return sendEmailNotification({
    userId, to,
    subject: `New bid on your load ${shipmentRef}`,
    body: `${carrierName} has placed a bid of P ${Number(bidAmount).toLocaleString()} on your load (${shipmentRef}).\n\nLog in to CargoMatch to review and accept.`,
  })
}

export function emailLoadMatched({ userId, to, shipmentRef, from, dest, carrierName }) {
  return sendEmailNotification({
    userId, to,
    subject: `Load matched — ${shipmentRef}`,
    body: `Your load from ${from} to ${dest} has been matched with ${carrierName}.\n\nReference: ${shipmentRef}\n\nLog in to CargoMatch to confirm and track your shipment.`,
  })
}

export function emailShipmentStatusChanged({ userId, to, shipmentRef, newStatus }) {
  const statusLabel = newStatus.replace(/_/g, ' ')
  return sendEmailNotification({
    userId, to,
    subject: `Shipment ${shipmentRef} — ${statusLabel}`,
    body: `Your shipment ${shipmentRef} status has been updated to: ${statusLabel}.\n\nLog in to CargoMatch to track your delivery.`,
  })
}
