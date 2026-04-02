import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Users, Truck, Package, DollarSign, CheckCircle, Clock,
  TrendingUp, Shield, ShieldCheck, ShieldX, Search,
  RefreshCw, MapPin, Star, ArrowRight, Eye, BarChart3,
  AlertTriangle, ChevronRight, X, Headphones, Send, Trash2, AlertCircle
} from 'lucide-react'
import CountUp from '../components/CountUp'
import { emailDisputeUpdated } from '../lib/emailNotify'

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
    totalShipments: 0, completedShipments: 0,
    pendingLoads: 0, activeShipments: 0,
    mrr: 0, tierCounts: { trial: 0, basic: 0, pro: 0, enterprise: 0 },
  })
  const [users,     setUsers]     = useState([])
  const [carriers,  setCarriers]  = useState([])
  const [shipments, setShipments] = useState([])
  const [loads,     setLoads]     = useState([])

  const [usersSearch,       setUsersSearch]       = useState('')
  const [usersRoleFilter,   setUsersRoleFilter]   = useState('all')
  const [carriersSearch,    setCarriersSearch]    = useState('')
  const [shipmentsSearch,   setShipmentsSearch]   = useState('')
  const [shipmentsStatus,   setShipmentsStatus]   = useState('all')
  const [verifying,         setVerifying]         = useState(null)
  const [disputes,          setDisputes]          = useState([])
  const [disputesSearch,    setDisputesSearch]    = useState('')
  const [selectedDispute,   setSelectedDispute]   = useState(null) // dispute for detail panel
  const [resolutionNote,    setResolutionNote]    = useState('')
  const [updatingDispute,   setUpdatingDispute]   = useState(null)
  const [editRoleModal,     setEditRoleModal]     = useState(null)   // profile obj being edited
  const [newRole,           setNewRole]           = useState('')
  const [savingRole,        setSavingRole]        = useState(false)
  const [roleError,         setRoleError]         = useState('')
  const [expandedUserId,    setExpandedUserId]    = useState(null)   // carrier quick-view
  const [supportThreads,    setSupportThreads]    = useState([])     // support chat threads
  const [activeSupportId,   setActiveSupportId]   = useState(null)   // selected thread id
  const [supportInput,      setSupportInput]       = useState('')
  const [sendingSupport,    setSendingSupport]     = useState(false)
  const [deleteModal,       setDeleteModal]        = useState(null)   // user being confirmed for deletion
  const [deletingUser,      setDeletingUser]       = useState(false)
  const [deleteError,       setDeleteError]        = useState('')

  useEffect(() => {
    if (user) fetchAll()
  }, [user])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchStats(), fetchUsers(), fetchCarriers(), fetchShipments(), fetchLoads(), fetchDisputes()])
    setLoading(false)
  }

  const fetchSupportThreads = async () => {
    const { data: threads } = await supabase
      .from('support_threads')
      .select('id, status, created_at, user_id, profiles!support_threads_user_id_fkey(full_name, email)')
      .order('updated_at', { ascending: false })
    if (!threads) return
    const enriched = await Promise.all(threads.map(async t => {
      const { data: msgs } = await supabase
        .from('support_messages')
        .select('*')
        .eq('thread_id', t.id)
        .order('created_at', { ascending: true })
      const unread = (msgs || []).filter(m => m.sender_id === t.user_id && !m.read).length
      const last = msgs?.[msgs.length - 1]
      return { ...t, messages: msgs || [], unread, lastMessage: last?.body || '', lastTime: last?.created_at || t.created_at }
    }))
    setSupportThreads(enriched)
  }

  const sendSupportReply = async (threadId, userId) => {
    if (!supportInput.trim()) return
    setSendingSupport(true)
    const body = supportInput.trim()
    setSupportInput('')
    await supabase.from('support_messages').insert({ thread_id: threadId, sender_id: user.id, body })
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'system',
      title: 'Support reply',
      body: body.slice(0, 80),
      link: '/messages',
    })
    // Mark user messages as read
    await supabase.from('support_messages').update({ read: true }).eq('thread_id', threadId).eq('sender_id', userId)
    fetchSupportThreads()
    setSendingSupport(false)
  }

  useEffect(() => {
    if (tab === 'support') fetchSupportThreads()
  }, [tab])

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
    const { data: subsData } = await supabase
      .from('carrier_subscriptions')
      .select('subscription_tier')
      .in('subscription_tier', ['trial', 'basic', 'pro', 'enterprise'])
    const tierCounts = { trial: 0, basic: 0, pro: 0, enterprise: 0 }
    ;(subsData || []).forEach(s => { if (tierCounts[s.subscription_tier] !== undefined) tierCounts[s.subscription_tier]++ })
    const mrr = tierCounts.basic * 150 + tierCounts.pro * 350 + tierCounts.enterprise * 750
    setStats({
      totalUsers: totalUsers || 0,
      totalCarriers: totalCarriers || 0,
      totalLoads: totalLoads || 0,
      totalShipments: totalShipments || 0,
      completedShipments: completedData?.length || 0,
      pendingLoads: pendingLoads || 0,
      activeShipments: activeShipments || 0,
      mrr,
      tierCounts,
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
      .select('*, profiles(full_name, phone, location), carrier_subscriptions(subscription_tier, status)')
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

  const fetchDisputes = async () => {
    try {
      const { data, error } = await supabase
        .from('disputes')
        .select(`
          id, reason, details, status, created_at, resolved_at, resolution_note,
          shipment_id,
          shipments(reference, shipper_id, carrier_id,
            profiles!shipments_shipper_id_fkey(full_name),
            carriers(company_name, user_id)
          ),
          profiles!disputes_raised_by_fkey(full_name, role)
        `)
        .order('created_at', { ascending: false})
      
      if (error) {
        if (import.meta.env.DEV) console.error('[AdminDashboard] fetchDisputes error:', error)
        return
      }
      
      setDisputes(data || [])
    } catch (err) {
      if (import.meta.env.DEV) console.error('[AdminDashboard] fetchDisputes exception:', err)
    }
  }

  const updateDisputeStatus = async (disputeId, newStatus, note) => {
    setUpdatingDispute(disputeId)
    const updates = {
      status:      newStatus,
      resolution_note: note || null,
      ...(newStatus === 'resolved' || newStatus === 'dismissed' ? { resolved_at: new Date().toISOString() } : {}),
    }
    const { error } = await supabase.from('disputes').update(updates).eq('id', disputeId)
    if (!error) {
      // Notify both parties
      const dispute = disputes.find(d => d.id === disputeId)
      if (dispute?.shipments) {
        const notifBody = `Dispute on shipment ${dispute.shipments.reference} is now: ${newStatus.replace('_', ' ')}${note ? ` — "${note}"` : ''}`
        const toNotify = [
          dispute.shipments.shipper_id,
          dispute.shipments.carriers?.user_id,
        ].filter(Boolean)
        if (toNotify.length > 0) {
          await supabase.from('notifications').insert(
            toNotify.map(uid => ({
              user_id: uid,
              type:    'alert',
              title:   'Dispute status updated',
              body:    notifBody,
              link:    uid === dispute.shipments.shipper_id ? '/shipper' : '/carrier',
            }))
          )
          // Fire-and-forget emails to both parties
          toNotify.forEach(uid => emailDisputeUpdated({
            userId:      uid,
            shipmentRef: dispute.shipments.reference,
            newStatus,
            note,
          }))
        }
      }
      setDisputes(ds => ds.map(d => d.id === disputeId ? { ...d, ...updates } : d))
      if (selectedDispute?.id === disputeId) setSelectedDispute(d => ({ ...d, ...updates }))
    }
    setUpdatingDispute(null)
  }

  const fetchLoads = async () => {
    const { data } = await supabase
      .from('loads')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(200)
    setLoads(data || [])
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

  const openEditRole = (u) => {
    setEditRoleModal(u)
    setNewRole(u.role)
    setRoleError('')
  }

  const updateUserRole = async () => {
    if (!editRoleModal || !newRole) return
    if (editRoleModal.id === user.id) {
      setRoleError("You cannot change your own role.")
      return
    }
    setSavingRole(true)
    setRoleError('')
    if (import.meta.env.DEV) {
      console.warn('[CargoMatch Admin] Role override:', editRoleModal.full_name, editRoleModal.role, '→', newRole)
    }
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', editRoleModal.id)
    if (error) {
      setRoleError(error.message || 'Failed to update role.')
    } else {
      setUsers(us => us.map(u => u.id === editRoleModal.id ? { ...u, role: newRole } : u))
      setEditRoleModal(null)
    }
    setSavingRole(false)
  }

  const deleteUser = async () => {
    if (!deleteModal) return
    setDeletingUser(true)
    setDeleteError('')
    
    try {
      // Call the Supabase RPC function to delete user
      const { data, error } = await supabase.rpc('admin_delete_user', {
        target_user_id: deleteModal.id
      })

      if (error) {
        setDeleteError(error.message || 'Failed to delete user')
        if (import.meta.env.DEV) console.error('[Admin] Delete error:', error)
        setDeletingUser(false)
        return
      }

      // Check the response from the function
      if (data && !data.success) {
        setDeleteError(data.error || 'Failed to delete user')
        setDeletingUser(false)
        return
      }

      // Success - remove from local state
      setUsers(prev => prev.filter(u => u.id !== deleteModal.id))
      setCarriers(prev => prev.filter(c => c.user_id !== deleteModal.id))
      setDeleteModal(null)
      
      // Show success notification
      if (import.meta.env.DEV) {
        console.log('[Admin] User deleted successfully:', deleteModal.full_name)
      }
    } catch (err) {
      setDeleteError(err.message || 'An unexpected error occurred')
      if (import.meta.env.DEV) console.error('[Admin] Delete exception:', err)
    } finally {
      setDeletingUser(false)
    }
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

  const openDisputes = disputes.filter(d => d.status === 'open' || d.status === 'under_review').length

  const openSupportThreads = supportThreads.filter(t => t.status === 'open' && t.unread > 0).length

  const TABS = [
    { id: 'overview',  label: '📊 Overview' },
    { id: 'users',     label: '👥 Users',     badge: stats.totalUsers },
    { id: 'carriers',  label: '🚛 Carriers',  badge: stats.totalCarriers },
    { id: 'shipments', label: '📦 Shipments', badge: stats.totalShipments },
    { id: 'loads',     label: '📋 Loads',     badge: stats.pendingLoads },
    { id: 'disputes',  label: '⚠️ Disputes',  badge: openDisputes },
    { id: 'support',   label: '💬 Support',   badge: openSupportThreads },
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
                { label: 'Monthly Revenue',   value: `P ${(stats.mrr || 0).toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50', sub: `${stats.tierCounts?.basic || 0} Basic · ${stats.tierCounts?.pro || 0} Pro · ${stats.tierCounts?.enterprise || 0} Enterprise` },
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
          <>
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
              <SkeletonRows cols={3} rows={5} />
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm">No users found.</div>
            ) : (
              <div className="divide-y divide-stone-50 animate-fadeIn">
                {filteredUsers.map((u, idx) => {
                  const carrierRecord = carriers.find(c => c.user_id === u.id)
                  const isExpanded = expandedUserId === u.id
                  const isSelf = u.id === user.id
                  return (
                    <div key={u.id} className="animate-slideUp" style={{ animationDelay: `${idx * 30}ms` }}>
                      <div className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-all">
                        <div className="w-9 h-9 bg-forest-100 rounded-full flex items-center justify-center font-display font-700 text-sm text-forest-700 flex-shrink-0">
                          {u.full_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900">{u.full_name}{isSelf && <span className="ml-1 text-xs text-stone-400">(you)</span>}</p>
                          <p className="text-xs text-stone-400">
                            {u.phone || 'No phone'}{u.company_name ? ` · ${u.company_name}` : ''}
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
                          {/* Edit role — disabled for self and admins */}
                          {!isSelf && !u.is_admin && (
                            <>
                              <button
                                onClick={() => openEditRole(u)}
                                className="text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors"
                              >
                                Edit Role
                              </button>
                              <button
                                onClick={() => setDeleteModal(u)}
                                className="text-xs p-1.5 border border-rose-200 rounded-lg hover:bg-rose-50 text-rose-600 transition-colors"
                                title="Delete user"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          {/* Carrier quick-view toggle */}
                          {carrierRecord && (
                            <button
                              onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                              className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-forest-50 text-forest-600' : 'text-stone-400 hover:bg-stone-100'}`}
                            >
                              <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Carrier quick-view panel */}
                      {isExpanded && carrierRecord && (
                        <div className="mx-6 mb-4 bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs text-stone-600">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <p className="text-stone-400 mb-0.5">Company</p>
                              <p className="font-medium text-stone-800">{carrierRecord.company_name || '—'}</p>
                            </div>
                            <div>
                              <p className="text-stone-400 mb-0.5">Subscription</p>
                              <p className={`font-medium capitalize ${
                                carrierRecord.carrier_subscriptions?.subscription_tier === 'pro'        ? 'text-forest-700' :
                                carrierRecord.carrier_subscriptions?.subscription_tier === 'enterprise' ? 'text-purple-700' :
                                carrierRecord.carrier_subscriptions?.subscription_tier === 'basic'      ? 'text-blue-700' :
                                'text-stone-500'
                              }`}>
                                {carrierRecord.carrier_subscriptions?.subscription_tier || 'None'}
                              </p>
                            </div>
                            <div>
                              <p className="text-stone-400 mb-0.5">Truck type</p>
                              <p className="font-medium text-stone-800">{carrierRecord.truck_type || '—'}</p>
                            </div>
                            <div>
                              <p className="text-stone-400 mb-0.5">Verified</p>
                              <div className="flex items-center gap-1.5">
                                {carrierRecord.verified
                                  ? <><ShieldCheck size={12} className="text-forest-500" /><span className="text-forest-700 font-medium">Yes</span></>
                                  : <><ShieldX size={12} className="text-stone-400" /><span className="text-stone-500">No</span></>
                                }
                                <button
                                  onClick={() => toggleVerify(carrierRecord.id, carrierRecord.verified)}
                                  disabled={verifying === carrierRecord.id}
                                  className="ml-1 px-2 py-0.5 rounded border border-stone-300 hover:bg-white transition-colors disabled:opacity-50"
                                >
                                  {verifying === carrierRecord.id ? '…' : carrierRecord.verified ? 'Revoke' : 'Verify'}
                                </button>
                              </div>
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

          {/* ── Edit Role Modal ───────────────────────────────── */}
          {editRoleModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setEditRoleModal(null)}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7" onClick={e => e.stopPropagation()}>
                <button onClick={() => setEditRoleModal(null)} className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100">
                  <X size={16} />
                </button>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-display font-700 text-stone-900">Edit Role</h3>
                    <p className="text-xs text-stone-400">{editRoleModal.full_name}</p>
                  </div>
                </div>

                {roleError && (
                  <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4">
                    <AlertTriangle size={13} className="flex-shrink-0" /> {roleError}
                  </div>
                )}

                <div className="mb-5">
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Role</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white"
                  >
                    <option value="shipper">Shipper</option>
                    <option value="carrier">Carrier</option>
                    <option value="both">Both</option>
                  </select>
                  <p className="text-xs text-stone-400 mt-1.5">
                    Current role: <span className="font-medium text-stone-600 capitalize">{editRoleModal.role}</span>
                  </p>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setEditRoleModal(null)}
                    className="flex-1 py-2.5 border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={updateUserRole}
                    disabled={savingRole || newRole === editRoleModal.role}
                    className="flex-1 py-2.5 bg-forest-600 hover:bg-forest-700 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {savingRole ? 'Saving…' : 'Save Role'}
                  </button>
                </div>
              </div>
            </div>
          )}
          </>
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

        {/* ── DISPUTES ─────────────────────────────────────────── */}
        {tab === 'disputes' && (() => {
          const DISPUTE_COLORS = {
            open:         'bg-rose-50 text-rose-700 border-rose-200',
            under_review: 'bg-amber-50 text-amber-700 border-amber-200',
            resolved:     'bg-forest-50 text-forest-700 border-forest-200',
            dismissed:    'bg-stone-100 text-stone-500 border-stone-200',
          }
          const filtered = disputes.filter(d => {
            const q = disputesSearch.toLowerCase()
            return !q
              || d.shipments?.reference?.toLowerCase().includes(q)
              || d.reason?.toLowerCase().includes(q)
              || d.profiles?.full_name?.toLowerCase().includes(q)
          })
          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* List */}
              <div className={`bg-white rounded-2xl border border-stone-100 overflow-hidden ${selectedDispute ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 gap-3">
                  <h2 className="font-display font-700 text-stone-900 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-500" /> Disputes
                    {openDisputes > 0 && (
                      <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-full font-medium">{openDisputes} open</span>
                    )}
                  </h2>
                  <div className="relative flex-1 max-w-xs">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input value={disputesSearch} onChange={e => setDisputesSearch(e.target.value)}
                      placeholder="Search reference, reason, name…"
                      className="w-full pl-8 pr-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-300" />
                  </div>
                </div>
                {loading ? <SkeletonRows cols={3} rows={5} /> : filtered.length === 0 ? (
                  <div className="p-12 text-center text-stone-400 text-sm">
                    <AlertTriangle size={28} className="mx-auto mb-3 text-stone-300" />
                    {disputesSearch ? 'No disputes match your search.' : 'No disputes yet.'}
                  </div>
                ) : (
                  <div className="divide-y divide-stone-50">
                    {filtered.map(d => (
                      <button key={d.id} onClick={() => { setSelectedDispute(d); setResolutionNote(d.resolution_note || '') }}
                        className={`w-full flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors text-left ${selectedDispute?.id === d.id ? 'bg-forest-50/40' : ''}`}>
                        <div className="w-9 h-9 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <AlertTriangle size={15} className="text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-sm font-700 text-stone-900">{d.shipments?.reference || '—'}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${DISPUTE_COLORS[d.status] || ''}`}>
                              {d.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-stone-600 truncate">{d.reason}</p>
                          <p className="text-xs text-stone-400 mt-0.5">
                            Raised by {d.profiles?.full_name || '—'} ({d.profiles?.role || '—'}) ·{' '}
                            {new Date(d.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <ChevronRight size={14} className="text-stone-300 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Detail panel */}
              {selectedDispute && (
                <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden h-fit">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                    <h3 className="font-display font-700 text-stone-900 text-sm">Dispute Detail</h3>
                    <button onClick={() => setSelectedDispute(null)} className="p-1 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100">
                      <X size={15} />
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <p className="text-xs text-stone-400 mb-1">Shipment</p>
                      <p className="text-sm font-700 text-stone-900">{selectedDispute.shipments?.reference}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-400 mb-1">Raised by</p>
                      <p className="text-sm text-stone-800">
                        {selectedDispute.profiles?.full_name} <span className="text-stone-400">({selectedDispute.profiles?.role})</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-400 mb-1">Reason</p>
                      <p className="text-sm text-stone-800">{selectedDispute.reason}</p>
                    </div>
                    {selectedDispute.details && (
                      <div>
                        <p className="text-xs text-stone-400 mb-1">Details</p>
                        <p className="text-sm text-stone-600 leading-relaxed">{selectedDispute.details}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-stone-400 mb-1">Date raised</p>
                      <p className="text-sm text-stone-600">{new Date(selectedDispute.created_at).toLocaleString()}</p>
                    </div>
                    {selectedDispute.resolved_at && (
                      <div>
                        <p className="text-xs text-stone-400 mb-1">Resolved at</p>
                        <p className="text-sm text-stone-600">{new Date(selectedDispute.resolved_at).toLocaleString()}</p>
                      </div>
                    )}

                    <div className="pt-3 border-t border-stone-100 space-y-3">
                      <p className="text-xs font-medium text-stone-600">Update Status</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { s: 'under_review', label: 'Under Review', color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
                          { s: 'resolved',     label: 'Resolved',     color: 'bg-forest-50 text-forest-700 border-forest-200 hover:bg-forest-100' },
                          { s: 'dismissed',    label: 'Dismissed',    color: 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200' },
                          { s: 'open',         label: 'Re-open',      color: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
                        ].map(({ s, label, color }) => (
                          <button key={s}
                            disabled={selectedDispute.status === s || updatingDispute === selectedDispute.id}
                            onClick={() => updateDisputeStatus(selectedDispute.id, s, resolutionNote)}
                            className={`text-xs font-medium py-2 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${color}`}>
                            {updatingDispute === selectedDispute.id ? '…' : label}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-600 mb-1.5">Resolution note (optional)</label>
                        <textarea
                          value={resolutionNote}
                          onChange={e => setResolutionNote(e.target.value)}
                          rows={3}
                          placeholder="Add a note for both parties…"
                          className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-300 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── SUPPORT ───────────────────────────────────────── */}
        {tab === 'support' && (
          <div className="flex gap-6 h-[70vh]">
            {/* Thread list */}
            <div className="w-72 flex-shrink-0 bg-white rounded-2xl border border-stone-100 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <span className="font-display font-700 text-stone-900 text-sm">Support Threads</span>
                <button onClick={fetchSupportThreads} className="text-stone-400 hover:text-forest-600"><RefreshCw size={13} /></button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-stone-50">
                {supportThreads.length === 0 && (
                  <div className="p-6 text-center text-xs text-stone-400">No support threads yet.</div>
                )}
                {supportThreads.map(t => (
                  <button key={t.id} onClick={() => setActiveSupportId(t.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors ${activeSupportId === t.id ? 'bg-forest-50 border-l-2 border-l-forest-500' : ''}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-display font-700 text-stone-900 text-xs truncate">{t.profiles?.full_name || 'User'}</span>
                      {t.unread > 0 && <span className="w-4 h-4 bg-rose-500 text-white text-xs rounded-full flex items-center justify-center font-medium">{t.unread}</span>}
                    </div>
                    <p className="text-xs text-stone-500 truncate">{t.lastMessage || 'No messages'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${t.status === 'open' ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'}`}>{t.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat panel */}
            {activeSupportId ? (() => {
              const thread = supportThreads.find(t => t.id === activeSupportId)
              if (!thread) return null
              return (
                <div className="flex-1 bg-white rounded-2xl border border-stone-100 overflow-hidden flex flex-col">
                  <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                    <div>
                      <span className="font-display font-700 text-stone-900 text-sm">{thread.profiles?.full_name || 'User'}</span>
                      <p className="text-xs text-stone-400">{thread.profiles?.email || ''}</p>
                    </div>
                    <button
                      onClick={async () => {
                        const newStatus = thread.status === 'open' ? 'resolved' : 'open'
                        await supabase.from('support_threads').update({ status: newStatus }).eq('id', thread.id)
                        fetchSupportThreads()
                      }}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${thread.status === 'open' ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
                      {thread.status === 'open' ? '✓ Resolve' : '↩ Reopen'}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {thread.messages.length === 0 && <p className="text-center text-xs text-stone-400 py-8">No messages yet.</p>}
                    {thread.messages.map((msg, i) => {
                      const fromUser = msg.sender_id === thread.user_id
                      const prevDate = i > 0 ? thread.messages[i-1].created_at?.slice(0,10) : null
                      const showDate = msg.created_at?.slice(0,10) !== prevDate
                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div className="flex items-center gap-3 my-3">
                              <div className="flex-1 h-px bg-stone-100" />
                              <span className="text-xs text-stone-400">{new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                              <div className="flex-1 h-px bg-stone-100" />
                            </div>
                          )}
                          <div className={`flex ${fromUser ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-sm px-3.5 py-2.5 rounded-2xl text-sm ${fromUser ? 'bg-stone-100 text-stone-800 rounded-bl-sm' : 'bg-forest-500 text-white rounded-br-sm'}`}>
                              {msg.body}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="px-4 py-3 border-t border-stone-100 flex gap-3">
                    <input
                      type="text"
                      value={supportInput}
                      onChange={e => setSupportInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !sendingSupport && sendSupportReply(thread.id, thread.user_id)}
                      placeholder="Reply to user..."
                      className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300"
                    />
                    <button
                      onClick={() => sendSupportReply(thread.id, thread.user_id)}
                      disabled={!supportInput.trim() || sendingSupport}
                      className="w-10 h-10 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white rounded-xl flex items-center justify-center transition-colors">
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              )
            })() : (
              <div className="flex-1 bg-white rounded-2xl border border-stone-100 flex items-center justify-center">
                <div className="text-center">
                  <Headphones size={32} className="text-stone-300 mx-auto mb-3" />
                  <p className="text-sm text-stone-400">Select a thread to view the conversation</p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Delete User Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-slideUp">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle size={22} className="text-rose-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-700 text-lg text-stone-900 mb-1">
                  Delete User Account?
                </h3>
                <p className="text-sm text-stone-600">
                  This will permanently delete <span className="font-medium text-stone-900">{deleteModal.full_name}</span> and all associated data including:
                </p>
                <ul className="mt-2 text-xs text-stone-600 space-y-1 ml-4 list-disc">
                  <li>Profile and account information</li>
                  <li>Carrier records (if applicable)</li>
                  <li>All loads and shipments created by this user</li>
                  <li>All bids placed or received</li>
                  <li>Messages and notifications</li>
                  <li>Reviews and ratings</li>
                </ul>
                <p className="mt-3 text-sm font-medium text-rose-600">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setDeleteModal(null)
                  setDeleteError('')
                }}
                disabled={deletingUser}
                className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteUser}
                disabled={deletingUser}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {deletingUser ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Delete User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
