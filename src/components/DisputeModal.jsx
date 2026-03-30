import { useState } from 'react'
import { X, AlertTriangle, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const REASONS = [
  'Cargo damaged in transit',
  'Cargo not delivered',
  'Wrong delivery location',
  'Delivery significantly delayed',
  'Carrier did not show up',
  'Shipper provided incorrect cargo details',
  'Payment issue',
  'Unprofessional conduct',
  'Other',
]

/**
 * DisputeModal — shared between shipper and carrier.
 *
 * Props:
 *   shipmentId     UUID of the shipment being disputed
 *   shipmentRef    Human-readable ref (e.g. "CM-ABC123")
 *   otherPartyId   profiles.id of the other party — receives notification
 *   onClose        () => void
 *   onDisputeRaised (dispute) => void  — called after successful insert
 */
export default function DisputeModal({ shipmentId, shipmentRef, otherPartyId, onClose, onDisputeRaised }) {
  const { user } = useAuth()
  const [reason,  setReason]  = useState('')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason.'); return }
    setError('')
    setLoading(true)
    try {
      const { data: dispute, error: insertErr } = await supabase
        .from('disputes')
        .insert({
          shipment_id: shipmentId,
          raised_by:   user.id,
          reason,
          details:     details.trim() || null,
          status:      'open',
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      // Notify the other party
      if (otherPartyId) {
        await supabase.from('notifications').insert({
          user_id: otherPartyId,
          type:    'alert',
          title:   'Dispute raised on your shipment',
          body:    `A dispute has been raised on shipment ${shipmentRef}: "${reason}"`,
          link:    '/shipper',
        })
      }

      onDisputeRaised(dispute)
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to raise dispute. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-7"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100">
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div>
            <h2 className="font-display font-700 text-stone-900 text-lg">Raise a Dispute</h2>
            <p className="text-xs text-stone-400">Shipment {shipmentRef}</p>
          </div>
        </div>

        <p className="text-sm text-stone-500 mb-5">
          Disputes are reviewed by CargoMatch admin within 2 business days.
          Both parties will be notified of any status changes.
        </p>

        {error && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl mb-4">
            <AlertTriangle size={14} className="flex-shrink-0" /> {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Reason *</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
            >
              <option value="">Select a reason…</option>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">
              Additional details <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              rows={4}
              placeholder="Describe what happened, include any relevant dates or amounts…"
              className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !reason}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Send size={14} />
            {loading ? 'Submitting…' : 'Submit Dispute'}
          </button>
        </div>
      </div>
    </div>
  )
}
