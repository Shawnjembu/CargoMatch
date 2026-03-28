import { useNavigate } from 'react-router-dom'
import { X, Zap, Check } from 'lucide-react'

const PLANS = [
  {
    id:       'basic',
    name:     'Basic',
    price:    150,
    color:    'border-stone-200',
    features: ['Up to 2 trucks listed', '10 bids / month', 'Verified badge'],
  },
  {
    id:       'pro',
    name:     'Pro',
    price:    350,
    popular:  true,
    color:    'border-forest-400 bg-forest-50/60',
    features: ['Up to 5 trucks', 'Unlimited bidding', 'Priority matching'],
  },
  {
    id:       'enterprise',
    name:     'Enterprise',
    price:    750,
    color:    'border-purple-200 bg-purple-50/40',
    features: ['Unlimited trucks', 'SADC cross-border loads', 'First access to new loads'],
  },
]

/**
 * Props:
 *   show          boolean — controls visibility
 *   reason        string  — one-line gate reason shown under heading
 *   onClose       fn      — called when carrier dismisses (not allowed for expired)
 *   forceUpgrade  boolean — hides dismiss button (for expired carriers)
 */
export default function UpgradeModal({ show, reason, onClose, forceUpgrade = false }) {
  const navigate = useNavigate()
  if (!show) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={forceUpgrade ? undefined : onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button — hidden for forced upgrade */}
        {!forceUpgrade && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X size={16} />
          </button>
        )}

        {/* Heading */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-forest-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap size={18} className="text-forest-600" />
          </div>
          <h3 className="font-display font-700 text-stone-900 text-lg">Upgrade your plan</h3>
        </div>

        {reason && (
          <p className="text-sm text-stone-500 mb-5 pl-12">{reason}</p>
        )}

        {/* Condensed plan cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {PLANS.map(p => (
            <div
              key={p.id}
              className={`rounded-xl border p-3 ${p.color}`}
            >
              {p.popular && (
                <span className="text-xs font-700 text-forest-600 block mb-1">Most Popular</span>
              )}
              <p className="font-display font-700 text-stone-900 text-sm mb-0.5">{p.name}</p>
              <p className="text-forest-600 font-700 text-base mb-2">
                P {p.price}<span className="text-xs font-normal text-stone-400">/mo</span>
              </p>
              <div className="space-y-1">
                {p.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-1 text-xs text-stone-600">
                    <Check size={10} className="text-forest-500 flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex gap-3">
          {!forceUpgrade && (
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
            >
              Maybe later
            </button>
          )}
          <button
            onClick={() => navigate('/carrier/subscription')}
            className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 text-white text-sm font-medium rounded-xl transition-all"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  )
}
