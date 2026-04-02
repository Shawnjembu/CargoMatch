import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Package, Truck, MapPin, CheckCircle, ArrowRight, ChevronRight
} from 'lucide-react'

// ── shared step-indicator ─────────────────────────────────────
function StepDots({ total, current }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i < current
              ? 'w-6 bg-forest-600'
              : i === current
              ? 'w-6 bg-forest-400'
              : 'w-2 bg-stone-200'
          }`}
        />
      ))}
    </div>
  )
}

// ── field helpers ─────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-600 mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white'

// ── city list (SADC) ─────────────────────────────────────────
const CITIES = [
  'Gaborone', 'Francistown', 'Maun', 'Kasane', 'Lobatse', 'Serowe',
  'Palapye', 'Selibe Phikwe', 'Jwaneng', 'Orapa',
  'Johannesburg', 'Pretoria', 'Durban', 'Cape Town',
  'Harare', 'Bulawayo', 'Lusaka', 'Windhoek', 'Maputo',
]

const TRUCK_TYPES = [
  'Flatbed', 'Box Truck', 'Refrigerated', 'Tanker',
  'Car Carrier', 'Lowboy', 'Curtainsider', 'Tipper', 'Other',
]

// ════════════════════════════════════════════════════════════
//  SHIPPER FLOW  (3 steps)
// ════════════════════════════════════════════════════════════

function ShipperOnboarding({ profile, onDone }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    full_name:    profile?.full_name || '',
    phone:        profile?.phone     || '',
    company_name: profile?.company_name || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const saveProfileAndFinish = async () => {
    setSaving(true)
    setError('')
    try {
      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          full_name:    form.full_name.trim(),
          phone:        form.phone.trim() || null,
          company_name: form.company_name.trim() || null,
          onboarded:    true,
        })
        .eq('id', profile.id)
      if (upErr) throw upErr
      onDone()
    } catch (e) {
      setError(e.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepDots total={3} current={step} />

      {step === 0 && (
        <div className="text-center">
          <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Package size={28} className="text-forest-600" />
          </div>
          <h2 className="font-display font-800 text-2xl text-stone-900 mb-3">Welcome to CargoMatch!</h2>
          <p className="text-stone-500 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            You're moments away from posting your first load and connecting with
            verified carriers across Botswana and the SADC region.
          </p>
          <ul className="text-left space-y-3 mb-8 max-w-xs mx-auto">
            {[
              'Post loads and receive competitive bids',
              'Track every shipment in real time',
              'Raise disputes if anything goes wrong',
            ].map(t => (
              <li key={t} className="flex items-start gap-2 text-sm text-stone-600">
                <CheckCircle size={15} className="text-forest-500 mt-0.5 flex-shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setStep(1)}
            className="w-full py-3 bg-forest-600 hover:bg-forest-700 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="font-display font-800 text-xl text-stone-900 mb-1">Your profile</h2>
          <p className="text-xs text-stone-400 mb-6">Carriers will see this when reviewing your loads.</p>

          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <Field label="Full name" required>
              <input
                type="text"
                value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                placeholder="Kagiso Modise"
                className={inputCls}
              />
            </Field>
            <Field label="Phone number">
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+267 71 234 567"
                className={inputCls}
              />
            </Field>
            <Field label="Company name">
              <input
                type="text"
                value={form.company_name}
                onChange={e => set('company_name', e.target.value)}
                placeholder="Modise Trading (Pty) Ltd"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setStep(0)}
              className="py-2.5 px-5 border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => { if (!form.full_name.trim()) { setError('Full name is required.'); return } setError(''); setStep(2) }}
              className="flex-1 py-2.5 bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Continue <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h2 className="font-display font-800 text-2xl text-stone-900 mb-3">You're all set!</h2>
          <p className="text-stone-500 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            Your account is ready. Head to your dashboard to post your first load — it takes less than 2 minutes.
          </p>
          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}
          <button
            onClick={saveProfileAndFinish}
            disabled={saving}
            className="w-full py-3 bg-forest-600 hover:bg-forest-700 disabled:bg-stone-200 disabled:text-stone-400 text-white font-semibold rounded-2xl transition-colors"
          >
            {saving ? 'Saving…' : 'Go to my dashboard →'}
          </button>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════
//  CARRIER FLOW  (4 steps)
// ════════════════════════════════════════════════════════════

function CarrierOnboarding({ profile, onDone }) {
  const [step, setStep] = useState(0)
  const [profile_form, setProfileForm] = useState({
    full_name:    profile?.full_name    || '',
    phone:        profile?.phone        || '',
    company_name: profile?.company_name || '',
  })
  const [truck, setTruck] = useState({
    truck_type:   '',
    capacity_tons: '',
    plate_number:  '',
  })
  const [route, setRoute] = useState({ from_city: '', to_city: '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const setP = (k, v) => setProfileForm(f => ({ ...f, [k]: v }))
  const setT = (k, v) => setTruck(f => ({ ...f, [k]: v }))
  const setR = (k, v) => setRoute(f => ({ ...f, [k]: v }))

  const saveAndFinish = async () => {
    setSaving(true)
    setError('')
    try {
      // 1. Update profiles
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          full_name:    profile_form.full_name.trim(),
          phone:        profile_form.phone.trim()        || null,
          company_name: profile_form.company_name.trim() || null,
          onboarded:    true,
        })
        .eq('id', profile.id)
      if (profErr) throw profErr

      // 2. Upsert carrier record
      const { data: carrier, error: carErr } = await supabase
        .from('carriers')
        .upsert({
          user_id:       profile.id,
          company_name:  profile_form.company_name.trim() || null,
          truck_type:    truck.truck_type    || null,
          capacity_tons: truck.capacity_tons ? Number(truck.capacity_tons) : null,
          plate_number:  truck.plate_number.trim() || null,
        }, { onConflict: 'user_id' })
        .select('id')
        .single()
      if (carErr) throw carErr

      // 3. Insert preferred route if provided
      if (route.from_city && route.to_city && carrier?.id) {
        await supabase.from('carrier_routes').upsert({
          carrier_id: carrier.id,
          from_city:  route.from_city,
          to_city:    route.to_city,
        }, { onConflict: 'carrier_id,from_city,to_city' })
      }

      onDone()
    } catch (e) {
      setError(e.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StepDots total={4} current={step} />

      {step === 0 && (
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Truck size={28} className="text-amber-600" />
          </div>
          <h2 className="font-display font-800 text-2xl text-stone-900 mb-3">Welcome, Carrier!</h2>
          <p className="text-stone-500 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
            Set up your carrier profile in a few quick steps and start bidding on
            loads across Botswana and SADC today.
          </p>
          <ul className="text-left space-y-3 mb-8 max-w-xs mx-auto">
            {[
              'Browse and bid on loads that match your routes',
              'Build your reputation with verified reviews',
              'Get paid securely through the platform',
            ].map(t => (
              <li key={t} className="flex items-start gap-2 text-sm text-stone-600">
                <CheckCircle size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setStep(1)}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="font-display font-800 text-xl text-stone-900 mb-1">Company details</h2>
          <p className="text-xs text-stone-400 mb-6">This is shown to shippers on your profile.</p>

          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-4">{error}</div>
          )}

          <div className="space-y-4">
            <Field label="Your full name" required>
              <input type="text" value={profile_form.full_name}
                onChange={e => setP('full_name', e.target.value)}
                placeholder="Thabo Dlamini" className={inputCls} />
            </Field>
            <Field label="Company name">
              <input type="text" value={profile_form.company_name}
                onChange={e => setP('company_name', e.target.value)}
                placeholder="Dlamini Transport Services" className={inputCls} />
            </Field>
            <Field label="Phone number">
              <input type="tel" value={profile_form.phone}
                onChange={e => setP('phone', e.target.value)}
                placeholder="+267 75 987 654" className={inputCls} />
            </Field>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(0)}
              className="py-2.5 px-5 border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors">
              Back
            </button>
            <button
              onClick={() => { if (!profile_form.full_name.trim()) { setError('Full name is required.'); return } setError(''); setStep(2) }}
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              Continue <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="font-display font-800 text-xl text-stone-900 mb-1">Your truck</h2>
          <p className="text-xs text-stone-400 mb-6">Helps us match you with the right loads.</p>

          <div className="space-y-4">
            <Field label="Truck type">
              <select value={truck.truck_type} onChange={e => setT('truck_type', e.target.value)} className={inputCls}>
                <option value="">Select type…</option>
                {TRUCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Capacity (tons)">
              <input type="number" min="0" step="0.5" value={truck.capacity_tons}
                onChange={e => setT('capacity_tons', e.target.value)}
                placeholder="e.g. 30" className={inputCls} />
            </Field>
            <Field label="Plate number">
              <input type="text" value={truck.plate_number}
                onChange={e => setT('plate_number', e.target.value)}
                placeholder="B 000 BWP" className={inputCls} />
            </Field>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(1)}
              className="py-2.5 px-5 border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors">
              Back
            </button>
            <button onClick={() => setStep(3)}
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              Continue <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="font-display font-800 text-xl text-stone-900 mb-1">Preferred route</h2>
          <p className="text-xs text-stone-400 mb-6">We'll prioritise loads along this corridor. You can add more routes later.</p>

          <div className="space-y-4">
            <Field label="From">
              <select value={route.from_city} onChange={e => setR('from_city', e.target.value)} className={inputCls}>
                <option value="">Select city…</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="To">
              <select value={route.to_city} onChange={e => setR('to_city', e.target.value)} className={inputCls}>
                <option value="">Select city…</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mt-4">{error}</div>
          )}

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(2)}
              className="py-2.5 px-5 border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors">
              Back
            </button>
            <button
              onClick={saveAndFinish}
              disabled={saving}
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              {saving ? 'Saving…' : <><MapPin size={14} /> Finish setup</>}
            </button>
          </div>
          <button
            onClick={saveAndFinish}
            disabled={saving}
            className="w-full mt-3 text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            Skip for now
          </button>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ════════════════════════════════════════════════════════════

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  if (!user || !profile) return null

  const handleDone = () => {
    // Navigate to appropriate dashboard; reload forces AuthContext to
    // re-fetch the profile so onboarded=true is reflected everywhere.
    const dest = profile.role === 'carrier' ? '/carrier' : '/shipper'
    navigate(dest, { replace: true })
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-cream flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        {profile.role === 'carrier'
          ? <CarrierOnboarding profile={profile} onDone={handleDone} />
          : <ShipperOnboarding profile={profile} onDone={handleDone} />
        }
      </div>
    </div>
  )
}
