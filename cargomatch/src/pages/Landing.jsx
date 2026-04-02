import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthModal from '../components/AuthModal'
import {
  Truck, Package, MapPin, Shield, BarChart2, Globe,
  CheckCircle, ArrowRight
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────
function NavBar({ onCTA, onSignIn }) {
  return (
    <nav className="fixed top-0 inset-x-0 z-40 bg-white/80 backdrop-blur border-b border-stone-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <span className="font-display font-800 text-xl text-forest-700">CargoMatch</span>
        <div className="flex items-center gap-4">
          <a href="#pricing" className="text-sm text-stone-500 hover:text-stone-800 transition-colors hidden sm:block">
            Pricing
          </a>
          <button
            onClick={onSignIn}
            className="text-sm text-stone-600 hover:text-forest-600 font-medium transition-colors hidden sm:block"
          >
            Sign In
          </button>
          <button
            onClick={onCTA}
            className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </nav>
  )
}

const HOW_SHIPPERS = [
  { step: '01', title: 'Post a Load', desc: 'Describe your cargo, pickup & delivery locations, and preferred dates.' },
  { step: '02', title: 'Receive Bids', desc: 'Verified carriers respond with competitive quotes within minutes.' },
  { step: '03', title: 'Confirm & Track', desc: 'Accept the best offer and track your shipment in real time.' },
]

const HOW_CARRIERS = [
  { step: '01', title: 'Browse Loads', desc: 'See loads matching your routes, truck type, and availability.' },
  { step: '02', title: 'Place a Bid', desc: 'Submit your rate and availability with one tap.' },
  { step: '03', title: 'Match & Earn', desc: "Get matched, complete the job, and grow your fleet's revenue." },
]

const WHY_CARDS = [
  {
    icon: Shield,
    title: 'Verified Carriers',
    desc: 'Every carrier on CargoMatch is vetted with valid operating licences and compliance documents.',
  },
  {
    icon: MapPin,
    title: 'Real-time Tracking',
    desc: 'Live GPS sharing means you always know exactly where your cargo is, no phone calls needed.',
  },
  {
    icon: BarChart2,
    title: 'Competitive Pricing',
    desc: 'Open bidding drives fair market rates — shippers save, carriers fill trucks.',
  },
  {
    icon: Globe,
    title: 'SADC Coverage',
    desc: 'Cross-border loads across Botswana, South Africa, Zimbabwe, Zambia and beyond.',
  },
]

const PLANS = [
  {
    name: 'Trial',
    price: 'Free',
    period: '30 days',
    color: 'border-stone-200',
    badge: null,
    features: ['5 load posts', 'Bid on loads', 'Basic tracking', 'Email support'],
  },
  {
    name: 'Basic',
    price: 'P150',
    period: '/ month',
    color: 'border-stone-200',
    badge: null,
    features: ['20 load posts', 'Priority matching', 'Live tracking', 'Chat support'],
  },
  {
    name: 'Pro',
    price: 'P350',
    period: '/ month',
    color: 'border-forest-500 ring-2 ring-forest-400',
    badge: 'Most Popular',
    features: ['Unlimited posts', 'Advanced analytics', 'Invoice generation', 'Phone support'],
  },
  {
    name: 'Enterprise',
    price: 'P750',
    period: '/ month',
    color: 'border-stone-200',
    badge: null,
    features: ['Everything in Pro', 'Dedicated account manager', 'Fleet management', 'Custom integrations'],
  },
]

// ── main component ────────────────────────────────────────────
export default function Landing() {
  const navigate  = useNavigate()
  const { user, profile } = useAuth()
  const [authModal, setAuthModal] = useState(null) // null | 'signin' | 'signup'

  function handleCTA(mode = 'signup') {
    if (user) {
      if (profile?.is_admin)           return navigate('/admin')
      if (profile?.role === 'carrier') return navigate('/carrier')
      return navigate('/shipper')
    }
    setAuthModal(mode)
  }

  return (
    <div className="min-h-screen bg-white font-sans text-stone-800">
      <NavBar onCTA={() => handleCTA('signup')} onSignIn={() => handleCTA('signin')} />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6 bg-gradient-to-br from-forest-50 via-white to-sand-50">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-3 py-1 bg-forest-100 text-forest-700 text-xs font-semibold rounded-full mb-6 tracking-wide uppercase">
            Built for Botswana &amp; SADC
          </span>
          <h1 className="font-display font-800 text-5xl sm:text-6xl text-stone-900 leading-tight mb-6">
            Move Cargo Smarter<br className="hidden sm:block" /> Across Botswana
          </h1>
          <p className="text-lg text-stone-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Connect with verified carriers, post loads in minutes, and track every
            shipment in real time — all in one platform built for the SADC region.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => handleCTA('signup')}
              className="w-full sm:w-auto px-8 py-4 bg-forest-600 hover:bg-forest-700 text-white font-semibold rounded-2xl text-base shadow-lg shadow-forest-200 transition-all hover:shadow-xl hover:-translate-y-0.5"
            >
              Post a Load
            </button>
            <button
              onClick={() => handleCTA('signup')}
              className="w-full sm:w-auto px-8 py-4 border-2 border-forest-600 text-forest-700 hover:bg-forest-50 font-semibold rounded-2xl text-base transition-colors"
            >
              Join as a Carrier
            </button>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display font-800 text-3xl sm:text-4xl text-stone-900 mb-3">How It Works</h2>
            <p className="text-stone-400 text-base">Simple for shippers. Powerful for carriers.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-12">
            {/* Shippers column */}
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-9 h-9 bg-forest-100 rounded-xl flex items-center justify-center">
                  <Package size={18} className="text-forest-700" />
                </div>
                <h3 className="font-display font-700 text-lg text-stone-800">For Shippers</h3>
              </div>
              <div className="space-y-6">
                {HOW_SHIPPERS.map(item => (
                  <div key={item.step} className="flex gap-4">
                    <span className="font-display font-800 text-2xl text-forest-200 w-8 flex-shrink-0 leading-tight">{item.step}</span>
                    <div>
                      <p className="font-semibold text-stone-800 mb-0.5">{item.title}</p>
                      <p className="text-sm text-stone-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Carriers column */}
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Truck size={18} className="text-amber-700" />
                </div>
                <h3 className="font-display font-700 text-lg text-stone-800">For Carriers</h3>
              </div>
              <div className="space-y-6">
                {HOW_CARRIERS.map(item => (
                  <div key={item.step} className="flex gap-4">
                    <span className="font-display font-800 text-2xl text-amber-200 w-8 flex-shrink-0 leading-tight">{item.step}</span>
                    <div>
                      <p className="font-semibold text-stone-800 mb-0.5">{item.title}</p>
                      <p className="text-sm text-stone-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY CARGOMATCH ───────────────────────────────────── */}
      <section className="py-24 px-6 bg-stone-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display font-800 text-3xl sm:text-4xl text-stone-900 mb-3">Why CargoMatch?</h2>
            <p className="text-stone-400 text-base">Everything you need, nothing you don't.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WHY_CARDS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-forest-50 border border-forest-100 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={18} className="text-forest-600" />
                </div>
                <h3 className="font-semibold text-stone-800 mb-2">{title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display font-800 text-3xl sm:text-4xl text-stone-900 mb-3">Simple, Transparent Pricing</h2>
            <p className="text-stone-400 text-base">Start free. Scale as you grow. Cancel anytime.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`relative bg-white rounded-2xl border-2 p-6 ${plan.color} ${plan.badge ? 'shadow-xl' : 'shadow-sm'}`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-forest-600 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}
                <h3 className="font-display font-700 text-lg text-stone-800 mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-800 text-stone-900">{plan.price}</span>
                  <span className="text-sm text-stone-400">{plan.period}</span>
                </div>
                <ul className="space-y-2.5 mt-5 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-stone-600">
                      <CheckCircle size={14} className="text-forest-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleCTA('signup')}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    plan.badge
                      ? 'bg-forest-600 hover:bg-forest-700 text-white'
                      : 'border border-stone-200 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────── */}
      <section className="py-20 px-6 bg-forest-700">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display font-800 text-3xl sm:text-4xl text-white mb-4">
            Ready to move your first load?
          </h2>
          <p className="text-forest-200 text-base mb-8">
            Join hundreds of businesses across Botswana already using CargoMatch.
          </p>
          <button
            onClick={() => handleCTA('signup')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white hover:bg-stone-50 text-forest-700 font-semibold rounded-2xl text-base shadow-lg transition-all hover:-translate-y-0.5"
          >
            Create a Free Account <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="bg-stone-900 text-stone-400 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <p className="font-display font-800 text-white text-lg mb-1">CargoMatch</p>
              <p className="text-sm">The smarter way to move freight across SADC.</p>
            </div>
            <nav className="flex flex-wrap items-center gap-6 text-sm">
              <a href="#" className="hover:text-white transition-colors">About</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
            </nav>
          </div>
          <div className="mt-8 pt-6 border-t border-stone-800 text-center text-xs text-stone-600">
            Built for Botswana 🇧🇼 &nbsp;·&nbsp; © {new Date().getFullYear()} CargoMatch. All rights reserved.
          </div>
        </div>
      </footer>

      {authModal && (
        <AuthModal defaultMode={authModal} onClose={() => setAuthModal(null)} />
      )}
    </div>
  )
}
