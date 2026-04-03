import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { updatePassword, user, signOut } = useAuth()
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  // Initialize session from URL tokens on mount
  useEffect(() => {
    const initResetSession = async () => {
      // If user is already logged in, sign them out for security
      if (user) {
        await signOut()
      }

      const accessToken = searchParams.get('access_token')
      const refreshToken = searchParams.get('refresh_token')

      if (!accessToken || !refreshToken) {
        setError('Invalid reset link. Please request a new password reset.')
        setLoading(false)
        return
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError) {
        setError('This reset link is invalid or has expired. Please request a new one.')
      } else {
        setSessionReady(true)
      }

      setLoading(false)
    }

    initResetSession()
  }, [searchParams, user, signOut])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!password || !confirmPassword) {
      setError('Please fill in both password fields.')
      return
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await updatePassword(password)
      setSuccess(true)
      setTimeout(() => navigate('/?signin=true'), 2000)
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-md mx-auto px-6 pt-28 pb-16">
        <div className="bg-white rounded-2xl border border-stone-200 p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-forest-500 rounded-lg flex items-center justify-center">
              <Lock size={20} className="text-white" />
            </div>
            <span className="font-display font-800 text-xl">
              <span className="text-forest-600">Cargo</span><span className="text-forest-500">Match</span>
            </span>
          </div>

          <h1 className="font-display text-2xl font-800 text-stone-900 mb-2">
            {success ? 'Password Updated' : 'Set New Password'}
          </h1>
          <p className="text-stone-500 text-sm mb-6">
            {success 
              ? 'Your password has been updated. Redirecting to login...' 
              : 'Enter a new password for your account.'}
          </p>

          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl mb-4">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 bg-forest-50 border border-forest-200 text-forest-700 text-sm px-4 py-3 rounded-xl mb-4">
              <CheckCircle size={15} />
              <span>Password updated successfully!</span>
            </div>
          )}

          {!success && !loading && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">New Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !sessionReady}
                className="w-full bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 disabled:text-stone-400 text-white font-display font-700 py-3 rounded-xl transition-all"
              >
                {loading ? 'Setting up...' : sessionReady ? 'Update Password' : 'Invalid Link'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-stone-400 mt-6">
            <button
              onClick={() => navigate('/')}
              className="text-forest-600 hover:text-forest-700 font-medium"
            >
              Back to Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}