import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Truck, Mail, Lock, User, Phone, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function AuthModal({ onClose, defaultMode = 'signin' }) {
  const { signIn, signUp, resetPassword, resendVerification } = useAuth()
  const navigate = useNavigate()
  const [mode,    setMode]    = useState(defaultMode)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [form, setForm] = useState({
    email: '', password: '', full_name: '', phone: '', role: 'shipper'
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleResendVerification = async () => {
    if (!form.email) { setError('Enter your email address first.'); return }
    setResendLoading(true)
    setError('')
    try {
      await resendVerification(form.email)
      setSuccess('Verification email sent! Check your inbox.')
    } catch (e) {
      setError(e.message || 'Failed to resend verification email.')
    } finally {
      setResendLoading(false)
    }
  }

  const handleSubmit = async () => {
    setError(''); setSuccess('')

    // Handle forgot password mode
    if (mode === 'forgot') {
      if (!form.email) { setError('Please enter your email address.'); return }
      setLoading(true)
      try {
        await resetPassword(form.email)
        setSuccess('Password reset link sent! Check your email.')
      } catch (e) {
        setError(e.message || 'Failed to send reset link. Please try again.')
      } finally {
        setLoading(false)
      }
      return
    }

    // Normal signin/signup validation
    if (!form.email || !form.password) { setError('Please fill in email and password.'); return }
    if (mode === 'signup' && !form.full_name) { setError('Please enter your full name.'); return }
    if (mode === 'signup' && form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (mode === 'signup' && form.phone) {
      const digits = form.phone.replace(/\D/g, '')
      const valid = /^(\+267|267)?[7][1-9]\d{6}$/.test(form.phone.replace(/\s/g, '')) || digits.length === 8
      if (!valid) { setError('Enter a valid Botswana number — e.g. +267 71 234 567'); return }
    }

    setLoading(true)
    try {
      if (mode === 'signin') {
        const data = await signIn({ email: form.email, password: form.password })
        onClose()
        // Redirect based on role
        const role = data?.user?.user_metadata?.role
        if (role === 'carrier') navigate('/carrier')
        else navigate('/shipper')
      } else {
        await signUp({ email: form.email, password: form.password, full_name: form.full_name, role: form.role, phone: form.phone })
        setSuccess('Account created! Redirecting...')
        setTimeout(() => {
          onClose()
          if (form.role === 'carrier') navigate('/carrier')
          else navigate('/shipper')
        }, 1000)
      }
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('already registered') || msg.includes('already exists'))
        setError('An account with this email already exists. Try signing in.')
      else if (msg.includes('Invalid login') || msg.includes('invalid_credentials'))
        setError('Wrong email or password.')
      else if (msg.includes('Email not confirmed'))
        setError('Please confirm your email first, or disable email confirmation in Supabase.')
      else if (msg.includes('rate limit') || msg.includes('security purposes'))
        setError('Too many attempts. Please wait a moment and try again.')
      else
        setError(msg || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100"><X size={18} /></button>

        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-forest-500 rounded-lg flex items-center justify-center">
            <Truck size={15} className="text-white" />
          </div>
          <span className="font-display font-800 text-lg">
            <span className="text-forest-600">Cargo</span><span className="text-forest-500">Match</span>
          </span>
        </div>

        <h2 className="font-display text-2xl font-800 text-stone-900 mb-1">
          {mode === 'signin' ? 'Welcome back' : mode === 'forgot' ? 'Reset password' : 'Create account'}
        </h2>
        <p className="text-stone-400 text-sm mb-6">
          {mode === 'signin' ? 'Sign in to your CargoMatch account.' : mode === 'forgot' ? 'Enter your email to receive a reset link.' : 'Join thousands of shippers and carriers.'}
        </p>

        {error   && <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl mb-4"><AlertCircle size={15} className="flex-shrink-0 mt-0.5" /><span>{error}</span></div>}
        {success && <div className="flex items-center gap-2 bg-forest-50 border border-forest-200 text-forest-700 text-sm px-4 py-3 rounded-xl mb-4"><CheckCircle size={15} />{success}</div>}

        {error.includes('confirm your email') && (
          <p className="text-center text-sm text-stone-500 mt-2 mb-4">
            <button onClick={handleResendVerification} disabled={resendLoading}
              className="text-forest-600 font-medium hover:text-forest-700 disabled:opacity-50">
              {resendLoading ? 'Sending...' : 'Resend verification email'}
            </button>
          </p>
        )}

        <div className="space-y-3">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Full Name *</label>
                <div className="relative"><User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type="text" placeholder="Your full name" value={form.full_name} onChange={e => set('full_name', e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" /></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Phone</label>
                <div className="relative"><Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type="tel" placeholder="+267 7X XXX XXX" value={form.phone} onChange={e => set('phone', e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" /></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-2">I am a... *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['shipper','📦 Shipper'],['carrier','🚛 Carrier'],['both','Both']].map(([val, label]) => (
                    <button key={val} onClick={() => set('role', val)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${form.role === val ? 'bg-forest-500 text-white border-forest-500' : 'border-stone-200 text-stone-600 hover:border-forest-300'}`}>{label}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Email *</label>
            <div className="relative"><Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type="email" placeholder="you@example.com" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" /></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Password * {mode === 'signup' && <span className="text-stone-400 font-normal">(min 6 chars)</span>}</label>
            <div className="relative"><Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type={showPw ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleSubmit()}
                className="w-full pl-9 pr-10 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button></div>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={loading}
          className="w-full mt-5 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 disabled:text-stone-400 text-white font-display font-700 py-3 rounded-xl transition-all">
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : mode === 'forgot' ? 'Send Reset Link' : 'Create Account'}
        </button>

        <p className="text-center text-sm text-stone-500 mt-4">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess('') }}
            className="text-forest-600 font-medium hover:text-forest-700">
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        {mode === 'signin' && (
          <p className="text-center text-sm text-stone-500 mt-3">
            <button onClick={() => setMode('forgot')}
              className="text-stone-400 hover:text-forest-600 transition-colors">
              Forgot password?
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
