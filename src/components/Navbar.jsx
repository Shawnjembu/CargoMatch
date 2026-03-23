import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Truck, Menu, X, Bell, MessageSquare, LogOut, User, ChevronDown, Map, Settings, Shield } from 'lucide-react'

import cargoLogo from './Cargo match.png'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AuthModal from './AuthModal'

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const [open,     setOpen]     = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [userMenu, setUserMenu] = useState(false)

  const isShipper = profile?.role === 'shipper' || profile?.role === 'both'
  const isCarrier = profile?.role === 'carrier' || profile?.role === 'both'
  const isAdmin   = profile?.is_admin === true

  const links = user ? [
    isShipper && { to: '/shipper', label: 'Dashboard' },
    isCarrier && !isShipper && { to: '/carrier', label: 'Dashboard' },
    isShipper && isCarrier && { to: '/carrier', label: 'Carrier' },
    isShipper && { to: '/post-load', label: 'Post Load' },
    { to: '/map', label: 'Map' },
    { to: '/messages', label: 'Messages' },
    isAdmin && { to: '/admin', label: 'Admin' },
  ].filter(Boolean) : [
    { to: '/', label: 'Home' },
  ]

  const handleSignOut = async () => {
    await signOut()
    setUserMenu(false)
    navigate('/')
  }

  const isActive = (to) => pathname === to || pathname.startsWith(to + '/')

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to={user ? (isShipper ? '/shipper' : '/carrier') : '/'} className="flex items-center group">
            <img src={cargoLogo} alt="CargoMatch" className="h-10 w-auto object-contain" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <Link key={l.to} to={l.to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive(l.to) ? 'bg-forest-500 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}>{l.label}</Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                <Link to="/notifications" className={`relative p-2 rounded-lg transition-colors ${isActive('/notifications') ? 'bg-forest-50 text-forest-600' : 'text-stone-500 hover:bg-stone-100'}`}>
                  <Bell size={18} />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white" />
                </Link>
                <Link to="/messages" className={`relative p-2 rounded-lg transition-colors ${isActive('/messages') ? 'bg-forest-50 text-forest-600' : 'text-stone-500 hover:bg-stone-100'}`}>
                  <MessageSquare size={18} />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-forest-500 rounded-full border border-white" />
                </Link>
                <div className="w-px h-5 bg-stone-200 mx-1" />
                {/* User menu */}
                <div className="relative">
                  <button onClick={() => setUserMenu(!userMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-stone-100 transition-colors">
                    <div className="w-7 h-7 bg-forest-100 rounded-full flex items-center justify-center font-display font-700 text-xs text-forest-700">
                      {(profile?.full_name || user.email)?.[0]?.toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-700 text-stone-800 leading-tight max-w-[100px] truncate">{profile?.full_name || 'User'}</p>
                      <p className="text-xs text-stone-400 capitalize leading-tight">{profile?.role}</p>
                    </div>
                    <ChevronDown size={14} className="text-stone-400" />
                  </button>
                  {userMenu && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-stone-200 shadow-lg py-1 z-50">
                      <div className="px-4 py-2.5 border-b border-stone-100">
                        <p className="text-xs font-700 text-stone-800">{profile?.full_name}</p>
                        <p className="text-xs text-stone-400">{user.email}</p>
                        <span className="text-xs bg-forest-50 text-forest-700 px-2 py-0.5 rounded-full font-medium capitalize mt-1 inline-block">{profile?.role}</span>
                      </div>
                      <Link to="/profile" onClick={() => setUserMenu(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors">
                        <Settings size={14} /> Profile Settings
                      </Link>
                      {isShipper && (
                        <Link to="/shipper" onClick={() => setUserMenu(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors">
                          <User size={14} /> Shipper Dashboard
                        </Link>
                      )}
                      {isCarrier && (
                        <Link to="/carrier" onClick={() => setUserMenu(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors">
                          <Truck size={14} /> Carrier Dashboard
                        </Link>
                      )}
                      <Link to="/map" onClick={() => setUserMenu(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors">
                        <Map size={14} /> Live Map
                      </Link>
                      {isAdmin && (
                        <>
                          <div className="border-t border-stone-100 mt-1" />
                          <Link to="/admin" onClick={() => setUserMenu(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors font-medium">
                            <Shield size={14} /> Admin Panel
                          </Link>
                        </>
                      )}
                      <div className="border-t border-stone-100 mt-1" />
                      <button onClick={handleSignOut}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors">
                        <LogOut size={14} /> Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button onClick={() => setShowAuth(true)} className="text-sm text-stone-600 hover:text-forest-600 font-medium transition-colors">Sign In</button>
                <button onClick={() => setShowAuth(true)} className="bg-forest-500 hover:bg-forest-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Get Started</button>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <div className="md:hidden flex items-center gap-1">
            {user && (
              <>
                <Link to="/notifications" className="relative p-2 text-stone-600"><Bell size={18} /><span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white" /></Link>
                <Link to="/messages" className="relative p-2 text-stone-600"><MessageSquare size={18} /><span className="absolute top-1 right-1 w-2 h-2 bg-forest-500 rounded-full border border-white" /></Link>
              </>
            )}
            <button className="p-2 text-stone-600" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-stone-200 bg-white/95 px-6 py-4 flex flex-col gap-2">
            {links.map(l => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive(l.to) ? 'bg-forest-500 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>{l.label}</Link>
            ))}
            {user ? (
              <>
                <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 rounded-lg"><Settings size={14} /> Profile Settings</Link>
                {isAdmin && (
                  <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 rounded-lg font-medium"><Shield size={14} /> Admin Panel</Link>
                )}
                <button onClick={() => { handleSignOut(); setOpen(false) }} className="flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 rounded-lg"><LogOut size={14} /> Sign Out</button>
              </>
            ) : (
              <button onClick={() => { setShowAuth(true); setOpen(false) }} className="bg-forest-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium">Sign In / Get Started</button>
            )}
          </div>
        )}
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
