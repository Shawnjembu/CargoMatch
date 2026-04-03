import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSubscription, PLAN_PRICES } from '../hooks/useSubscription'
import {
  Check, X, Zap, Shield, Star, Globe, ArrowLeft,
  ChevronDown, CheckCircle, XCircle, Loader, AlertCircle,
} from 'lucide-react'

// ── Plan definitions ───────────────────────────────────────────
const PLANS = [
  {
    id:    'basic',
    name:  'Basic',
    price: PLAN_PRICES.basic,
    features: [
      { text: 'Up to 2 trucks listed',          included: true },
      { text: 'Bid on up to 10 loads/month',     included: true },
      { text: 'Verified carrier badge',          included: true },
      { text: 'In-app messaging',                included: true },
      { text: 'Standard load notifications',     included: true },
      { text: 'Priority matching',               included: false },
      { text: 'Earnings analytics',              included: false },
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
      { text: 'Unlimited load bidding',          included: true },
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
      { text: 'Unlimited trucks listed',         included: true },
      { text: 'Unlimited load bidding',          included: true },
      { text: 'Verified + Featured badge',       included: true },
      { text: 'In-app messaging',                included: true },
      { text: 'First access to new loads',       included: true },
      { text: 'Top priority matching',           included: true },
      { text: 'Full earnings analytics',         included: true },
      { text: 'SADC cross-border loads',         included: true },
    ],
  },
]

// Feature rows for comparison table
const COMPARE_FEATURES = [
  { label: 'Trucks listed',             basic: '2',          pro: '5',        enterprise: 'Unlimited' },
  { label: 'Bids per month',            basic: '10',         pro: 'Unlimited', enterprise: 'Unlimited' },
  { label: 'Verified carrier badge',    basic: true,         pro: true,       enterprise: true },
  { label: 'Featured badge',            basic: false,        pro: false,      enterprise: true },
  { label: 'In-app messaging',          basic: true,         pro: true,       enterprise: true },
  { label: 'Load notifications',        basic: 'Standard',   pro: 'Priority', enterprise: 'First access' },
  { label: 'Matching priority',         basic: 'Normal',     pro: 'Priority', enterprise: 'Top priority' },
  { label: 'Earnings analytics',        basic: false,        pro: true,       enterprise: true },
  { label: 'SADC cross-border loads',   basic: false,        pro: false,      enterprise: true },
  { label: 'Customer support',          basic: 'Email',      pro: 'Priority', enterprise: 'Dedicated' },
]

const TIER_ICON = {
  trial:      Star,
  basic:      Shield,
  pro:        Zap,
  enterprise: Globe,
  expired:    XCircle,
}
const TIER_COLOR = {
  trial:      'text-amber-500',
  basic:      'text-stone-500',
  pro:        'text-blue-500',
  enterprise: 'text-purple-500',
  expired:    'text-rose-500',
}

// ── Google Pay helper ──────────────────────────────────────────
const GPY_ENV = import.meta.env.DEV ? 'TEST' : 'PRODUCTION'
const MERCHANT_ID = import.meta.env.VITE_GOOGLE_PAY_MERCHANT_ID || ''

function loadGooglePayScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.payments?.api?.PaymentsClient) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://pay.google.com/gp/p/js/pay.js'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
}

function getPaymentsClient() {
  return new window.google.payments.api.PaymentsClient({
    environment: GPY_ENV,
    paymentDataCallbacks: { onPaymentAuthorized: () => ({ transactionState: 'SUCCESS' }) },
  })
}

const BASE_REQUEST = {
  apiVersion: 2,
  apiVersionMinor: 0,
  allowedPaymentMethods: [{
    type: 'CARD',
    parameters: {
      allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
      allowedCardNetworks: ['VISA', 'MASTERCARD'],
    },
    tokenizationSpecification: {
      type: 'PAYMENT_GATEWAY',
      parameters: {
        gateway: 'example',  // replace with your gateway name in production
        gatewayMerchantId: MERCHANT_ID,
      },
    },
  }],
}

// ── Compare table cell ─────────────────────────────────────────
function Cell({ value }) {
  if (value === true)  return <Check size={14} className="text-forest-500 mx-auto" />
  if (value === false) return <X    size={14} className="text-stone-300 mx-auto" />
  return <span className="text-xs text-stone-600">{value}</span>
}

