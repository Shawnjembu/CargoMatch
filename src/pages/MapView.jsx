import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Truck, Package, MapPin, ArrowRight, RefreshCw } from 'lucide-react'

const CITIES = {
  'Gaborone':    { lat: -24.6282, lng: 25.9231 },
  'Francistown': { lat: -21.1667, lng: 27.5167 },
  'Maun':        { lat: -19.9833, lng: 23.4167 },
  'Kasane':      { lat: -17.8000, lng: 25.1500 },
  'Lobatse':     { lat: -25.2167, lng: 25.6833 },
  'Palapye':     { lat: -22.5500, lng: 27.1333 },
  'Serowe':      { lat: -22.3833, lng: 26.7167 },
  'Jwaneng':     { lat: -24.6025, lng: 24.7283 },
  'Molepolole':  { lat: -24.4069, lng: 25.4950 },
}

function getCity(loc) {
  if (!loc) return null
  const key = Object.keys(CITIES).find(k => loc.toLowerCase().includes(k.toLowerCase()))
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
    if (leafletMap.current) return

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      const L = window.L
      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true })
        .setView([-23.0, 25.5], 6)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 18,
      }).addTo(map)

      // Add city markers
      Object.entries(CITIES).forEach(([name, coord]) => {
        const icon = L.divIcon({
          html: `<div style="background:white;border:2px solid #d6d3d1;border-radius:50%;width:10px;height:10px;"></div>`,
          className: '', iconAnchor: [5, 5],
        })
        L.marker([coord.lat, coord.lng], { icon })
          .bindTooltip(name, { permanent: false, direction: 'top', className: 'leaflet-tooltip-city' })
          .addTo(map)
      })

      leafletMap.current = map
      setMapReady(true)
    }
    document.head.appendChild(script)

    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null } }
  }

  // Render shipment markers when map + data are ready
  useEffect(() => {
    if (!mapReady || !leafletMap.current) return
    const L = window.L
    const map = leafletMap.current

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m))
    markersRef.current = []

    shipments.forEach(s => {
      const from = getCity(s.loads?.from_location)
      const to   = getCity(s.loads?.to_location)
      if (!from || !to) return

      const progress = (s.progress_pct || 20) / 100
      const pos = lerp(from, to, progress)

      // Route line
      const line = L.polyline([[from.lat, from.lng],[to.lat, to.lng]], {
        color: '#259658', weight: 2, dashArray: '6 4', opacity: 0.5
      }).addTo(map)

      // From pin
      const fromIcon = L.divIcon({
        html: `<div style="background:#259658;border-radius:50%;width:10px;height:10px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
        className: '', iconAnchor: [5, 5],
      })
      const fromMarker = L.marker([from.lat, from.lng], { icon: fromIcon })
        .bindPopup(`<b>${from.name}</b><br>Pickup`)
        .addTo(map)

      // Truck marker
      const truckIcon = L.divIcon({
        html: `<div style="background:#259658;color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(37,150,88,0.5);border:2px solid white;font-size:13px;cursor:pointer;">🚛</div>`,
        className: '', iconAnchor: [15, 15],
      })
      const truckMarker = L.marker([pos.lat, pos.lng], { icon: truckIcon })
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:160px">
            <b style="color:#259658">${s.reference || s.id.slice(0,8)}</b><br>
            <span style="color:#666">${s.carriers?.company_name || 'Carrier'}</span><br>
            <span style="font-size:11px">${s.loads?.from_location} → ${s.loads?.to_location}</span><br>
            <span style="font-size:11px;color:#259658">● In Transit · ${Math.round(s.progress_pct || 20)}%</span>
          </div>
        `)
        .addTo(map)
        .on('click', () => setSelected(s))

      markersRef.current.push(line, fromMarker, truckMarker)
    })
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
