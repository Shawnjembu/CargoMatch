import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Truck, MapPin, ArrowRight, Printer, ChevronLeft, CheckCircle, AlertCircle } from 'lucide-react'

export default function Invoice() {
  const { id } = useParams()
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { fetchInvoice() }, [id])

  const fetchInvoice = async () => {
    const { data: s } = await supabase
      .from('shipments')
      .select(`
        id, reference, status, price, created_at, delivered_at,
        loads(from_location, to_location, cargo_type, weight_kg, description, pickup_date),
        carriers(company_name, reg_number),
        profiles!shipments_shipper_id_fkey(full_name, phone, location),
        escrow_transactions(amount, currency, dpo_reference, paid_at, released_at, status)
      `)
      .eq('id', id)
      .single()

    if (!s) { setNotFound(true) }
    else setData(s)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center text-stone-400 text-sm font-body">
        Loading invoice...
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-cream font-body flex items-center justify-center px-6">
        <div className="text-center">
          <AlertCircle size={36} className="text-stone-300 mx-auto mb-4" />
          <h1 className="font-display text-xl font-800 text-stone-900 mb-2">Invoice not found</h1>
          <p className="text-stone-400 text-sm mb-6">This shipment doesn't exist or you don't have access.</p>
          <Link to="/shipper" className="text-sm text-forest-600 hover:underline">← Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  const escrow    = data.escrow_transactions
  const load      = data.loads
  const carrier   = data.carriers
  const shipper   = data.profiles
  const amount    = escrow?.amount ? Number(escrow.amount) : (data.price || 0)
  const paidDate  = escrow?.paid_at     ? new Date(escrow.paid_at)     : null
  const relDate   = escrow?.released_at ? new Date(escrow.released_at) : null
  const issueDate = data.delivered_at   ? new Date(data.delivered_at)  : new Date(data.created_at)
  const isPaid    = escrow?.status === 'released' || data.status === 'delivered'

  const fmt = (d) => d?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—'
  const fmtP = (n) => `P ${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="min-h-screen bg-stone-100 font-body">

      {/* Toolbar — hidden on print */}
      <div className="no-print bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/shipper" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors">
          <ChevronLeft size={14} /> Back to Dashboard
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white text-sm font-medium px-5 py-2 rounded-xl transition-all">
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* Invoice document */}
      <div className="max-w-2xl mx-auto my-8 px-4 print-container">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden" id="invoice-doc">

          {/* Header */}
          <div className="bg-forest-600 px-8 py-7 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <Truck size={16} className="text-white" />
                </div>
                <span className="font-display font-800 text-white text-lg">
                  Cargo<span className="text-forest-200">Match</span>
                </span>
              </div>
              <p className="text-forest-200 text-xs">CargoMatch Platform · Gaborone, Botswana</p>
              <p className="text-forest-200 text-xs">support@cargomatch.co.bw</p>
            </div>
            <div className="text-right">
              <p className="text-forest-200 text-xs uppercase tracking-widest font-medium mb-1">Receipt</p>
              <p className="text-white font-display font-800 text-xl">{data.reference || `CM-${data.id.slice(0,8).toUpperCase()}`}</p>
              <p className="text-forest-200 text-xs mt-1">{fmt(issueDate)}</p>
              {isPaid && (
                <span className="inline-flex items-center gap-1 mt-2 bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full border border-white/30">
                  <CheckCircle size={10} /> PAID
                </span>
              )}
            </div>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-6 px-8 py-6 border-b border-stone-100">
            <div>
              <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Bill To</p>
              <p className="font-display font-700 text-stone-900">{shipper?.full_name || '—'}</p>
              {shipper?.phone    && <p className="text-sm text-stone-500 mt-0.5">{shipper.phone}</p>}
              {shipper?.location && <p className="text-sm text-stone-500">{shipper.location}</p>}
            </div>
            <div>
              <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-2">Carrier</p>
              <p className="font-display font-700 text-stone-900">{carrier?.company_name || '—'}</p>
              {carrier?.reg_number && <p className="text-sm text-stone-500 mt-0.5">Reg: {carrier.reg_number}</p>}
            </div>
          </div>

          {/* Route summary */}
          <div className="px-8 py-5 border-b border-stone-100 bg-stone-50/50">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-3">Shipment Details</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2.5 flex-1">
                <MapPin size={13} className="text-forest-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-stone-400">From</p>
                  <p className="text-sm font-medium text-stone-900">{load?.from_location || '—'}</p>
                </div>
              </div>
              <ArrowRight size={14} className="text-stone-300 flex-shrink-0" />
              <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2.5 flex-1">
                <MapPin size={13} className="text-stone-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-stone-400">To</p>
                  <p className="text-sm font-medium text-stone-900">{load?.to_location || '—'}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Cargo Type',    value: load?.cargo_type || '—' },
                { label: 'Weight',        value: load?.weight_kg ? `${load.weight_kg.toLocaleString()} kg` : '—' },
                { label: 'Pickup Date',   value: load?.pickup_date ? fmt(new Date(load.pickup_date)) : '—' },
              ].map((r, i) => (
                <div key={i} className="bg-white border border-stone-200 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-stone-400">{r.label}</p>
                  <p className="font-medium text-stone-800 mt-0.5">{r.value}</p>
                </div>
              ))}
            </div>
            {load?.description && (
              <p className="text-xs text-stone-500 mt-3 bg-white border border-stone-200 rounded-xl px-3 py-2.5">
                <span className="font-medium text-stone-600">Notes: </span>{load.description}
              </p>
            )}
          </div>

          {/* Line items */}
          <div className="px-8 py-6 border-b border-stone-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 font-medium uppercase tracking-widest">
                  <th className="text-left pb-3">Description</th>
                  <th className="text-right pb-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                <tr>
                  <td className="py-3">
                    <p className="font-medium text-stone-900">Freight Service</p>
                    <p className="text-xs text-stone-400 mt-0.5">{load?.from_location} → {load?.to_location} · {load?.cargo_type}</p>
                  </td>
                  <td className="py-3 text-right font-display font-700 text-stone-900">{fmtP(amount)}</td>
                </tr>
                <tr>
                  <td className="py-3 text-stone-400 text-xs">Platform fee (5%)</td>
                  <td className="py-3 text-right text-xs text-stone-400">{fmtP(amount * 0.05)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="px-8 py-5 border-b border-stone-100">
            <div className="flex items-center justify-between">
              <span className="font-display font-700 text-stone-900 text-lg">Total Paid</span>
              <span className="font-display font-800 text-forest-600 text-2xl">{fmtP(amount)}</span>
            </div>
          </div>

          {/* Payment info */}
          <div className="px-8 py-5 border-b border-stone-100 bg-forest-50/40">
            <p className="text-xs font-medium text-stone-400 uppercase tracking-widest mb-3">Payment Details</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Payment Gateway',  value: 'DPO Pay (Network International)' },
                { label: 'DPO Reference',     value: escrow?.dpo_reference || '—' },
                { label: 'Payment Date',      value: paidDate ? fmt(paidDate) : '—' },
                { label: 'Funds Released',    value: relDate  ? fmt(relDate)  : '—' },
                { label: 'Currency',          value: escrow?.currency || 'BWP' },
                { label: 'Escrow Status',     value: isPaid ? 'Released ✓' : 'Pending' },
              ].map((r, i) => (
                <div key={i}>
                  <p className="text-xs text-stone-400">{r.label}</p>
                  <p className="font-medium text-stone-800 mt-0.5">{r.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-5 flex items-center justify-between">
            <p className="text-xs text-stone-400">
              Generated by CargoMatch · {fmt(new Date())}
            </p>
            <p className="text-xs text-stone-400">
              Ref: {data.reference || data.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