// ── Main page ──────────────────────────────────────────────────
export default function CarrierSubscription() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [carrierId,    setCarrierId]    = useState(null)
  const [selectedPlan, setSelectedPlan] = useState(null)   // plan object pending payment
  const [gpayReady,    setGpayReady]    = useState(false)
  const [paying,       setPaying]       = useState(false)
  const [payError,     setPayError]     = useState(null)
  const [success,      setSuccess]      = useState(null)   // plan name on success
  const [compareOpen,  setCompareOpen]  = useState(false)
  const gpayBtnRef = useRef(null)

  const { currentTier, daysRemaining, upgradeSubscription, loading, refetch } =
    useSubscription(carrierId)

  // Fetch carrier id
  useEffect(() => {
    if (!user) return
    supabase.from('carriers').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setCarrierId(data.id) })
  }, [user])

  // Load Google Pay SDK once
  useEffect(() => {
    loadGooglePayScript()
      .then(() => setGpayReady(true))
      .catch(() => setGpayReady(false))
  }, [])

  // Render official Google Pay button when a plan is selected
  useEffect(() => {
    if (!gpayReady || !selectedPlan || !gpayBtnRef.current) return
    gpayBtnRef.current.innerHTML = ''

    const client = getPaymentsClient()
    const btn = client.createButton({
      buttonType: 'subscribe',
      buttonColor: 'default',
      buttonSizeMode: 'fill',
      buttonLocale: 'en',
      onClick: () => handleGooglePay(selectedPlan),
    })
    gpayBtnRef.current.appendChild(btn)
  }, [gpayReady, selectedPlan])

  // Handle Google Pay button click - triggers the official SDK payment flow
  const handleGPayClick = () => {
    if (!gpayReady) {
      setPayError('Google Pay is not available in this browser.')
      return
    }
    handleGooglePay(selectedPlan)
  }

  // ── Google Pay flow ───────────────────────────────────────────
  const handleGooglePay = async (plan) => {
    if (!gpayReady) {
      setPayError('Google Pay is not available in this browser.')
      return
    }
    setPaying(true)
    setPayError(null)

    const client = getPaymentsClient()
    const paymentDataRequest = {
      ...BASE_REQUEST,
      merchantInfo: { merchantName: 'CargoMatch', merchantId: MERCHANT_ID },
      transactionInfo: {
        currencyCode: 'BWP',
        totalPriceStatus: 'FINAL',
        totalPrice: plan.price.toFixed(2),
        totalPriceLabel: `CargoMatch ${plan.name} Plan`,
      },
      callbackIntents: ['PAYMENT_AUTHORIZATION'],
    }

    try {
      const paymentData = await client.loadPaymentData(paymentDataRequest)
      const paymentToken = paymentData.paymentMethodData.tokenizationData.token

      const { error: activateErr } = await upgradeSubscription(plan.id, paymentToken)
      if (activateErr) throw new Error(activateErr)

      await refetch()
      setSelectedPlan(null)
      // Generate confirmation code for the success page
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, '0')
      const confirmCode = `CM-${dateStr}-${randomPart}`
      navigate(`/carrier/subscription/success?plan=${plan.id}&price=${plan.price}&name=${encodeURIComponent(plan.name)}&code=${encodeURIComponent(confirmCode)}`)
    } catch (err) {
      if (err.statusCode === 'CANCELED') {
        // User closed the sheet — silent
        setSelectedPlan(null)
      } else {
        setPayError('Payment failed. Please try again.')
      }
    } finally {
      setPaying(false)
    }
  }

  // ── Main plans page ───────────────────────────────────────────
  const tierOrder = ['trial', 'basic', 'pro', 'enterprise', 'expired']

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
          {currentTier === 'trial' && daysRemaining > 0 && (
            <p className="text-stone-500 text-base">
              You have <strong className={daysRemaining <= 3 ? 'text-rose-600' : 'text-amber-600'}>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong> left on your free trial. Upgrade to keep full access.
            </p>
          )}
          {currentTier === 'expired' && (
            <p className="text-stone-500 text-base">
              Your trial has ended. Subscribe to continue using CargoMatch as a carrier.
            </p>
          )}
          {['basic', 'pro', 'enterprise'].includes(currentTier) && (
            <p className="text-stone-500 text-base">
              You're on the <strong>{currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}</strong> plan. Upgrade anytime.
            </p>
          )}
        </div>

        {/* Payment error */}
        {payError && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 mb-6 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span className="flex-1">{payError}</span>
            <button onClick={() => setPayError(null)} className="text-rose-500 hover:text-rose-700"><X size={14} /></button>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-4">
          {PLANS.map(plan => {
            const isCurrent = currentTier === plan.id
            const isSelected = selectedPlan?.id === plan.id
            const TierIcon = TIER_ICON[plan.id] || Shield
            const currentIdx = tierOrder.indexOf(currentTier)
            const planIdx    = tierOrder.indexOf(plan.id)
            const ctaLabel   = isCurrent ? 'Current Plan'
              : (currentTier === 'trial' || currentTier === 'expired' || currentIdx < 0) ? 'Choose Plan'
              : planIdx > currentIdx ? 'Upgrade'
              : 'Switch'

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border p-6 flex flex-col transition-all ${
                  plan.popular
                    ? 'border-2 border-blue-400 shadow-lg shadow-blue-50'
                    : isSelected
                      ? 'border-forest-400 shadow-md'
                      : 'border-stone-200 hover:border-stone-300 hover:shadow-sm'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-500 text-white text-xs font-700 px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute top-4 right-4">
                    <span className="bg-forest-50 text-forest-700 border border-forest-200 text-xs font-700 px-2.5 py-0.5 rounded-full">
                      Current
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <TierIcon size={18} className={TIER_COLOR[plan.id]} />
                  <h2 className="font-display font-700 text-stone-900 text-xl">{plan.name}</h2>
                </div>

                <div className="mb-5">
                  <span className="font-display font-800 text-stone-900 text-3xl">P {plan.price}</span>
                  <span className="text-stone-400 text-sm"> / month</span>
                </div>

                <div className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      {f.included
                        ? <Check size={14} className="text-forest-500 flex-shrink-0" />
                        : <X size={14} className="text-stone-300 flex-shrink-0" />}
                      <span className={`text-sm ${f.included ? 'text-stone-700' : 'text-stone-400'}`}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA button */}
                <button
                  onClick={() => {
                    if (isCurrent || loading) return
                    setPayError(null)
                    setSelectedPlan(isSelected ? null : plan)
                  }}
                  disabled={isCurrent || loading}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-all ${
                    isCurrent
                      ? 'bg-stone-100 text-stone-400 cursor-default'
                      : isSelected
                        ? 'bg-forest-600 text-white ring-2 ring-forest-300'
                        : plan.popular
                          ? 'bg-forest-500 hover:bg-forest-600 text-white'
                          : 'border border-stone-200 hover:border-forest-400 text-stone-700 hover:text-forest-700 hover:bg-forest-50'
                  }`}
                >
                  {isCurrent ? 'Current Plan' : isSelected ? '✓ Selected' : ctaLabel}
                </button>
              </div>
            )
          })}
        </div>

        {/* ── Payment confirmation panel (Screens 2 & 3) ────────── */}
        {selectedPlan && (
          <div className="bg-white rounded-2xl border-2 border-forest-300 shadow-lg p-6 mb-6 animate-slideUp">
            {/* Step heading */}
            <p className="text-xs font-700 text-forest-600 uppercase tracking-wider mb-4">Complete your subscription</p>

            <div className="flex flex-col sm:flex-row gap-6">
              {/* Plan summary */}
              <div className="flex-1 bg-stone-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  {(() => { const Icon = TIER_ICON[selectedPlan.id] || Shield; return <Icon size={16} className={TIER_COLOR[selectedPlan.id]} /> })()}
                  <span className="font-display font-700 text-stone-900">{selectedPlan.name} Plan</span>
                </div>
                <p className="font-display font-800 text-2xl text-stone-900 mb-1">
                  P {selectedPlan.price}<span className="text-sm font-normal text-stone-400"> / month</span>
                </p>
                <p className="text-xs text-stone-400 mb-3">Billed monthly in BWP. Cancel anytime.</p>
                <div className="space-y-1.5">
                  {selectedPlan.features.filter(f => f.included).slice(0, 3).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-stone-600">
                      <Check size={11} className="text-forest-500 flex-shrink-0" />
                      {f.text}
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment method — official Google Pay mark */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-700 text-stone-500 uppercase tracking-wider mb-3">Payment method</p>
                  <p className="text-xs text-stone-400 mb-4">Pay securely. Your payment details are handled by Google Pay.</p>
                </div>

                {paying ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-stone-400">
                    <Loader size={14} className="animate-spin" /> Processing payment…
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGPayClick}
                    className="w-full rounded-xl overflow-hidden border border-stone-200 hover:border-stone-300 transition-colors"
                    title="Pay with Google Pay"
                  >
                    <img
                      src="/assets/google-pay-mark_800.svg"
                      alt="Pay with Google Pay"
                      className="w-full h-auto max-h-[48px] object-contain"
                    />
                  </button>
                )}

                <button
                  onClick={() => setSelectedPlan(null)}
                  className="mt-3 text-sm text-stone-400 hover:text-stone-600 transition-colors flex items-center gap-1"
                >
                  <ArrowLeft size={12} /> Change plan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Compare all features */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden mb-6">
          <button
            onClick={() => setCompareOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <span>Compare all features</span>
            <ChevronDown size={16} className={`text-stone-400 transition-transform ${compareOpen ? 'rotate-180' : ''}`} />
          </button>

          {compareOpen && (
            <div className="overflow-x-auto border-t border-stone-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50">
                    <th className="text-left px-6 py-3 text-stone-500 font-medium w-1/2">Feature</th>
                    <th className="text-center px-4 py-3 text-stone-700 font-700">Basic</th>
                    <th className="text-center px-4 py-3 text-blue-700 font-700">Pro</th>
                    <th className="text-center px-4 py-3 text-purple-700 font-700">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_FEATURES.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50/50'}>
                      <td className="px-6 py-3 text-stone-600">{row.label}</td>
                      <td className="px-4 py-3 text-center"><Cell value={row.basic} /></td>
                      <td className="px-4 py-3 text-center"><Cell value={row.pro} /></td>
                      <td className="px-4 py-3 text-center"><Cell value={row.enterprise} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Billing note */}
        <p className="text-center text-xs text-stone-400">
          Billed monthly in BWP. Cancel anytime. Payment method: Google Pay.
        </p>
      </div>
    </div>
  )
}
