import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import AuthModal from '../components/AuthModal'
import { fmtBWP } from '../lib/rates'
import { TRIAL_MODE } from '../lib/config'
import CountUp from '../components/CountUp'
import {
  Package, MapPin, Clock, CheckCircle, Truck, Plus, TrendingDown,
  Star, AlertCircle, ArrowRight, ChevronRight, LogIn, Bell,
  MessageSquare, Navigation, RefreshCw, X, Image, Send, Gavel, CreditCard
} from 'lucide-react'

const CITIES = {
  'Gaborone':    { lat: -24.6282, lng: 25.9231 },
  'Francistown': { lat: -21.1667, lng: 27.5167 },
  'Maun':        { lat: -19.9833, lng: 23.4167 },
  'Kasane':      { lat: -17.8000, lng: 25.1500 },
  'Lobatse':     { lat: -25.2167, lng: 25.6833 },
  'Palapye':     { lat: -22.5500, lng: 27.1333 },
  'Serowe':      { lat: -22.3833, lng: 26.7167 },
}
function getCity(loc) {
  if (!loc) return null
  const key = Object.keys(CITIES).find(k => loc?.toLowerCase().includes(k.toLowerCase()))
  return key ? { ...CITIES[key], name: key } : null
}
function lerp(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t } }

const statusConfig = {
  in_transit: { label: 'In Transit',    color: 'bg-blue-50 text-blue-700 border border-blue-100' },
  pending:    { label: 'Pending Match', color: 'bg-amber-50 text-amber-700 border border-amber-100' },
  delivered:  { label: 'Delivered',     color: 'bg-forest-50 text-forest-700 border border-forest-100' },
  matched:    { label: 'Matched',       color: 'bg-purple-50 text-purple-700 border border-purple-100' },
  confirmed:  { label: 'Confirmed',     color: 'bg-purple-50 text-purple-700 border border-purple-100' },
  picked_up:  { label: 'Picked Up',     color: 'bg-blue-50 text-blue-700 border border-blue-100' },
  cancelled:  { label: 'Cancelled',     color: 'bg-stone-100 text-stone-500 border border-stone-200' },
}

function StatusIcon({ status }) {
  if (['in_transit','picked_up'].includes(status)) return <Truck size={18} className="text-blue-600" />
  if (status === 'pending')   return <AlertCircle size={18} className="text-amber-600" />
  if (status === 'delivered') return <CheckCircle size={18} className="text-forest-600" />
  return <Package size={18} className="text-purple-600" />
}

