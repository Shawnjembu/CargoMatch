import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Truck, Star, Shield, MapPin, Package, Clock,
  MessageSquare, ChevronLeft, Award, Calendar,
  Phone, ChevronRight, AlertCircle, FileText,
  CheckCircle, X, ShieldCheck, Send, ArrowRight
} from 'lucide-react'

const CARGO_TYPES = [
  'General Merchandise', 'Building Materials', 'Food & Perishables',
  'Electronics', 'Furniture', 'Textiles', 'Agricultural Products',
  'Hazardous Materials', 'Vehicles / Equipment', 'Other',
]

export default function CarrierProfile() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const { user }     = useAuth()
  const [carrier,    setCarrier]    = useState(null)
  const [trucks,     setTrucks]     = useState([])
  const [routes,     setRoutes]     = useState([])
  const [reviews,    setReviews]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [notFound,   setNotFound]   = useState(false)
  const [quoteOpen,  setQuoteOpen]  = useState(false)
  const [quoteForm,  setQuoteForm]  = useState({ from: '', to: '', cargo: '', weight: '' })
  const [quoteError, setQuoteError] = useState('')

  useEffect(() => { if (id) fetchAll() }, [id])

  const fetchAll = async () => {
    setLoading(true)
    const { data: carrierData } = await supabase
      .from('carriers')
      .select('*, profiles(full_name, phone, location, bio, avatar_url, created_at)')
      .eq('id', id)
      .single()

    if (!carrierData) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setCarrier(carrierData)

    const [{ data: t }, { data: r }, { data: rv }] = await Promise.all([
      supabase.from('trucks').select('*').eq('carrier_id', id),
      supabase.from('carrier_routes').select('*').eq('carrier_id', id),
      supabase
        .from('reviews')
        .select('*, profiles!reviews_reviewer_id_fkey(full_name)')
        .eq('reviewee_id', carrierData.user_id)
        .order('created_at', { ascending: false }),
    ])
    setTrucks(t || [])
    setRoutes(r || [])
    setReviews(rv || [])
    // Pre-fill quote form from carrier's first route
    if (r?.length) {
      const first = r[0]
      setQuoteForm(f => ({
        ...f,
        from: first.from_city || first.from_location || '',
        to:   first.to_city   || first.to_location   || '',
      }))
    }
    setLoading(false)
  }

  const openQuote = () => {
    if (!user) { navigate('/') ; return }
    setQuoteError('')
    setQuoteOpen(true)
  }

  const submitQuote = () => {
    if (!quoteForm.from.trim() || !quoteForm.to.trim()) { setQuoteError('Please enter pickup and destination.'); return }
    if (!quoteForm.cargo)                                { setQuoteError('Please select a cargo type.'); return }
    if (!quoteForm.weight || Number(quoteForm.weight) <= 0) { setQuoteError('Please enter a valid weight.'); return }
    navigate('/post-load', {
      state: {
        from:      quoteForm.from.trim(),
        to:        quoteForm.to.trim(),
        cargoType: quoteForm.cargo,
        weight:    quoteForm.weight,
      },
    })
  }

  // ── Loading skeleton ─────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-cream font-body">
        <Navbar />
        <div className="max-w-5xl mx-auto px-6 pt-28 pb-16">
          <div className="grid lg:grid-cols-3 gap-6 animate-pulse">
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-2xl border border-stone-100 p-6">
                <div className="flex flex-col items-center gap-3 mb-5">
                  <div className="w-20 h-20 bg-stone-100 rounded-2xl" />
                  <div className="h-5 w-36 bg-stone-100 rounded-full" />
                  <div className="h-4 w-24 bg-stone-100 rounded-full" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[1,2,3].map(i => <div key={i} className="h-14 bg-stone-100 rounded-xl" />)}
                </div>
                <div className="space-y-3 mt-5">
                  {[1,2,3].map(i => <div key={i} className="h-4 bg-stone-100 rounded-full" />)}
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-white rounded-2xl border border-stone-100 p-6 h-28" />
              <div className="bg-white rounded-2xl border border-stone-100 p-6 h-44" />
              <div className="bg-white rounded-2xl border border-stone-100 p-6 h-64" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Not found ────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-cream font-body">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">
          <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={28} className="text-stone-400" />
          </div>
          <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">Carrier Not Found</h1>
          <p className="text-stone-400 text-sm mb-8">This carrier profile doesn't exist or has been removed.</p>
          <Link to="/shipper" className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all">
            <ChevronLeft size={16} /> Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const ratingBars = [5, 4, 3, 2, 1].map(star => {
    const count = reviews.filter(r => r.rating === star).length
    return { star, pct: reviews.length ? Math.round((count / reviews.length) * 100) : 0 }
  })

  const memberSince = carrier.profiles?.created_at
    ? new Date(carrier.profiles.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : carrier.member_since
      ? new Date(carrier.member_since).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : 'Recently joined'

  const truckStatusStyle = {
    active:     'bg-forest-50 text-forest-700',
    in_transit: 'bg-blue-50 text-blue-700',
    maintenance:'bg-amber-50 text-amber-700',
  }

  return (
    <>
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-16">

        <Link to="/shipper" className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors mb-6">
          <ChevronLeft size={14} /> Back
        </Link>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── Left column ─────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Profile card */}
            <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
              {/* Verified banner */}
              {carrier.verified && (
                <div className="bg-forest-600 px-5 py-3 flex items-center gap-2.5">
                  <ShieldCheck size={16} className="text-white flex-shrink-0" />
                  <div>
                    <p className="text-white text-sm font-display font-700 leading-none">Verified Carrier</p>
                    <p className="text-forest-200 text-xs mt-0.5">Identity & documents confirmed by CargoMatch</p>
                  </div>
                </div>
              )}

              <div className="p-6">
                <div className="text-center mb-5">
                  {carrier.profiles?.avatar_url ? (
                    <img src={carrier.profiles.avatar_url} alt={carrier.company_name}
                      className="w-20 h-20 object-cover rounded-2xl mx-auto mb-3 border border-stone-200" />
                  ) : (
                    <div className="w-20 h-20 bg-forest-100 rounded-2xl flex items-center justify-center font-display font-800 text-3xl text-forest-700 mx-auto mb-3">
                      {carrier.company_name?.[0] || '?'}
                    </div>
                  )}
                  <h1 className="font-display text-xl font-800 text-stone-900">{carrier.company_name}</h1>
                  {carrier.profiles?.full_name && (
                    <p className="text-stone-500 text-sm">{carrier.profiles.full_name}</p>
                  )}
                  {carrier.top_carrier && (
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium mt-2">
                      <Award size={10} /> Top Carrier
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Rating',  value: carrier.rating > 0 ? Number(carrier.rating).toFixed(1) : 'New' },
                    { label: 'Trips',   value: carrier.total_trips || 0 },
                    { label: 'On Time', value: `${carrier.on_time_rate || 100}%` },
                  ].map((s, i) => (
                    <div key={i} className="text-center bg-stone-50 rounded-xl py-2.5">
                      <p className="font-display font-800 text-stone-900 text-lg">{s.value}</p>
                      <p className="text-xs text-stone-400">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Details */}
                <div className="space-y-2.5 text-sm mb-5">
                  {[
                    carrier.profiles?.location && { icon: MapPin,   value: carrier.profiles.location },
                    { icon: Calendar, value: `Member since ${memberSince}` },
                    carrier.response_time && { icon: Clock, value: `Responds in ${carrier.response_time}` },
                    carrier.profiles?.phone && { icon: Phone, value: carrier.profiles.phone },
                    carrier.reg_number && { icon: FileText, value: `Reg: ${carrier.reg_number}` },
                  ].filter(Boolean).map((d, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-stone-600">
                      <d.icon size={13} className="text-forest-500 flex-shrink-0" />
                      <span>{d.value}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={openQuote}
                    className="w-full flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm py-3 rounded-xl transition-all">
                    <Package size={14} /> Request Quote
                  </button>
                  <Link to="/messages"
                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-stone-700 font-medium text-sm py-2.5 rounded-xl transition-all border border-stone-200 hover:border-stone-300">
                    <MessageSquare size={14} /> Send Message
                  </Link>
                </div>
              </div>
            </div>

            {/* Documents */}
            <div className="bg-white rounded-2xl border border-stone-100 p-5">
              <h3 className="font-display font-700 text-stone-900 text-sm mb-3 flex items-center gap-2">
                <FileText size={14} className="text-forest-500" /> Compliance Documents
              </h3>
              <div className="space-y-2.5">
                {[
                  { label: 'Operator Licence',      has: !!carrier.license_url },
                  { label: 'Insurance Certificate', has: !!carrier.insurance_url },
                ].map((doc, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                    <span className="text-sm text-stone-700">{doc.label}</span>
                    {doc.has ? (
                      <span className="flex items-center gap-1 text-xs text-forest-700 bg-forest-50 border border-forest-200 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle size={10} /> On file
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                        Not uploaded
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {!carrier.verified && (
                <p className="text-xs text-stone-400 mt-3">Documents are verified by CargoMatch before carrier is marked Verified.</p>
              )}
            </div>

            {/* Fleet */}
            {trucks.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 p-5">
                <h3 className="font-display font-700 text-stone-900 text-sm mb-3 flex items-center gap-2">
                  <Truck size={14} className="text-forest-500" />
                  Fleet · {trucks.length} truck{trucks.length !== 1 ? 's' : ''}
                </h3>
                <div className="space-y-3">
                  {trucks.map(t => (
                    <div key={t.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-stone-800">{t.type}</p>
                        <p className="text-xs text-stone-400">{t.plate} · {t.capacity_kg?.toLocaleString()}kg</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${truckStatusStyle[t.status] || 'bg-stone-100 text-stone-500'}`}>
                        {t.status?.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right column ────────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* About / bio */}
            {carrier.profiles?.bio && (
              <div className="bg-white rounded-2xl border border-stone-100 p-6">
                <h2 className="font-display font-700 text-stone-900 mb-3">About</h2>
                <p className="text-stone-600 text-sm leading-relaxed">{carrier.profiles.bio}</p>
              </div>
            )}

            {/* Common routes */}
            {routes.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 p-6">
                <h2 className="font-display font-700 text-stone-900 mb-4 flex items-center gap-2">
                  <MapPin size={15} className="text-forest-500" /> Common Routes
                </h2>
                <div className="space-y-2">
                  {routes.map(r => (
                    <div key={r.id} className="flex items-center gap-3 bg-stone-50 rounded-xl px-4 py-3">
                      <div className="w-2 h-2 bg-forest-500 rounded-full flex-shrink-0" />
                      <span className="text-sm text-stone-700 font-medium">{r.from_city} → {r.to_city}</span>
                      <ChevronRight size={13} className="text-stone-300 ml-auto" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            <div className="bg-white rounded-2xl border border-stone-100 p-6">
              <h2 className="font-display font-700 text-stone-900 mb-5">
                Reviews
                {reviews.length > 0 && (
                  <span className="text-sm font-400 text-stone-400 ml-2">({reviews.length})</span>
                )}
              </h2>

              {reviews.length === 0 ? (
                <div className="text-center py-8">
                  <Star size={28} className="text-stone-200 mx-auto mb-3" />
                  <p className="text-stone-400 text-sm">No reviews yet.</p>
                  <p className="text-stone-300 text-xs mt-1">Reviews appear after completed deliveries.</p>
                </div>
              ) : (
                <>
                  {/* Rating summary */}
                  <div className="flex items-center gap-6 mb-6 pb-6 border-b border-stone-100">
                    <div className="text-center">
                      <p className="font-display text-5xl font-800 text-stone-900">
                        {carrier.rating > 0 ? Number(carrier.rating).toFixed(1) : '—'}
                      </p>
                      <div className="flex items-center justify-center gap-0.5 my-1">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={13} className={s <= Math.round(carrier.rating) ? 'fill-amber-400 text-amber-400' : 'text-stone-200'} />
                        ))}
                      </div>
                      <p className="text-xs text-stone-400">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {ratingBars.map(b => (
                        <div key={b.star} className="flex items-center gap-2">
                          <span className="text-xs text-stone-400 w-3">{b.star}</span>
                          <Star size={10} className="fill-amber-400 text-amber-400 flex-shrink-0" />
                          <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${b.pct}%` }} />
                          </div>
                          <span className="text-xs text-stone-400 w-6">{b.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Review list */}
                  <div className="space-y-5">
                    {reviews.map((r, i) => (
                      <div key={r.id} className={i < reviews.length - 1 ? 'pb-5 border-b border-stone-100' : ''}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center font-display font-700 text-xs text-stone-600">
                              {r.profiles?.full_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-sm font-display font-700 text-stone-900">
                                {r.profiles?.full_name || 'Anonymous'}
                              </p>
                              <p className="text-xs text-stone-400">
                                {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} size={11} className={s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-200'} />
                            ))}
                          </div>
                        </div>
                        {r.comment && (
                          <p className="text-sm text-stone-600 leading-relaxed ml-10">{r.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>

    {/* Request Quote Modal */}
    {quoteOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setQuoteOpen(false)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fadeUp"
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="font-display font-700 text-stone-900">Request a Quote</h3>
              <p className="text-xs text-stone-400 mt-0.5">from {carrier.company_name}</p>
            </div>
            <button onClick={() => setQuoteOpen(false)}
              className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100">
              <X size={16} />
            </button>
          </div>

          {quoteError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-xl mt-3">
              {quoteError}
            </div>
          )}

          <div className="space-y-4 mt-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">From *</label>
                <input type="text" value={quoteForm.from}
                  onChange={e => setQuoteForm(f => ({ ...f, from: e.target.value }))}
                  placeholder="e.g. Gaborone"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">To *</label>
                <input type="text" value={quoteForm.to}
                  onChange={e => setQuoteForm(f => ({ ...f, to: e.target.value }))}
                  placeholder="e.g. Francistown"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Cargo Type *</label>
              <select value={quoteForm.cargo}
                onChange={e => setQuoteForm(f => ({ ...f, cargo: e.target.value }))}
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300">
                <option value="">Select cargo type...</option>
                {CARGO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Weight (kg) *</label>
              <input type="number" value={quoteForm.weight}
                onChange={e => setQuoteForm(f => ({ ...f, weight: e.target.value }))}
                placeholder="e.g. 500"
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
            </div>
          </div>

          {routes.length > 0 && (
            <div className="mt-4 bg-stone-50 rounded-xl px-4 py-3">
              <p className="text-xs text-stone-500 font-medium mb-2">Carrier's regular routes</p>
              <div className="flex flex-wrap gap-1.5">
                {routes.slice(0, 4).map(r => {
                  const from = r.from_city || r.from_location
                  const to   = r.to_city   || r.to_location
                  return (
                    <button key={r.id}
                      onClick={() => setQuoteForm(f => ({ ...f, from, to }))}
                      className="text-xs bg-white border border-stone-200 hover:border-forest-300 hover:bg-forest-50 text-stone-600 hover:text-forest-700 px-2.5 py-1 rounded-lg transition-all">
                      {from} → {to}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button onClick={() => setQuoteOpen(false)}
              className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50">
              Cancel
            </button>
            <button onClick={submitQuote}
              className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2">
              <ArrowRight size={14} /> Continue to Post Load
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
