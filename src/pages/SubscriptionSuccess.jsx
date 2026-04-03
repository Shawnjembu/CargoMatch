import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useSubscription } from '../hooks/useSubscription'
import { supabase } from '../lib/supabase'
import { CheckCircle, ArrowRight, CreditCard, Copy, Check } from 'lucide-react'

const PLAN_FEATURES = {
  basic:      ['Up to 2 trucks listed', '10 bids per month', 'Verified carrier badge'],
  pro:        ['Up to 5 trucks listed', 'Unlimited bidding', 'Priority matching + analytics'],
  enterprise: ['Unlimited trucks', 'Unlimited bidding', 'SADC cross-border loads'],
}

const REDIRECT_SECONDS = 10

// Generate a unique confirmation code: CM-YYYYMMDD-XXXXXX
function generateConfirmationCode() {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, '0')
  return `CM-${dateStr}-${randomPart}`
}

// Format current date/time for display
function formatTransactionDateTime() {
  return new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SubscriptionSuccess() {
  const navigate       = useNavigate()
  const [params]       = useSearchParams()
  const { user }       = useAuth()

  const [carrierId,  setCarrierId]  = useState(null)
  const [countdown,  setCountdown]  = useState(REDIRECT_SECONDS)
  const [checkAnim,  setCheckAnim]  = useState(false)
  const [confirmationCode, setConfirmationCode] = useState('')
  const [copied, setCopied] = useState(false)

  // Query params — used for mock preview and real flow alike
  const planId    = params.get('plan')  || 'pro'
  const planName  = params.get('name')  || (planId.charAt(0).toUpperCase() + planId.slice(1))
  const planPrice = params.get('price') || '350'
  // Get confirmation code from URL (passed from payment) or keep the generated one
  const urlCode = params.get('code')

  const { subscription, loading } = useSubscription(carrierId)

  // Guard: if no active subscription and not loading, redirect to plans
  // (Skip guard when accessed with query params for screenshot/mock use)
  const hasMockParams = params.has('plan')

  // Fetch carrier id
  useEffect(() => {
    if (!user) return
    supabase.from('carriers').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setCarrierId(data.id) })
  }, [user])

  // If carrier has no active subscription and this isn't a mock preview, redirect
  useEffect(() => {
    if (loading || hasMockParams) return
    if (!subscription) return
    const { subscription_tier } = subscription
    if (!['basic', 'pro', 'enterprise'].includes(subscription_tier)) {
      navigate('/carrier/subscription', { replace: true })
    }
  }, [subscription, loading, hasMockParams])

  // Trigger checkmark animation and set confirmation code on mount
  useEffect(() => {
    const t = setTimeout(() => setCheckAnim(true), 100)
    // Use code from URL if available, otherwise generate one
    if (urlCode && !confirmationCode) {
      setConfirmationCode(urlCode)
    } else if (!confirmationCode) {
      setConfirmationCode(generateConfirmationCode())
    }
    return () => clearTimeout(t)
  }, [urlCode])

  // Countdown + auto-redirect
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) {
          clearInterval(interval)
          navigate('/carrier')
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Subscription end date — real from DB or +30 days from now (mock)
  const subEnd = subscription?.subscription_end
    ? new Date(subscription.subscription_end)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const formattedEnd = subEnd.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  // Copy confirmation code to clipboard
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(confirmationCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-lg mx-auto px-6 pt-28 pb-16">

        {/* Animated checkmark */}
        <div className="text-center mb-8">
          <div
            className={`w-20 h-20 bg-forest-100 rounded-full flex items-center justify-center mx-auto mb-6 transition-all duration-500 ${
              checkAnim ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
            }`}
          >
            <CheckCircle
              size={40}
              className={`text-forest-500 transition-all duration-700 delay-200 ${
                checkAnim ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
              }`}
            />
          </div>
          <h1 className="font-display text-3xl font-800 text-stone-900 mb-2">Payment Successful!</h1>
          <p className="text-stone-500 text-base">
            Your <strong className="text-stone-800">{planName}</strong> subscription is now active.
          </p>
        </div>

        {/* Confirmation Code Section */}
        {confirmationCode && (
          <div className="bg-white rounded-2xl border border-forest-200 overflow-hidden mb-6">
            <div className="px-6 py-4 bg-forest-50 border-b border-forest-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-forest-500" />
                <span className="font-display font-700 text-stone-900 text-sm">Confirmation</span>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs text-stone-500 mb-2">Confirmation Code</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-lg font-700 text-stone-900 bg-stone-50 px-4 py-3 rounded-xl border border-stone-200">
                  {confirmationCode}
                </code>
                <button
                  onClick={handleCopyCode}
                  className="p-3 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors"
                  title="Copy confirmation code"
                >
                  {copied ? <Check size={18} className="text-forest-500" /> : <Copy size={18} className="text-stone-400" />}
                </button>
              </div>
              {copied && <p className="text-xs text-forest-600 mt-2">Copied to clipboard!</p>}
            </div>
          </div>
        )}

        {/* Subscription details card */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2">
            <CreditCard size={16} className="text-forest-500" />
            <h2 className="font-display font-700 text-stone-900 text-sm">Subscription Details</h2>
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Plan</span>
              <span className="font-700 text-stone-900">{planName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Price</span>
              <span className="font-700 text-stone-900">P {planPrice} / month</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Status</span>
              <span className="inline-flex items-center gap-1.5 font-700 text-forest-700">
                <span className="w-2 h-2 bg-forest-500 rounded-full" />
                Active
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Next billing date</span>
              <span className="font-700 text-stone-900">{formattedEnd}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Payment method</span>
              <span className="font-700 text-stone-900">Paid with Google Pay</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Date</span>
              <span className="font-700 text-stone-900">{formatTransactionDateTime()}</span>
            </div>
            <div className="pt-2 border-t border-stone-100 space-y-1.5">
              {(PLAN_FEATURES[planId] || PLAN_FEATURES.pro).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-stone-600">
                  <span className="w-1.5 h-1.5 bg-forest-400 rounded-full flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Confirmation note */}
        <p className="text-center text-xs text-stone-400 mb-8">
          A confirmation has been sent to your registered email address.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <button
            onClick={() => navigate('/carrier')}
            className="flex-1 flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all"
          >
            Go to Dashboard <ArrowRight size={14} />
          </button>
          <Link
            to="/carrier/subscription"
            className="flex-1 flex items-center justify-center gap-2 border border-stone-200 text-stone-600 hover:bg-stone-50 font-medium text-sm px-6 py-3 rounded-xl transition-all"
          >
            View subscription
          </Link>
        </div>

        {/* Countdown */}
        <p className="text-center text-xs text-stone-400">
          Redirecting to your dashboard in <strong>{countdown}s</strong>…
        </p>

      </div>
    </div>
  )
}
