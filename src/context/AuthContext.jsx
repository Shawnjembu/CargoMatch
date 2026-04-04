import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (authUser) => {
    if (!authUser) { setProfile(null); return null }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()
    setProfile(data || null)
    return data
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      fetchProfile(session?.user ?? null).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      fetchProfile(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async ({ email, password, full_name, role, phone }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, role, phone }
      }
    })
    if (error) throw error
    if (!data.user) throw new Error('Sign up failed — no user returned.')
    // Profile is created automatically via database trigger
    // Just fetch it after a short delay
    await new Promise(resolve => setTimeout(resolve, 500))
    await fetchProfile(data.user)
    return data
  }

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    if (data.user) {
      // KNOWN GOTCHA: Users created manually via the Supabase console (e.g. test
      // accounts, admin users) bypass the DB trigger that normally creates a
      // profiles row on signup.  On their very first sign-in we detect the missing
      // row and auto-insert a stub profile defaulting to role='shipper'.
      //
      // ⚠️  If you manually created a carrier or admin account in the Supabase
      // dashboard you MUST update that user's role (and is_admin flag) afterwards
      // — either via the Supabase table editor or the Admin Panel → Users tab.
      // There is currently no in-app role-override UI for admins (tracked gap).
      const { data: existing } = await supabase
        .from('profiles').select('id').eq('id', data.user.id).single()
      if (!existing) {
        if (import.meta.env.DEV) {
          console.warn(
            '[CargoMatch] Auto-created stub profile for manually-created user:',
            data.user.email,
            '— role defaulted to "shipper". Update via Supabase table editor if needed.'
          )
        }
        await supabase.from('profiles').upsert({
          id:        data.user.id,
          full_name: data.user.email.split('@')[0],
          role:      'shipper',
        }, { onConflict: 'id' })
      }
      await fetchProfile(data.user)
    }
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  // ── Reset password ──────────────────────────────────────────────
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://cargo-match-gold.vercel.app/reset-password',
    })
    if (error) throw error
    return { success: true }
  }

  // ── Update password ────────────────────────────────────────────
  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    return { success: true }
  }

  // ── Resend verification email ────────────────────────────────────
  const resendVerification = async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        redirectTo: 'https://cargo-match-gold.vercel.app/',
      }
    })
    if (error) throw error
    return { success: true }
  }

  // Check if user email is verified
  const isEmailVerified = () => {
    return user?.email_confirmed_at != null && user.email_confirmed_at !== ''
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, resetPassword, updatePassword, resendVerification, isEmailVerified }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
