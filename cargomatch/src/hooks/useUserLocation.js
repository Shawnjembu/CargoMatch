import { useState, useCallback } from 'react'

const SESSION_KEY = 'cm_user_location'
const MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim()

/** Reverse geocode lat/lng → "City, CC" using Google Maps Geocoding API */
async function reverseGeocode(lat, lng) {
  if (!MAPS_KEY) return null
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality&key=${MAPS_KEY}`
    )
    const data = await res.json()
    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0]
      const cityComp = result.address_components.find(c =>
        c.types.includes('locality') || c.types.includes('administrative_area_level_2')
      )
      const countryComp = result.address_components.find(c =>
        c.types.includes('country')
      )
      if (cityComp) {
        return countryComp
          ? `${cityComp.long_name}, ${countryComp.short_name}`
          : cityComp.long_name
      }
    }
  } catch (_) {}
  return null
}

/** Read the sessionStorage cache */
function readCache() {
  try {
    const cached = sessionStorage.getItem(SESSION_KEY)
    if (cached) return JSON.parse(cached)
  } catch (_) {}
  return null
}

/** Write to sessionStorage cache */
function writeCache(location, city) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ location, city }))
  } catch (_) {}
}

/**
 * useUserLocation — GPS detection hook.
 *
 * Returns:
 *   location: { lat, lng } | null
 *   city: string | null   (reverse-geocoded)
 *   loading: boolean
 *   error: string | null
 *   requestLocation()     — show permission prompt / use cached coords
 *   requestLocationSilently() — only fires if permission already granted; returns { location, city } or null
 */
export function useUserLocation() {
  const [location, setLocation] = useState(null)
  const [city, setCity]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  /** User-triggered: prompts for permission if needed */
  const requestLocation = useCallback(() => {
    const cached = readCache()
    if (cached) {
      setLocation(cached.location)
      setCity(cached.city)
      return
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }

    setLoading(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setLocation(loc)
        const cityName = await reverseGeocode(loc.lat, loc.lng)
        setCity(cityName)
        writeCache(loc, cityName)
        setLoading(false)
      },
      (err) => {
        setLoading(false)
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location access denied. Please type your location manually.')
        } else {
          setError('Unable to detect location. Please type manually.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  /**
   * Silent request — only fires if permission was already granted.
   * Returns { location, city } on success or null if not permitted / unavailable.
   */
  const requestLocationSilently = useCallback(async () => {
    const cached = readCache()
    if (cached) {
      setLocation(cached.location)
      setCity(cached.city)
      return cached
    }

    if (!navigator.permissions || !navigator.geolocation) return null
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' })
      if (perm.state !== 'granted') return null
    } catch (_) {
      return null
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setLocation(loc)
          const cityName = await reverseGeocode(loc.lat, loc.lng)
          setCity(cityName)
          writeCache(loc, cityName)
          resolve({ location: loc, city: cityName })
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      )
    })
  }, [])

  return { location, city, loading, error, requestLocation, requestLocationSilently }
}
