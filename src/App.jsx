import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import ShipperDashboard from './pages/ShipperDashboard'
import CarrierDashboard from './pages/CarrierDashboard'
import PostLoad from './pages/PostLoad'
import Messages from './pages/Messages'
import TrackShipment from './pages/TrackShipment'
import Notifications from './pages/Notifications'
import CarrierProfile from './pages/CarrierProfile'
import ProfileSettings from './pages/ProfileSettings'
import MapView from './pages/MapView'
import AdminDashboard from './pages/AdminDashboard'
import PaymentReturn       from './pages/PaymentReturn'
import NotFound            from './pages/NotFound'
import Invoice             from './pages/Invoice'
import CarrierSubscription from './pages/CarrierSubscription'

function RoleRoute({ children, role }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center text-stone-400">Loading...</div>
  if (!user) return <Navigate to="/" replace />
  if (role && profile?.role !== role && profile?.role !== 'both') return <Navigate to="/" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center text-stone-400">Loading...</div>
  if (!user || !profile?.is_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/"                  element={<Landing />} />
        <Route path="/shipper"           element={<RoleRoute><ShipperDashboard /></RoleRoute>} />
        <Route path="/carrier"           element={<RoleRoute><CarrierDashboard /></RoleRoute>} />
        <Route path="/post-load"         element={<RoleRoute><PostLoad /></RoleRoute>} />
        <Route path="/messages"          element={<RoleRoute><Messages /></RoleRoute>} />
        <Route path="/messages/:id"      element={<RoleRoute><Messages /></RoleRoute>} />
        <Route path="/track/:shipmentId" element={<RoleRoute><TrackShipment /></RoleRoute>} />
        <Route path="/notifications"     element={<RoleRoute><Notifications /></RoleRoute>} />
        <Route path="/carrier/:id"       element={<CarrierProfile />} />
        <Route path="/profile"           element={<RoleRoute><ProfileSettings /></RoleRoute>} />
        <Route path="/map"               element={<RoleRoute><MapView /></RoleRoute>} />
        <Route path="/admin"             element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/payment/return"        element={<RoleRoute><PaymentReturn /></RoleRoute>} />
        <Route path="/invoice/:id"           element={<RoleRoute><Invoice /></RoleRoute>} />
        <Route path="/carrier/subscription"  element={<RoleRoute><CarrierSubscription /></RoleRoute>} />
        <Route path="*"                  element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
