import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSubscription, PLAN_PRICES } from '../hooks/useSubscription'
import {
  Check, X, Zap, Shield, Star, Globe, ArrowLeft,
  CreditCard, Loader, CheckCircle, XCircle, Smartphone,
} from 'lucide-react'

// ── Plan definitions ───────────────────────────────────────────
const PLANS = [
  {
    id:    'basic',
    name:  'Basic',
    price: PLAN_PRICES.basic,
    features: [
      { text: 'Up to 2 trucks listed',          included: true },
      { text: '10 bids per month',               included: true },
      { text: 'Verified carrier badge',          included: true },
      { text: 'In-app messaging',                included: true },
      { text: 'Standard load notifications',     included: true },
      { text: 'Priority matching',               included: false },
      { text: 'Earnings analytics dashboard',    included: false },
      { text: 'SADC cross-border loads',         included: false },
    ],
  },
  {
    id:      'pro',
    name:    'Pro',
    price:   PLAN_PRICES.pro,
    popular: true,
    features: [
      { text: 'Up to 5 trucks listed',           included: true },
      { text: 'Unlimited bidding',               included: true },
      { text: 'Verified carrier badge',          included: true },
      { text: 'In-app messaging',                included: true },
      { text: 'Priority load notifications',     included: true },
      { text: 'Priority matching algorithm',     included: true },
      { text: 'Full earnings analytics',         included: true },
      { text: 'SADC cross-border loads',         included: false },
    ],
  },
  {
    id:    'enterprise',
    name:  'Enterprise',
    price: PLAN_PRICES.enterprise,
    features: [
      { text: 'Unlimited trucks',                included: true },
      { text: 'Unlimited bidding',               included: true },
      { text: 'Verified + Featured badge',       included: true },
      { text: 'In-app messaging',                included: true },
      { text: 'First access to new loads',       included: true },
      { text: 'Top priority in matching',        included: true },
      { text: 'Full earnings analytics',         included: true },
      { text: 'SADC cross-border loads',         included: true },
    ],
  },
]

// ── Badge icon per tier ────────────────────────────────────────
const TIER_BADGE = {
  trial:      { icon: Star,   color: 'text-amber-500' },
  basic:      { icon: Shield, color: 'text-stone-500' },
  pro:        { icon: Zap,    color: 'text-blue-500' },
  enterprise: { icon: Globe,  color: 'text-purple-500' },
  expired:    { icon: XCircle,color: 'text-rose-500' },
}

