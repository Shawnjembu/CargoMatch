import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  User, Phone, MapPin, FileText, Truck, Shield,
  Save, AlertCircle, CheckCircle, Lock, Eye, EyeOff, ChevronLeft, Camera,
  Upload, Route, Plus, X
} from 'lucide-react'

export default function ProfileSettings() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [showPwd, setShowPwd] = useState(false)

  const [form, setForm] = useState({
    full_name: '', phone: '', location: '', bio: '', role: 'shipper'
  })
  const [pwd, setPwd] = useState({ current: '', new: '', confirm: '' })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Carrier extra fields
  const [carrierForm, setCarrierForm] = useState({
    company_name: '', reg_number: '', trucks: []
  })
  const [carrierInfo,   setCarrierInfo]   = useState(null)
  const [routes,        setRoutes]        = useState([])
  const [newRoute,      setNewRoute]      = useState({ from_location: '', to_location: '' })
  const [addingRoute,   setAddingRoute]   = useState(false)
  const [uploadingDoc,  setUploadingDoc]  = useState('')  // 'license' | 'insurance' | ''

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        phone:     profile.phone     || '',
        location:  profile.location  || '',
        bio:       profile.bio       || '',
        role:      profile.role      || 'shipper',
      })
    }
    if (user) fetchCarrierInfo()
  }, [profile, user])

  const fetchCarrierInfo = async () => {
    const { data } = await supabase.from('carriers')
      .select('*, trucks(*), carrier_routes(*)')
      .eq('user_id', user.id)
      .single()
    if (data) {
      setCarrierInfo(data)
      setCarrierForm({ company_name: data.company_name || '', reg_number: data.reg_number || '', trucks: data.trucks || [] })
      setRoutes(data.carrier_routes || [])
    }
  }

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setPwdField = (k, v) => setPwd(p => ({ ...p, [k]: v }))

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setMessage({ type: 'error', text: 'Image must be under 3MB' }); return }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    // Upload immediately
    setUploadingAvatar(true)
    const ext  = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
      setMessage({ type: 'success', text: 'Profile photo updated!' })
    }
    setUploadingAvatar(false)
  }

  const saveProfile = async () => {
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: form.full_name,
        phone:     form.phone,
        location:  form.location,
        bio:       form.bio,
        role:      form.role,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id)
      if (error) throw error

      // If switching to carrier/both, ensure carrier row exists
      if ((form.role === 'carrier' || form.role === 'both') && !carrierInfo) {
        await supabase.from('carriers').upsert({
          user_id:      user.id,
          company_name: carrierForm.company_name || form.full_name + ' Transport',
        }, { onConflict: 'user_id' })
        fetchCarrierInfo()
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' })
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const saveCarrier = async () => {
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const fields = { company_name: carrierForm.company_name, reg_number: carrierForm.reg_number || null }
      if (carrierInfo) {
        const { error } = await supabase.from('carriers').update(fields).eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('carriers').insert({ user_id: user.id, ...fields })
        if (error) throw error
      }
      setMessage({ type: 'success', text: 'Carrier profile updated!' })
      fetchCarrierInfo()
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const uploadDocument = async (e, docType) => {
    const file = e.target.files[0]
    if (!file || !carrierInfo) return
    if (file.size > 5 * 1024 * 1024) { setMessage({ type: 'error', text: 'File must be under 5MB' }); return }
    setUploadingDoc(docType)
    const ext  = file.name.split('.').pop()
    const path = `carrier-docs/${carrierInfo.id}/${docType}.${ext}`
    const { error } = await supabase.storage.from('carrier-docs').upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage.from('carrier-docs').getPublicUrl(path)
      const field = docType === 'license' ? 'license_url' : 'insurance_url'
      await supabase.from('carriers').update({ [field]: urlData.publicUrl }).eq('id', carrierInfo.id)
      setCarrierInfo(c => ({ ...c, [field]: urlData.publicUrl }))
      setMessage({ type: 'success', text: `${docType === 'license' ? 'Operator licence' : 'Insurance certificate'} uploaded!` })
    } else {
      setMessage({ type: 'error', text: error.message })
    }
    setUploadingDoc('')
  }

  const addRoute = async () => {
    if (!newRoute.from_location.trim() || !newRoute.to_location.trim() || !carrierInfo) return
    setAddingRoute(true)
    const { data, error } = await supabase.from('carrier_routes').insert({
      carrier_id:    carrierInfo.id,
      from_location: newRoute.from_location.trim(),
      to_location:   newRoute.to_location.trim(),
    }).select().single()
    if (!error) {
      setRoutes(r => [...r, data])
      setNewRoute({ from_location: '', to_location: '' })
    }
    setAddingRoute(false)
  }

  const removeRoute = async (id) => {
    await supabase.from('carrier_routes').delete().eq('id', id)
    setRoutes(r => r.filter(x => x.id !== id))
  }

  const addTruck = async () => {
    if (!carrierInfo) return
    const { data, error } = await supabase.from('trucks').insert({
      carrier_id:  carrierInfo.id,
      type:        'Hino 300 (3 Ton)',
      plate:       'B 0000 XX',
      capacity_kg: 3000,
      status:      'active',
    }).select().single()
    if (!error) setCarrierForm(f => ({ ...f, trucks: [...f.trucks, data] }))
  }

  const updateTruck = async (id, field, value) => {
    setCarrierForm(f => ({ ...f, trucks: f.trucks.map(t => t.id === id ? { ...t, [field]: value } : t) }))
    await supabase.from('trucks').update({ [field]: value }).eq('id', id)
  }

  const removeTruck = async (id) => {
    await supabase.from('trucks').delete().eq('id', id)
    setCarrierForm(f => ({ ...f, trucks: f.trucks.filter(t => t.id !== id) }))
  }

  const changePassword = async () => {
    if (pwd.new !== pwd.confirm) { setMessage({ type: 'error', text: 'Passwords do not match.' }); return }
    if (pwd.new.length < 6)      { setMessage({ type: 'error', text: 'Password must be at least 6 characters.' }); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwd.new })
    if (error) setMessage({ type: 'error', text: error.message })
    else { setMessage({ type: 'success', text: 'Password updated!' }); setPwd({ current: '', new: '', confirm: '' }) }
    setSaving(false)
  }

  const isCarrier = form.role === 'carrier' || form.role === 'both'

  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">

        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors mb-6">
          <ChevronLeft size={14} /> Back
        </button>

        <h1 className="font-display text-3xl font-800 text-stone-900 mb-8">Profile Settings</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-stone-200">
          {[
            { id: 'profile', label: 'Profile', icon: User },
            isCarrier && { id: 'carrier', label: 'Carrier Info', icon: Truck },
            { id: 'security', label: 'Security', icon: Lock },
          ].filter(Boolean).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-all ${
                tab === t.id ? 'border-forest-500 text-forest-600' : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {message.text && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-6 text-sm ${
            message.type === 'success' ? 'bg-forest-50 border border-forest-200 text-forest-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
          }`}>
            {message.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            {message.text}
          </div>
        )}

        {/* Profile Tab */}
        {tab === 'profile' && (
          <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4 pb-5 border-b border-stone-100">
              <div className="relative">
                {avatarPreview || profile?.avatar_url ? (
                  <img src={avatarPreview || profile.avatar_url} alt="avatar" className="w-16 h-16 rounded-2xl object-cover border-2 border-forest-200" />
                ) : (
                  <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center font-display font-800 text-2xl text-forest-700">
                    {profile?.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-forest-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-forest-600 transition-colors shadow-md">
                  {uploadingAvatar ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={12} className="text-white" />}
                  <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </label>
              </div>
              <div>
                <p className="font-display font-700 text-stone-900">{profile?.full_name}</p>
                <p className="text-sm text-stone-400">{user?.email}</p>
                <span className="text-xs bg-forest-50 text-forest-700 px-2 py-0.5 rounded-full font-medium capitalize">{profile?.role}</span>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Full Name</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Phone</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                    placeholder="+267 7X XXX XXX"
                    className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Location</label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input type="text" value={form.location} onChange={e => set('location', e.target.value)}
                  placeholder="e.g. Gaborone, Botswana"
                  className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Bio</label>
              <div className="relative">
                <FileText size={14} className="absolute left-3 top-3 text-stone-400" />
                <textarea rows={3} value={form.bio} onChange={e => set('bio', e.target.value)}
                  placeholder="Tell carriers/shippers about yourself..."
                  className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 resize-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-2">Account Role</label>
              <div className="grid grid-cols-3 gap-2">
                {[['shipper','Shipper 📦'],['carrier','Carrier 🚛'],['both','Both']].map(([val, label]) => (
                  <button key={val} onClick={() => set('role', val)}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      form.role === val ? 'bg-forest-500 text-white border-forest-500' : 'border-stone-200 text-stone-600 hover:border-forest-300'
                    }`}>{label}</button>
                ))}
              </div>
            </div>

            <button onClick={saveProfile} disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white font-medium py-3 rounded-xl transition-all">
              <Save size={16} /> {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        )}

        {/* Carrier Info Tab */}
        {tab === 'carrier' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-4">
              <h3 className="font-display font-700 text-stone-900 flex items-center gap-2"><Truck size={16} className="text-forest-500" /> Company Info</h3>

              {carrierInfo?.verified && (
                <div className="flex items-center gap-2 bg-forest-50 border border-forest-200 text-forest-700 text-sm px-3 py-2 rounded-xl">
                  <Shield size={14} /> Verified Carrier
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Company / Trading Name</label>
                  <input type="text" value={carrierForm.company_name}
                    onChange={e => setCarrierForm(f => ({ ...f, company_name: e.target.value }))}
                    placeholder="e.g. Lekgowa Transport"
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Registration / PPADB Number</label>
                  <input type="text" value={carrierForm.reg_number}
                    onChange={e => setCarrierForm(f => ({ ...f, reg_number: e.target.value }))}
                    placeholder="e.g. BW-2024-00123"
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
              </div>

              <button onClick={saveCarrier} disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white font-medium py-3 rounded-xl transition-all">
                <Save size={16} /> {saving ? 'Saving...' : 'Save Carrier Info'}
              </button>

              {/* Document uploads */}
              <div className="pt-4 border-t border-stone-100 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-stone-600">Compliance Documents</p>
                  {carrierInfo?.verified ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-forest-50 text-forest-700 border border-forest-200 px-2 py-0.5 rounded-full font-medium">✓ Verified</span>
                  ) : (carrierInfo?.license_url || carrierInfo?.insurance_url) ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">⏳ Pending review</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full font-medium">Not submitted</span>
                  )}
                </div>
                {[
                  { key: 'license',   label: 'Operator Licence',       field: 'license_url' },
                  { key: 'insurance', label: 'Insurance Certificate',   field: 'insurance_url' },
                ].map(doc => (
                  <div key={doc.key} className="flex items-center justify-between gap-3 bg-stone-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-stone-800">{doc.label}</p>
                      {carrierInfo?.[doc.field] ? (
                        <a href={carrierInfo[doc.field]} target="_blank" rel="noreferrer"
                          className="text-xs text-forest-600 hover:underline">View uploaded document ↗</a>
                      ) : (
                        <p className="text-xs text-stone-400">Not uploaded yet</p>
                      )}
                    </div>
                    <label className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                      uploadingDoc === doc.key ? 'bg-stone-200 text-stone-400' : 'bg-white border-stone-200 text-stone-600 hover:border-forest-300 hover:text-forest-700'
                    }`}>
                      {uploadingDoc === doc.key
                        ? <span className="w-3 h-3 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                        : <Upload size={12} />
                      }
                      {uploadingDoc === doc.key ? 'Uploading...' : carrierInfo?.[doc.field] ? 'Replace' : 'Upload'}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => uploadDocument(e, doc.key)} className="hidden" disabled={!carrierInfo || uploadingDoc !== ''} />
                    </label>
                  </div>
                ))}
                {!carrierInfo?.verified && (carrierInfo?.license_url || carrierInfo?.insurance_url) && (
                  <p className="text-xs text-stone-400 pt-1">Documents submitted. An admin will review and verify your account shortly.</p>
                )}
              </div>
            </div>

            {/* Routes */}
            <div className="bg-white rounded-2xl border border-stone-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-700 text-stone-900 flex items-center gap-2"><Route size={16} className="text-forest-500" /> My Routes</h3>
              </div>
              {routes.length === 0 ? (
                <p className="text-sm text-stone-400 text-center py-4">No routes added. Add the routes you regularly travel.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {routes.map(r => (
                    <div key={r.id} className="flex items-center justify-between bg-stone-50 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-stone-800 font-medium">{r.from_location} → {r.to_location}</span>
                      <button onClick={() => removeRoute(r.id)} className="text-rose-400 hover:text-rose-600 transition-colors"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={newRoute.from_location}
                  onChange={e => setNewRoute(r => ({ ...r, from_location: e.target.value }))}
                  placeholder="From city"
                  className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                <input type="text" value={newRoute.to_location}
                  onChange={e => setNewRoute(r => ({ ...r, to_location: e.target.value }))}
                  placeholder="To city"
                  className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                <button onClick={addRoute} disabled={addingRoute || !carrierInfo}
                  className="flex items-center gap-1 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors whitespace-nowrap">
                  {addingRoute ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus size={14} />} Add
                </button>
              </div>
            </div>

            {/* Fleet */}
            <div className="bg-white rounded-2xl border border-stone-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-700 text-stone-900 flex items-center gap-2"><Truck size={16} className="text-forest-500" /> My Fleet</h3>
                <button onClick={addTruck}
                  className="text-xs bg-forest-50 text-forest-700 border border-forest-200 px-3 py-1.5 rounded-lg hover:bg-forest-100 transition-colors font-medium">
                  + Add Truck
                </button>
              </div>

              {carrierForm.trucks.length === 0 ? (
                <p className="text-sm text-stone-400 text-center py-6">No trucks added yet. Click "Add Truck" to add your fleet.</p>
              ) : (
                <div className="space-y-4">
                  {carrierForm.trucks.map(t => (
                    <div key={t.id} className="border border-stone-200 rounded-xl p-4 space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-stone-500 mb-1">Truck Type</label>
                          <input type="text" value={t.type}
                            onChange={e => updateTruck(t.id, 'type', e.target.value)}
                            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-500 mb-1">Plate Number</label>
                          <input type="text" value={t.plate}
                            onChange={e => updateTruck(t.id, 'plate', e.target.value)}
                            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-500 mb-1">Capacity (kg)</label>
                          <input type="number" value={t.capacity_kg}
                            onChange={e => updateTruck(t.id, 'capacity_kg', parseInt(e.target.value))}
                            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                        </div>
                        <div>
                          <label className="block text-xs text-stone-500 mb-1">Status</label>
                          <select value={t.status} onChange={e => updateTruck(t.id, 'status', e.target.value)}
                            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300">
                            <option value="active">Active</option>
                            <option value="in_transit">In Transit</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                        </div>
                      </div>
                      <button onClick={() => removeTruck(t.id)}
                        className="text-xs text-rose-500 hover:text-rose-700 transition-colors">Remove truck</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Security Tab */}
        {tab === 'security' && (
          <div className="bg-white rounded-2xl border border-stone-100 p-6 space-y-5">
            <h3 className="font-display font-700 text-stone-900 flex items-center gap-2"><Lock size={16} className="text-forest-500" /> Change Password</h3>
            <p className="text-sm text-stone-400">Leave blank if you don't want to change your password.</p>

            {['new', 'confirm'].map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-stone-600 mb-1.5 capitalize">
                  {field === 'new' ? 'New Password' : 'Confirm New Password'}
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type={showPwd ? 'text' : 'password'} value={pwd[field]}
                    onChange={e => setPwdField(field, e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                  <button onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            ))}

            <div className="pt-2 border-t border-stone-100">
              <p className="text-xs text-stone-400 mb-1">Email address</p>
              <p className="text-sm font-medium text-stone-700">{user?.email}</p>
            </div>

            <button onClick={changePassword} disabled={saving || !pwd.new}
              className="w-full flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 disabled:bg-stone-200 text-white font-medium py-3 rounded-xl transition-all">
              <Lock size={16} /> {saving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
