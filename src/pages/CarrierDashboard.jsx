import { useEffect, useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { calcMinRate, fmtBWP } from '../lib/rates'
import CountUp from '../components/CountUp'
import { useSubscription } from '../hooks/useSubscription'
import TrialBanner from '../components/TrialBanner'
import UpgradeModal from '../components/UpgradeModal'
import LocationInput from '../components/LocationInput'
import { useUserLocation } from '../hooks/useUserLocation'
import {
  Truck, MapPin, DollarSign, Star, CheckCircle, Clock,
  TrendingUp, ArrowRight, Shield, Plus, Bell,
  Navigation, X, Play, RefreshCw, Search, Send,
  Gavel, Info, CreditCard, Lock, Globe
} from 'lucide-react'

// ── Adjacent cities map (within ~50km) ──────────────────────
const ADJACENT_CITIES = {
  'gaborone':    ['tlokweng', 'mogoditshane', 'phakalane', 'ramotswa', 'mochudi', 'lobatse'],
  'francistown': ['mahalapye', 'palapye', 'selibe-phikwe'],
  'maun':        ['sehithwa', 'toteng', 'gumare', 'nokaneng'],
  'serowe':      ['palapye', 'mahalapye'],
  'palapye':     ['serowe', 'mahalapye', 'francistown'],
  'lobatse':     ['gaborone', 'ramotswa', 'goodhope'],
  'molepolole':  ['gaborone', 'mogoditshane', 'thamaga', 'moshupa'],
}

// ── Smart Matching Engine ────────────────────────────────────
function scoreLoad(load, carrierInfo, carrierRoutes, trucks) {
  let score = 0
  const tags = []

  // Route overlap: carrier has a route that overlaps with this load
  const lFrom = load.from_location?.toLowerCase() || ''
  const lTo   = load.to_location?.toLowerCase()   || ''
  const routeMatch = carrierRoutes.some(r => {
    const rFrom = r.from_city?.toLowerCase() || ''
    const rTo   = r.to_city?.toLowerCase()   || ''
    return lFrom.includes(rFrom) || lTo.includes(rTo) ||
           lFrom.includes(rTo)   || lTo.includes(rFrom)
  })
  if (routeMatch) {
    score += 40
    tags.push({ label: 'Route Match', style: 'bg-forest-50 text-forest-700 border-forest-200' })
  }

  // Near Pickup: use GPS-detected current_location first, fall back to profile location
  const rawCity = (carrierInfo?.current_location || carrierInfo?.profiles?.location || '').toLowerCase()
  const carrierCity = rawCity.split(',')[0].trim()
  if (carrierCity) {
    const pickupCity = lFrom.split(',')[0].trim()
    const isNear = pickupCity.includes(carrierCity) || carrierCity.includes(pickupCity) ||
      (ADJACENT_CITIES[carrierCity] || []).some(adj => pickupCity.includes(adj) || adj.includes(pickupCity))
    if (isNear) {
      score += 20
      tags.push({ label: 'Near Pickup', style: 'bg-blue-50 text-blue-700 border-blue-200' })
    }
  }

  // Verification bonus
  if (carrierInfo?.verified) score += 15

  // Rating bonus (up to 25pts for 5★)
  if (carrierInfo?.rating > 0) score += Math.round(carrierInfo.rating * 5)

  // Fleet capacity check
  const activeTrucks  = trucks.filter(t => t.status === 'active')
  const capableTrucks = activeTrucks.filter(t => t.capacity_kg >= (load.weight_kg || 0))

  if (capableTrucks.length > 0) {
    score += 20
    tags.push({ label: 'Fits Your Fleet', style: 'bg-purple-50 text-purple-700 border-purple-200' })
  } else if (activeTrucks.length === 0 && trucks.length > 0) {
    score -= 20
    tags.push({ label: 'Fleet Busy', style: 'bg-amber-50 text-amber-700 border-amber-200' })
  } else if (activeTrucks.length > 0 && capableTrucks.length === 0 && load.weight_kg > 0) {
    tags.push({ label: 'Overweight', style: 'bg-rose-50 text-rose-700 border-rose-200' })
  }

  // Urgent flag (informational)
  if (load.urgent) {
    tags.push({ label: 'Urgent', style: 'bg-rose-50 text-rose-700 border-rose-200' })
  }

  return { score, tags }
}
// ────────────────────────────────────────────────────────────

function LoadCard({ l, openBidModal, myBidIds, recommended, index = 0 }) {
  const minRate = calcMinRate(l.from_location, l.to_location, l.weight_kg)
  const alreadyBid = myBidIds?.has(l.id)
  return (
    <div className={`p-5 hover:bg-stone-50 transition-all animate-slideUp ${recommended ? 'bg-forest-50/20' : ''}`}
      style={{ animationDelay: `${index * 50}ms` }}>
      <div className="flex items-start gap-4">
        {l.image_url && (
          <img src={l.image_url} alt="cargo" className="w-14 h-14 object-cover rounded-xl border border-stone-200 flex-shrink-0" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-display font-700 text-stone-900 text-sm">{l.id.slice(0,8).toUpperCase()}</span>
            {l.pooling && <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium">Pooled</span>}
            {l._bidCount > 0 && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
                {l._bidCount} bid{l._bidCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-stone-700 mb-1 min-w-0">
            <MapPin size={12} className="text-forest-500 flex-shrink-0" />
            <span className="font-medium truncate max-w-[90px]">{l.from_location}</span>
            <ArrowRight size={11} className="text-stone-300 flex-shrink-0" />
            <span className="font-medium truncate max-w-[90px]">{l.to_location}</span>
          </div>
          <p className="text-xs text-stone-400">{l.cargo_type} · {l.weight_kg}kg</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-stone-400">
            <span className="flex items-center gap-1"><Clock size={10} /> {l.pickup_date}</span>
            {l.profiles?.full_name && <span>By: {l.profiles.full_name}</span>}
          </div>
          <p className="text-xs text-stone-300 mt-1 flex items-center gap-1">
            <Info size={10} /> Min rate: {fmtBWP(minRate)}
          </p>
          {/* Match tags */}
          {l.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {l.tags.map((t, i) => (
                <span key={i} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${t.style}`}>{t.label}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-stone-400 mb-0.5">Estimate</p>
          <p className="font-display font-800 text-forest-600 text-xl">{fmtBWP(l.price_estimate || minRate)}</p>
          {alreadyBid ? (
            <span className="mt-2 inline-flex items-center gap-1 text-xs text-forest-600 font-medium bg-forest-50 border border-forest-200 px-3 py-1.5 rounded-lg">
              <CheckCircle size={11} /> Bid Placed
            </span>
          ) : (
            <button onClick={() => openBidModal(l)}
              className="mt-2 flex items-center gap-1.5 bg-forest-500 hover:bg-forest-600 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
              <Gavel size={11} /> Place Bid
            </button>
          )}
          <Link to="/messages" className="block mt-1 text-xs text-forest-600 hover:underline">Message Shipper</Link>
        </div>
      </div>
    </div>
  )
}

const CITIES = {
  'Gaborone':        { lat: -24.6282, lng: 25.9231 },
  'Francistown':     { lat: -21.1667, lng: 27.5167 },
  'Maun':            { lat: -19.9833, lng: 23.4167 },
  'Kasane':          { lat: -17.8000, lng: 25.1500 },
  'Lobatse':         { lat: -25.2167, lng: 25.6833 },
  'Palapye':         { lat: -22.5500, lng: 27.1333 },
  'Serowe':          { lat: -22.3833, lng: 26.7167 },
  'Jwaneng':         { lat: -24.6025, lng: 24.7283 },
  'Molepolole':      { lat: -24.4069, lng: 25.4950 },
  'Kanye':           { lat: -24.9833, lng: 25.3500 },
  'Mochudi':         { lat: -24.4000, lng: 26.1500 },
  'Mahalapye':       { lat: -23.1000, lng: 26.8167 },
  'Ramotswa':        { lat: -24.8700, lng: 25.8800 },
  'Tlokweng':        { lat: -24.6000, lng: 26.0500 },
  'Mogoditshane':    { lat: -24.5500, lng: 25.8400 },
  'Tonota':          { lat: -21.4333, lng: 27.4667 },
  'Selebi-Phikwe':   { lat: -22.0000, lng: 27.8167 },
  'Phikwe':          { lat: -22.0000, lng: 27.8167 },
  'Orapa':           { lat: -21.3000, lng: 25.3667 },
  'Letlhakane':      { lat: -21.4167, lng: 25.5833 },
  'Bobonong':        { lat: -21.9667, lng: 28.4167 },
  'Tutume':          { lat: -20.4000, lng: 27.1333 },
  'Nata':            { lat: -20.2167, lng: 26.1833 },
  'Shakawe':         { lat: -18.3667, lng: 21.8500 },
  'Ghanzi':          { lat: -21.6942, lng: 21.6422 },
  'Tsabong':         { lat: -26.0333, lng: 22.4667 },
  'Werda':           { lat: -25.6833, lng: 23.2667 },
  'Kang':            { lat: -23.6833, lng: 22.8333 },
  'Hukuntsi':        { lat: -23.9833, lng: 21.7500 },
  'Good Hope':       { lat: -25.9500, lng: 25.9833 },
  'Gabane':          { lat: -24.6000, lng: 25.7500 },
  'Pilane':          { lat: -24.3300, lng: 25.9000 },
}

// Aliases to catch common variant spellings
const ALIASES = {
  'selebi phikwe': 'Selebi-Phikwe',
  'selibe phikwe': 'Selebi-Phikwe',
  'selibe-phikwe': 'Selebi-Phikwe',
  'gcbd':          'Gaborone',
  'gabs':          'Gaborone',
}

function getCity(loc) {
  if (!loc) return null
  const lower = loc.toLowerCase().trim()
  // Check aliases first
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias)) {
      const c = CITIES[canonical]
      return c ? { ...c, name: canonical } : null
    }
  }
  // Match any known city name as a substring (case-insensitive)
  const key = Object.keys(CITIES).find(k => lower.includes(k.toLowerCase()))
  return key ? { ...CITIES[key], name: key } : null
}


export default function CarrierDashboard() {
  const { user, profile } = useAuth()
  const navigate    = useNavigate()
  const mapRef      = useRef(null)
  const leafletMap  = useRef(null)
  const markersRef  = useRef([])
  const [tab,            setTab]           = useState('loads')
  const [availableLoads, setAvailableLoads] = useState([])
  const [myTrips,        setMyTrips]        = useState([])
  const [carrierInfo,    setCarrierInfo]    = useState(null)
  const [trucks,         setTrucks]         = useState([])
  const [loading,        setLoading]        = useState(true)
  const [mapReady,       setMapReady]       = useState(false)
  const [newLoadCount,   setNewLoadCount]   = useState(0)
  const [addingTruck,    setAddingTruck]    = useState(false)
  const [newTruck,       setNewTruck]       = useState({ type: '', plate: '', capacity_kg: 3000 })
  const [carrierRoutes,      setCarrierRoutes]      = useState([])
  const [shipperReviewModal, setShipperReviewModal] = useState(null) // { shipmentId, shipperId, shipperName }
  const [shipperRating,      setShipperRating]      = useState(0)
  const [shipperRatingHover, setShipperRatingHover] = useState(0)
  const [shipperComment,     setShipperComment]     = useState('')
  const [submittingReview,   setSubmittingReview]   = useState(false)
  const [reviewedTripIds,    setReviewedTripIds]    = useState(new Set())
  const [showPostTrip,  setShowPostTrip]   = useState(false)
  const [tripForm,       setTripForm]       = useState({ from: '', to: '', date: '', price: '', notes: '' })
  const [savingTrip,     setSavingTrip]     = useState(false)
  // GPS location sharing
  const locationWatcher = useRef(null)
  const [sharingLocation, setSharingLocation] = useState(null) // shipment_id
  // Onboarding wizard
  const [showWizard,   setShowWizard]   = useState(false)
  const [wizardStep,   setWizardStep]   = useState(1)
  const [wizardData,   setWizardData]   = useState({ company_name: '', reg_number: '', truckType: '', plate: '', capacity: 3000, fromCity: '', toCity: '' })
  const [savingWizard, setSavingWizard] = useState(false)
  const [loadsSearch,    setLoadsSearch]    = useState('')
  const [loadsCargoType, setLoadsCargoType] = useState('all')
  const [loadsUrgent,    setLoadsUrgent]    = useState(false)
  const [loadsPooled,    setLoadsPooled]    = useState(false)
  const [loadsSort,      setLoadsSort]      = useState('newest')
  // Bidding
  const [bidModal,       setBidModal]       = useState(null)  // load object
  const [bidPrice,       setBidPrice]       = useState('')
  const [bidNote,        setBidNote]        = useState('')
  const [submittingBid,  setSubmittingBid]  = useState(false)
  const [myBidIds,       setMyBidIds]       = useState(new Set()) // load_ids I've bid on
  // Upgrade modal
  const [upgradeModal,   setUpgradeModal]   = useState({ isOpen: false, reason: '', blockedAction: null })
  // Earnings
  const [earnings,       setEarnings]       = useState([])
  // Location banner
  const [locationBannerDismissed, setLocationBannerDismissed] = useState(
    () => sessionStorage.getItem('cm_loc_banner_dismissed') === '1'
  )
  const [savingLocation,   setSavingLocation]   = useState(false)
  const [tripFromDetected, setTripFromDetected] = useState(false)

  // GPS hook (for location banner + Post Trip pre-fill)
  const {
    city: detectedCity,
    loading: gpsLoading,
    requestLocation: requestGpsLocation,
    requestLocationSilently,
  } = useUserLocation()

  // Subscription
  const {
    currentTier, daysRemaining, truckLimit,
    canBid, canAddTruck, canPostTrip, canAccessAnalytics, canAccessSADC,
    bidsUsedThisMonth, bidsRemainingThisMonth,
    createTrialSubscription, incrementBidCount,
  } = useSubscription(carrierInfo?.id)

  useEffect(() => {
    if (!user) return
    fetchData()

    // Realtime: notify carrier of new loads + pickup location updates from shipper
    const channel = supabase.channel('carrier-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loads' }, (payload) => {
        setNewLoadCount(n => n + 1)
        setAvailableLoads(prev => [payload.new, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shipments' }, (payload) => {
        const p = payload.new
        if (p.pickup_lat) {
          setMyTrips(prev => prev.map(t => t.id === p.id
            ? { ...t, pickup_lat: p.pickup_lat, pickup_lng: p.pickup_lng, pickup_shared_at: p.pickup_shared_at }
            : t
          ))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  useEffect(() => {
    if (tab === 'map') {
      setTimeout(() => initMap(), 100)
    }
  }, [tab])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: carrier } = await supabase
        .from('carriers')
        .select('*, profiles(full_name, location)')
        .eq('user_id', user.id)
        .maybeSingle()
      setCarrierInfo(carrier || null)

      if (carrier?.id) {
        const [{ data: t }, { data: trips, error: tripError }, { data: routes }] = await Promise.all([
          supabase.from('trucks').select('*').eq('carrier_id', carrier.id),
          supabase.from('shipments').select(`
            id, reference, status, price, progress_pct, shipper_id, carrier_id,
            pickup_lat, pickup_lng, pickup_shared_at,
            created_at, delivered_at,
            loads(from_location, to_location, cargo_type, weight_kg),
            reviews(id, reviewer_id),
            profiles!shipments_shipper_id_fkey(full_name)
          `).eq('carrier_id', carrier.id).order('created_at', { ascending: false }),
          supabase.from('carrier_routes').select('*').eq('carrier_id', carrier.id),
        ])
        setTrucks(t || [])
        setMyTrips(trips || [])
        const reviewed = new Set((trips || []).filter(t => t.reviews?.some(r => r.reviewer_id === user.id)).map(t => t.id))
        setReviewedTripIds(reviewed)
        setCarrierRoutes(routes || [])

        // Fetch real earnings from carrier_earnings table
        const { data: earningsData } = await supabase
          .from('carrier_earnings')
          .select('*, loads(from_location, to_location)')
          .eq('carrier_id', carrier.id)
          .order('earned_at', { ascending: false })
        setEarnings(earningsData || [])
      }

      const [{ data: loads, error: loadsError }, { data: allBids }] = await Promise.all([
        supabase.from('loads').select('*, profiles!loads_shipper_id_fkey(full_name, phone)').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('load_bids').select('load_id, carrier_user_id').eq('status', 'pending'),
      ])
      // Track which loads this carrier already bid on + bid counts per load
      const bidCountMap = {}
      const myBidSet    = new Set()
      ;(allBids || []).forEach(b => {
        bidCountMap[b.load_id] = (bidCountMap[b.load_id] || 0) + 1
        if (b.carrier_user_id === user.id) myBidSet.add(b.load_id)
      })
      setMyBidIds(myBidSet)
      setAvailableLoads((loads || []).map(l => ({ ...l, _bidCount: bidCountMap[l.id] || 0 })))

    } catch {
    } finally {
      setLoading(false)
    }
  }

  // Show onboarding wizard to new carriers
  useEffect(() => {
    if (!loading && !carrierInfo?.company_name) setShowWizard(true)
  }, [loading, carrierInfo])

  // Silent location detection on load — pre-fill if already granted
  useEffect(() => {
    if (!carrierInfo?.id) return
    if (carrierInfo.current_location) return // already has location
    requestLocationSilently().then(result => {
      if (result?.city) saveCarrierLocation(result.city, carrierInfo.id)
    })
  }, [carrierInfo?.id])

  // When GPS detects a city (via banner Enable button), save it
  useEffect(() => {
    if (detectedCity && carrierInfo?.id) {
      saveCarrierLocation(detectedCity, carrierInfo.id)
    }
  }, [detectedCity])

  const saveCarrierLocation = useCallback(async (cityName, cId) => {
    if (!cityName || !cId) return
    setSavingLocation(true)
    await supabase.from('carriers').update({
      current_location:    cityName,
      location_updated_at: new Date().toISOString(),
    }).eq('id', cId)
    // Update local state so Near Pickup badge reacts immediately
    setCarrierInfo(prev => prev ? { ...prev, current_location: cityName } : prev)
    setSavingLocation(false)
  }, [])

  // Cleanup GPS watcher on unmount
  useEffect(() => {
    return () => { if (locationWatcher.current) navigator.geolocation.clearWatch(locationWatcher.current) }
  }, [])

  const toggleLocationSharing = (shipmentId) => {
    if (sharingLocation === shipmentId) {
      navigator.geolocation.clearWatch(locationWatcher.current)
      setSharingLocation(null)
      return
    }
    if (!navigator.geolocation) { alert('GPS not available on this device.'); return }
    setSharingLocation(shipmentId)
    locationWatcher.current = navigator.geolocation.watchPosition(
      async (pos) => {
        await supabase.from('shipment_locations').upsert({
          shipment_id: shipmentId,
          lat:         pos.coords.latitude,
          lng:         pos.coords.longitude,
          speed_kmh:   pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
          heading:     pos.coords.heading,
          recorded_at: new Date().toISOString(),
        }, { onConflict: 'shipment_id' })
      },
      () => { setSharingLocation(null) },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    )
  }

  const saveWizardStep = async () => {
    setSavingWizard(true)
    try {
      if (wizardStep === 1) {
        // Create or update carrier
        let carrier = carrierInfo
        if (!carrier) {
          const { data } = await supabase.from('carriers')
            .insert({ user_id: user.id, company_name: wizardData.company_name, reg_number: wizardData.reg_number })
            .select().single()
          carrier = data
          setCarrierInfo(data)
          // Auto-create trial subscription for new carrier
          if (data?.id) await createTrialSubscription(data.id)
        } else {
          await supabase.from('carriers').update({ company_name: wizardData.company_name, reg_number: wizardData.reg_number }).eq('id', carrier.id)
          setCarrierInfo(c => ({ ...c, company_name: wizardData.company_name }))
        }
        setWizardStep(2)
      } else if (wizardStep === 2) {
        const carrier = carrierInfo
        if (!carrier) return
        const { data } = await supabase.from('trucks').insert({ carrier_id: carrier.id, type: wizardData.truckType, plate: wizardData.plate, capacity_kg: wizardData.capacity, status: 'active' }).select().single()
        if (data) setTrucks(t => [...t, data])
        setWizardStep(3)
      } else if (wizardStep === 3) {
        const carrier = carrierInfo
        if (!carrier) return
        await supabase.from('carrier_routes').insert({ carrier_id: carrier.id, from_city: wizardData.fromCity, to_city: wizardData.toCity })
        setWizardStep(4)
      } else {
        setShowWizard(false)
        fetchData()
      }
    } catch { /* silent */ }
    setSavingWizard(false)
  }

  const initMap = () => {
    if (leafletMap.current || !mapRef.current) return
    import('../lib/googleMaps').then(({ loadGoogleMaps }) => loadGoogleMaps()).then((gmaps) => {
      if (!mapRef.current || leafletMap.current) return
      const map = new gmaps.Map(mapRef.current, {
        center: { lat: -23.0, lng: 25.5 },
        zoom: 6,
        mapTypeId: 'roadmap',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      })
      Object.entries(CITIES).forEach(([name, c]) => {
        const m = new gmaps.Marker({
          position: c,
          map,
          icon: { path: gmaps.SymbolPath.CIRCLE, scale: 5, fillColor: 'white', fillOpacity: 1, strokeColor: '#d6d3d1', strokeWeight: 2 },
          title: name,
        })
        const info = new gmaps.InfoWindow({ content: `<b>${name}</b>` })
        m.addListener('click', () => info.open(map, m))
      })
      leafletMap.current = map
      setMapReady(true)
    }).catch(() => {})
  }

  // Draw load routes on map
  useEffect(() => {
    if (!mapReady || !leafletMap.current) return
    const gmaps = window.google.maps
    const map = leafletMap.current

    markersRef.current.forEach(m => { try { m.setMap(null) } catch(e){} })
    markersRef.current = []

    const colors = ['#259658','#3b82f6','#f59e0b','#8b5cf6','#ef4444']
    ;(async () => {
      const { drawRoadRoute } = await import('../lib/googleMaps')
      for (const [i, load] of availableLoads.entries()) {
        const from = getCity(load.from_location)
        const to   = getCity(load.to_location)
        if (!from || !to) continue
        const color = colors[i % colors.length]

        const route = await drawRoadRoute(gmaps, map, from, to, { strokeColor: color, strokeWeight: 3 })

        const info = new gmaps.InfoWindow({
          content: `<b>${load.from_location} → ${load.to_location}</b><br>${load.cargo_type} · ${load.weight_kg}kg<br><b style="color:${color}">P ${(load.price_estimate||0).toLocaleString()}</b>`,
        })
        const fromDot = new gmaps.Marker({ position: from, map, icon: { path: gmaps.SymbolPath.CIRCLE, scale: 6, fillColor: color, fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 }, title: load.from_location })
        const toDot   = new gmaps.Marker({ position: to,   map, icon: { path: gmaps.SymbolPath.CIRCLE, scale: 6, fillColor: '#6b7280', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 }, title: load.to_location })
        fromDot.addListener('click', () => info.open(map, fromDot))
        markersRef.current.push(route, fromDot, toDot)
      }
    })()
  }, [mapReady, availableLoads, tab])

  const addTruck = async () => {
    if (!newTruck.type || !newTruck.plate) return
    if (!canAddTruck(trucks.length)) {
      setAddingTruck(false)
      setUpgradeModal({ isOpen: true, reason: `You've reached the ${truckLimit}-truck limit on ${currentTier === 'trial' ? 'your trial' : currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}. Upgrade to add more trucks.`, blockedAction: 'truck' })
      return
    }
    let carrier = carrierInfo
    if (!carrier) {
      const { data } = await supabase
        .from('carriers')
        .insert({ user_id: user.id, company_name: profile?.full_name + ' Transport' })
        .select().single()
      carrier = data
      setCarrierInfo(data)
    }
    if (!carrier) return
    const { data, error } = await supabase.from('trucks').insert({
      carrier_id:  carrier.id,
      type:        newTruck.type,
      plate:       newTruck.plate,
      capacity_kg: newTruck.capacity_kg,
      status:      'active',
    }).select().single()
    if (!error) {
      setTrucks(t => [...t, data])
      setNewTruck({ type: '', plate: '', capacity_kg: 3000 })
      setAddingTruck(false)
    } else {
      alert('Error adding truck: ' + error.message)
    }
  }

  const updateTruckStatus = async (id, status) => {
    await supabase.from('trucks').update({ status }).eq('id', id)
    setTrucks(t => t.map(x => x.id === id ? { ...x, status } : x))
  }

  const postTrip = async () => {
    if (!tripForm.from || !tripForm.to || !tripForm.date) return
    if (!canPostTrip()) {
      setShowPostTrip(false)
      setUpgradeModal({ isOpen: true, reason: 'Your trial has ended. Upgrade to post trips.', blockedAction: currentTier === 'expired' ? 'expired' : 'trip' })
      return
    }
    setSavingTrip(true)
    let carrier = carrierInfo
    if (!carrier) {
      const { data } = await supabase
        .from('carriers')
        .insert({ user_id: user.id, company_name: profile?.full_name + ' Transport' })
        .select().single()
      carrier = data
      setCarrierInfo(data)
    }
    if (!carrier) { setSavingTrip(false); return }
    await supabase.from('carrier_routes').insert({
      carrier_id: carrier.id,
      from_city:  tripForm.from,
      to_city:    tripForm.to,
    })
    await supabase.from('notifications').insert({
      user_id: user.id,
      type:    'alert',
      title:   'Trip posted!',
      body:    `Your trip ${tripForm.from} → ${tripForm.to} on ${tripForm.date} is now visible to shippers.`,
      link:    '/carrier',
    })
    setSavingTrip(false)
    setShowPostTrip(false)
    setTripForm({ from: '', to: '', date: '', price: '', notes: '' })
    alert(`Trip posted! ${tripForm.from} → ${tripForm.to} on ${tripForm.date}`)
  }

  const updateShipmentStatus = async (shipmentId, status) => {
    await supabase.from('shipments').update({ status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}) }).eq('id', shipmentId)
    fetchData()
    // Notify shipper
    const trip = myTrips.find(t => t.id === shipmentId)
    if (trip) {
      await supabase.from('notifications').insert({
        user_id: trip.shipper_id, type: status === 'delivered' ? 'delivery' : 'tracking',
        title:   status === 'delivered' ? 'Your load has been delivered!' : `Shipment status updated: ${status.replace('_',' ')}`,
        body:    `${trip.loads?.from_location} → ${trip.loads?.to_location}`,
        link:    `/track/${trip.reference}`,
      })
    }
  }

  const submitShipperReview = async () => {
    if (!shipperRating || !shipperReviewModal) return
    setSubmittingReview(true)
    const { error } = await supabase.from('reviews').insert({
      shipment_id: shipperReviewModal.shipmentId,
      reviewer_id: user.id,
      reviewee_id: shipperReviewModal.shipperId,
      rating: shipperRating,
      comment: shipperComment.trim() || null,
    })
    if (!error) {
      setReviewedTripIds(prev => new Set([...prev, shipperReviewModal.shipmentId]))
      await supabase.from('notifications').insert({
        user_id: shipperReviewModal.shipperId,
        type:    'review',
        title:   'You received a new review!',
        body:    `${carrierInfo?.company_name || 'A carrier'} rated your shipment ${shipperRating} star${shipperRating > 1 ? 's' : ''}.`,
        link:    '/shipper',
      })
      setShipperReviewModal(null)
      setShipperRating(0)
      setShipperComment('')
    }
    setSubmittingReview(false)
  }

  const openBidModal = (load) => {
    if (!canBid()) {
      if (currentTier === 'expired') {
        setUpgradeModal({ isOpen: true, reason: 'Your access has expired. Subscribe to continue placing bids.', blockedAction: 'expired' })
      } else {
        setUpgradeModal({ isOpen: true, reason: `You've used all ${bidsUsedThisMonth} bids this month on ${currentTier === 'trial' ? 'your trial' : 'Basic'}. Upgrade to Pro for unlimited bidding.`, blockedAction: 'bid' })
      }
      return
    }
    const min = calcMinRate(load.from_location, load.to_location, load.weight_kg)
    setBidModal(load)
    setBidPrice(String(load.price_estimate || min))
    setBidNote('')
  }

  const placeBid = async () => {
    if (!bidModal || !bidPrice) return
    const min = calcMinRate(bidModal.from_location, bidModal.to_location, bidModal.weight_kg)
    if (Number(bidPrice) < min) return
    setSubmittingBid(true)
    let carrier = carrierInfo
    if (!carrier) {
      const { data } = await supabase
        .from('carriers')
        .insert({ user_id: user.id, company_name: profile?.full_name + ' Transport' })
        .select().single()
      carrier = data
      setCarrierInfo(data)
    }
    const { error } = await supabase.from('load_bids').insert({
      load_id:         bidModal.id,
      carrier_id:      carrier.id,
      carrier_user_id: user.id,
      price:           Number(bidPrice),
      note:            bidNote.trim() || null,
      status:          'pending',
    })
    if (!error) {
      setMyBidIds(prev => new Set([...prev, bidModal.id]))
      setAvailableLoads(prev => prev.map(l => l.id === bidModal.id ? { ...l, _bidCount: (l._bidCount || 0) + 1 } : l))
      // Track bid usage for Basic/Trial tiers
      if (currentTier === 'basic' || currentTier === 'trial') await incrementBidCount()
      // Notify shipper
      await supabase.from('notifications').insert({
        user_id: bidModal.shipper_id,
        type:    'bid',
        title:   'New bid on your load!',
        body:    `${carrier.company_name} bid ${fmtBWP(Number(bidPrice))} · ${bidModal.from_location} → ${bidModal.to_location}`,
        link:    '/shipper',
      })
      setBidModal(null)
    } else {
      setBidNote(`Error: ${error.message}`)
    }
    setSubmittingBid(false)
  }

  const now = new Date()
  // Earnings from carrier_earnings table (real paid amounts)
  const monthEarnings = earnings
    .filter(e => {
      if (e.status !== 'released') return false
      const d = new Date(e.earned_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((s, e) => s + Number(e.amount || 0), 0)
  const totalReleased = earnings
    .filter(e => e.status === 'released')
    .reduce((s, e) => s + Number(e.amount || 0), 0)
  const activeTrips     = myTrips.filter(t => ['confirmed','picked_up','in_transit'].includes(t.status))
  const avgRating     = carrierInfo?.rating || 0

  const CARGO_TYPES = ['General Goods', 'Electronics', 'Food/Perishables', 'Furniture', 'Livestock', 'Construction Materials', 'Chemicals', 'Automotive', 'Mining Equipment', 'Other']

  const filteredLoads = availableLoads
    .filter(l => {
      const q = loadsSearch.toLowerCase()
      const matchSearch = !q || l.from_location?.toLowerCase().includes(q) || l.to_location?.toLowerCase().includes(q) || l.cargo_type?.toLowerCase().includes(q)
      const matchCargo  = loadsCargoType === 'all' || l.cargo_type === loadsCargoType
      const matchUrgent = !loadsUrgent || l.urgent
      const matchPooled = !loadsPooled || l.pooling
      return matchSearch && matchCargo && matchUrgent && matchPooled
    })
    .map(l => ({ ...l, ...scoreLoad(l, carrierInfo, carrierRoutes, trucks) }))
    .sort((a, b) => {
      if (loadsSort === 'price_high') return (b.price_estimate || 0) - (a.price_estimate || 0)
      if (loadsSort === 'price_low')  return (a.price_estimate || 0) - (b.price_estimate || 0)
      if (loadsSort === 'weight')     return (b.weight_kg || 0) - (a.weight_kg || 0)
      // Default: score first, then newest
      if (b.score !== a.score) return b.score - a.score
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const recommendedLoads = filteredLoads.filter(l => l.score >= 40)
  const otherLoads        = filteredLoads.filter(l => l.score  < 40)

  const statusColors = { confirmed: 'bg-purple-50 text-purple-700', picked_up: 'bg-blue-50 text-blue-700', in_transit: 'bg-blue-50 text-blue-700', delivered: 'bg-forest-50 text-forest-700', cancelled: 'bg-stone-100 text-stone-500' }
  const statusLabels = { confirmed: 'Confirmed', picked_up: 'Picked Up', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled' }

  return (
    <>
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-16">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-sm text-stone-400 mb-1">Carrier Portal</p>
            <h1 className="font-display text-3xl font-800 text-stone-900">
              {carrierInfo?.company_name || profile?.full_name || 'My Dashboard'}
            </h1>
            {carrierInfo?.verified && (
              <span className="inline-flex items-center gap-1 text-xs bg-forest-50 text-forest-700 border border-forest-200 px-2 py-0.5 rounded-full font-medium mt-1">
                <Shield size={10} /> Verified Carrier
              </span>
            )}
            {/* Subscription status badge — client-side expiry safety net */}
            {(() => {
              const effectiveTier = (currentTier === 'trial' && daysRemaining <= 0) ? 'expired' : currentTier
              const pillClass =
                effectiveTier === 'trial'      ? 'bg-amber-50 text-amber-700 border-amber-200' :
                effectiveTier === 'basic'      ? 'bg-stone-100 text-stone-600 border-stone-200' :
                effectiveTier === 'pro'        ? 'bg-blue-50 text-blue-700 border-blue-200' :
                effectiveTier === 'enterprise' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                'bg-rose-50 text-rose-700 border-rose-200'
              const pillLabel =
                effectiveTier === 'trial'      ? `Trial · ${daysRemaining}d left` :
                effectiveTier === 'basic'      ? 'Basic' :
                effectiveTier === 'pro'        ? 'Pro' :
                effectiveTier === 'enterprise' ? 'Enterprise' :
                'Expired · Upgrade'
              return (
                <Link to="/carrier/subscription" className="inline-block mt-1">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${pillClass}`}>
                    {pillLabel}
                  </span>
                </Link>
              )
            })()}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {newLoadCount > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium px-3 py-1.5 rounded-full animate-pulse">
                <Bell size={13} /> {newLoadCount} new load{newLoadCount > 1 ? 's' : ''}!
              </div>
            )}
            <button onClick={() => {
              setShowPostTrip(true)
              // Pre-fill From if carrier has a known location
              if (!tripForm.from) {
                const knownCity = carrierInfo?.current_location
                if (knownCity) {
                  setTripForm(f => ({ ...f, from: knownCity }))
                  setTripFromDetected(true)
                } else {
                  // Try silent detection
                  requestLocationSilently().then(result => {
                    if (result?.city) {
                      setTripForm(f => ({ ...f, from: result.city }))
                      setTripFromDetected(true)
                    }
                  })
                }
              }
            }}
              className="flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all">
              <Navigation size={14} /> Post a Trip
            </button>
            <button onClick={() => setAddingTruck(true)}
              className="flex items-center gap-2 bg-white border border-stone-200 hover:border-forest-300 text-stone-700 text-sm font-medium px-4 py-2 rounded-xl transition-all">
              <Plus size={14} /> Add Truck
            </button>
            <button onClick={fetchData} className="p-2 text-stone-400 hover:text-stone-600 border border-stone-200 rounded-xl transition-colors">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {loading ? (
            // Loading skeletons
            [0,1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 p-5 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-stone-100 mb-3" />
                <div className="h-7 w-24 bg-stone-100 rounded-lg mb-1" />
                <div className="h-3 w-16 bg-stone-100 rounded-full" />
              </div>
            ))
          ) : (
            [
              { label: 'This Month',   icon: DollarSign,  color: 'text-forest-600 bg-forest-50', node: <CountUp to={monthEarnings} prefix="P " decimals={2} duration={1200} /> },
              { label: 'Active Trips', icon: Truck,       color: 'text-blue-600 bg-blue-50',     node: <CountUp to={activeTrips.length} duration={900} /> },
              { label: 'Rating',       icon: Star,        color: 'text-amber-600 bg-amber-50',   node: avgRating ? <CountUp to={avgRating} suffix=" ★" decimals={1} duration={1000} /> : <span className="text-stone-400">—</span> },
              { label: 'Fleet',        icon: TrendingUp,  color: 'text-purple-600 bg-purple-50', node: <><CountUp to={trucks.length} duration={800} /> truck{trucks.length !== 1 ? 's' : ''}</> },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 p-5 animate-slideUp"
                style={{ animationDelay: `${i * 60}ms` }}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${s.color}`}><s.icon size={18} /></div>
                <p className="font-display text-2xl font-800 text-stone-900">{s.node}</p>
                <p className="text-xs text-stone-400 mt-0.5">{s.label}</p>
              </div>
            ))
          )}
        </div>

        {/* Location banner */}
        {!loading && carrierInfo && !locationBannerDismissed && !carrierInfo.current_location && (
          <div className="mx-4 sm:mx-6 mb-4 flex items-center gap-3 bg-forest-50 border border-forest-200 rounded-xl px-4 py-3">
            <span className="text-base flex-shrink-0">📍</span>
            <p className="text-sm text-forest-800 flex-1">Share your location to get better load matches near you</p>
            <button
              onClick={() => { requestGpsLocation() }}
              disabled={gpsLoading || savingLocation}
              className="flex-shrink-0 bg-forest-500 hover:bg-forest-600 disabled:opacity-60 text-white text-xs font-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              {gpsLoading || savingLocation ? 'Detecting…' : 'Enable location'}
            </button>
            <button
              onClick={() => {
                setLocationBannerDismissed(true)
                sessionStorage.setItem('cm_loc_banner_dismissed', '1')
              }}
              className="flex-shrink-0 text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              Not now
            </button>
          </div>
        )}
        {!loading && carrierInfo?.current_location && (
          <p className="mx-4 sm:mx-6 mb-3 text-xs text-forest-600">
            📍 Showing loads near <strong>{carrierInfo.current_location.split(',')[0]}</strong>
          </p>
        )}

        {/* Trial countdown banner */}
        {currentTier === 'trial'   && <TrialBanner daysRemaining={daysRemaining} />}
        {currentTier === 'expired' && (
          <div className="mx-4 sm:mx-6 mb-4 flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <Lock size={16} className="text-rose-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-700 text-rose-800">Your trial has ended</p>
              <p className="text-xs text-rose-600">Dashboard is read-only. Upgrade to post trips, add trucks, and place bids.</p>
            </div>
            <button
              onClick={() => navigate('/carrier/subscription')}
              className="flex-shrink-0 bg-rose-500 hover:bg-rose-600 text-white text-xs font-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              Choose Plan
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-stone-100 p-1 rounded-xl overflow-x-auto scrollbar-none w-full sm:w-fit">
          {[
            { id: 'loads',    label: '📦 Available Loads', badge: availableLoads.length },
            { id: 'trips',    label: '🚛 My Trips',        badge: activeTrips.length },
            { id: 'earnings', label: '💰 Earnings' },
            { id: 'map',      label: '🗺️ Map View' },
            { id: 'fleet',    label: '🔧 Fleet' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}>
              {t.label}
              {t.badge > 0 && <span className="w-5 h-5 bg-forest-500 text-white text-xs rounded-full flex items-center justify-center">{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Available Loads Tab */}
        {tab === 'loads' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">Available Loads</h2>
              <span className="text-xs bg-forest-50 text-forest-700 px-2 py-0.5 rounded-full font-medium">{filteredLoads.length} of {availableLoads.length}</span>
            </div>

            {/* Filter Bar */}
            <div className="px-5 py-3 border-b border-stone-100 flex flex-wrap gap-2 items-center bg-stone-50/50">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input type="text" placeholder="Search route or cargo..." value={loadsSearch}
                  onChange={e => setLoadsSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white" />
              </div>
              {/* Cargo Type */}
              <select value={loadsCargoType} onChange={e => setLoadsCargoType(e.target.value)}
                className="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300">
                <option value="all">All Cargo</option>
                {CARGO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {/* Sort */}
              <select value={loadsSort} onChange={e => setLoadsSort(e.target.value)}
                className="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300">
                <option value="newest">Newest first</option>
                <option value="price_high">Price: High → Low</option>
                <option value="price_low">Price: Low → High</option>
                <option value="weight">Heaviest first</option>
              </select>
              {/* Toggles */}
              <button onClick={() => setLoadsUrgent(v => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-colors ${loadsUrgent ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'}`}>
                🔴 Urgent
              </button>
              <button onClick={() => setLoadsPooled(v => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-colors ${loadsPooled ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'}`}>
                🔗 Pooled
              </button>
              {(loadsSearch || loadsCargoType !== 'all' || loadsUrgent || loadsPooled) && (
                <button onClick={() => { setLoadsSearch(''); setLoadsCargoType('all'); setLoadsUrgent(false); setLoadsPooled(false) }}
                  className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1">
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            {loading ? (
              <div className="divide-y divide-stone-50">
                {[1,2,3].map(i => (
                  <div key={i} className="p-5 flex items-start gap-4 animate-pulse">
                    <div className="w-14 h-14 bg-stone-100 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2"><div className="h-4 w-20 bg-stone-100 rounded-full" /><div className="h-4 w-12 bg-stone-100 rounded-full" /></div>
                      <div className="h-3 w-44 bg-stone-100 rounded-full" />
                      <div className="h-3 w-28 bg-stone-100 rounded-full" />
                    </div>
                    <div className="space-y-2 flex-shrink-0 text-right"><div className="h-6 w-20 bg-stone-100 rounded-full ml-auto" /><div className="h-8 w-24 bg-stone-100 rounded-lg" /></div>
                  </div>
                ))}
              </div>
            ) : filteredLoads.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm">
                {availableLoads.length === 0 ? 'No loads available right now. Check back soon!' : 'No loads match your filters.'}
              </div>
            ) : (
              <>
                {/* Recommended section */}
                {recommendedLoads.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-forest-50 border-b border-forest-100">
                      <Star size={12} className="text-forest-600 fill-forest-500" />
                      <span className="text-xs font-700 text-forest-700">Recommended for You</span>
                      <span className="text-xs text-forest-500 ml-auto">{recommendedLoads.length} matched to your profile</span>
                    </div>
                    <div className="divide-y divide-stone-50 animate-fadeIn">
                      {recommendedLoads.map((l, i) => <LoadCard key={l.id} l={l} openBidModal={openBidModal} myBidIds={myBidIds} recommended index={i} />)}
                    </div>
                  </>
                )}

                {/* Other loads */}
                {otherLoads.length > 0 && (
                  <>
                    {recommendedLoads.length > 0 && (
                      <div className="flex items-center gap-2 px-5 py-2.5 bg-stone-50 border-b border-stone-100 border-t border-t-stone-100">
                        <span className="text-xs font-700 text-stone-500">Other Available Loads</span>
                        <span className="text-xs text-stone-400 ml-auto">{otherLoads.length} loads</span>
                      </div>
                    )}
                    <div className="divide-y divide-stone-50 animate-fadeIn">
                      {otherLoads.map((l, i) => <LoadCard key={l.id} l={l} openBidModal={openBidModal} myBidIds={myBidIds} index={recommendedLoads.length + i} />)}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* My Trips Tab */}
        {tab === 'trips' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">My Trips</h2>
              <span className="text-xs text-stone-400">{myTrips.length} total</span>
            </div>
            {myTrips.length === 0 ? (
              <div className="p-12 text-center">
                <Truck size={32} className="text-stone-300 mx-auto mb-3" />
                <p className="text-stone-400 text-sm">No trips yet — accept a load to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-50 animate-fadeIn">
                {myTrips.map((t, idx) => {
                  const rating = t.reviews?.[0]?.rating
                  return (
                    <div key={t.id} className="p-5 hover:bg-stone-50 transition-all animate-slideUp"
                      style={{ animationDelay: `${idx * 50}ms` }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {t.loads?.image_url && (
                            <img src={t.loads.image_url} alt="cargo" className="w-12 h-12 object-cover rounded-xl border border-stone-200 flex-shrink-0" />
                          )}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-display font-700 text-stone-900 text-sm">{t.reference}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[t.status] || 'bg-stone-100 text-stone-500'}`}>
                                {statusLabels[t.status] || t.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-stone-600 min-w-0">
                              <MapPin size={11} className="text-forest-500 flex-shrink-0" />
                              <span className="truncate max-w-[80px]">{t.loads?.from_location}</span>
                              <ArrowRight size={10} className="text-stone-300 flex-shrink-0" />
                              <span className="truncate max-w-[80px]">{t.loads?.to_location}</span>
                            </div>
                            <p className="text-xs text-stone-400 mt-0.5">{t.loads?.cargo_type} · {t.loads?.weight_kg}kg</p>
                            {rating && (
                              <div className="flex items-center gap-0.5 mt-1">
                                {[1,2,3,4,5].map(s => <Star key={s} size={10} className={s <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-200'} />)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-display font-700 text-forest-600">P {(t.price || 0).toLocaleString()}</p>
                          {/* Status update buttons */}
                          {t.status === 'confirmed' && (
                            <div className="mt-2 flex flex-col gap-1.5">
                              {t.pickup_lat ? (
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${t.pickup_lat},${t.pickup_lng}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                                  <Navigation size={10} className="animate-pulse" /> Navigate to Pickup
                                </a>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-stone-400 italic">
                                  <MapPin size={10} /> Waiting for shipper location…
                                </span>
                              )}
                              <button onClick={() => updateShipmentStatus(t.id, 'picked_up')}
                                className="flex items-center gap-1 bg-forest-500 hover:bg-forest-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                                <Play size={10} /> Mark Picked Up
                              </button>
                            </div>
                          )}
                          {t.status === 'picked_up' && (
                            <button onClick={() => updateShipmentStatus(t.id, 'in_transit')}
                              className="mt-2 flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                              <Truck size={10} /> Start Transit
                            </button>
                          )}
                          {t.status === 'in_transit' && (
                            <button onClick={() => updateShipmentStatus(t.id, 'delivered')}
                              className="mt-2 flex items-center gap-1 bg-forest-500 hover:bg-forest-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                              <CheckCircle size={10} /> Mark Delivered
                            </button>
                          )}
                          {/* GPS sharing toggle for active trips */}
                          {['confirmed','picked_up','in_transit'].includes(t.status) && (
                            <button onClick={() => toggleLocationSharing(t.id)}
                              className={`mt-2 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                                sharingLocation === t.id
                                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                              }`}>
                              <Navigation size={10} /> {sharingLocation === t.id ? 'Stop GPS' : 'Share GPS'}
                            </button>
                          )}
                          {t.status === 'delivered' && !reviewedTripIds.has(t.id) && t.shipper_id && (
                            <button onClick={() => { setShipperRating(0); setShipperRatingHover(0); setShipperComment(''); setShipperReviewModal({ shipmentId: t.id, shipperId: t.shipper_id, shipperName: t.profiles?.full_name }) }}
                              className="mt-2 flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium">
                              <Star size={10} className="fill-amber-400 text-amber-400" /> Rate Shipper
                            </button>
                          )}
                          {t.status === 'delivered' && reviewedTripIds.has(t.id) && (
                            <span className="mt-2 flex items-center gap-1 text-xs text-stone-400">
                              <CheckCircle size={10} /> Reviewed
                            </span>
                          )}
                          <Link to={`/track/${t.reference}`} className="block mt-1 text-xs text-forest-600 hover:underline">Track</Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Earnings Tab */}
        {tab === 'earnings' && (
          <div className="space-y-5">

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Total Earned',  value: totalReleased,   icon: CheckCircle, color: 'text-forest-600 bg-forest-50', prefix: 'P ', decimals: 2 },
                { label: 'This Month',    value: monthEarnings,   icon: DollarSign,  color: 'text-blue-600 bg-blue-50',    prefix: 'P ', decimals: 2 },
                { label: 'Total Trips',   value: myTrips.length,  icon: Truck,       color: 'text-purple-600 bg-purple-50', prefix: '', decimals: 0 },
              ].map((c, i) => (
                <div key={i} className="bg-white rounded-2xl border border-stone-100 p-5 animate-slideUp" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.color}`}><c.icon size={18} /></div>
                  <p className="font-display text-2xl font-800 text-stone-900">
                    <CountUp to={c.value} prefix={c.prefix} decimals={c.decimals} duration={1100 + i * 100} />
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Analytics — Pro / Enterprise only */}
            {!canAccessAnalytics() ? (
              <div className="bg-white rounded-2xl border border-stone-100 p-8 text-center relative overflow-hidden">
                {/* Blurred preview bars */}
                <div className="absolute inset-0 flex items-end gap-3 px-8 pb-12 opacity-10 pointer-events-none">
                  {[40,70,50,90,65,80].map((h, i) => (
                    <div key={i} className="flex-1 bg-forest-500 rounded-t-lg" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="relative z-10">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <TrendingUp size={20} className="text-blue-500" />
                  </div>
                  <p className="font-display font-700 text-stone-900 text-sm mb-1">Full Earnings Analytics</p>
                  <p className="text-xs text-stone-400 mb-4">Monthly charts, per-load breakdown, and top routes are available on Pro and Enterprise.</p>
                  <button
                    onClick={() => setUpgradeModal({ isOpen: true, reason: 'Earnings analytics are available on Pro and Enterprise plans.', blockedAction: 'analytics' })}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-forest-600 hover:text-forest-700 bg-forest-50 border border-forest-200 px-4 py-2 rounded-lg transition-colors"
                  >
                    Upgrade to Pro
                  </button>
                </div>
              </div>
            ) : (() => {
              // Monthly chart — last 6 months from carrier_earnings
              const months = {}
              earnings.forEach(e => {
                const d = new Date(e.earned_at)
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
                if (!months[key]) months[key] = { label, amount: 0 }
                if (e.status === 'released') months[key].amount += Number(e.amount || 0)
              })
              const entries = Object.values(months).sort((a, b) => a.label.localeCompare(b.label)).slice(-6)
              const maxVal  = Math.max(...entries.map(e => e.amount), 1)

              // Top routes
              const routeMap = {}
              earnings.forEach(e => {
                const from = e.loads?.from_location
                const to   = e.loads?.to_location
                if (!from || !to) return
                const key = `${from} → ${to}`
                if (!routeMap[key]) routeMap[key] = { route: key, amount: 0, trips: 0 }
                routeMap[key].amount += Number(e.amount || 0)
                routeMap[key].trips  += 1
              })
              const topRoutes = Object.values(routeMap).sort((a, b) => b.amount - a.amount).slice(0, 5)

              return (
                <>
                  {/* Monthly bar chart */}
                  {entries.length > 0 && (
                    <div className="bg-white rounded-2xl border border-stone-100 p-5">
                      <h3 className="font-display font-700 text-stone-900 text-sm mb-4">Monthly Earnings (BWP)</h3>
                      <div className="flex items-end gap-2 h-36">
                        {entries.map((e, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <p className="text-xs text-stone-500 font-medium">
                              {e.amount > 0 ? `P${Math.round(e.amount / 1000) > 0 ? (e.amount / 1000).toFixed(1) + 'k' : e.amount.toFixed(0)}` : ''}
                            </p>
                            <div className="w-full bg-stone-100 rounded-t-lg" style={{ height: '96px' }}>
                              <div
                                className="w-full bg-forest-500 rounded-t-lg transition-all duration-700 mt-auto"
                                style={{ height: `${(e.amount / maxVal) * 96}px`, marginTop: `${96 - (e.amount / maxVal) * 96}px`, minHeight: e.amount > 0 ? 4 : 0 }}
                              />
                            </div>
                            <span className="text-xs text-stone-400">{e.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top routes */}
                  {topRoutes.length > 0 && (
                    <div className="bg-white rounded-2xl border border-stone-100 p-5">
                      <h3 className="font-display font-700 text-stone-900 text-sm mb-4">Top Routes by Earnings</h3>
                      <div className="space-y-3">
                        {topRoutes.map((r, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs font-700 text-stone-400 w-4">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-stone-800 truncate">{r.route}</p>
                              <p className="text-xs text-stone-400">{r.trips} trip{r.trips !== 1 ? 's' : ''}</p>
                            </div>
                            <p className="font-display font-700 text-forest-600 text-sm flex-shrink-0">
                              P {r.amount.toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Per-load earnings table */}
            <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                <h3 className="font-display font-700 text-stone-900 text-sm">Earnings History</h3>
                <span className="text-xs text-stone-400">{earnings.length} record{earnings.length !== 1 ? 's' : ''}</span>
              </div>
              {earnings.length === 0 ? (
                <div className="py-12 text-center">
                  <DollarSign size={28} className="text-stone-300 mx-auto mb-3" />
                  <p className="text-stone-400 text-sm font-medium mb-1">No earnings yet</p>
                  <p className="text-stone-300 text-xs">Earnings are recorded when you complete a delivery.</p>
                </div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {earnings.slice(0, 20).map((e, idx) => {
                    const date = new Date(e.earned_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    return (
                      <div key={e.id} className="px-5 py-4 hover:bg-stone-50 transition-all flex items-center gap-4"
                        style={{ animationDelay: `${idx * 35}ms` }}>
                        <div className="w-8 h-8 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
                          <CheckCircle size={14} className="text-forest-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-stone-500 truncate">
                            {e.loads?.from_location && e.loads?.to_location
                              ? `${e.loads.from_location} → ${e.loads.to_location}`
                              : 'Completed delivery'}
                          </p>
                          <p className="text-xs text-stone-400 mt-0.5">{date}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-display font-700 text-forest-700">P {Number(e.amount).toLocaleString('en-BW', { minimumFractionDigits: 2 })}</p>
                          <span className="text-xs bg-forest-50 text-forest-600 px-1.5 py-0.5 rounded-full">Released</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map Tab */}
        {tab === 'map' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-display font-700 text-stone-900 text-sm flex items-center gap-2">
                <Navigation size={14} className="text-forest-500" /> Load Routes Map
              </h2>
              <span className="text-xs text-stone-400">{availableLoads.length} available loads shown</span>
            </div>
            {!canAccessSADC() && (
              <div className="flex items-center gap-3 px-5 py-3 bg-purple-50 border-b border-purple-100">
                <Globe size={14} className="text-purple-500 flex-shrink-0" />
                <p className="text-xs text-purple-700 flex-1">
                  SADC cross-border loads are only visible on the <strong>Enterprise</strong> plan.
                </p>
                <button
                  onClick={() => setUpgradeModal({ isOpen: true, reason: 'SADC cross-border routes are available on Enterprise only.', blockedAction: 'sadc' })}
                  className="text-xs font-medium text-purple-700 hover:text-purple-900 underline underline-offset-2 flex-shrink-0"
                >
                  Upgrade
                </button>
              </div>
            )}
            <div ref={mapRef} style={{ height: '500px', width: '100%' }} />
            <div className="px-5 py-3 border-t border-stone-100 flex gap-4 text-xs text-stone-500 flex-wrap">
              {availableLoads.slice(0,5).map((l, i) => {
                const colors = ['#259658','#3b82f6','#f59e0b','#8b5cf6','#ef4444']
                return (
                  <div key={l.id} className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded" style={{ background: colors[i % colors.length] }} />
                    <span>{l.from_location} → {l.to_location}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Fleet Tab */}
        {tab === 'fleet' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
                <h2 className="font-display font-700 text-stone-900">My Fleet</h2>
                <button onClick={() => setAddingTruck(true)}
                  className="flex items-center gap-2 text-xs bg-forest-50 text-forest-700 border border-forest-200 px-3 py-1.5 rounded-lg hover:bg-forest-100 transition-colors font-medium">
                  <Plus size={12} /> Add Truck
                </button>
              </div>
              {trucks.length === 0 ? (
                <div className="p-12 text-center">
                  <Truck size={32} className="text-stone-300 mx-auto mb-3" />
                  <p className="text-stone-400 text-sm mb-3">No trucks added yet.</p>
                  <button onClick={() => setAddingTruck(true)}
                    className="inline-flex items-center gap-2 bg-forest-500 text-white text-sm font-medium px-4 py-2 rounded-xl">
                    <Plus size={14} /> Add Your First Truck
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {trucks.map(t => (
                    <div key={t.id} className="flex items-center justify-between px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center"><Truck size={18} className="text-stone-500" /></div>
                        <div>
                          <p className="font-medium text-stone-900 text-sm">{t.type}</p>
                          <p className="text-xs text-stone-400">{t.plate} · {t.capacity_kg?.toLocaleString()}kg capacity</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={t.status} onChange={e => updateTruckStatus(t.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-lg border font-medium focus:outline-none ${
                            t.status === 'active' ? 'bg-forest-50 text-forest-700 border-forest-200' :
                            t.status === 'in_transit' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                          <option value="active">Active</option>
                          <option value="in_transit">In Transit</option>
                          <option value="maintenance">Maintenance</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Truck Modal */}
      {addingTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setAddingTruck(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-700 text-stone-900">Add New Truck</h3>
              <button onClick={() => setAddingTruck(false)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Truck Type</label>
                <input type="text" placeholder="e.g. Hino 300 (3 Ton)" value={newTruck.type}
                  onChange={e => setNewTruck(t => ({ ...t, type: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Plate Number</label>
                <input type="text" placeholder="e.g. B 4421 MP" value={newTruck.plate}
                  onChange={e => setNewTruck(t => ({ ...t, plate: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Capacity (kg)</label>
                <input type="number" value={newTruck.capacity_kg}
                  onChange={e => setNewTruck(t => ({ ...t, capacity_kg: parseInt(e.target.value) }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAddingTruck(false)} className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50">Cancel</button>
              <button onClick={addTruck} disabled={!newTruck.type || !newTruck.plate}
                className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white text-sm font-medium rounded-xl transition-all">
                Add Truck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post Trip Modal */}
      {showPostTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowPostTrip(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-700 text-stone-900">Post a Trip</h3>
              <button onClick={() => setShowPostTrip(false)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><X size={16} /></button>
            </div>
            <p className="text-xs text-stone-400 mb-4">Let shippers know you're heading on a route so they can book space on your truck.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <LocationInput
                    label="From"
                    value={tripForm.from}
                    onChange={v => { setTripForm(f => ({ ...f, from: v })); setTripFromDetected(false) }}
                    placeholder="e.g. Gaborone"
                    inputClassName="py-2.5 px-3"
                    onDetected={city => {
                      setTripFromDetected(true)
                      if (carrierInfo?.id) saveCarrierLocation(city, carrierInfo.id)
                    }}
                  />
                  {tripFromDetected && tripForm.from && (
                    <p className="text-xs text-forest-600 mt-1">📍 Detected: {tripForm.from}</p>
                  )}
                </div>
                <div>
                  <LocationInput
                    label="To"
                    value={tripForm.to}
                    onChange={v => setTripForm(f => ({ ...f, to: v }))}
                    placeholder="e.g. Francistown"
                    inputClassName="py-2.5 px-3"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Departure Date</label>
                <input type="date" value={tripForm.date}
                  onChange={e => setTripForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Price per kg (optional)</label>
                <input type="number" placeholder="e.g. 5" value={tripForm.price}
                  onChange={e => setTripForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Notes</label>
                <textarea rows={2} placeholder="Available capacity, special notes..." value={tripForm.notes}
                  onChange={e => setTripForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPostTrip(false)} className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50">Cancel</button>
              <button onClick={postTrip} disabled={savingTrip || !tripForm.from || !tripForm.to || !tripForm.date}
                className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white text-sm font-medium rounded-xl transition-all">
                {savingTrip ? 'Posting...' : 'Post Trip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Onboarding Wizard */}
    {showWizard && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-6">
            {[1,2,3,4].map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= wizardStep ? 'bg-forest-500' : 'bg-stone-200'}`} />
            ))}
          </div>

          {wizardStep === 1 && (
            <>
              <h3 className="font-display font-700 text-stone-900 text-lg mb-1">Welcome to CargoMatch 👋</h3>
              <p className="text-sm text-stone-400 mb-5">Let's set up your carrier profile in 3 quick steps.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Company Name *</label>
                  <input type="text" placeholder="e.g. Kgosi Transport Ltd"
                    value={wizardData.company_name}
                    onChange={e => setWizardData(d => ({ ...d, company_name: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Registration Number (optional)</label>
                  <input type="text" placeholder="e.g. BW 2024/001234"
                    value={wizardData.reg_number}
                    onChange={e => setWizardData(d => ({ ...d, reg_number: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
              </div>
            </>
          )}

          {wizardStep === 2 && (
            <>
              <h3 className="font-display font-700 text-stone-900 text-lg mb-1">Add Your First Truck</h3>
              <p className="text-sm text-stone-400 mb-5">You can add more trucks later from your fleet tab.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Truck Type *</label>
                  <input type="text" placeholder="e.g. Hino 300 (3 Ton Flatbed)"
                    value={wizardData.truckType}
                    onChange={e => setWizardData(d => ({ ...d, truckType: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Plate Number *</label>
                  <input type="text" placeholder="e.g. B 4421 MP"
                    value={wizardData.plate}
                    onChange={e => setWizardData(d => ({ ...d, plate: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Capacity (kg)</label>
                  <input type="number" value={wizardData.capacity}
                    onChange={e => setWizardData(d => ({ ...d, capacity: parseInt(e.target.value) }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
              </div>
            </>
          )}

          {wizardStep === 3 && (
            <>
              <h3 className="font-display font-700 text-stone-900 text-lg mb-1">Your Main Route</h3>
              <p className="text-sm text-stone-400 mb-5">Add the corridor you operate most. This helps match you with relevant loads.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">From City *</label>
                  <input type="text" placeholder="e.g. Gaborone"
                    value={wizardData.fromCity}
                    onChange={e => setWizardData(d => ({ ...d, fromCity: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">To City *</label>
                  <input type="text" placeholder="e.g. Francistown"
                    value={wizardData.toCity}
                    onChange={e => setWizardData(d => ({ ...d, toCity: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
              </div>
            </>
          )}

          {wizardStep === 4 && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-forest-500" />
              </div>
              <h3 className="font-display font-700 text-stone-900 text-lg mb-2">You're all set!</h3>
              <p className="text-sm text-stone-400">Your carrier profile is ready. Start browsing loads and placing bids.</p>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {wizardStep > 1 && wizardStep < 4 && (
              <button onClick={() => setWizardStep(s => s - 1)}
                className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50">
                Back
              </button>
            )}
            <button
              onClick={saveWizardStep}
              disabled={savingWizard ||
                (wizardStep === 1 && !wizardData.company_name) ||
                (wizardStep === 2 && (!wizardData.truckType || !wizardData.plate)) ||
                (wizardStep === 3 && (!wizardData.fromCity || !wizardData.toCity))
              }
              className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white text-sm font-medium rounded-xl transition-all">
              {savingWizard ? 'Saving...' : wizardStep === 4 ? 'Go to Dashboard' : wizardStep === 3 ? 'Finish Setup' : 'Continue →'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Bid Modal */}
    {bidModal && (() => {
      const min = calcMinRate(bidModal.from_location, bidModal.to_location, bidModal.weight_kg)
      const price = Number(bidPrice)
      const valid = price >= min
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setBidModal(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-700 text-stone-900">Place a Bid</h3>
              <button onClick={() => setBidModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><X size={16} /></button>
            </div>
            <p className="text-xs text-stone-400 mb-5">{bidModal.from_location} → {bidModal.to_location} · {bidModal.cargo_type} · {bidModal.weight_kg}kg</p>

            <div className="bg-stone-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-xs text-stone-500">Minimum rate</span>
              <span className="font-display font-700 text-stone-900">{fmtBWP(min)}</span>
            </div>

            <label className="block text-xs font-medium text-stone-600 mb-1.5">Your Bid (BWP)</label>
            <div className="relative mb-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-display font-700 text-sm">P</span>
              <input
                type="number"
                min={min}
                value={bidPrice}
                onChange={e => setBidPrice(e.target.value)}
                className={`w-full border rounded-xl pl-7 pr-4 py-2.5 text-sm font-display font-700 focus:outline-none focus:ring-2 ${
                  !valid && bidPrice ? 'border-rose-300 focus:ring-rose-200' : 'border-stone-200 focus:ring-forest-300'
                }`}
              />
            </div>
            {!valid && bidPrice && (
              <p className="text-xs text-rose-500 mb-3">Bid must be at least {fmtBWP(min)}</p>
            )}

            <label className="block text-xs font-medium text-stone-600 mb-1.5 mt-3">Note to Shipper (optional)</label>
            <textarea
              placeholder="e.g. Available from Monday, fully insured, experienced driver"
              value={bidNote}
              onChange={e => setBidNote(e.target.value)}
              rows={2}
              className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-forest-300 mb-5"
            />

            <div className="flex gap-3">
              <button onClick={() => setBidModal(null)}
                className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50">
                Cancel
              </button>
              <button onClick={placeBid} disabled={!valid || submittingBid}
                className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2">
                <Gavel size={14} /> {submittingBid ? 'Submitting...' : 'Submit Bid'}
              </button>
            </div>
          </div>
        </div>
      )
    })()}

    {/* Upgrade Modal */}
    <UpgradeModal
      isOpen={upgradeModal.isOpen}
      reason={upgradeModal.reason}
      blockedAction={upgradeModal.blockedAction}
      onClose={() => setUpgradeModal({ isOpen: false, reason: '', blockedAction: null })}
    />


    {/* Shipper Review Modal */}
    {shipperReviewModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShipperReviewModal(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-700 text-stone-900">Rate Shipper</h3>
              {shipperReviewModal.shipperName && (
                <p className="text-xs text-stone-400 mt-0.5">{shipperReviewModal.shipperName}</p>
              )}
            </div>
            <button onClick={() => setShipperReviewModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><X size={16} /></button>
          </div>
          <div className="flex justify-center gap-2 mb-5">
            {[1,2,3,4,5].map(s => (
              <button key={s}
                onMouseEnter={() => setShipperRatingHover(s)}
                onMouseLeave={() => setShipperRatingHover(0)}
                onClick={() => setShipperRating(s)}
                className="transition-transform hover:scale-110">
                <Star size={32} className={(shipperRatingHover || shipperRating) >= s ? 'fill-amber-400 text-amber-400' : 'text-stone-200'} />
              </button>
            ))}
          </div>
          <textarea
            placeholder="How was working with this shipper? (optional)"
            value={shipperComment}
            onChange={e => setShipperComment(e.target.value)}
            rows={3}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-forest-300 mb-4"
          />
          <div className="flex gap-3">
            <button onClick={() => setShipperReviewModal(null)}
              className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 text-sm font-medium hover:bg-stone-50">
              Skip
            </button>
            <button onClick={submitShipperReview} disabled={!shipperRating || submittingReview}
              className="flex-1 py-3 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2">
              <Send size={14} /> {submittingReview ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
