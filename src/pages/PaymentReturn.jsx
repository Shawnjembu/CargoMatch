import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { CheckCircle, XCircle, Loader, ArrowRight } from 'lucide-react'

export default function PaymentReturn() {
  const [params]  = useSearchParams()
  const [status,  setStatus]  = useState('verifying') // verifying | success | failed
  const [ref,     setRef]     = useState('')
  const [error,   setError]   = useState('')

  useEffect(() => {
    verify()
  }, [])

  const verify = async () => {
    const token    = params.get('TransactionToken')
    const approved = params.get('TransactionApproved')

    if (!token || approved !== '1') {
      setError('Payment was cancelled or declined.')
      setStatus('failed')
      return
    }

    // Retrieve pending payment context stored before redirect
    let pending
    try {
      pending = JSON.parse(localStorage.getItem('pendingPayment') || 'null')
    } catch {
      pending = null
    }

    if (!pending) {
      setError('Payment context not found. Please contact support.')
      setStatus('failed')
      return
    }

    const { data, error: fnError } = await supabase.functions.invoke('dpo-verify-token', {
      body: {
        token,
        bidId:         pending.bidId,
        loadId:        pending.loadId,
        carrierId:     pending.carrierId,
        carrierUserId: pending.carrierUserId,
        shipperId:     pending.shipperId,
        amount:        pending.amount,
      },
    })

    if (fnError || !data?.success) {
      setError(data?.error ?? fnError?.message ?? 'Verification failed.')
      setStatus('failed')
      return
    }

    localStorage.removeItem('pendingPayment')
    setRef(data.reference)
    setStatus('success')
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">

        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Loader size={28} className="text-forest-500 animate-spin" />
            </div>
            <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">Verifying Payment</h1>
            <p className="text-stone-400 text-sm">Please wait while we confirm your payment with DPO Pay…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={28} className="text-forest-500" />
            </div>
            <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">Payment Confirmed!</h1>
            <p className="text-stone-500 text-sm mb-1">Your payment is held securely in escrow.</p>
            <p className="text-stone-400 text-xs mb-8">It will be released to the carrier once you confirm delivery.</p>
            {ref && (
              <div className="bg-forest-50 border border-forest-200 rounded-xl px-4 py-3 mb-8">
                <p className="text-xs text-forest-600 font-medium">Shipment Reference</p>
                <p className="font-display font-800 text-forest-700 text-lg">{ref}</p>
              </div>
            )}
            <div className="flex flex-col gap-3">
              <Link to="/shipper"
                className="inline-flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all">
                Go to Dashboard <ArrowRight size={15} />
              </Link>
              {ref && (
                <Link to={`/track/${ref}`}
                  className="inline-flex items-center justify-center gap-2 border border-stone-200 text-stone-600 hover:bg-stone-50 font-medium text-sm px-6 py-3 rounded-xl transition-all">
                  Track Shipment
                </Link>
              )}
            </div>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <XCircle size={28} className="text-rose-500" />
            </div>
            <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">Payment Failed</h1>
            <p className="text-stone-500 text-sm mb-8">{error || 'Something went wrong. No charges were made.'}</p>
            <Link to="/shipper"
              className="inline-flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all">
              Back to Dashboard
            </Link>
          </>
        )}

      </div>
    </div>
  )
}
