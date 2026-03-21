import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import AuthModal from '../components/AuthModal'
import CountUp from '../components/CountUp'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Truck, Package, MapPin, Star, Shield, DollarSign,
  ArrowRight, Users, BarChart2, Zap, ChevronRight
} from 'lucide-react'

const features = [
  { icon: Zap,      title: 'Smart Matching',    desc: 'Our AI pairs your cargo with trucks already heading your route — matched in minutes, not days.', color: 'bg-amber-50 text-amber-600' },
  { icon: Users,    title: 'Load Pooling',      desc: 'Share truck space with other shippers going the same way. Split costs, not headaches.',          color: 'bg-blue-50 text-blue-600' },
  { icon: MapPin,   title: 'Real-Time Tracking',desc: 'Live GPS tracking from pickup to drop-off. Always know where your cargo is.',                    color: 'bg-forest-50 text-forest-600' },
  { icon: Shield,   title: 'Verified Carriers', desc: 'Every truck owner is vetted, rated, and reviewed. You only work with trusted partners.',         color: 'bg-purple-50 text-purple-600' },
  { icon: DollarSign,title: 'Price Transparency',desc: 'See all costs before you commit. No hidden fees, no surprises at delivery.',                   color: 'bg-rose-50 text-rose-600' },
  { icon: BarChart2, title: 'Route Analytics',  desc: 'Get insights into your shipping patterns and discover where you can save even more.',            color: 'bg-teal-50 text-teal-600' },
]

const steps = [
  { n: '01', title: 'Post Your Load',  desc: 'Describe your cargo, pickup location, destination and timeline.' },
  { n: '02', title: 'Get Matched',     desc: 'The platform instantly surfaces available trucks on your route.' },
  { n: '03', title: 'Compare & Book',  desc: 'Review carrier profiles, ratings and prices. Confirm in one tap.' },
  { n: '04', title: 'Track & Receive', desc: 'Watch your shipment move live. Confirm delivery when it arrives.' },
]

const testimonials = [
  { name: 'Kabo Mosweu',   role: 'Hardware Store Owner, Gaborone',   text: 'CargoMatch cut my supply chain costs by almost half. The load pooling feature is a game changer for a small business like mine.', rating: 5 },
  { name: 'Thato Seretse', role: 'Carrier, Francistown–Gaborone',    text: "I used to drive back empty after every delivery. Now I fill my truck both ways. My monthly income has grown significantly.",          rating: 5 },
  { name: 'Mpho Dlamini',  role: 'Logistics Manager, Kasane',        text: 'The real-time tracking alone justifies the platform. My clients love being able to see exactly where their goods are.',            rating: 5 },
]

const LIVE_STATS = [
  { label: 'Active Carriers',  key: 'carriers',  suffix: '+',   decimals: 0 },
  { label: 'Loads Delivered',  key: 'delivered',  suffix: '+',   decimals: 0 },
  { label: 'Avg. Cost Savings', key: 'savings',   suffix: '%',   decimals: 0 },
  { label: 'Platform Rating',  key: 'rating',    suffix: '★',   decimals: 1 },
]

