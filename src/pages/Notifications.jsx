import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Bell, Truck, MessageSquare, CheckCircle, AlertTriangle,
  Package, Star, MapPin, ChevronRight, Check, CreditCard,
  Gavel, AlertCircle, Trash2, X,
} from 'lucide-react'

const ICON_MAP = {
  match:    { icon: Truck,          color: 'bg-blue-50 text-blue-600' },
  message:  { icon: MessageSquare,  color: 'bg-forest-50 text-forest-600' },
  tracking: { icon: MapPin,         color: 'bg-purple-50 text-purple-600' },
  delivery: { icon: CheckCircle,    color: 'bg-forest-50 text-forest-600' },
  review:   { icon: Star,           color: 'bg-amber-50 text-amber-600' },
  alert:    { icon: AlertTriangle,  color: 'bg-rose-50 text-rose-600' },
  payment:  { icon: CreditCard,     color: 'bg-emerald-50 text-emerald-600' },
  bid:      { icon: Gavel,          color: 'bg-amber-50 text-amber-600' },
  system:   { icon: AlertCircle,    color: 'bg-stone-50 text-stone-500' },
}

const FILTERS = [
  { label: 'All',        match: null },
  { label: 'Unread',     match: '__unread__' },
  { label: 'Alerts',     match: 'alert' },
  { label: 'Bids',       match: 'bid' },
  { label: 'Messages',   match: 'message' },
  { label: 'Tracking',   match: 'tracking' },
  { label: 'Deliveries', match: 'delivery' },
  { label: 'Payments',   match: 'payment' },
]

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)    return 'Just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString()
}

function dayLabel(iso) {
  const d     = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString())     return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function groupByDay(notifications) {
  const groups = []
  let lastLabel = null
  for (const n of notifications) {
    const label = dayLabel(n.created_at)
    if (label !== lastLabel) {
      groups.push({ label, items: [n] })
      lastLabel = label
    } else {
      groups[groups.length - 1].items.push(n)
    }
  }
  return groups
}

export default function Notifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [activeFilter,  setActiveFilter]  = useState('All')
  const [loading,       setLoading]       = useState(true)
  const [deleting,      setDeleting]      = useState(null) // id being deleted

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchNotifications()

    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => setNotifications(prev => [payload.new, ...prev]))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setNotifications(data || [])
    setLoading(false)
  }

  const markAllRead = async () => {
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setNotifications(n => n.map(x => ({ ...x, read: true })))
  }

  const markRead = async (id) => {
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x))
  }

  const deleteNotification = async (e, id) => {
    e.stopPropagation()
    setDeleting(id)
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(n => n.filter(x => x.id !== id))
    setDeleting(null)
  }

  const clearRead = async () => {
    if (!user) return
    await supabase.from('notifications').delete().eq('user_id', user.id).eq('read', true)
    setNotifications(n => n.filter(x => !x.read))
  }

  const filterDef = FILTERS.find(f => f.label === activeFilter) || FILTERS[0]

  const filtered = useMemo(() => notifications.filter(n => {
    if (filterDef.match === '__unread__') return !n.read
    if (filterDef.match)                 return n.type === filterDef.match
    return true
  }), [notifications, filterDef])

  const groups      = useMemo(() => groupByDay(filtered), [filtered])
  const unreadCount = notifications.filter(n => !n.read).length
  const readCount   = notifications.filter(n => n.read).length

  // Badge counts per filter
  const badgeFor = (match) => {
    if (!match || match === '__unread__') return 0
    return notifications.filter(n => !n.read && n.type === match).length
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-800 text-stone-900">Notifications</h1>
            {unreadCount > 0
              ? <p className="text-sm text-stone-400 mt-0.5">{unreadCount} unread</p>
              : <p className="text-sm text-stone-400 mt-0.5">You're all caught up</p>
            }
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="flex items-center gap-1.5 text-sm text-forest-600 hover:text-forest-700 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-forest-50">
                <Check size={13} /> Mark all read
              </button>
            )}
            {readCount > 0 && (
              <button onClick={clearRead}
                className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-rose-600 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-rose-50">
                <Trash2 size={13} /> Clear read
              </button>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map(f => {
            const badge = f.match && f.match !== '__unread__' ? badgeFor(f.match)
              : f.match === '__unread__' ? unreadCount : 0
            return (
              <button key={f.label} onClick={() => setActiveFilter(f.label)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  activeFilter === f.label
                    ? 'bg-forest-500 text-white'
                    : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-300'
                }`}>
                {f.label}
                {badge > 0 && (
                  <span className={`text-xs w-4 h-4 rounded-full flex items-center justify-center leading-none ${
                    activeFilter === f.label ? 'bg-white/30 text-white' : 'bg-rose-100 text-rose-600'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 p-4 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-stone-100 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3.5 w-40 bg-stone-100 rounded-full" />
                    <div className="h-3 w-64 bg-stone-100 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bell size={22} className="text-stone-300" />
            </div>
            <p className="text-stone-500 font-medium mb-1">No notifications</p>
            <p className="text-stone-400 text-sm">
              {activeFilter === 'All'
                ? "You'll see match alerts, bids, tracking updates, and dispute notices here."
                : `No ${activeFilter.toLowerCase()} notifications yet.`}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2 px-1">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.items.map(n => {
                    const cfg  = ICON_MAP[n.type] || ICON_MAP.system
                    const Icon = cfg.icon
                    return (
                      <div key={n.id}
                        onClick={() => markRead(n.id)}
                        className={`bg-white rounded-2xl border p-4 transition-all cursor-pointer hover:shadow-md hover:shadow-stone-100 group relative ${
                          !n.read ? 'border-forest-200 bg-forest-50/20' : 'border-stone-100'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                            <Icon size={18} />
                          </div>
                          <div className="flex-1 min-w-0 pr-6">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={`text-sm font-display font-700 ${!n.read ? 'text-stone-900' : 'text-stone-700'}`}>
                                {n.title}
                              </p>
                              {!n.read && <span className="w-1.5 h-1.5 bg-forest-500 rounded-full flex-shrink-0" />}
                            </div>
                            <p className="text-sm text-stone-500 leading-relaxed mb-2">{n.body}</p>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-stone-400">{timeAgo(n.created_at)}</span>
                              {n.link && (
                                <Link to={n.link} onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-forest-600 hover:text-forest-700 font-medium transition-colors">
                                  View <ChevronRight size={11} />
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Delete button — visible on hover */}
                        <button
                          onClick={(e) => deleteNotification(e, n.id)}
                          disabled={deleting === n.id}
                          className="absolute top-3 right-3 p-1.5 rounded-lg text-stone-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                          title="Dismiss"
                        >
                          {deleting === n.id ? <span className="text-xs">…</span> : <X size={13} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
