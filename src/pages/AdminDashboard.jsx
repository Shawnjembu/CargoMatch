import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Users, Truck, Package, DollarSign, CheckCircle, Clock,
  TrendingUp, Shield, ShieldCheck, ShieldX, Search,
  RefreshCw, MapPin, Star, ArrowRight, Eye, BarChart3
} from 'lucide-react'
import CountUp from '../components/CountUp'

const STATUS_COLORS = {
  confirmed: 'bg-purple-50 text-purple-700',
  picked_up: 'bg-blue-50 text-blue-700',
  in_transit: 'bg-blue-50 text-blue-700',
  delivered:  'bg-green-50 text-green-700',
  cancelled:  'bg-stone-100 text-stone-500',
  pending:    'bg-amber-50 text-amber-700',
  matched:    'bg-purple-50 text-purple-700',
}

function SkeletonRows({ cols = 3, rows = 4 }) {
  return (
    <div className="divide-y divide-stone-50">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
          <div className="w-9 h-9 bg-stone-100 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 bg-stone-100 rounded-full" />
            <div className="h-3 w-56 bg-stone-100 rounded-full" />
          </div>
          {cols >= 2 && <div className="h-5 w-20 bg-stone-100 rounded-full" />}
          {cols >= 3 && <div className="h-8 w-24 bg-stone-100 rounded-xl" />}
        </div>
      ))}
    </div>
  )
}

