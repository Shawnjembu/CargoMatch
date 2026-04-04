import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, Clock, CheckCircle, XCircle, AlertCircle, Loader } from 'lucide-react'

const TIER_LABELS = {
  trial: 'Free Trial',
  basic: 'Basic Plan',
  pro: 'Pro Plan',
  enterprise: 'Enterprise Plan',
  expired: 'Expired',
}

export default function SubscriptionHistory() {
  const { user } = useAuth()
  const [carrierId, setCarrierId] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    supabase.from('carriers').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) { setLoading(false); return }
        setCarrierId(data.id)
      })
  }, [user])

  useEffect(() => {
    if (!carrierId) return

    supabase
      .from('carrier_subscriptions')
      .select('*')
      .eq('carrier_id', carrierId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          if (import.meta.env.DEV) console.error('Failed to load subscription history:', error)
          setHistory([])
        } else {
          setHistory(data || [])
        }
        setLoading(false)
      })
  }, [carrierId])

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        <Link
          to="/carrier"
          className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors mb-8"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>

        <h1 className="font-display text-2xl sm:text-3xl font-800 text-stone-900 mb-2">
          Subscription History
        </h1>
        <p className="text-stone-500 text-sm mb-8">
          View your past and current subscription records.
        </p>

        {loading ? (
          <div className="flex flex-col items-center py-12 text-stone-400">
            <Loader size={24} className="animate-spin mb-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
            <AlertCircle size={32} className="text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500">No subscription records found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((sub) => (
              <div
                key={sub.id}
                className="bg-white rounded-2xl border border-stone-200 p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display font-700 text-lg text-stone-900">
                        {TIER_LABELS[sub.subscription_tier] || sub.subscription_tier}
                      </h3>
                      {sub.subscription_tier === 'expired' ? (
                        <XCircle size={16} className="text-rose-500" />
                      ) : (
                        <CheckCircle size={16} className="text-forest-500" />
                      )}
                    </div>
                    <p className="text-xs text-stone-400">
                      Created {formatDate(sub.created_at)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  {(sub.trial_start_date || sub.subscription_start) && (
                    <div>
                      <p className="text-stone-400 text-xs">Start Date</p>
                      <p className="text-stone-700">
                        {formatDate(sub.trial_start_date || sub.subscription_start)}
                      </p>
                    </div>
                  )}
                  {(sub.trial_end_date || sub.subscription_end) && (
                    <div>
                      <p className="text-stone-400 text-xs">End Date</p>
                      <p className="text-stone-700">
                        {formatDate(sub.trial_end_date || sub.subscription_end)}
                      </p>
                    </div>
                  )}
                  {sub.monthly_bid_count !== undefined && (
                    <div>
                      <p className="text-stone-400 text-xs">Bids Used</p>
                      <p className="text-stone-700">{sub.monthly_bid_count}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            to="/carrier/subscription"
            className="inline-flex items-center gap-2 text-sm text-forest-600 hover:text-forest-700 font-medium"
          >
            View Current Plan
          </Link>
        </div>
      </div>
    </div>
  )
}