export default function Landing() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [showAuth, setShowAuth] = useState(false)
  const [authRole, setAuthRole] = useState('shipper')
  const [liveNums, setLiveNums] = useState({ carriers: 0, delivered: 0, savings: 40, rating: 4.8 })

  useEffect(() => {
    const fetchLiveStats = async () => {
      const [{ count: delivered }, { count: carriers }] = await Promise.all([
        supabase.from('shipments').select('*', { count: 'exact', head: true }).eq('status', 'delivered'),
        supabase.from('carriers').select('*', { count: 'exact', head: true }),
      ])
      setLiveNums({ carriers: carriers || 0, delivered: delivered || 0, savings: 40, rating: 4.8 })
    }
    fetchLiveStats()
  }, [])

  const handleCTA = (role) => {
    if (user) {
      navigate(role === 'carrier' ? '/carrier' : '/shipper')
    } else {
      setAuthRole(role)
      setShowAuth(true)
    }
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-forest-100 rounded-full blur-3xl opacity-40 translate-x-1/3 -translate-y-1/4" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-sand rounded-full blur-2xl opacity-60 -translate-x-1/4 translate-y-1/4" />
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'linear-gradient(#259658 1px, transparent 1px), linear-gradient(90deg, #259658 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        </div>

        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-forest-50 border border-forest-200 text-forest-700 text-sm font-medium px-4 py-1.5 rounded-full mb-8 animate-fadeUp">
            <span className="w-2 h-2 bg-forest-500 rounded-full animate-pulse-dot" />
            Now live across Southern Africa
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-800 text-stone-900 leading-[1.05] mb-6 animate-fadeUp delay-100">
            Freight matching,<br />
            <span className="text-forest-500 relative">
              reimagined.
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 400 12" fill="none">
                <path d="M2 8 Q100 2 200 8 Q300 14 398 8" stroke="#259658" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.4" />
              </svg>
            </span>
          </h1>

          <p className="text-lg md:text-xl text-stone-500 max-w-2xl mx-auto mb-10 animate-fadeUp delay-200 leading-relaxed">
            CargoMatch connects shippers and carriers across Botswana and Southern Africa.
            Post a load, get matched instantly, track in real time — and save up to 40% on transport costs.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fadeUp delay-300">
            <button
              onClick={() => handleCTA('shipper')}
              className="inline-flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-display font-700 text-base px-8 py-4 rounded-xl transition-all hover:shadow-lg hover:shadow-forest-200 hover:-translate-y-0.5"
            >
              📦 I Need to Ship <ArrowRight size={18} />
            </button>
            <button
              onClick={() => handleCTA('carrier')}
              className="inline-flex items-center justify-center gap-2 bg-white border-2 border-stone-200 hover:border-forest-300 text-stone-700 font-display font-700 text-base px-8 py-4 rounded-xl transition-all hover:-translate-y-0.5"
            >
              🚛 I'm a Carrier <Truck size={18} />
            </button>
          </div>
        </div>

        {/* Floating route card */}
        <div className="max-w-4xl mx-auto mt-20 animate-fadeUp delay-400">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl shadow-stone-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-stone-400 uppercase tracking-widest">Live Route Preview</span>
              <span className="flex items-center gap-1.5 text-xs text-forest-600 font-medium">
                <span className="w-2 h-2 bg-forest-500 rounded-full animate-pulse-dot" /> 3 trucks available
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 bg-forest-500 rounded-full" />
                <div className="w-0.5 h-16 bg-stone-200 my-1" />
                <div className="w-3 h-3 bg-stone-400 rounded-full" />
              </div>
              <div className="flex-1">
                <div className="mb-4">
                  <p className="font-display font-700 text-stone-900">Gaborone</p>
                  <p className="text-sm text-stone-400">Pickup · Ready now</p>
                </div>
                <div className="h-0.5 route-line mb-4" />
                <div>
                  <p className="font-display font-700 text-stone-900">Francistown</p>
                  <p className="text-sm text-stone-400">Destination · ~3h 20min</p>
                </div>
              </div>
              <div className="hidden sm:flex flex-col gap-2">
                {[
                  { carrier: 'Lekgowa Transport', price: 'P 1,240', rating: '4.9' },
                  { carrier: 'Moagi Haulage',     price: 'P 1,390', rating: '4.7' },
                  { carrier: 'Ditiro Freight',    price: 'P 1,180', rating: '4.8' },
                ].map((c, i) => (
                  <div key={i} className="flex items-center gap-3 bg-stone-50 rounded-lg px-3 py-2">
                    <div className="w-7 h-7 bg-forest-100 rounded-full flex items-center justify-center">
                      <Truck size={13} className="text-forest-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-stone-800">{c.carrier}</p>
                      <p className="text-xs text-stone-400">★ {c.rating}</p>
                    </div>
                    <span className="ml-auto text-sm font-display font-700 text-forest-600">{c.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-forest-600 py-14 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {LIVE_STATS.map((s, i) => (
            <div key={i} className="text-center">
              <p className="font-display text-3xl md:text-4xl font-800 text-white">
                <CountUp to={liveNums[s.key]} suffix={s.suffix} decimals={s.decimals} duration={1600} />
              </p>
              <p className="text-forest-200 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-forest-600 font-medium text-sm uppercase tracking-widest mb-3">Platform Features</p>
            <h2 className="font-display text-4xl md:text-5xl font-800 text-stone-900">
              Everything you need,<br />nothing you don't.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 p-6 hover:shadow-lg hover:shadow-stone-100 transition-all hover:-translate-y-1 group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon size={20} />
                </div>
                <h3 className="font-display font-700 text-stone-900 text-lg mb-2">{f.title}</h3>
                <p className="text-stone-500 text-sm leading-relaxed">{f.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-forest-500 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Learn more <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 bg-sand">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-forest-600 font-medium text-sm uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="font-display text-4xl md:text-5xl font-800 text-stone-900">Ship in four steps.</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <div key={i} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-forest-200 -translate-x-1/2 z-0" />
                )}
                <div className="relative z-10 text-center">
                  <div className="w-16 h-16 bg-forest-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 font-display font-800 text-lg shadow-lg shadow-forest-200">
                    {s.n}
                  </div>
                  <h3 className="font-display font-700 text-stone-900 mb-2">{s.title}</h3>
                  <p className="text-stone-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <button
              onClick={() => handleCTA('shipper')}
              className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-display font-700 px-8 py-4 rounded-xl transition-all hover:shadow-lg hover:shadow-forest-200"
            >
              Start Shipping <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-forest-600 font-medium text-sm uppercase tracking-widest mb-3">Testimonials</p>
            <h2 className="font-display text-4xl md:text-5xl font-800 text-stone-900">Trusted across Botswana.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 p-6 hover:shadow-lg transition-all">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} size={14} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-stone-700 text-sm leading-relaxed mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-forest-100 rounded-full flex items-center justify-center font-display font-700 text-forest-700 text-sm">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-display font-700 text-stone-900">{t.name}</p>
                    <p className="text-xs text-stone-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 px-6 bg-forest-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-4xl md:text-5xl font-800 text-white mb-4">Ready to move smarter?</h2>
          <p className="text-forest-200 text-lg mb-10">Join thousands of shippers and carriers already saving time and money on every trip.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => handleCTA('shipper')}
              className="inline-flex items-center justify-center gap-2 bg-white text-forest-700 hover:bg-forest-50 font-display font-700 px-8 py-4 rounded-xl transition-all"
            >
              Post a Load <Package size={18} />
            </button>
            <button
              onClick={() => handleCTA('carrier')}
              className="inline-flex items-center justify-center gap-2 bg-forest-700 hover:bg-forest-800 text-white font-display font-700 px-8 py-4 rounded-xl transition-all border border-forest-500"
            >
              Register as Carrier <Truck size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 py-10 px-6 bg-cream">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-forest-500 rounded-lg flex items-center justify-center">
              <Truck size={13} className="text-white" />
            </div>
            <span className="font-display font-800 text-stone-900">Cargo<span className="text-forest-500">Match</span></span>
          </div>
          <p className="text-stone-400 text-sm">© 2025 CargoMatch. Built for Southern Africa.</p>
          <div className="flex gap-6 text-sm text-stone-400">
            <a href="#" className="hover:text-forest-600 transition-colors">Privacy</a>
            <a href="#" className="hover:text-forest-600 transition-colors">Terms</a>
            <a href="#" className="hover:text-forest-600 transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          defaultMode="signup"
        />
      )}
    </div>
  )
}
