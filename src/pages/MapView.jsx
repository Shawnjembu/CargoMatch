import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Truck, MapPin, ArrowRight, RefreshCw } from 'lucide-react'

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

export default function MapView() {
  const { user, profile } = useAuth()
  const mapRef     = useRef(null)
  const leafletMap = useRef(null)
  const markersRef = useRef([])
  const [shipments, setShipments] = useState([])
  const [selected,  setSelected]  = useState(null)
  const [mapReady,  setMapReady]  = useState(false)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    fetchShipments()
    initMap()
  }, [])

  const fetchShipments = async () => {
    const isCarrier = profile?.role === 'carrier' || profile?.role === 'both'
    const isShipper = profile?.role === 'shipper' || profile?.role === 'both'

    let query = supabase
      .from('shipments')
      .select('*, loads(from_location, to_location, cargo_type, weight_kg), carriers(company_name)')
      .in('status', ['confirmed', 'picked_up', 'in_transit'])

    if (isShipper && !isCarrier) query = query.eq('shipper_id', user.id)

    const { data } = await query.limit(20)
    setShipments(data || [])
    setLoading(false)
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
      Object.entries(CITIES).forEach(([name, coord]) => {
        const m = new gmaps.Marker({
          position: coord, map,
          icon: { path: gmaps.SymbolPath.CIRCLE, scale: 5, fillColor: 'white', fillOpacity: 1, strokeColor: '#d6d3d1', strokeWeight: 2 },
          title: name,
        })
        const info = new gmaps.InfoWindow({ content: `<b>${name}</b>` })
        m.addListener('mouseover', () => info.open(map, m))
        m.addListener('mouseout',  () => info.close())
      })
      leafletMap.current = map
      setMapReady(true)
    }).catch(console.error)
  }

  // Render shipment markers when map + data are ready
  useEffect(() => {
    if (!mapReady || !leafletMap.current) return
    const gmaps = window.google.maps
    const map = leafletMap.current

    markersRef.current.forEach(m => { try { m.setMap(null) } catch(e){} })
    markersRef.current = []

    ;(async () => {
      const { drawRoadRoute } = await import('../lib/googleMaps')
      for (const s of shipments) {
        const from = getCity(s.loads?.from_location)
        const to   = getCity(s.loads?.to_location)
        if (!from || !to) continue

        const progress = (s.progress_pct || 20) / 100
        const pos = lerp(from, to, progress)

        const route = await drawRoadRoute(gmaps, map, from, to, { strokeColor: '#259658', strokeWeight: 2 })

        const fromPin = new gmaps.Marker({
          position: from, map,
          icon: { path: gmaps.SymbolPath.CIRCLE, scale: 5, fillColor: '#259658', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
          title: from.name,
        })
        fromPin.addListener('click', () => new gmaps.InfoWindow({ content: `<b>${from.name}</b><br>Pickup` }).open(map, fromPin))

        const truckSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><circle cx='16' cy='16' r='14' fill='%23259658' stroke='white' stroke-width='2.5'/><text x='16' y='21' font-size='13' text-anchor='middle'>🚛</text></svg>`
        const truckPin = new gmaps.Marker({
          position: pos, map,
          icon: { url: truckSvg, scaledSize: new gmaps.Size(32, 32), anchor: new gmaps.Point(16, 16) },
          title: s.carriers?.company_name || 'Carrier',
        })
        const info = new gmaps.InfoWindow({
          content: `<div style="font-family:sans-serif;min-width:160px"><b style="color:#259658">${s.reference || s.id.slice(0,8)}</b><br><span style="color:#666">${s.carriers?.company_name || 'Carrier'}</span><br><span style="font-size:11px">${s.loads?.from_location} → ${s.loads?.to_location}</span><br><span style="font-size:11px;color:#259658">● In Transit · ${Math.round(s.progress_pct || 20)}%</span></div>`,
        })
        truckPin.addListener('click', () => { info.open(map, truckPin); setSelected(s) })

        markersRef.current.push(route, fromPin, truckPin)
      }
    })()
  }, [mapReady, shipments])

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-2xl font-800 text-stone-900">Live Map</h1>
            <p className="text-sm text-stone-400">
              {loading ? 'Loading shipments...' : `${shipments.length} active shipment${shipments.length !== 1 ? 's' : ''} on the map`}
            </p>
          </div>
          <button onClick={() => { fetchShipments() }}
            className="flex items-center gap-2 text-sm text-forest-600 border border-forest-200 bg-forest-50 px-3 py-1.5 rounded-lg hover:bg-forest-100 transition-colors font-medium">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        <div className="grid lg:grid-cols-4 gap-4">
          {/* Map */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
              <div ref={mapRef} style={{ height: '560px', width: '100%' }} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[580px]">
            {/* Selected shipment */}
            {selected && (
              <div className="bg-forest-50 border border-forest-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-700 text-forest-700 text-sm">{selected.reference}</span>
                  <button onClick={() => setSelected(null)} className="text-xs text-stone-400 hover:text-stone-600">✕</button>
                </div>
                <div className="flex items-center gap-1 text-xs text-stone-600 mb-1">
                  <MapPin size={10} className="text-forest-500" />
                  {selected.loads?.from_location} → {selected.loads?.to_location}
                </div>
                <p className="text-xs text-stone-500">{selected.loads?.cargo_type} · {selected.loads?.weight_kg}kg</p>
                <div className="mt-3 flex gap-2">
                  <Link to={`/track/${selected.reference}`}
                    className="flex-1 text-center text-xs bg-forest-500 text-white py-1.5 rounded-lg font-medium hover:bg-forest-600 transition-colors">
                    Track
                  </Link>
                  <Link to="/messages"
                    className="flex-1 text-center text-xs bg-white border border-forest-200 text-forest-600 py-1.5 rounded-lg font-medium hover:bg-forest-50 transition-colors">
                    Message
                  </Link>
                </div>
              </div>
            )}

            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider px-1">Active Shipments</p>

            {loading ? (
              <div className="text-xs text-stone-400 px-1">Loading...</div>
            ) : shipments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-100 p-4 text-center">
                <Truck size={24} className="text-stone-300 mx-auto mb-2" />
                <p className="text-xs text-stone-400">No active shipments on the map</p>
              </div>
            ) : (
              shipments.map(s => (
                <div key={s.id}
                  onClick={() => setSelected(s)}
                  className={`bg-white rounded-xl border p-3 cursor-pointer transition-all hover:shadow-md ${selected?.id === s.id ? 'border-forest-300 bg-forest-50/50' : 'border-stone-100'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-display font-700 text-stone-800">{s.reference || s.id.slice(0,8)}</span>
                    <span className="text-xs text-forest-600 font-medium">● In Transit</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-stone-500">
                    <MapPin size={9} className="text-forest-500" />
                    <span>{s.loads?.from_location}</span>
                    <ArrowRight size={9} className="text-stone-300" />
                    <span>{s.loads?.to_location}</span>
                  </div>
                  <div className="mt-2 h-1 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-forest-500 rounded-full" style={{ width: `${s.progress_pct || 20}%` }} />
                  </div>
                </div>
              ))
            )}

            {/* City legend */}
            <div className="bg-white rounded-xl border border-stone-100 p-3 mt-2">
              <p className="text-xs font-medium text-stone-500 mb-2">Major Routes</p>
              {[
                'Gaborone → Francistown',
                'Francistown → Maun',
                'Gaborone → Lobatse',
                'Maun → Kasane',
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                  <div className="w-4 h-0.5 bg-forest-400 rounded" style={{ backgroundImage: 'repeating-linear-gradient(to right, #259658 0, #259658 4px, transparent 4px, transparent 8px)' }} />
                  {r}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
