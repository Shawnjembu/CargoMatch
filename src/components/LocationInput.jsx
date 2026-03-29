import { useState, useRef, useEffect, useCallback } from 'react'
import { Crosshair, Loader } from 'lucide-react'
import { useUserLocation } from '../hooks/useUserLocation'

// ── City lists ─────────────────────────────────────────────────
const BOTSWANA_CITIES = [
  'Gaborone', 'Francistown', 'Maun', 'Serowe', 'Selibe-Phikwe',
  'Lobatse', 'Kanye', 'Molepolole', 'Palapye', 'Jwaneng',
  'Kasane', 'Mahalapye', 'Orapa', 'Letlhakane', 'Sowa Town',
  'Tlokweng', 'Phakalane', 'Mogoditshane', 'Ramotswa', 'Mochudi',
  'Moshupa', 'Thamaga', 'Goodhope', 'Tsabong', 'Hukuntsi',
  'Ghanzi', 'Shakawe', 'Gumare', 'Nokaneng', 'Sehithwa',
  'Toteng', 'Rakops', 'Letlhakeng', 'Kopong',
].map(c => `${c}, BW`)

const SADC_CITIES = [
  'Johannesburg, ZA', 'Pretoria, ZA', 'Cape Town, ZA',
  'Durban, ZA', 'Harare, ZW', 'Bulawayo, ZW', 'Lusaka, ZM',
  'Livingstone, ZM', 'Windhoek, NA', 'Walvis Bay, NA',
  'Maputo, MZ', 'Beira, MZ', 'Dar es Salaam, TZ',
]

const ALL_CITIES = [...BOTSWANA_CITIES, ...SADC_CITIES]

function filterCities(query) {
  if (!query || query.length < 1) return []
  const q = query.toLowerCase()
  const startsWith = ALL_CITIES.filter(c => c.toLowerCase().startsWith(q))
  const contains   = ALL_CITIES.filter(c => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q))
  return [...startsWith, ...contains].slice(0, 6)
}

// ── Component ───────────────────────────────────────────────────
/**
 * LocationInput — drop-in replacement for plain location text inputs.
 *
 * Props:
 *   value: string
 *   onChange: (value: string) => void
 *   placeholder?: string
 *   label?: string
 *   required?: boolean
 *   showDetectButton?: boolean  (default true)
 *   inputClassName?: string     (extra classes for the <input>)
 *   onDetected?: (city: string) => void  (fired after GPS detection)
 */
export default function LocationInput({
  value,
  onChange,
  placeholder = 'e.g. Gaborone, BW',
  label,
  required,
  showDetectButton = true,
  inputClassName = '',
  onDetected,
}) {
  const [suggestions,    setSuggestions]    = useState([])
  const [showDrop,       setShowDrop]       = useState(false)
  const [activeIdx,      setActiveIdx]      = useState(-1)
  const [gpsError,       setGpsError]       = useState(null)
  const [dropUp,         setDropUp]         = useState(false)

  const wrapRef  = useRef(null)
  const inputRef = useRef(null)
  const dropRef  = useRef(null)

  const { loading: gpsLoading, error: gpsErr, city, requestLocation } = useUserLocation()

  // Propagate GPS error to local state
  useEffect(() => {
    if (gpsErr) setGpsError(gpsErr)
  }, [gpsErr])

  // When city is detected via GPS, fill the field
  useEffect(() => {
    if (city && gpsLoading === false) {
      const filled = city
      onChange(filled)
      setSuggestions([])
      setShowDrop(false)
      setGpsError(null)
      if (onDetected) onDetected(filled)
    }
  }, [city, gpsLoading])

  // Update suggestions as user types
  const handleChange = useCallback((e) => {
    const v = e.target.value
    onChange(v)
    setGpsError(null)
    const s = filterCities(v)
    setSuggestions(s)
    setShowDrop(s.length > 0)
    setActiveIdx(-1)
  }, [onChange])

  // Check if dropdown should open upward
  const handleFocus = useCallback(() => {
    if (value) {
      const s = filterCities(value)
      setSuggestions(s)
      setShowDrop(s.length > 0)
    }
    // Determine if near bottom of screen
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropUp(rect.bottom + 240 > window.innerHeight)
    }
  }, [value])

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!showDrop) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setShowDrop(false)
    }
  }, [showDrop, suggestions, activeIdx])

  const selectSuggestion = useCallback((city) => {
    onChange(city)
    setSuggestions([])
    setShowDrop(false)
    setActiveIdx(-1)
    inputRef.current?.focus()
  }, [onChange])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDetect = useCallback((e) => {
    e.preventDefault()
    setGpsError(null)
    requestLocation()
  }, [requestLocation])

  return (
    <div ref={wrapRef} className="relative">
      {label && (
        <label className="block text-xs font-medium text-stone-600 mb-1.5">
          {label}{required && ' *'}
        </label>
      )}

      {/* Input + GPS button */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white ${showDetectButton ? 'pr-10' : ''} ${inputClassName}`}
        />

        {showDetectButton && (
          <button
            type="button"
            onClick={handleDetect}
            disabled={gpsLoading}
            title="Use my location"
            aria-label="Detect my location"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-stone-400 hover:text-forest-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-forest-50"
            style={{ minWidth: 28, minHeight: 28 }}
          >
            {gpsLoading
              ? <Loader size={14} className="animate-spin text-forest-500" />
              : <Crosshair size={14} />
            }
          </button>
        )}
      </div>

      {/* GPS error */}
      {gpsError && (
        <p className="text-xs text-rose-500 mt-1">{gpsError}</p>
      )}

      {/* Suggestions dropdown */}
      {showDrop && suggestions.length > 0 && (
        <ul
          ref={dropRef}
          className={`absolute z-50 left-0 right-0 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s) }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                i === activeIdx
                  ? 'bg-forest-50 text-forest-700'
                  : 'text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-forest-400 flex-shrink-0" />
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