export default function AdminDashboard() {
  const { user } = useAuth()

  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState({
    totalUsers: 0, totalCarriers: 0, totalLoads: 0,
    totalShipments: 0, completedShipments: 0, estimatedRevenue: 0,
    pendingLoads: 0, activeShipments: 0, heldEscrow: 0,
  })
  const [users,     setUsers]     = useState([])
  const [carriers,  setCarriers]  = useState([])
  const [shipments, setShipments] = useState([])
  const [loads,     setLoads]     = useState([])
  const [escrow,    setEscrow]    = useState([])
  const [escrowSearch, setEscrowSearch] = useState('')

  const [usersSearch,       setUsersSearch]       = useState('')
  const [usersRoleFilter,   setUsersRoleFilter]   = useState('all')
  const [carriersSearch,    setCarriersSearch]    = useState('')
  const [shipmentsSearch,   setShipmentsSearch]   = useState('')
  const [shipmentsStatus,   setShipmentsStatus]   = useState('all')
  const [verifying,         setVerifying]         = useState(null)

  useEffect(() => {
    if (user) fetchAll()
  }, [user])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchStats(), fetchUsers(), fetchCarriers(), fetchShipments(), fetchLoads(), fetchEscrow()])
    setLoading(false)
  }

  const fetchStats = async () => {
    const [
      { count: totalUsers },
      { count: totalCarriers },
      { count: totalLoads },
      { count: totalShipments },
      { data: completedData },
      { count: pendingLoads },
      { count: activeShipments },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('carriers').select('*', { count: 'exact', head: true }),
      supabase.from('loads').select('*', { count: 'exact', head: true }),
      supabase.from('shipments').select('*', { count: 'exact', head: true }),
      supabase.from('shipments').select('price').eq('status', 'delivered'),
      supabase.from('loads').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('shipments').select('*', { count: 'exact', head: true }).in('status', ['confirmed', 'picked_up', 'in_transit']),
    ])
    const revenue = (completedData || []).reduce((s, x) => s + (x.price || 0), 0) * 0.05
    const { data: escrowData } = await supabase.from('escrow_transactions').select('amount').eq('status', 'held')
    const heldEscrow = (escrowData || []).reduce((s, x) => s + Number(x.amount || 0), 0)
    setStats({
      totalUsers: totalUsers || 0,
      totalCarriers: totalCarriers || 0,
      totalLoads: totalLoads || 0,
      totalShipments: totalShipments || 0,
      completedShipments: completedData?.length || 0,
      estimatedRevenue: revenue,
      pendingLoads: pendingLoads || 0,
      activeShipments: activeShipments || 0,
      heldEscrow,
    })
  }

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers(data || [])
  }

  const fetchCarriers = async () => {
    const { data } = await supabase
      .from('carriers')
      .select('*, profiles(full_name, phone, location)')
      .order('created_at', { ascending: false })
    setCarriers(data || [])
  }

  const fetchShipments = async () => {
    const { data } = await supabase
      .from('shipments')
      .select(`
        id, reference, status, price, created_at, delivered_at,
        loads(from_location, to_location, cargo_type, weight_kg),
        carriers(company_name),
        profiles!shipments_shipper_id_fkey(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(200)
    setShipments(data || [])
  }

  const fetchLoads = async () => {
    const { data } = await supabase
      .from('loads')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(200)
    setLoads(data || [])
  }

  const fetchEscrow = async () => {
    const { data } = await supabase
      .from('escrow_transactions')
      .select(`
        id, amount, currency, status, dpo_reference, paid_at, released_at, created_at,
        shipments(reference, profiles!shipments_shipper_id_fkey(full_name), carriers(company_name))
      `)
      .order('created_at', { ascending: false })
      .limit(200)
    setEscrow(data || [])
  }

  const toggleVerify = async (carrierId, current) => {
    setVerifying(carrierId)
    const { error } = await supabase
      .from('carriers')
      .update({ verified: !current })
      .eq('id', carrierId)
    if (!error) {
      setCarriers(cs => cs.map(c => c.id === carrierId ? { ...c, verified: !current } : c))
    }
    setVerifying(null)
  }

  // Filtered lists
  const filteredUsers = users.filter(u => {
    const q = usersSearch.toLowerCase()
    const matchQ    = !q || u.full_name?.toLowerCase().includes(q) || u.phone?.includes(q)
    const matchRole = usersRoleFilter === 'all' || u.role === usersRoleFilter
    return matchQ && matchRole
  })

  const filteredCarriers = carriers.filter(c => {
    const q = carriersSearch.toLowerCase()
    return !q || c.company_name?.toLowerCase().includes(q) || c.profiles?.full_name?.toLowerCase().includes(q)
  })

  const filteredShipments = shipments.filter(s => {
    const q = shipmentsSearch.toLowerCase()
    const matchQ = !q
      || s.reference?.toLowerCase().includes(q)
      || s.loads?.from_location?.toLowerCase().includes(q)
      || s.loads?.to_location?.toLowerCase().includes(q)
      || s.carriers?.company_name?.toLowerCase().includes(q)
    const matchStatus = shipmentsStatus === 'all' || s.status === shipmentsStatus
    return matchQ && matchStatus
  })

  const filteredEscrow = escrow.filter(e => {
    const q = escrowSearch.toLowerCase()
    return !q
      || e.shipments?.reference?.toLowerCase().includes(q)
      || e.shipments?.carriers?.company_name?.toLowerCase().includes(q)
      || e.shipments?.profiles?.full_name?.toLowerCase().includes(q)
  })

  const TABS = [
    { id: 'overview',  label: '📊 Overview' },
    { id: 'users',     label: '👥 Users',     badge: stats.totalUsers },
    { id: 'carriers',  label: '🚛 Carriers',  badge: stats.totalCarriers },
    { id: 'shipments', label: '📦 Shipments', badge: stats.totalShipments },
    { id: 'loads',     label: '📋 Loads',     badge: stats.pendingLoads },
    { id: 'escrow',    label: '💰 Escrow',    badge: escrow.filter(e => e.status === 'held').length },
  ]

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 pt-28 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <span className="inline-flex items-center gap-1 text-xs bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-medium mb-2">
              <Shield size={10} /> Admin Access
            </span>
            <h1 className="font-display text-3xl font-800 text-stone-900">Admin Panel</h1>
            <p className="text-sm text-stone-400 mt-0.5">Platform management & oversight</p>
          </div>
          <button onClick={fetchAll}
            className="p-2 text-stone-400 hover:text-stone-600 border border-stone-200 rounded-xl transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-stone-100 p-1 rounded-xl w-fit flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}>
              {t.label}
              {t.badge > 0 && (
                <span className="w-5 h-5 bg-stone-400 text-white text-xs rounded-full flex items-center justify-center">
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6">

            {/* KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Users',      value: stats.totalUsers,          icon: Users,       color: 'text-blue-600 bg-blue-50',     sub: 'Registered accounts' },
                { label: 'Carriers',         value: stats.totalCarriers,       icon: Truck,       color: 'text-forest-600 bg-forest-50', sub: 'Transport providers' },
                { label: 'Loads Posted',     value: stats.totalLoads,          icon: Package,     color: 'text-amber-600 bg-amber-50',   sub: `${stats.pendingLoads} pending` },
                { label: 'Total Shipments',  value: stats.totalShipments,      icon: TrendingUp,  color: 'text-purple-600 bg-purple-50', sub: `${stats.completedShipments} delivered` },
                { label: 'Active Shipments', value: stats.activeShipments,     icon: Truck,       color: 'text-blue-600 bg-blue-50',     sub: 'On the road now' },
                { label: 'Completed',        value: stats.completedShipments,  icon: CheckCircle, color: 'text-forest-600 bg-forest-50', sub: 'Successful deliveries' },
                { label: 'Est. Revenue',     value: `P ${stats.estimatedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50', sub: '5% commission model' },
                { label: 'Pending Loads',    value: stats.pendingLoads,        icon: Clock,       color: 'text-amber-600 bg-amber-50',   sub: 'Awaiting a carrier' },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-2xl border border-stone-100 p-5 animate-slideUp"
                  style={{ animationDelay: `${i * 55}ms` }}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
                    <s.icon size={18} />
                  </div>
                  {loading
                    ? <div className="h-7 w-16 bg-stone-100 rounded animate-pulse mb-1" />
                    : <p className="font-display text-2xl font-800 text-stone-900">
                        {typeof s.value === 'number'
                          ? <CountUp to={s.value} duration={1000 + i * 80} />
                          : s.value}
                      </p>
                  }
                  <p className="text-xs font-medium text-stone-700 mt-0.5">{s.label}</p>
                  <p className="text-xs text-stone-400">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-stone-100 p-6">
              <h3 className="font-display font-700 text-stone-900 mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-3">
                {[
                  { tab: 'carriers',  label: 'Manage Verifications', icon: ShieldCheck, color: 'bg-forest-50 hover:bg-forest-100 text-forest-700 border-forest-200' },
                  { tab: 'users',     label: 'View All Users',       icon: Users,       color: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200' },
                  { tab: 'shipments', label: 'Monitor Shipments',    icon: Package,     color: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200' },
                  { tab: 'loads',     label: 'Review Pending Loads', icon: Clock,       color: 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' },
                ].map(a => (
                  <button key={a.tab} onClick={() => setTab(a.tab)}
                    className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors border ${a.color}`}>
                    <a.icon size={14} /> {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent shipments */}
            <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
                <h3 className="font-display font-700 text-stone-900">Recent Shipments</h3>
                <button onClick={() => setTab('shipments')} className="text-xs text-forest-600 font-medium hover:text-forest-700">View all →</button>
              </div>
              {loading ? (
                <SkeletonRows cols={2} rows={4} />
              ) : shipments.length === 0 ? (
                <div className="p-12 text-center text-stone-400 text-sm">No shipments yet.</div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {shipments.slice(0, 6).map(s => (
                    <div key={s.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-stone-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-700 text-stone-900">{s.reference}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] || 'bg-stone-100 text-stone-500'}`}>
                            {s.status?.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-stone-400">
                          <MapPin size={10} className="text-forest-400" />
                          <span>{s.loads?.from_location} → {s.loads?.to_location}</span>
                          {s.carriers?.company_name && <span className="ml-2">· {s.carriers.company_name}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-700 text-forest-600">P {(s.price || 0).toLocaleString()}</p>
                        <p className="text-xs text-stone-400">{new Date(s.created_at).toLocaleDateString()}</p>
                      </div>
                      <Link to={`/track/${s.reference}`}
                        className="p-2 text-stone-400 hover:text-forest-600 rounded-lg hover:bg-forest-50 transition-colors flex-shrink-0">
                        <Eye size={14} />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── USERS ────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">All Users</h2>
              <span className="text-xs text-stone-400">{filteredUsers.length} of {users.length}</span>
            </div>
            <div className="px-5 py-3 border-b border-stone-100 flex flex-wrap gap-2 bg-stone-50/50">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input type="text" placeholder="Search name or phone..." value={usersSearch}
                  onChange={e => setUsersSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white" />
              </div>
              <select value={usersRoleFilter} onChange={e => setUsersRoleFilter(e.target.value)}
                className="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300">
                <option value="all">All Roles</option>
                <option value="shipper">Shippers</option>
                <option value="carrier">Carriers</option>
                <option value="both">Both</option>
              </select>
            </div>
            {loading ? (
              <SkeletonRows cols={2} rows={5} />
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm">No users found.</div>
            ) : (
              <div className="divide-y divide-stone-50 animate-fadeIn">
                {filteredUsers.map((u, idx) => (
                  <div key={u.id} className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-all animate-slideUp"
                    style={{ animationDelay: `${idx * 30}ms` }}>
                    <div className="w-9 h-9 bg-forest-100 rounded-full flex items-center justify-center font-display font-700 text-sm text-forest-700 flex-shrink-0">
                      {u.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900">{u.full_name}</p>
                      <p className="text-xs text-stone-400">
                        {u.phone || 'No phone'}{u.location ? ` · ${u.location}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        u.role === 'shipper' ? 'bg-blue-50 text-blue-700' :
                        u.role === 'carrier' ? 'bg-forest-50 text-forest-700' :
                        'bg-purple-50 text-purple-700'
                      }`}>{u.role}</span>
                      {u.is_admin && (
                        <span className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <Shield size={9} /> Admin
                        </span>
                      )}
                      <span className="text-xs text-stone-400 hidden sm:block">
                        {new Date(u.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CARRIERS ─────────────────────────────────────────── */}
        {tab === 'carriers' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">Carrier Management</h2>
              <span className="text-xs text-stone-400">
                {carriers.filter(c => c.verified).length} verified · {carriers.filter(c => !c.verified).length} unverified
              </span>
            </div>
            <div className="px-5 py-3 border-b border-stone-100 bg-stone-50/50">
              <div className="relative max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input type="text" placeholder="Search carriers..." value={carriersSearch}
                  onChange={e => setCarriersSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white" />
              </div>
            </div>
            {loading ? (
              <SkeletonRows cols={3} rows={4} />
            ) : filteredCarriers.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm">No carriers registered yet.</div>
            ) : (
              <div className="divide-y divide-stone-50 animate-fadeIn">
                {filteredCarriers.map((c, idx) => (
                  <div key={c.id} className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-all animate-slideUp"
                    style={{ animationDelay: `${idx * 35}ms` }}>
                    <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Truck size={18} className="text-stone-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-700 text-stone-900">{c.company_name}</p>
                        {c.verified  && <ShieldCheck size={13} className="text-forest-500" />}
                        {c.top_carrier && <Star size={13} className="text-amber-500 fill-amber-400" />}
                      </div>
                      <p className="text-xs text-stone-400">
                        {c.profiles?.full_name || 'Unknown owner'}
                        {c.rating > 0 && ` · ★ ${c.rating}`}
                        {` · ${c.total_trips || 0} trips`}
                        {c.profiles?.location ? ` · ${c.profiles.location}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        c.verified
                          ? 'bg-forest-50 text-forest-700 border-forest-200'
                          : 'bg-stone-100 text-stone-500 border-stone-200'
                      }`}>
                        {c.verified ? 'Verified' : 'Unverified'}
                      </span>
                      <button onClick={() => toggleVerify(c.id, c.verified)}
                        disabled={verifying === c.id}
                        className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-colors border disabled:opacity-50 ${
                          c.verified
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                            : 'bg-forest-50 hover:bg-forest-100 text-forest-700 border-forest-200'
                        }`}>
                        {verifying === c.id
                          ? '...'
                          : c.verified
                            ? <><ShieldX size={12} /> Revoke</>
                            : <><ShieldCheck size={12} /> Verify</>
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SHIPMENTS ────────────────────────────────────────── */}
        {tab === 'shipments' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">All Shipments</h2>
              <span className="text-xs text-stone-400">{filteredShipments.length} shown</span>
            </div>
            <div className="px-5 py-3 border-b border-stone-100 flex flex-wrap gap-2 bg-stone-50/50">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input type="text" placeholder="Search ref, route, carrier..." value={shipmentsSearch}
                  onChange={e => setShipmentsSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white" />
              </div>
              <select value={shipmentsStatus} onChange={e => setShipmentsStatus(e.target.value)}
                className="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300">
                <option value="all">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="picked_up">Picked Up</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            {loading ? (
              <SkeletonRows cols={3} rows={5} />
            ) : filteredShipments.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm">No shipments found.</div>
            ) : (
              <div className="divide-y divide-stone-50">
                {filteredShipments.map(s => (
                  <div key={s.id} className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-700 text-stone-900">{s.reference}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] || 'bg-stone-100 text-stone-500'}`}>
                          {s.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-stone-400">
                        <MapPin size={10} className="text-forest-400" />
                        <span className="font-medium text-stone-600">{s.loads?.from_location}</span>
                        <ArrowRight size={9} className="text-stone-300" />
                        <span className="font-medium text-stone-600">{s.loads?.to_location}</span>
                        {s.loads?.cargo_type && <span className="ml-2">{s.loads.cargo_type} · {s.loads.weight_kg}kg</span>}
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {s.carriers?.company_name && `Carrier: ${s.carriers.company_name}`}
                        {s.profiles?.full_name && ` · Shipper: ${s.profiles.full_name}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-700 text-forest-600">P {(s.price || 0).toLocaleString()}</p>
                      <p className="text-xs text-stone-400">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    <Link to={`/track/${s.reference}`}
                      className="p-2 text-stone-400 hover:text-forest-600 rounded-lg hover:bg-forest-50 transition-colors flex-shrink-0">
                      <Eye size={14} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LOADS ────────────────────────────────────────────── */}
        {tab === 'loads' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="font-display font-700 text-stone-900">All Loads</h2>
              <span className="text-xs text-stone-400">{loads.length} total · {stats.pendingLoads} pending</span>
            </div>
            {loading ? (
              <SkeletonRows cols={2} rows={5} />
            ) : loads.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm">No loads posted yet.</div>
            ) : (
              <div className="divide-y divide-stone-50">
                {loads.map(l => (
                  <div key={l.id} className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors">
                    {l.image_url && (
                      <img src={l.image_url} alt="cargo"
                        className="w-10 h-10 object-cover rounded-xl border border-stone-200 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-700 text-stone-700">{l.id.slice(0, 8).toUpperCase()}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[l.status] || 'bg-stone-100 text-stone-500'}`}>
                          {l.status}
                        </span>
                        {l.urgent  && <span className="text-xs bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-full font-medium">Urgent</span>}
                        {l.pooling && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">Pooled</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-stone-400">
                        <MapPin size={10} className="text-forest-400" />
                        <span>{l.from_location} → {l.to_location}</span>
                        <span className="ml-2">{l.cargo_type} · {l.weight_kg}kg</span>
                        {l.profiles?.full_name && <span className="ml-2">· {l.profiles.full_name}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-700 text-forest-600">P {(l.price_estimate || 0).toLocaleString()}</p>
                      <p className="text-xs text-stone-400">{new Date(l.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ESCROW ───────────────────────────────────────────── */}
        {tab === 'escrow' && (
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 flex-wrap gap-3">
              <div>
                <h2 className="font-display font-700 text-stone-900">Escrow Transactions</h2>
                <p className="text-xs text-stone-400 mt-0.5">
                  {escrow.filter(e => e.status === 'held').length} held ·{' '}
                  P {stats.heldEscrow.toLocaleString()} total in escrow
                </p>
              </div>
              <input type="text" placeholder="Search reference or carrier..."
                value={escrowSearch} onChange={e => setEscrowSearch(e.target.value)}
                className="border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 w-60" />
            </div>
            {loading ? <SkeletonRows cols={3} rows={5} /> : filteredEscrow.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm">No escrow transactions yet.</div>
            ) : (
              <div className="divide-y divide-stone-50">
                {filteredEscrow.map(e => (
                  <div key={e.id} className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      e.status === 'released' ? 'bg-forest-100' : e.status === 'held' ? 'bg-amber-100' : 'bg-stone-100'
                    }`}>
                      <DollarSign size={18} className={e.status === 'released' ? 'text-forest-600' : e.status === 'held' ? 'text-amber-600' : 'text-stone-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-700 text-stone-900">
                          {e.shipments?.reference || e.id.slice(0,8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                          e.status === 'released' ? 'bg-forest-50 text-forest-700' :
                          e.status === 'held'     ? 'bg-amber-50 text-amber-700' :
                          e.status === 'refunded' ? 'bg-rose-50 text-rose-700' :
                          'bg-stone-100 text-stone-500'
                        }`}>{e.status}</span>
                      </div>
                      <p className="text-xs text-stone-400">
                        {e.shipments?.profiles?.full_name || 'Shipper'} →{' '}
                        {e.shipments?.carriers?.company_name || 'Carrier'}
                        {e.dpo_reference && ` · DPO: ${e.dpo_reference}`}
                      </p>
                      <p className="text-xs text-stone-300 mt-0.5">
                        Paid: {e.paid_at ? new Date(e.paid_at).toLocaleDateString('en-GB') : '—'}
                        {e.released_at && ` · Released: ${new Date(e.released_at).toLocaleDateString('en-GB')}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-display font-700 text-stone-900">P {Number(e.amount).toLocaleString()}</p>
                      <p className="text-xs text-stone-400">{e.currency}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
