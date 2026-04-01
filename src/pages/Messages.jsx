import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Send, Search, Package, MapPin, CheckCheck, MessageSquare, Navigation, ArrowLeft } from 'lucide-react'

const QUICK_REPLIES = [
  'When can you pick up?',
  "What's your ETA?",
  'Load is ready for pickup.',
  'Payment has been sent.',
  'Please confirm delivery.',
]

export default function Messages() {
  const { id: paramId } = useParams()
  const { user } = useAuth()
  const [convos,   setConvos]   = useState([])
  const [activeId, setActiveId] = useState(paramId || null)
  const [input,    setInput]    = useState('')
  const [search,   setSearch]   = useState('')
  const [sending,  setSending]  = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [fetchErr, setFetchErr] = useState('')
  const bottomRef  = useRef(null)
  const activeIdRef = useRef(activeId)  // always-current ref for use inside realtime callback

  // Keep ref in sync so the realtime callback always sees the latest activeId
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  useEffect(() => {
    if (!user) return
    fetchConversations()
    const channel = supabase.channel('messages-realtime')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${user.id}`
      }, (payload) => {
        fetchConversations().then(() => {
          // If the incoming message belongs to the conversation the user is
          // currently viewing, mark it read immediately — no badge should appear.
          const incomingShipmentId = payload.new?.shipment_id
          if (incomingShipmentId && incomingShipmentId === activeIdRef.current) {
            markRead(incomingShipmentId)
          }
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeId, convos])

  const fetchConversations = async () => {
    setFetchErr('')
    if (!user) return
    setLoading(true)
    try {
      // Get carrier id for this user if they are a carrier
      const { data: carrierData } = await supabase
        .from('carriers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      const carrierId = carrierData?.id

      // Build OR filter
      let orFilter = `shipper_id.eq.${user.id}`
      if (carrierId) orFilter += `,carrier_id.eq.${carrierId}`

      const { data: shipments, error } = await supabase
        .from('shipments')
        .select(`
          id, reference, status, shipper_id, carrier_id, price,
          loads(from_location, to_location, cargo_type, weight_kg),
          shipper:profiles!shipments_shipper_id_fkey(id, full_name),
          carrier:carriers(id, company_name, user_id)
        `)
        .or(orFilter)

      if (error) { setLoading(false); return }
      if (!shipments?.length) { setConvos([]); setLoading(false); return }

      const enriched = await Promise.all(shipments.map(async s => {
        const isShipper = s.shipper_id === user.id
        const otherName = isShipper
          ? (s.carrier?.company_name || 'Carrier')
          : (s.shipper?.full_name    || 'Shipper')
        const otherId = isShipper
          ? s.carrier?.user_id
          : s.shipper?.id

        const { data: msgs } = await supabase
          .from('messages')
          .select('*')
          .eq('shipment_id', s.id)
          .order('created_at', { ascending: true })

        const unread = (msgs || []).filter(m => m.receiver_id === user.id && !m.read).length
        const last   = msgs?.[msgs.length - 1]

        return {
          id:           s.id,
          name:         otherName,
          otherId,
          shipment_ref: s.reference,
          status:       s.status,
          price:        s.price,
          route:        `${s.loads?.from_location || ''} → ${s.loads?.to_location || ''}`,
          cargo:        s.loads ? `${s.loads.cargo_type} · ${s.loads.weight_kg}kg` : null,
          avatar:       otherName?.[0]?.toUpperCase() || '?',
          avatarColor:  isShipper ? 'bg-blue-100 text-blue-700' : 'bg-forest-100 text-forest-700',
          lastMessage:  last?.body || 'No messages yet',
          time:         last ? new Date(last.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
          unread,
          online: false,
          messages: (msgs || []).map(m => ({
            id:         m.id,
            from_me:    m.sender_id === user.id,
            body:       m.body,
            date:       new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            created_at: new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            read:       m.read,
          })),
        }
      }))

      const filtered = enriched.filter(Boolean)
      setConvos(filtered)
      if (!activeId && filtered.length) setActiveId(filtered[0].id)
    } catch (err) {
      setFetchErr('Failed to load conversations. Check your connection and try again.')
      if (import.meta.env.DEV) console.error('[Messages] fetchConversations error:', err)
    } finally {
      setLoading(false)
    }
  }

  const active = convos.find(c => c.id === activeId) || convos[0]

  const sendMessage = async () => {
    if (!input.trim() || !active || !user) return
    setSending(true)
    const body = input.trim()
    setInput('')

    if (!active.otherId) {
      alert('Cannot find recipient.')
      setSending(false)
      return
    }

    const { error } = await supabase.from('messages').insert({
      shipment_id:  active.id,
      sender_id:    user.id,
      receiver_id:  active.otherId,
      body,
    })

    if (error) {
      alert('Failed to send: ' + error.message)
      setSending(false)
      return
    }

    await supabase.from('notifications').insert({
      user_id: active.otherId,
      type:    'message',
      title:   'New message',
      body:    body.slice(0, 80),
      link:    `/messages/${active.id}`,
    })

    fetchConversations()
    setSending(false)
  }

  const markRead = async (cId) => {
    await supabase.from('messages')
      .update({ read: true })
      .eq('shipment_id', cId)
      .eq('receiver_id', user.id)
    setConvos(prev => prev.map(c =>
      c.id === cId ? { ...c, unread: 0, messages: c.messages.map(m => ({ ...m, read: true })) } : c
    ))
  }

  const filtered = convos.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.shipment_ref?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-cream font-body flex flex-col">
      <Navbar />
      <div className="flex-1 flex pt-16 overflow-hidden" style={{ maxHeight: '100vh' }}>

        {/* Sidebar */}
        <div className={`${activeId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0 border-r border-stone-200 bg-white flex-col`}>
          <div className="p-4 border-b border-stone-100">
            <h2 className="font-display font-700 text-stone-900 mb-3">Messages</h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type="text" placeholder="Search..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-6 text-center text-xs text-stone-400">Loading conversations...</div>}
            {!loading && fetchErr && (
              <div className="mx-4 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {fetchErr}
                <button onClick={fetchConversations} className="block mt-1 underline text-rose-600 hover:text-rose-800">Retry</button>
              </div>
            )}
            {!loading && !fetchErr && filtered.length === 0 && (
              <div className="p-6 text-center">
                <MessageSquare size={28} className="text-stone-300 mx-auto mb-2" />
                <p className="text-xs text-stone-400">No conversations yet.</p>
                <p className="text-xs text-stone-400 mt-1">Accept a load or post one to start chatting.</p>
              </div>
            )}
            {filtered.map(c => (
              <button key={c.id}
                onClick={() => { setActiveId(c.id); markRead(c.id); }}
                className={`w-full text-left px-4 py-3.5 border-b border-stone-50 transition-colors hover:bg-stone-50 ${activeId === c.id ? 'bg-forest-50 border-l-2 border-l-forest-500' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-700 text-sm ${c.avatarColor}`}>{c.avatar}</div>
                    {c.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-forest-500 rounded-full border-2 border-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-display font-700 text-stone-900 text-sm truncate">{c.name}</span>
                      <span className="text-xs text-stone-400 flex-shrink-0 ml-2">{c.time}</span>
                    </div>
                    {c.shipment_ref && (
                      <span className="text-xs text-forest-600 bg-forest-50 px-1.5 py-0.5 rounded font-medium">{c.shipment_ref}</span>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-stone-500 truncate flex-1">{c.lastMessage}</p>
                      {c.unread > 0 && (
                        <span className="ml-2 w-5 h-5 bg-forest-500 text-white text-xs rounded-full flex items-center justify-center flex-shrink-0 font-medium">{c.unread}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        {active ? (
          <div className="flex-1 flex flex-col min-w-0 bg-stone-50 w-full">
            {/* Header */}
            <div className="bg-white border-b border-stone-200 flex-shrink-0">
              <div className="px-4 md:px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveId(null)} className="md:hidden p-1.5 -ml-1 text-stone-500 hover:text-stone-800">
                    <ArrowLeft size={18} />
                  </button>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-display font-700 text-sm ${active.avatarColor}`}>{active.avatar}</div>
                  <div>
                    <span className="font-display font-700 text-stone-900 text-sm">{active.name}</span>
                    <div className="flex items-center gap-1 text-xs text-stone-400 mt-0.5">
                      <MapPin size={10} className="text-forest-500" />{active.route}
                      {active.shipment_ref && <><span className="mx-1">·</span><span className="text-forest-600 font-medium">{active.shipment_ref}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {active.shipment_ref && (
                    <Link to={`/track/${active.shipment_ref}`}
                      className="flex items-center gap-1.5 text-xs bg-forest-50 text-forest-700 border border-forest-200 px-3 py-1.5 rounded-lg hover:bg-forest-100 font-medium">
                      <Navigation size={12} /> Track
                    </Link>
                  )}
                </div>
              </div>
              {/* Load context banner */}
              {(active.cargo || active.price) && (
                <div className="px-6 pb-3 flex items-center gap-4 flex-wrap">
                  {active.cargo && (
                    <span className="flex items-center gap-1 text-xs text-stone-500 bg-stone-50 border border-stone-100 px-2.5 py-1 rounded-lg">
                      <Package size={10} /> {active.cargo}
                    </span>
                  )}
                  {active.price > 0 && (
                    <span className="text-xs text-stone-500 bg-stone-50 border border-stone-100 px-2.5 py-1 rounded-lg">
                      P {Number(active.price).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6 space-y-3">
              {active.messages.length === 0 && (
                <div className="text-center text-stone-400 text-sm py-12">No messages yet. Say hello!</div>
              )}
              {active.messages.map((msg, i) => {
                const prevDate = i > 0 ? active.messages[i - 1].date : null
                const showDate = msg.date !== prevDate
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-stone-100" />
                        <span className="text-xs text-stone-400 font-medium">{msg.date}</span>
                        <div className="flex-1 h-px bg-stone-100" />
                      </div>
                    )}
                    <div className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'}`}>
                      {!msg.from_me && (
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-display font-700 text-xs mr-2 flex-shrink-0 mt-1 ${active.avatarColor}`}>{active.avatar}</div>
                      )}
                      <div className={`max-w-xs lg:max-w-md flex flex-col ${msg.from_me ? 'items-end' : 'items-start'}`}>
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.from_me ? 'bg-forest-500 text-white rounded-br-sm' : 'bg-white text-stone-800 border border-stone-100 rounded-bl-sm shadow-sm'}`}>
                          {msg.body}
                        </div>
                        <div className={`flex items-center gap-1 mt-1 ${msg.from_me ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-xs text-stone-400">{msg.created_at}</span>
                          {msg.from_me && <CheckCheck size={12} className={msg.read ? 'text-forest-500' : 'text-stone-300'} />}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-stone-200 px-4 pt-3 pb-3 flex-shrink-0">
              {/* Quick replies */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
                {QUICK_REPLIES.map(r => (
                  <button key={r} onClick={() => setInput(r)}
                    className="flex-shrink-0 text-xs bg-stone-50 hover:bg-forest-50 hover:text-forest-700 border border-stone-200 hover:border-forest-200 text-stone-600 px-3 py-1.5 rounded-full transition-colors">
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input type="text" placeholder="Type a message..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !sending && sendMessage()}
                  className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 transition-all" />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  className="w-10 h-10 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
            {loading ? 'Loading...' : 'Select a conversation or accept a load to start messaging'}
          </div>
        )}
      </div>
    </div>
  )
}
