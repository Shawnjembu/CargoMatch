import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { MapPin, Package, Truck, Users, AlertCircle, CheckCircle, ArrowRight, ChevronLeft, Zap, Image, X } from 'lucide-react'

const STEPS = ['Route', 'Cargo', 'Preferences', 'Review']
const cargoTypes = ['General Merchandise','Building Materials','Food & Perishables','Electronics','Furniture','Textiles','Agricultural Products','Hazardous Materials','Vehicles / Equipment','Other']

export default function PostLoad() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const prefill  = location.state || {}
  const [step, setStep]         = useState(prefill.from ? 1 : 0)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')
  const [newRef, setNewRef]     = useState('')
  const [imageFile,       setImageFile]       = useState(null)
  const [imagePreview,    setImagePreview]    = useState(null)
  const [uploading,       setUploading]       = useState(false)
  const [matchedCarriers, setMatchedCarriers] = useState(0)
  const [form, setForm] = useState({
    from:        prefill.from      || '',
    to:          prefill.to        || '',
    pickupDate:  '',
    pickupTime:  '',
    cargoType:   prefill.cargoType || '',
    weight:      prefill.weight    || '',
    description: '',
    pooling:     true,
    urgent:      false,
    insurance:   false,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const canNext = () => {
    if (step === 0) return form.from.trim() && form.to.trim() && form.pickupDate
    if (step === 1) return form.cargoType && form.weight
    return true
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setError('')
  }

  const uploadImage = async (loadId) => {
    if (!imageFile) return null
    setUploading(true)
    const ext  = imageFile.name.split('.').pop()
    const path = `loads/${loadId}.${ext}`
    const { error } = await supabase.storage.from('cargo-images').upload(path, imageFile, { upsert: true })
    if (error) { setUploading(false); return null }
    const { data } = supabase.storage.from('cargo-images').getPublicUrl(path)
    setUploading(false)
    return data.publicUrl
  }

  const handleSubmit = async () => {
    if (!user) return
    setSubmitting(true); setError('')
    try {
      const { data, error: insertError } = await supabase.from('loads').insert({
        shipper_id:    user.id,
        from_location: form.from.trim(),
        to_location:   form.to.trim(),
        pickup_date:   form.pickupDate,
        pickup_time:   form.pickupTime || null,
        cargo_type:    form.cargoType,
        weight_kg:     parseInt(form.weight),
        description:   form.description || null,
        pooling:       form.pooling,
        urgent:        form.urgent,
        insurance:     form.insurance,
        status:        'pending',
      }).select().single()

      if (insertError) throw insertError

      // Upload image if selected
      if (imageFile) {
        const imageUrl = await uploadImage(data.id)
        if (imageUrl) await supabase.from('loads').update({ image_url: imageUrl }).eq('id', data.id)
      }

      // Smart matching: find carriers with routes overlapping this load
      const fromCity = form.from.trim().split(',')[0].trim()
      const toCity   = form.to.trim().split(',')[0].trim()

      const { data: matchingRoutes } = await supabase
        .from('carrier_routes')
        .select('carrier_id, carriers!inner(user_id, company_name)')
        .or(`from_city.ilike.%${fromCity}%,to_city.ilike.%${toCity}%,from_city.ilike.%${toCity}%,to_city.ilike.%${fromCity}%`)

      let notified = 0
      if (matchingRoutes && matchingRoutes.length > 0) {
        const seen = new Set()
        const carrierNotifs = matchingRoutes
          .filter(r => {
            const uid = r.carriers?.user_id
            if (!uid || uid === user.id || seen.has(uid)) return false
            seen.add(uid)
            return true
          })
          .map(r => ({
            user_id: r.carriers.user_id,
            type:    'match',
            title:   `New load on your route: ${fromCity} → ${toCity}`,
            body:    `${form.cargoType} · ${form.weight}kg${form.urgent ? ' · 🔴 Urgent' : ''}${form.pooling ? ' · Pooling available' : ''}`,
            link:    '/carrier',
          }))

        if (carrierNotifs.length > 0) {
          await supabase.from('notifications').insert(carrierNotifs)
          notified = carrierNotifs.length
        }
      }
      setMatchedCarriers(notified)

      // Notify shipper
      await supabase.from('notifications').insert({
        user_id: user.id, type: 'match',
        title: 'Load posted!',
        body:  `Your load from ${form.from} to ${form.to} is live.${notified > 0 ? ` ${notified} carrier${notified > 1 ? 's' : ''} on this route notified.` : ' Finding carriers now.'}`,
        link:  '/shipper',
      })

      setNewRef(data?.reference || `CM-${Math.floor(Math.random()*9000+1000)}`)
      setSubmitted(true)
    } catch (e) {
      setError(e.message || 'Failed to post load.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-cream font-body">
        <Navbar />
        <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">
          <div className="w-20 h-20 bg-forest-100 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle size={36} className="text-forest-500" /></div>
          <h1 className="font-display text-3xl font-800 text-stone-900 mb-3">Load Posted!</h1>
          {matchedCarriers > 0 ? (
            <>
              <p className="text-stone-500 mb-1">Smart matching found carriers on your route.</p>
              <p className="text-sm text-forest-600 font-700 mb-10">
                🎯 {matchedCarriers} carrier{matchedCarriers > 1 ? 's' : ''} on this corridor notified directly.
              </p>
            </>
          ) : (
            <>
              <p className="text-stone-500 mb-2">Your load is live and visible to all carriers.</p>
              <p className="text-sm text-forest-600 font-medium mb-10">You'll be notified when a carrier accepts.</p>
            </>
          )}
          <div className="bg-white border border-stone-100 rounded-2xl p-5 text-left mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-700 text-stone-900">{newRef}</span>
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse-dot" /> Matching...
              </span>
            </div>
            {imagePreview && <img src={imagePreview} alt="cargo" className="w-full h-32 object-cover rounded-xl mb-3" />}
            <div className="flex items-center gap-2 text-sm text-stone-700">
              <MapPin size={13} className="text-forest-500" />
              <span className="font-medium">{form.from}</span><ArrowRight size={12} className="text-stone-300" /><span className="font-medium">{form.to}</span>
            </div>
            <p className="text-xs text-stone-400 mt-1">{form.cargoType} · {form.weight}kg</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/shipper" className="flex-1 inline-flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-medium px-5 py-3 rounded-xl transition-all">View Dashboard <ArrowRight size={16} /></Link>
            <button onClick={() => { setSubmitted(false); setStep(0); setForm({ from:'',to:'',pickupDate:'',pickupTime:'',cargoType:'',weight:'',description:'',pooling:true,urgent:false,insurance:false }); setImageFile(null); setImagePreview(null) }}
              className="flex-1 bg-white border border-stone-200 text-stone-700 font-medium px-5 py-3 rounded-xl transition-all hover:border-stone-300">Post Another</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 pt-28 pb-16">
        <Link to="/shipper" className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors mb-8"><ChevronLeft size={16} /> Back</Link>
        <h1 className="font-display text-3xl font-800 text-stone-900 mb-2">Post a Load</h1>
        <p className="text-stone-400 text-sm mb-8">Fill in your shipment details and we'll match you with the best carrier.</p>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-forest-600' : 'text-stone-400'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-700 flex-shrink-0 ${i < step ? 'bg-forest-500 text-white' : i === step ? 'bg-forest-100 text-forest-700 border-2 border-forest-500' : 'bg-stone-100 text-stone-400'}`}>
                  {i < step ? <CheckCircle size={14} /> : i + 1}
                </div>
                <span className="text-xs font-medium hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded-full mx-1 ${i < step ? 'bg-forest-500' : 'bg-stone-200'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-stone-100 p-6 mb-6">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}

          {/* Step 0: Route */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="font-display font-700 text-stone-900 flex items-center gap-2"><MapPin size={16} className="text-forest-500" /> Route Details</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-stone-600 mb-1.5">Pickup Location *</label>
                  <input type="text" placeholder="e.g. Gaborone, BW" value={form.from} onChange={e => set('from', e.target.value)}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" /></div>
                <div><label className="block text-xs font-medium text-stone-600 mb-1.5">Destination *</label>
                  <input type="text" placeholder="e.g. Francistown, BW" value={form.to} onChange={e => set('to', e.target.value)}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-stone-600 mb-1.5">Pickup Date *</label>
                  <input type="date" value={form.pickupDate} onChange={e => set('pickupDate', e.target.value)}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" /></div>
                <div><label className="block text-xs font-medium text-stone-600 mb-1.5">Preferred Time</label>
                  <input type="time" value={form.pickupTime} onChange={e => set('pickupTime', e.target.value)}
                    className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" /></div>
              </div>
            </div>
          )}

          {/* Step 1: Cargo */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="font-display font-700 text-stone-900 flex items-center gap-2"><Package size={16} className="text-forest-500" /> Cargo Details</h2>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Cargo Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {cargoTypes.map(t => (
                    <button key={t} onClick={() => set('cargoType', t)}
                      className={`text-left text-xs px-3 py-2.5 rounded-xl border transition-all ${form.cargoType === t ? 'border-forest-500 bg-forest-50 text-forest-700 font-medium' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div><label className="block text-xs font-medium text-stone-600 mb-1.5">Weight (kg) *</label>
                <input type="number" placeholder="e.g. 500" value={form.weight} onChange={e => set('weight', e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" /></div>
              <div><label className="block text-xs font-medium text-stone-600 mb-1.5">Description</label>
                <textarea rows={3} placeholder="Special handling, fragile items, etc." value={form.description} onChange={e => set('description', e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 resize-none" /></div>

              {/* Image upload */}
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Cargo Photo (optional)</label>
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="preview" className="w-full h-40 object-cover rounded-xl border border-stone-200" />
                    <button onClick={() => { setImageFile(null); setImagePreview(null) }}
                      className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-50 transition-colors">
                      <X size={14} className="text-rose-500" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-200 rounded-xl py-8 cursor-pointer hover:border-forest-300 hover:bg-forest-50/30 transition-all">
                    <Image size={24} className="text-stone-400" />
                    <p className="text-sm text-stone-500">Click to upload a photo</p>
                    <p className="text-xs text-stone-400">PNG, JPG up to 5MB</p>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Preferences */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="font-display font-700 text-stone-900 flex items-center gap-2"><Truck size={16} className="text-forest-500" /> Preferences</h2>
              <div className="space-y-3">
                {[
                  { key: 'pooling',   icon: Users,       label: 'Enable Load Pooling', desc: 'Share truck space to save up to 40%' },
                  { key: 'urgent',    icon: AlertCircle, label: 'Mark as Urgent',      desc: 'Prioritize matching — additional fee may apply' },
                  { key: 'insurance', icon: CheckCircle, label: 'Add Cargo Insurance', desc: 'Cover your goods during transit (recommended)' },
                ].map(opt => (
                  <div key={opt.key} onClick={() => set(opt.key, !form[opt.key])}
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${form[opt.key] ? 'border-forest-300 bg-forest-50' : 'border-stone-200 hover:border-stone-300'}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${form[opt.key] ? 'bg-forest-100 text-forest-600' : 'bg-stone-100 text-stone-400'}`}><opt.icon size={16} /></div>
                    <div className="flex-1"><p className="text-sm font-medium text-stone-800">{opt.label}</p><p className="text-xs text-stone-400">{opt.desc}</p></div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${form[opt.key] ? 'border-forest-500 bg-forest-500' : 'border-stone-300'}`}>
                      {form[opt.key] && <CheckCircle size={12} className="text-white fill-white" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display font-700 text-stone-900 flex items-center gap-2"><CheckCircle size={16} className="text-forest-500" /> Review Your Load</h2>
              {imagePreview && <img src={imagePreview} alt="cargo" className="w-full h-36 object-cover rounded-xl" />}
              <div className="divide-y divide-stone-50">
                {[
                  { label: 'Route',    value: `${form.from} → ${form.to}` },
                  { label: 'Pickup',   value: `${form.pickupDate}${form.pickupTime ? ' at ' + form.pickupTime : ''}` },
                  { label: 'Cargo',    value: form.cargoType },
                  { label: 'Weight',   value: `${form.weight} kg` },
                  { label: 'Notes',    value: form.description || 'None' },
                  { label: 'Pooling',  value: form.pooling    ? 'Enabled ✓' : 'Disabled' },
                  { label: 'Urgent',   value: form.urgent     ? 'Yes'       : 'No' },
                  { label: 'Insurance',value: form.insurance  ? 'Added ✓'   : 'Not added' },
                  { label: 'Photo',    value: imageFile ? `${imageFile.name}` : 'No photo' },
                ].map((r, i) => (
                  <div key={i} className="flex justify-between py-3 text-sm">
                    <span className="text-stone-400 font-medium">{r.label}</span>
                    <span className="text-stone-800 text-right max-w-xs">{r.value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-forest-50 border border-forest-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-forest-700 text-sm font-medium mb-1"><Zap size={14} /> AI Matching Ready</div>
                <p className="text-forest-600 text-xs leading-relaxed">Our algorithm will scan available carriers on your route and notify you within minutes.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="px-6 py-3 border border-stone-200 rounded-xl text-stone-600 font-medium text-sm hover:bg-stone-50 transition-all">Back</button>
          )}
          <button
            onClick={() => { if (step < STEPS.length - 1) setStep(s => s + 1); else handleSubmit() }}
            disabled={!canNext() || submitting || uploading}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed text-white font-display font-700 py-3 rounded-xl transition-all">
            {submitting || uploading ? 'Please wait...' : step < STEPS.length - 1 ? <><span>Continue</span><ArrowRight size={16} /></> : <><span>Post Load</span><Zap size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