// ── Payment method modal ───────────────────────────────────────
function PaymentModal({ plan, onClose, onDpoPay, onGooglePay, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100">
          <X size={16} />
        </button>

        <div className="mb-5">
          <h3 className="font-display font-700 text-stone-900 text-lg">Choose payment method</h3>
          <p className="text-sm text-stone-400 mt-0.5">
            {plan?.name} plan — P {plan?.price}/month
          </p>
        </div>

        <div className="space-y-3">
          {/* DPO Pay */}
          <button
            onClick={() => onDpoPay(plan)}
            disabled={loading}
            className="w-full flex items-center gap-4 p-4 border border-stone-200 rounded-xl hover:border-forest-300 hover:bg-forest-50/40 transition-all text-left"
          >
            <div className="w-10 h-10 bg-forest-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CreditCard size={18} className="text-forest-600" />
            </div>
            <div>
              <p className="font-medium text-stone-900 text-sm">Pay with DPO Pay</p>
              <p className="text-xs text-stone-400">Local BWP payment · Cards, EFT, mobile money</p>
            </div>
          </button>

          {/* Google Pay */}
          <button
            onClick={() => onGooglePay(plan)}
            disabled={loading}
            className="w-full flex items-center gap-4 p-4 border border-stone-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/40 transition-all text-left"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Smartphone size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-stone-900 text-sm">Pay with Google Pay</p>
              <p className="text-xs text-stone-400">Fast checkout with your Google account</p>
            </div>
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-stone-400">
            <Loader size={14} className="animate-spin" /> Processing…
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function CarrierSubscription() {
  const navigate    = useNavigate()
  const [params]    = useSearchParams()
  const { user }    = useAuth()

  const [carrierId, setCarrierId]       = useState(null)
  const [payModal,  setPayModal]        = useState(null)   // plan object when open
  const [payLoading,setPayLoading]      = useState(false)
  const [pageStatus,setPageStatus]      = useState('idle') // idle | verifying | success | failed
  const [statusMsg, setStatusMsg]       = useState('')

  const { subscription, currentTier, daysRemaining, upgradeSubscription, loading } =
    useSubscription(carrierId)

  // ── Fetch carrier id on mount ─────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('carriers').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setCarrierId(data.id) })
  }, [user])

  // ── Handle DPO Pay return ─────────────────────────────────────
  useEffect(() => {
    const token    = params.get('TransactionToken')
    const approved = params.get('TransactionApproved')
    if (!token) return

    setPageStatus('verifying')

    const pending = (() => {
      try { return JSON.parse(localStorage.getItem('pendingSubscription') || 'null') } catch { return null }
    })()

    if (!pending || approved !== '1') {
      setStatusMsg('Payment was cancelled or declined. No charges were made.')
      setPageStatus('failed')
      return
    }

    ;(async () => {
      // Verify token with DPO
      const { data, error } = await supabase.functions.invoke('dpo-verify-token', {
        body: { token, subscriptionPayment: true, amount: pending.amount },
      })

      if (error || !data?.success) {
        setStatusMsg(data?.error ?? error?.message ?? 'Payment verification failed.')
        setPageStatus('failed')
        return
      }

      const { error: upErr } = await upgradeSubscription(pending.tier)
      if (upErr) {
        setStatusMsg('Payment received but plan activation failed. Contact support.')
        setPageStatus('failed')
        return
      }

      localStorage.removeItem('pendingSubscription')
      setStatusMsg(`You're now on the ${pending.tier.charAt(0).toUpperCase() + pending.tier.slice(1)} plan!`)
      setPageStatus('success')
    })()
  }, [params])

  // ── DPO Pay handler ───────────────────────────────────────────
  const handleDpoPay = async (plan) => {
    setPayLoading(true)
    const appUrl = window.location.origin
    const ref    = `SUB-${plan.id.toUpperCase()}-${Date.now()}`

    const { data, error } = await supabase.functions.invoke('dpo-create-token', {
      body: {
        amount:      plan.price,
        currency:    'BWP',
        reference:   ref,
        redirectUrl: `${appUrl}/carrier/subscription`,
        backUrl:     `${appUrl}/carrier/subscription`,
        description: `CargoMatch ${plan.name} subscription — P ${plan.price}/month`,
      },
    })

    if (error || !data?.payUrl) {
      alert(data?.error ?? 'Could not initiate payment. Please try again.')
      setPayLoading(false)
      return
    }

    localStorage.setItem('pendingSubscription', JSON.stringify({
      tier:   plan.id,
      amount: plan.price,
      ref,
    }))

    window.location.href = data.payUrl
  }

  // ── Google Pay handler ────────────────────────────────────────
  const handleGooglePay = async (plan) => {
    if (!window.PaymentRequest) {
      alert('Google Pay is not supported in this browser. Please use DPO Pay instead.')
      return
    }
    setPayLoading(true)

    const request = new window.PaymentRequest(
      [{ supportedMethods: 'https://google.com/pay', data: {
        environment:       'TEST',  // change to 'PRODUCTION' when live
        apiVersion:        2,
        apiVersionMinor:   0,
        merchantInfo:      { merchantName: 'CargoMatch', merchantId: 'BCR2DN4TR3Q7I66I' },
        allowedPaymentMethods: [{
          type:       'CARD',
          parameters: { allowedAuthMethods: ['PAN_ONLY','CRYPTOGRAM_3DS'], allowedCardNetworks: ['VISA','MASTERCARD'] },
          tokenizationSpecification: { type: 'PAYMENT_GATEWAY', parameters: { gateway: 'example', gatewayMerchantId: 'cargomatch' } },
        }],
      }}],
      { total: { label: `CargoMatch ${plan.name} Plan`, amount: { currency: 'BWP', value: String(plan.price) } } }
    )

    try {
      const result = await request.show()
      await result.complete('success')
      // Activate plan directly (Google Pay handled payment)
      const { error } = await upgradeSubscription(plan.id)
      if (error) throw new Error('Plan activation failed')
      setPayModal(null)
      setStatusMsg(`You're now on the ${plan.name} plan!`)
      setPageStatus('success')
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatusMsg('Google Pay payment failed. Please try DPO Pay instead.')
        setPageStatus('failed')
      }
    } finally {
      setPayLoading(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────
  if (pageStatus === 'success') {
    return (
      <div className="min-h-screen bg-cream font-body">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">
          <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={28} className="text-forest-500" />
          </div>
          <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">Plan Activated!</h1>
          <p className="text-stone-500 text-sm mb-8">{statusMsg}</p>
          <button
            onClick={() => navigate('/carrier')}
            className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Failed screen ─────────────────────────────────────────────
  if (pageStatus === 'failed') {
    return (
      <div className="min-h-screen bg-cream font-body">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <XCircle size={28} className="text-rose-500" />
          </div>
          <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">Payment Failed</h1>
          <p className="text-stone-500 text-sm mb-8">{statusMsg}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setPageStatus('idle')}
              className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/carrier')}
              className="inline-flex items-center gap-2 border border-stone-200 text-stone-600 hover:bg-stone-50 font-medium text-sm px-6 py-3 rounded-xl transition-all"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Verifying screen ──────────────────────────────────────────
  if (pageStatus === 'verifying') {
    return (
      <div className="min-h-screen bg-cream font-body">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">
          <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-pulse">
            <Loader size={28} className="text-forest-500 animate-spin" />
          </div>
          <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">Verifying Payment</h1>
          <p className="text-stone-400 text-sm">Please wait while we confirm your payment…</p>
        </div>
      </div>
    )
  }

  // ── Main plans page ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-16">

        {/* Back link */}
        <Link
          to="/carrier"
          className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors mb-8"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-800 text-stone-900 mb-3">
            Choose your plan
          </h1>
          <p className="text-stone-500 text-base">
            Start with a free 1-month trial. Upgrade anytime.
          </p>

          {/* Trial days remaining */}
          {currentTier === 'trial' && daysRemaining > 0 && (
            <div className={`inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full text-sm font-medium border ${
              daysRemaining <= 3
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <Star size={13} />
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining on your free trial
            </div>
          )}
          {currentTier === 'expired' && (
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full text-sm font-medium bg-rose-50 border border-rose-200 text-rose-700">
              <XCircle size={13} /> Your trial has ended — choose a plan to continue
            </div>
          )}
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {PLANS.map(plan => {
            const isCurrent = currentTier === plan.id
            const BadgeIcon = TIER_BADGE[plan.id]?.icon || Shield

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border p-6 flex flex-col transition-all ${
                  plan.popular
                    ? 'border-forest-400 shadow-lg shadow-forest-100'
                    : 'border-stone-200 hover:border-stone-300 hover:shadow-sm'
                }`}
              >
                {/* Most Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-forest-500 text-white text-xs font-700 px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Current plan badge */}
                {isCurrent && (
                  <div className="absolute top-4 right-4">
                    <span className="bg-forest-50 text-forest-700 border border-forest-200 text-xs font-700 px-2.5 py-0.5 rounded-full">
                      Current
                    </span>
                  </div>
                )}

                {/* Plan icon + name */}
                <div className="flex items-center gap-2 mb-2">
                  <BadgeIcon size={18} className={TIER_BADGE[plan.id]?.color} />
                  <h2 className="font-display font-700 text-stone-900 text-xl">{plan.name}</h2>
                </div>

                {/* Price */}
                <div className="mb-5">
                  <span className="font-display font-800 text-stone-900 text-3xl">P {plan.price}</span>
                  <span className="text-stone-400 text-sm"> / month</span>
                </div>

                {/* Feature list */}
                <div className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      {f.included
                        ? <Check size={14} className="text-forest-500 flex-shrink-0" />
                        : <X size={14} className="text-stone-300 flex-shrink-0" />
                      }
                      <span className={`text-sm ${f.included ? 'text-stone-700' : 'text-stone-400'}`}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => !isCurrent && setPayModal(plan)}
                  disabled={isCurrent || loading}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-all ${
                    isCurrent
                      ? 'bg-stone-100 text-stone-400 cursor-default'
                      : plan.popular
                        ? 'bg-forest-500 hover:bg-forest-600 text-white'
                        : 'border border-stone-200 hover:border-forest-400 text-stone-700 hover:text-forest-700 hover:bg-forest-50'
                  }`}
                >
                  {isCurrent ? 'Current Plan' : currentTier === 'expired' ? 'Choose Plan' : 'Upgrade'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-stone-400 mt-8">
          All plans are billed monthly in Botswana Pula (BWP). Cancel anytime.
          Prices exclude applicable taxes.
        </p>
      </div>

      {/* Payment method modal */}
      {payModal && (
        <PaymentModal
          plan={payModal}
          onClose={() => { setPayModal(null); setPayLoading(false) }}
          onDpoPay={handleDpoPay}
          onGooglePay={handleGooglePay}
          loading={payLoading}
        />
      )}
    </div>
  )
}
