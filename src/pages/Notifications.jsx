import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Bell, Truck, MessageSquare, CheckCircle, AlertCircle, Package, Star, MapPin, ChevronRight, Check, CreditCard, Gavel } from 'lucide-react'

const ICON_MAP = {
  match:    { icon: Truck,         color: 'bg-blue-50 text-blue-600' },
  message:  { icon: MessageSquare, color: 'bg-forest-50 text-forest-600' },
  tracking: { icon: MapPin,        color: 'bg-purple-50 text-purple-600' },
  delivery: { icon: CheckCircle,   color: 'bg-forest-50 text-forest-600' },
  review:   { icon: Star,          color: 'bg-amber-50 text-amber-600' },
  alert:    { icon: Package,       color: 'bg-rose-50 text-rose-600' },
  payment:  { icon: CreditCard,    color: 'bg-emerald-50 text-emerald-600' },
  bid:      { icon: Gavel,         color: 'bg-amber-50 text-amber-600' },
  system:   { icon: AlertCircle,   color: 'bg-stone-50 text-stone-600' },
}

const FILTERS = ['All', 'Unread', 'Messages', 'Tracking', 'Deliveries']

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)   return 'Just now'
  if (diff < 3600) return `${Math.floor(diff/60)} min ago`
  if (diff < 86400) return `${Math.floor(diff/3600)} hr ago`
  return `${Math.floor(diff/86400)} days ago`
}

export default function Notifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [activeFilter,  setActiveFilter]  = useState('All')
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    fetchNotifications()

    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => setNotifications(prev => [payload.new, ...prev]))
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

  const filtered = notifications.filter(n => {
    if (activeFilter === 'Unread')    return !n.read
    if (activeFilter === 'Messages')  return n.type === 'message'
    if (activeFilter === 'Tracking')  return n.type === 'tracking'
    if (activeFilter === 'Deliveries') return n.type === 'delivery'
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-800 text-stone-900">Notifications</h1>
            {unreadCount > 0 && <p className="text-sm text-stone-400 mt-0.5">{unreadCount} unread</p>}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-forest-600 hover:text-forest-700 font-medium transition-colors">
              <Check size={14} /> Mark all read
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeFilter === f ? 'bg-forest-500 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-300'
              }`}>{f}</button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-stone-400 text-sm">Loading notifications...</div>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="text-center py-20">
                <Bell size={32} className="text-stone-300 mx-auto mb-3" />
                <p className="text-stone-400 text-sm">No notifications here</p>
              </div>
            )}
            {filtered.map(n => {
              const cfg = ICON_MAP[n.type] || ICON_MAP.system
              const Icon = cfg.icon
              return (
                <div key={n.id} onClick={() => markRead(n.id)}
                  className={`bg-white rounded-2xl border p-4 transition-all cursor-pointer hover:shadow-md hover:shadow-stone-100 group ${!n.read ? 'border-forest-200 bg-forest-50/30' : 'border-stone-100'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}><Icon size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-display font-700 ${!n.read ? 'text-stone-900' : 'text-stone-700'}`}>{n.title}</p>
                          {!n.read && <span className="w-2 h-2 bg-forest-500 rounded-full flex-shrink-0" />}
                        </div>
                        <span className="text-xs text-stone-400 flex-shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="text-sm text-stone-500 leading-relaxed mb-2">{n.body}</p>
                      {n.link && (
                        <Link to={n.link} onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-forest-600 hover:text-forest-700 font-medium transition-colors">
                          View <ChevronRight size={12} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
