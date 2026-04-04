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
import Onboarding              from './pages/Onboarding'
import NotFound                from './pages/NotFound'
import Invoice                 from './pages/Invoice'
import CarrierSubscription     from './pages/CarrierSubscription'
import SubscriptionSuccess     from './pages/SubscriptionSuccess'
import SubscriptionHistory     from './pages/SubscriptionHistory'
import ResetPassword            from './pages/ResetPassword'
import PageLoader              from './components/PageLoader'

// Redirect logged-in users away from the landing page to their dashboard
function HomeRoute() {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Landing />
  if (profile?.is_admin)           return <Navigate to="/admin"   replace />
  if (profile?.role === 'carrier') return <Navigate to="/carrier" replace />
  return <Navigate to="/shipper" replace />
}

function RoleRoute({ children, role }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/" replace />
  if (profile && profile.onboarded === false) return <Navigate to="/onboarding" replace />
  if (role && profile?.role !== role && profile?.role !== 'both') return <Navigate to="/" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user || !profile?.is_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/"                  element={<HomeRoute />} />
        <Route path="/onboarding"        element={<Onboarding />} />
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
        <Route path="/invoice/:id"                     element={<RoleRoute><Invoice /></RoleRoute>} />
        {/* carrier/subscription must come BEFORE carrier/:id to avoid id="subscription" match */}
        <Route path="/carrier/subscription"            element={<RoleRoute><CarrierSubscription /></RoleRoute>} />
        <Route path="/carrier/subscription/success"    element={<RoleRoute><SubscriptionSuccess /></RoleRoute>} />
        <Route path="/carrier/subscription/history"     element={<RoleRoute><SubscriptionHistory /></RoleRoute>} />
        <Route path="/reset-password"                 element={<ResetPassword />} />
        <Route path="*"                                element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