export default function ShipperDashboard() {
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const mapRef      = useRef(null)
  const leafletMap  = useRef(null)
  const markersRef  = useRef([])
  const [tab,       setTab]      = useState('shipments')
  const [shipments, setShipments] = useState([])
  const [loads,     setLoads]    = useState([])
  const [notifs,    setNotifs]   = useState([])
  const [messages,  setMessages] = useState([])
  const [loading,   setLoading]  = useState(false)
  const [mapReady,  setMapReady] = useState(false)
  const [showAuth,  setShowAuth] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [unreadMsgs,   setUnreadMsgs]   = useState(0)
  const [reviewModal,  setReviewModal]  = useState(null)  // { shipmentId, carrierId, carrierName, carrierUserId }
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewHover,  setReviewHover]  = useState(0)
  const [reviewComment,setReviewComment]= useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewedIds,  setReviewedIds]  = useState(new Set())
  const [bidsModal,    setBidsModal]    = useState(null)  // { load, bids[] }
  const [loadBidCounts,setLoadBidCounts]= useState({})    // load_id -> count
  const [acceptingBid, setAcceptingBid] = useState(null)  // bid id being processed
  const [payModal,     setPayModal]     = useState(null)  // { load, bid } — confirmation step

  useEffect(() => {
    if (!user) return
    fetchData()

    // Realtime: notifications
    const channel = supabase.channel('shipper-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (p) => { setNotifs(n => [p.new, ...n]); setUnreadNotifs(c => c + 1) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => { setUnreadMsgs(c => c + 1) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments', filter: `shipper_id=eq.${user.id}` },
        fetchData)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  useEffect(() => {
    if (tab === 'map') {
      setTimeout(() => initMap(), 150)
    }
  }, [tab])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)
    const [{ data: sData }, { data: lData }, { data: nData }, { data: mData }] = await Promise.all([
      supabase.from('shipments').select('id, reference, status, price, progress_pct, shipper_id, carrier_id, created_at, loads(cargo_type, weight_kg, from_location, to_location, image_url), carriers(company_name, user_id), reviews(id, reviewer_id)')
        .eq('shipper_id', user.id).order('created_at', { ascending: false }),
      supabase.from('loads').select('*').eq('shipper_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('messages').select('*, sender:profiles!messages_sender_id_fkey(full_name)').eq('receiver_id', user.id).eq('read', false).limit(5),
    ])
    setShipments(sData || [])
    setLoads(lData || [])

    // Fetch bid counts separately (needs lData to be resolved first)
    if ((lData || []).length > 0) {
      const { data: bData } = await supabase
        .from('load_bids')
        .select('load_id')
        .eq('status', 'pending')
        .in('load_id', lData.map(l => l.id))
      const counts = {}
      ;(bData || []).forEach(b => { counts[b.load_id] = (counts[b.load_id] || 0) + 1 })
      setLoadBidCounts(counts)
    } else {
      setLoadBidCounts({})
    }
    setNotifs(nData || [])
    setMessages(mData || [])
    const reviewed = new Set((sData || []).filter(s => s.reviews?.some(r => r.reviewer_id === user.id)).map(s => s.id))
    setReviewedIds(reviewed)
    setUnreadNotifs((nData || []).filter(n => !n.read).length)
    setUnreadMsgs((mData || []).length)
    setLoading(false)
  }

  const initMap = () => {
    if (leafletMap.current) return
    if (!mapRef.current) return
    const doInit = () => {
      if (!mapRef.current) return
      const L = window.L
      const map = L.map(mapRef.current, { zoomControl: true }).setView([-23.0, 25.5], 6)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 18,
      }).addTo(map)
      Object.entries(CITIES).forEach(([name, c]) => {
        L.circleMarker([c.lat, c.lng], { radius: 5, color: '#259658', fillColor: '#fff', fillOpacity: 1, weight: 2 })
          .bindTooltip(name).addTo(map)
      })
      leafletMap.current = map
      setMapReady(true)
    }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    if (window.L) {
      doInit()
    } else {
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = doInit
      document.head.appendChild(script)
    }
  }

  useEffect(() => {
    if (!mapReady || !leafletMap.current || tab !== 'map') return
    const L = window.L
    const map = leafletMap.current
    markersRef.current.forEach(m => { try { map.removeLayer(m) } catch(e){} })
    markersRef.current = []

    // Draw pending loads
    loads.forEach((l, i) => {
      const from = getCity(l.from_location)
      const to   = getCity(l.to_location)
      if (!from || !to) return
      const line = L.polyline([[from.lat, from.lng],[to.lat, to.lng]], { color: '#f59e0b', weight: 2, dashArray: '6 4', opacity: 0.7 }).addTo(map)
      const dot  = L.circleMarker([from.lat, from.lng], { radius: 6, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 1, weight: 2 })
        .bindPopup(`<b>Pending: ${l.from_location} → ${l.to_location}</b><br>${l.cargo_type} · ${l.weight_kg}kg`).addTo(map)
      markersRef.current.push(line, dot)
    })

    // Draw active shipments with truck marker
    shipments.filter(s => ['in_transit','picked_up','confirmed'].includes(s.status)).forEach(s => {
      const from = getCity(s.loads?.from_location)
      const to   = getCity(s.loads?.to_location)
      if (!from || !to) return
      const progress = (s.progress_pct || 10) / 100
      const pos = lerp(from, to, progress)
      const line = L.polyline([[from.lat, from.lng],[to.lat, to.lng]], { color: '#259658', weight: 3, opacity: 0.6 }).addTo(map)
      const truckIcon = L.divIcon({
        html: `<div style="background:#259658;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(37,150,88,0.5);border:2px solid white;font-size:12px;">🚛</div>`,
        className: '', iconAnchor: [14,14],
      })
      const marker = L.marker([pos.lat, pos.lng], { icon: truckIcon })
        .bindPopup(`<b>${s.reference}</b><br>${s.carriers?.company_name}<br>${s.loads?.from_location} → ${s.loads?.to_location}`)
        .addTo(map)
      markersRef.current.push(line, marker)
    })
  }, [mapReady, tab, shipments, loads])

  const confirmDelivery = async (shipmentId) => {
    await supabase.from('shipments').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', shipmentId)

    // Release escrow funds to carrier
    const { data: escrow } = await supabase
      .from('escrow_transactions')
      .update({ status: 'released', released_at: new Date().toISOString() })
      .eq('shipment_id', shipmentId)
      .eq('status', 'held')
      .select()
      .maybeSingle()

    const s = shipments.find(x => x.id === shipmentId)

    if (escrow && s?.carriers?.user_id) {
      await supabase.from('notifications').insert({
        user_id: s.carriers.user_id,
        type:    'payment',
        title:   'Payment released!',
        body:    `P ${Number(escrow.amount).toLocaleString()} for ${s.reference} has been released to you.`,
        link:    '/carrier',
      })
    }

    await fetchData()
    // Prompt review after delivery
    if (s && s.carriers?.user_id) {
      setReviewRating(0); setReviewComment(''); setReviewHover(0)
      setReviewModal({ shipmentId, carrierId: s.carrier_id, carrierName: s.carriers.company_name, carrierUserId: s.carriers.user_id })
    }
  }

  const submitReview = async () => {
    if (!reviewRating || !reviewModal) return
    setSubmittingReview(true)
    const { error } = await supabase.from('reviews').insert({
      shipment_id:  reviewModal.shipmentId,
      reviewer_id:  user.id,
      reviewee_id:  reviewModal.carrierUserId,
      rating:       reviewRating,
      comment:      reviewComment.trim() || null,
    })
    if (!error) {
      setReviewedIds(prev => new Set([...prev, reviewModal.shipmentId]))
      await supabase.from('notifications').insert({
        user_id: reviewModal.carrierUserId,
        type:    'review',
        title:   'You received a new review!',
        body:    `${profile?.full_name || 'A shipper'} rated your service ${reviewRating} star${reviewRating > 1 ? 's' : ''}.`,
        link:    '/carrier',
      })
      setReviewModal(null)
    }
    setSubmittingReview(false)
  }

  const openBidsModal = async (load) => {
    const { data: bids } = await supabase
      .from('load_bids')
      .select('*, carriers(company_name, rating, verified, id), profiles:carrier_user_id(full_name)')
      .eq('load_id', load.id)
      .eq('status', 'pending')
      .order('price', { ascending: true })
    setBidsModal({ load, bids: bids || [] })
  }

  const initPayment = async (load, bid) => {
    setAcceptingBid(bid.id)

    if (TRIAL_MODE) {
      // ── Free trial: accept bid directly, no payment required ──
      try {
        const carrierId     = bid.carrier_id ?? bid.carriers?.id
        const carrierUserId = bid.carrier_user_id
        const ref           = 'CM-' + Date.now().toString(36).toUpperCase()

        // Accept this bid, reject all others for the load
        await supabase.from('load_bids').update({ status: 'accepted' }).eq('id', bid.id)
        await supabase.from('load_bids').update({ status: 'rejected' }).eq('load_id', load.id).neq('id', bid.id)

        // Mark load as matched
        await supabase.from('loads').update({ status: 'matched' }).eq('id', load.id)

        // Create shipment
        const { data: shipment, error: shipErr } = await supabase
          .from('shipments')
          .insert({
            load_id:    load.id,
            carrier_id: carrierId,
            shipper_id: user.id,
            price:      bid.price,
            status:     'confirmed',
            reference:  ref,
          })
          .select()
          .single()

        if (shipErr) throw new Error(shipErr.message)

        // Notify both parties
        await supabase.from('notifications').insert([
          {
            user_id: user.id,
            type:    'match',
            title:   'Carrier confirmed!',
            body:    `Your shipment ${ref} is confirmed. This is a free trial — no payment required.`,
            link:    `/track/${ref}`,
          },
          {
            user_id: carrierUserId,
            type:    'match',
            title:   'Bid accepted!',
            body:    `Your bid was accepted for P ${Number(bid.price).toLocaleString()}. Free trial period — no payment held.`,
            link:    '/carrier',
          },
        ])

        fetchData()
        setBidsModal(null)
        setPayModal(null)
      } catch (err) {
        alert('Something went wrong: ' + err.message)
      } finally {
        setAcceptingBid(null)
      }
      return
    }

    // ── Full DPO Pay flow (active when TRIAL_MODE = false) ────
    const appUrl = window.location.origin
    const ref    = `BID-${bid.id.slice(0,8).toUpperCase()}`

    const { data, error } = await supabase.functions.invoke('dpo-create-token', {
      body: {
        amount:      bid.price,
        currency:    'BWP',
        reference:   ref,
        redirectUrl: `${appUrl}/payment/return`,
        backUrl:     `${appUrl}/shipper`,
        description: `CargoMatch: ${load.from_location} → ${load.to_location}`,
      },
    })

    if (error || !data?.payUrl) {
      alert(data?.error ?? 'Could not initiate payment. Please try again.')
      setAcceptingBid(null)
      return
    }

    localStorage.setItem('pendingPayment', JSON.stringify({
      bidId:         bid.id,
      loadId:        load.id,
      carrierId:     bid.carrier_id ?? bid.carriers?.id,
      carrierUserId: bid.carrier_user_id,
      shipperId:     user.id,
      amount:        bid.price,
    }))

    window.location.href = data.payUrl
  }

  const markNotifRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x))
    setUnreadNotifs(c => Math.max(0, c - 1))
  }

  const cancelLoad = async (loadId) => {
    if (!confirm('Delete this pending load? Any bids will also be removed.')) return
    await supabase.from('load_bids').delete().eq('load_id', loadId)
    await supabase.from('loads').delete().eq('id', loadId)
    setLoads(ls => ls.filter(l => l.id !== loadId))
  }

  const cancelShipment = async (shipment) => {
    if (!confirm('Cancel this shipment? The carrier will be notified.')) return
    await supabase.from('shipments').update({ status: 'cancelled' }).eq('id', shipment.shipment_id)
    if (shipment.carrier_user_id) {
      await supabase.from('notifications').insert({
        user_id: shipment.carrier_user_id,
        type:    'alert',
        title:   'Shipment cancelled',
        body:    `Shipment ${shipment.reference} has been cancelled by the shipper.`,
        link:    '/carrier',
      })
    }
    fetchData()
  }

  const allRows = [
    ...loads.map(l => ({ _type: 'load', id: l.id, reference: l.id.slice(0,8).toUpperCase(), from_location: l.from_location, to_location: l.to_location, status: 'pending', price: l.price_estimate || 0, progress_pct: 0, cargo: `${l.cargo_type} (${l.weight_kg}kg)`, carrier: null, eta: '—', image_url: l.image_url })),
    ...shipments.map(s => ({ _type: 'shipment', id: s.id, reference: s.reference || s.id.slice(0,8).toUpperCase(), from_location: s.loads?.from_location || '—', to_location: s.loads?.to_location || '—', status: s.status, price: s.price || 0, progress_pct: s.progress_pct || 0, cargo: s.loads ? `${s.loads.cargo_type} (${s.loads.weight_kg}kg)` : '—', carrier: s.carriers?.company_name, carrier_user_id: s.carriers?.user_id, eta: s.eta ? new Date(s.eta).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '—', image_url: s.loads?.image_url, shipment_id: s.id, carrier_id: s.carrier_id, has_review: reviewedIds.has(s.id) })),
  ]

  const active    = allRows.filter(r => ['in_transit','picked_up','confirmed','matched'].includes(r.status)).length
  const delivered = allRows.filter(r => r.status === 'delivered').length
  const totalSpent = shipments.reduce((s, x) => s + (x.price || 0), 0)

  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-cream font-body">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">
          <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mx-auto mb-6"><Truck size={28} className="text-forest-500" /></div>
          <h1 className="font-display text-3xl font-800 text-stone-900 mb-3">Shipper Dashboard</h1>
          <p className="text-stone-400 mb-8">Sign in to view and manage your shipments.</p>
          <button onClick={() => setShowAuth(true)} className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-display font-700 px-8 py-3 rounded-xl transition-all">
            <LogIn size={18} /> Sign In
          </button>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  return (
    <>
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 pt-28 pb-16">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-sm text-stone-400 mb-1">Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</p>
            <h1 className="font-display text-3xl font-800 text-stone-900">Shipper Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {unreadNotifs > 0 && (
              <button onClick={() => setTab('notifications')} className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium px-3 py-1.5 rounded-full">
                <Bell size={13} /> {unreadNotifs} new notification{unreadNotifs > 1 ? 's' : ''}
              </button>
            )}
            {unreadMsgs > 0 && (
              <Link to="/messages" className="flex items-center gap-2 bg-forest-50 border border-forest-200 text-forest-700 text-sm font-medium px-3 py-1.5 rounded-full">
                <MessageSquare size={13} /> {unreadMsgs} new message{unreadMsgs > 1 ? 's' : ''}
              </Link>
            )}
            <Link to="/post-load" className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm px-4 py-2 rounded-xl transition-all">
              <Plus size={16} /> Post New Load
            </Link>
            <button onClick={fetchData} className="p-2 text-stone-400 hover:text-stone-600 border border-stone-200 rounded-xl"><RefreshCw size={16} /></button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active',       num: active,      icon: Truck,        color: 'text-blue-600 bg-blue-50',     prefix: '',  suffix: '' },
            { label: 'Delivered',    num: delivered,   icon: CheckCircle,  color: 'text-forest-600 bg-forest-50', prefix: '',  suffix: '' },
            { label: 'Total Spent',  num: totalSpent,  icon: Package,      color: 'text-purple-600 bg-purple-50', prefix: 'P ', suffix: '' },
            { label: 'Avg. Savings', num: 38,          icon: TrendingDown, color: 'text-rose-600 bg-rose-50',     prefix: '',  suffix: '%' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-stone-100 p-5 animate-slideUp"
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${s.color}`}><s.icon size={18} /></div>
              <p className="font-display text-2xl font-800 text-stone-900">
                <CountUp to={s.num} prefix={s.prefix} suffix={s.suffix} duration={1100 + i * 100} />
              </p>
              <p className="text-xs text-stone-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-stone-100 p-1 rounded-xl w-fit flex-wrap">
          {[
            { id: 'shipments',     label: '📦 Shipments',     badge: allRows.length },
            { id: 'map',           label: '🗺️ Map' },
            { id: 'notifications', label: '🔔 Alerts',        badge: unreadNotifs },
            { id: 'messages',      label: '💬 Messages',      badge: unreadMsgs },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}>
              {t.label}
              {t.badge > 0 && <span className="w-5 h-5 bg-rose-500 text-white text-xs rounded-full flex items-center justify-center">{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Shipments Tab */}
        {tab === 'shipments' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">My Loads & Shipments</h2>
              <span className="text-xs text-stone-400">{allRows.length} total</span>
            </div>
            {loading ? (
              <div className="divide-y divide-stone-50">
                {[1,2,3].map(i => (
                  <div key={i} className="p-5 flex items-start gap-4 animate-pulse">
                    <div className="w-14 h-14 bg-stone-100 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2"><div className="h-4 w-24 bg-stone-100 rounded-full" /><div className="h-4 w-16 bg-stone-100 rounded-full" /></div>
                      <div className="h-3 w-48 bg-stone-100 rounded-full" />
                      <div className="h-3 w-32 bg-stone-100 rounded-full" />
                    </div>
                    <div className="space-y-2 flex-shrink-0"><div className="h-5 w-20 bg-stone-100 rounded-full" /><div className="h-7 w-16 bg-stone-100 rounded-lg" /></div>
                  </div>
                ))}
              </div>
            ) : allRows.length === 0 ? (
              <div className="p-12 text-center">
                <Package size={32} className="text-stone-300 mx-auto mb-3" />
                <p className="text-stone-500 font-medium mb-1">No shipments yet</p>
                <p className="text-stone-400 text-sm mb-4">Post your first load to get matched with a carrier.</p>
                <Link to="/post-load" className="inline-flex items-center gap-2 bg-forest-500 text-white text-sm font-medium px-4 py-2 rounded-xl"><Plus size={14} /> Post a Load</Link>
              </div>
            ) : (
              <div className="divide-y divide-stone-50 animate-fadeIn">
                {allRows.map((s, idx) => {
                  const cfg = statusConfig[s.status] || statusConfig['pending']
                  return (
                    <div key={s.id} className="p-5 hover:bg-stone-50 transition-all group animate-slideUp"
                      style={{ animationDelay: `${idx * 45}ms` }}>
                      <div className="flex items-start gap-4">
                        {/* Cargo image */}
                        {s.image_url ? (
                          <img src={s.image_url} alt="cargo" className="w-14 h-14 object-cover rounded-xl border border-stone-200 flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-1">
                            <StatusIcon status={s.status} />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-display font-700 text-stone-900 text-sm">{s.reference}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                            {s._type === 'load' && loadBidCounts[s.id] > 0 && (
                              <button onClick={() => openBidsModal(loads.find(l => l.id === s.id))}
                                className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium hover:bg-amber-100 transition-colors">
                                <Gavel size={9} /> {loadBidCounts[s.id]} bid{loadBidCounts[s.id] !== 1 ? 's' : ''}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-stone-600">
                            <MapPin size={11} className="text-forest-500" />
                            <span className="font-medium">{s.from_location}</span>
                            <ArrowRight size={10} className="text-stone-300" />
                            <span className="font-medium">{s.to_location}</span>
                          </div>
                          <p className="text-xs text-stone-400 mt-0.5">{s.cargo} · {s.carrier || 'Awaiting match'}</p>
                        </div>
                        <div className="text-right flex-shrink-0 space-y-1">
                          <p className="font-display font-700 text-stone-900">{s.price ? `P ${s.price.toLocaleString()}` : 'TBD'}</p>
                          {s._type === 'shipment' && ['in_transit','picked_up'].includes(s.status) && (
                            <Link to={`/track/${s.reference}`} className="block text-xs text-forest-600 hover:underline">Track →</Link>
                          )}
                          {s._type === 'shipment' && s.status === 'in_transit' && (
                            <button onClick={() => confirmDelivery(s.shipment_id)}
                              className="block w-full text-xs bg-forest-500 text-white px-2 py-1 rounded-lg hover:bg-forest-600 transition-colors">
                              Confirm Delivery
                            </button>
                          )}
                          {s._type === 'shipment' && s.status === 'delivered' && !s.has_review && s.carrier_user_id && (
                            <button onClick={() => { setReviewRating(0); setReviewComment(''); setReviewHover(0); setReviewModal({ shipmentId: s.shipment_id, carrierId: s.carrier_id, carrierName: s.carrier, carrierUserId: s.carrier_user_id }) }}
                              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium mt-1">
                              <Star size={11} className="fill-amber-400 text-amber-400" /> Leave Review
                            </button>
                          )}
                          {s._type === 'shipment' && s.status === 'delivered' && s.has_review && (
                            <span className="flex items-center gap-1 text-xs text-stone-400 mt-1">
                              <CheckCircle size={11} /> Reviewed
                            </span>
                          )}
                          {s._type === 'shipment' && s.status === 'delivered' && (
                            <Link to={`/invoice/${s.shipment_id}`} className="block text-xs text-stone-400 hover:text-forest-600 transition-colors mt-1">
                              🧾 Invoice
                            </Link>
                          )}
                          {s._type === 'shipment' && s.carrier_id && (
                            <Link to={`/carrier/${s.carrier_id}`} className="block text-xs text-forest-600 hover:underline">
                              View Profile →
                            </Link>
                          )}
                          <Link to="/messages" className="block text-xs text-stone-400 hover:text-forest-600 transition-colors">
                            <MessageSquare size={12} className="inline mr-0.5" /> Message
                          </Link>
                          {s._type === 'load' && (
                            <button onClick={() => cancelLoad(s.id)}
                              className="block text-xs text-rose-400 hover:text-rose-600 transition-colors mt-1">
                              <X size={10} className="inline mr-0.5" /> Delete
                            </button>
                          )}
                          {s._type === 'shipment' && ['matched','confirmed','in_transit'].includes(s.status) && (
                            <button onClick={() => cancelShipment(s)}
                              className="block text-xs text-rose-400 hover:text-rose-600 transition-colors mt-1">
                              <X size={10} className="inline mr-0.5" /> Cancel
                            </button>
                          )}
                        </div>
                      </div>
                      {['in_transit','picked_up'].includes(s.status) && (
                        <div className="mt-3 ml-14">
                          <div className="flex justify-between text-xs text-stone-400 mb-1">
                            <span>{s.from_location}</span><span>{Math.round(s.progress_pct)}%</span><span>{s.to_location}</span>
                          </div>
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div className="relative h-full bg-forest-500 rounded-full overflow-hidden"
                              style={{ width: `${s.progress_pct}%`, transition: 'width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                              <span className="animate-shimmer" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Map Tab */}
        {tab === 'map' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-display font-700 text-stone-900 text-sm flex items-center gap-2">
                <Navigation size={14} className="text-forest-500" /> My Shipments Map
              </h2>
              <div className="flex items-center gap-4 text-xs text-stone-400">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-forest-500 inline-block rounded" /> Active shipments</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded" style={{backgroundImage:'repeating-linear-gradient(to right,#f59e0b 0,#f59e0b 4px,transparent 4px,transparent 8px)'}} /> Pending loads</span>
              </div>
            </div>
            <div ref={mapRef} style={{ height: '480px', width: '100%' }} />
          </div>
        )}

        {/* Notifications Tab */}
        {tab === 'notifications' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">Notifications</h2>
              {unreadNotifs > 0 && (
                <button onClick={async () => {
                  await supabase.from('notifications').update({ read: true }).eq('user_id', user.id)
                  setNotifs(n => n.map(x => ({ ...x, read: true }))); setUnreadNotifs(0)
                }} className="text-xs text-forest-600 font-medium hover:text-forest-700">Mark all read</button>
              )}
            </div>
            {notifs.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm"><Bell size={32} className="mx-auto mb-3 text-stone-300" /> No notifications yet</div>
            ) : (
              <div className="divide-y divide-stone-50">
                {notifs.map(n => (
                  <div key={n.id} onClick={() => markNotifRead(n.id)}
                    className={`p-4 cursor-pointer hover:bg-stone-50 transition-colors ${!n.read ? 'bg-forest-50/30' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.read ? 'bg-forest-500' : 'bg-stone-200'}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-stone-900">{n.title}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{n.body}</p>
                        <p className="text-xs text-stone-300 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                      {n.link && <Link to={n.link} onClick={e => e.stopPropagation()} className="text-xs text-forest-600 hover:underline flex-shrink-0">View →</Link>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-6 py-3 border-t border-stone-100">
              <Link to="/notifications" className="text-xs text-forest-600 font-medium hover:text-forest-700">View all notifications →</Link>
            </div>
          </div>
        )}

        {/* Messages Tab */}
        {tab === 'messages' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">Recent Messages</h2>
              <Link to="/messages" className="text-xs text-forest-600 font-medium hover:text-forest-700">Open inbox →</Link>
            </div>
            {messages.length === 0 ? (
              <div className="p-12 text-center">
                <MessageSquare size={32} className="text-stone-300 mx-auto mb-3" />
                <p className="text-stone-400 text-sm mb-3">No unread messages</p>
                <Link to="/messages" className="text-sm text-forest-600 font-medium hover:text-forest-700">Open messages →</Link>
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {messages.map(m => (
                  <Link key={m.id} to="/messages" className="flex items-start gap-3 px-5 py-4 hover:bg-stone-50 transition-colors">
                    <div className="w-9 h-9 bg-forest-100 rounded-full flex items-center justify-center font-display font-700 text-sm text-forest-700 flex-shrink-0">
                      {m.sender?.full_name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900">{m.sender?.full_name}</p>
                      <p className="text-xs text-stone-500 truncate">{m.body}</p>
                      <p className="text-xs text-stone-300">{new Date(m.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</p>
                    </div>
                    <span className="w-2 h-2 bg-forest-500 rounded-full flex-shrink-0 mt-2" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Review Modal */}
    {reviewModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setReviewModal(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-700 text-stone-900">Rate Your Experience</h3>
            <button onClick={() => setReviewModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><X size={16} /></button>
          </div>
          <p className="text-xs text-stone-400 mb-6">How was your delivery with <span className="font-medium text-stone-600">{reviewModal.carrierName}</span>?</p>

          {/* Star Rating */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3, 4, 5].map(star => (
              <button key={star}
                onMouseEnter={() => setReviewHover(star)}
                onMouseLeave={() => setReviewHover(0)}
                onClick={() => setReviewRating(star)}
                className="transition-transform hover:scale-110 active:scale-95">
                <Star size={36}
                  className={`transition-colors ${star <= (reviewHover || reviewRating) ? 'fill-amber-400 text-amber-400' : 'text-stone-200'}`} />
              </button>
            ))}
          </div>
          {reviewRating > 0 && (
            <p className="text-center text-sm font-medium text-stone-600 -mt-3 mb-5">
              {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent!'][reviewRating]}
            </p>
          )}

          {/* Comment */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Comment (optional)</label>
            <textarea rows={3} placeholder="Tell others about your experience..."
              value={reviewComment} onChange={e => setReviewComment(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 resize-none" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setReviewModal(null)} className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50">Skip</button>
            <button onClick={submitReview} disabled={!reviewRating || submittingReview}
              className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2">
              {submittingReview ? 'Submitting...' : <><Send size={14} /> Submit Review</>}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Bids Modal */}
    {bidsModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setBidsModal(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-700 text-stone-900">Bids Received</h3>
            <button onClick={() => setBidsModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><X size={16} /></button>
          </div>
          <p className="text-xs text-stone-400 mb-5">
            {bidsModal.load.from_location} → {bidsModal.load.to_location} · {bidsModal.load.cargo_type} · {bidsModal.load.weight_kg}kg
          </p>

          {bidsModal.bids.length === 0 ? (
            <div className="py-12 text-center">
              <Gavel size={28} className="text-stone-300 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">No bids yet. Carriers will be notified.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bidsModal.bids.map((bid, i) => (
                <div key={bid.id} className={`border rounded-xl p-4 ${i === 0 ? 'border-forest-300 bg-forest-50/30' : 'border-stone-100'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-display font-700 text-stone-900 text-sm">
                          {bid.carriers?.company_name || bid.profiles?.full_name || 'Carrier'}
                        </span>
                        {bid.carriers?.verified && (
                          <span className="text-xs bg-forest-50 text-forest-700 border border-forest-200 px-1.5 py-0.5 rounded-full font-medium">✓ Verified</span>
                        )}
                        {i === 0 && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">Lowest</span>}
                      </div>
                      {bid.carriers?.rating > 0 && (
                        <div className="flex items-center gap-1 mb-1">
                          {[1,2,3,4,5].map(s => <Star key={s} size={10} className={s <= Math.round(bid.carriers.rating) ? 'fill-amber-400 text-amber-400' : 'text-stone-200'} />)}
                          <span className="text-xs text-stone-400 ml-0.5">{Number(bid.carriers.rating).toFixed(1)}</span>
                        </div>
                      )}
                      {bid.note && <p className="text-xs text-stone-500 mt-1 italic">"{bid.note}"</p>}
                      <p className="text-xs text-stone-300 mt-1">{new Date(bid.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-display font-800 text-forest-600 text-lg">{fmtBWP(bid.price)}</p>
                      <button
                        onClick={() => setPayModal({ load: bidsModal.load, bid })}
                        disabled={acceptingBid === bid.id}
                        className="mt-2 flex items-center gap-1.5 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
                        <CreditCard size={11} /> {acceptingBid === bid.id ? 'Processing...' : 'Accept & Pay'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}
    {/* Payment Confirmation Modal */}
    {payModal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={() => setPayModal(null)}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-800 text-stone-900">{TRIAL_MODE ? 'Confirm Carrier' : 'Confirm Payment'}</h3>
              <p className="text-xs text-stone-400 mt-0.5">{TRIAL_MODE ? 'Free trial — no payment required' : 'Funds held in escrow until delivery'}</p>
            </div>
            <button onClick={() => setPayModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><X size={16} /></button>
          </div>

          {/* Carrier */}
          <div className="bg-stone-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-stone-400 mb-0.5">Carrier</p>
              <p className="font-display font-700 text-stone-900 text-sm">{payModal.bid.carriers?.company_name || 'Carrier'}</p>
              {payModal.bid.carriers?.rating > 0 && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  {[1,2,3,4,5].map(s => <Star key={s} size={9} className={s <= Math.round(payModal.bid.carriers.rating) ? 'fill-amber-400 text-amber-400' : 'text-stone-200'} />)}
                  <span className="text-xs text-stone-400 ml-0.5">{Number(payModal.bid.carriers.rating).toFixed(1)}</span>
                </div>
              )}
            </div>
            {payModal.bid.carriers?.verified && (
              <span className="text-xs bg-forest-50 text-forest-700 border border-forest-200 px-2 py-1 rounded-full font-medium">✓ Verified</span>
            )}
          </div>

          {/* Route */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 bg-stone-50 rounded-xl px-3 py-2.5">
              <p className="text-xs text-stone-400">From</p>
              <p className="text-sm font-medium text-stone-900">{payModal.load.from_location}</p>
            </div>
            <ArrowRight size={14} className="text-stone-300 flex-shrink-0" />
            <div className="flex-1 bg-stone-50 rounded-xl px-3 py-2.5">
              <p className="text-xs text-stone-400">To</p>
              <p className="text-sm font-medium text-stone-900">{payModal.load.to_location}</p>
            </div>
          </div>

          {/* Amount breakdown */}
          <div className="border border-stone-100 rounded-xl overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-50">
              <span className="text-sm text-stone-600">Freight service</span>
              <span className="text-sm font-medium text-stone-900">{fmtBWP(payModal.bid.price)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-50 bg-stone-50/50">
              <span className="text-xs text-stone-400">Platform fee (5%)</span>
              <span className="text-xs text-stone-400">deducted from carrier payout</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-forest-50/40">
              <span className="font-display font-700 text-stone-900">Total charged</span>
              <span className="font-display font-800 text-forest-600 text-xl">{fmtBWP(payModal.bid.price)}</span>
            </div>
          </div>

          {/* Escrow / trial note */}
          {TRIAL_MODE ? (
            <div className="flex items-start gap-2.5 bg-forest-50 border border-forest-200 rounded-xl px-3.5 py-3 mb-5 text-xs text-forest-800">
              <CheckCircle size={14} className="flex-shrink-0 mt-0.5 text-forest-500" />
              <p><span className="font-semibold">Free launch period</span> — no payment is charged today. The carrier will be confirmed and you can track your shipment instantly.</p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3 mb-5 text-xs text-amber-800">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
              <p>Payment is held securely in escrow and only released to the carrier after you confirm delivery.</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setPayModal(null)}
              className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => { const { load, bid } = payModal; setPayModal(null); setBidsModal(null); initPayment(load, bid) }}
              disabled={acceptingBid === payModal.bid.id}
              className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2">
              <CreditCard size={14} /> {acceptingBid === payModal.bid.id ? 'Processing...' : TRIAL_MODE ? 'Confirm Carrier' : 'Confirm & Pay'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
