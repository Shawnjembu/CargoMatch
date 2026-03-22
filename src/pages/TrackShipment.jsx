import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { ArrowRight, MessageSquare, CheckCircle, ChevronLeft, Navigation, AlertCircle } from 'lucide-react'

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
  'Kang':            { lat: -23.6833, lng: 22.8333 },
  'Hukuntsi':        { lat: -23.9833, lng: 21.7500 },
  'Gabane':          { lat: -24.6000, lng: 25.7500 },
  'Pilane':          { lat: -24.3300, lng: 25.9000 },
}
const ALIASES = {
  'selebi phikwe': 'Selebi-Phikwe',
  'selibe phikwe': 'Selebi-Phikwe',
  'selibe-phikwe': 'Selebi-Phikwe',
  'gabs':          'Gaborone',
}
function getCity(loc) {
  if (!loc) return null
  const lower = loc.toLowerCase().trim()
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (lower.includes(alias)) { const c = CITIES[canonical]; return c ? { ...c, name: canonical } : null }
  }
  const key = Object.keys(CITIES).find(k => lower.includes(k.toLowerCase()))
  return key ? { ...CITIES[key], name: key } : null
}

function lerp(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

export default function TrackShipment() {
  const { shipmentId } = useParams()
  const [shipment,     setShipment]     = useState(null)
  const [notFound,     setNotFound]     = useState(false)
  const [liveProgress, setLiveProgress] = useState(0)
  const [liveCoord,    setLiveCoord]    = useState(null)  // { lat, lng } from GPS
  const [loading,      setLoading]      = useState(true)
  const [lastSeen,     setLastSeen]     = useState(null)
  const mapRef      = useRef(null)
  const leafletMap  = useRef(null)
  const truckMarker = useRef(null)
  const [mapReady,  setMapReady]  = useState(false)

  useEffect(() => {
    fetchShipment()
    // Realtime: shipment status updates
    const shipChannel = supabase.channel('track-shipment')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'shipments',
        filter: `reference=eq.${shipmentId}`,
      }, (payload) => {
        setShipment(prev => ({ ...prev, ...payload.new }))
        setLiveProgress(payload.new.progress_pct || 0)
      })
      .subscribe()
    return () => supabase.removeChannel(shipChannel)
  }, [shipmentId])

  // Subscribe to live GPS once shipment id is known
  useEffect(() => {
    if (!shipment?.id) return
    fetchLocation(shipment.id)
    const gpsChannel = supabase.channel('gps-' + shipment.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shipment_locations',
        filter: `shipment_id=eq.${shipment.id}`,
      }, (payload) => {
        if (payload.new?.lat) {
          setLiveCoord({ lat: Number(payload.new.lat), lng: Number(payload.new.lng) })
          setLastSeen(new Date(payload.new.recorded_at))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(gpsChannel)
  }, [shipment?.id])

  const fetchLocation = async (id) => {
    const { data } = await supabase
      .from('shipment_locations')
      .select('lat, lng, recorded_at')
      .eq('shipment_id', id)
      .maybeSingle()
    if (data) {
      setLiveCoord({ lat: Number(data.lat), lng: Number(data.lng) })
      setLastSeen(new Date(data.recorded_at))
    }
  }

  const fetchShipment = async () => {
    const { data } = await supabase
      .from('shipments')
      .select(`*, loads(*), carriers(company_name, trucks(*))`)
      .eq('reference', shipmentId)
      .single()

    if (data) {
      setShipment(data)
      setLiveProgress(data.progress_pct || 0)
    } else {
      setNotFound(true)
    }
    setLoading(false)
  }

  const fromLoc = shipment?.loads?.from_location || shipment?.from_location
  const toLoc   = shipment?.loads?.to_location   || shipment?.to_location
  const fromCoord = getCity(fromLoc) || { lat: -24.6282, lng: 25.9231 }
  const toCoord   = getCity(toLoc)   || { lat: -21.1667, lng: 27.5167 }
  // Use real GPS if available, fall back to interpolated position
  const truckPos  = liveCoord || lerp(fromCoord, toCoord, (liveProgress || 0) / 100)
  const isLiveGPS = !!liveCoord

  // Init Google Maps
  useEffect(() => {
    if (leafletMap.current || loading) return
    import('../lib/googleMaps').then(({ loadGoogleMaps }) => loadGoogleMaps()).then((gmaps) => {
      if (!mapRef.current || leafletMap.current) return
      const map = new gmaps.Map(mapRef.current, {
        center: { lat: truckPos.lat, lng: truckPos.lng },
        zoom: 7,
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      })

      // Draw road-following route via Directions API
      import('../lib/googleMaps').then(({ drawRoadRoute }) =>
        drawRoadRoute(gmaps, map, fromCoord, toCoord, { strokeColor: '#259658', strokeWeight: 4 })
      )

      const dotIcon = (color) => ({
        path: gmaps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2.5,
      })
      new gmaps.Marker({ position: fromCoord, map, icon: dotIcon('#259658'), title: fromLoc })
        .addListener('click', () => new gmaps.InfoWindow({ content: `<b>${fromLoc}</b><br>Pickup` }).open(map))
      new gmaps.Marker({ position: toCoord, map, icon: dotIcon('#6b7280'), title: toLoc })
        .addListener('click', () => new gmaps.InfoWindow({ content: `<b>${toLoc}</b><br>Destination` }).open(map))

      const truckEl = document.createElement('div')
      truckEl.innerHTML = '🚛'
      truckEl.style.cssText = 'background:#259658;color:white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(37,150,88,0.45);border:2px solid white;font-size:15px;cursor:pointer;'
      truckMarker.current = new gmaps.Marker({
        position: truckPos,
        map,
        icon: { url: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36'><circle cx='18' cy='18' r='16' fill='%23259658' stroke='white' stroke-width='2.5'/><text x='18' y='23' font-size='14' text-anchor='middle'>🚛</text></svg>`, anchor: new gmaps.Point(18, 18) },
        title: shipment?.carriers?.company_name || 'Carrier',
      })
      const infoWin = new gmaps.InfoWindow({ content: `<b>${shipment?.carriers?.company_name || 'Carrier'}</b><br>${shipment?.status || ''}` })
      truckMarker.current.addListener('click', () => infoWin.open(map, truckMarker.current))

      leafletMap.current = map
      setMapReady(true)
    }).catch(console.error)
    return () => { leafletMap.current = null }
  }, [loading])

  // Move marker when real GPS coord arrives
  useEffect(() => {
    if (!mapReady || !liveCoord) return
    truckMarker.current?.setPosition(liveCoord)
  }, [liveCoord, mapReady])

  // Fallback: animate by interpolation when no real GPS
  useEffect(() => {
    if (!mapReady || liveCoord || shipment?.status === 'delivered') return
    const interval = setInterval(() => {
      setLiveProgress(p => {
        const next = Math.min(p + 0.15, 100)
        const pos = lerp(fromCoord, toCoord, next / 100)
        truckMarker.current?.setPosition(pos)
        return next
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [mapReady, liveCoord])

  const events = [
    { label: 'Order Confirmed',            done: true },
    { label: 'Cargo Picked Up',            done: liveProgress > 5 },
    { label: 'In Transit',                 done: liveProgress > 10 },
    { label: 'Approaching Destination',    done: liveProgress > 80 },
    { label: 'Delivered',                  done: liveProgress >= 100 || shipment?.status === 'delivered' },
  ]

  if (!loading && notFound) {
    return (
      <div className="min-h-screen bg-cream font-body">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">
          <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={28} className="text-stone-400" />
          </div>
          <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">Shipment Not Found</h1>
          <p className="text-stone-400 text-sm mb-8">No shipment found with reference <span className="font-medium text-stone-600">{shipmentId}</span>. Check the reference and try again.</p>
          <Link to="/shipper" className="inline-flex items-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all">
            <ChevronLeft size={16} /> Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 pt-28 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/shipper" className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors mb-2"><ChevronLeft size={14} /> Back</Link>
            <h1 className="font-display text-2xl font-800 text-stone-900">Tracking <span className="text-forest-500">{shipmentId}</span></h1>
          </div>
          <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full ${
            shipment?.status === 'delivered' ? 'bg-forest-50 text-forest-700 border border-forest-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {shipment?.status === 'delivered' ? <><CheckCircle size={13} /> Delivered</> : <><span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse-dot" /> In Transit</>}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
                <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Navigation size={14} className="text-forest-500" />
                  <span>{fromLoc}</span><ArrowRight size={12} className="text-stone-300" /><span>{toLoc}</span>
                </div>
                {isLiveGPS ? (
                  <span className="flex items-center gap-1.5 text-xs text-forest-600 font-medium">
                    <span className="w-2 h-2 bg-forest-500 rounded-full animate-pulse" /> Live GPS
                    {lastSeen && <span className="text-stone-400 font-normal">· {lastSeen.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>}
                  </span>
                ) : (
                  <span className="text-xs text-stone-400">Estimated position</span>
                )}
              </div>
              {loading ? (
                <div className="h-96 flex items-center justify-center text-stone-400 text-sm">Loading map...</div>
              ) : (
                <div ref={mapRef} style={{ height: '420px', width: '100%' }} />
              )}
              <div className="px-5 py-3 border-t border-stone-100">
                <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                  <span className="font-medium">{fromLoc}</span>
                  <span className="text-forest-600 font-medium">{Math.round(liveProgress)}% complete</span>
                  <span className="font-medium">{toLoc}</span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div className="relative h-full bg-forest-500 rounded-full overflow-hidden"
                    style={{ width: `${liveProgress}%`, transition: 'width 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                    {shipment?.status !== 'delivered' && <span className="animate-shimmer" />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-stone-100 p-5">
              <h3 className="font-display font-700 text-stone-900 text-sm mb-4">Shipment Details</h3>
              <div className="space-y-3">
                {[
                  { label: 'Ref', value: shipment?.reference || shipmentId },
                  { label: 'Carrier', value: shipment?.carriers?.company_name || '—' },
                  { label: 'Cargo', value: shipment?.loads ? `${shipment.loads.cargo_type} (${shipment.loads.weight_kg}kg)` : '—' },
                  { label: 'ETA', value: shipment?.eta ? new Date(shipment.eta).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '—' },
                ].map((d, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-stone-400">{d.label}</span>
                    <span className="text-stone-800 font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-stone-100">
                <Link to="/messages" className="w-full flex items-center justify-center gap-2 bg-forest-50 hover:bg-forest-100 text-forest-700 font-medium text-sm py-2.5 rounded-xl transition-colors border border-forest-200">
                  <MessageSquare size={14} /> Message Carrier
                </Link>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-stone-100 p-5">
              <h3 className="font-display font-700 text-stone-900 text-sm mb-4">Delivery Timeline</h3>
              <div className="space-y-0">
                {events.map((e, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${e.done ? 'bg-forest-500' : 'bg-stone-200'}`}>
                        {e.done ? <CheckCircle size={12} className="text-white" /> : <div className="w-2 h-2 bg-stone-400 rounded-full" />}
                      </div>
                      {i < events.length - 1 && <div className={`w-0.5 h-8 my-0.5 ${e.done ? 'bg-forest-300' : 'bg-stone-200'}`} />}
                    </div>
                    <div className="pb-4">
                      <p className={`text-sm font-medium ${e.done ? 'text-stone-800' : 'text-stone-400'}`}>{e.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
