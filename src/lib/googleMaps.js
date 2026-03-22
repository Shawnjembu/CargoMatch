let _promise = null

export function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (_promise) return _promise
  _promise = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_KEY
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.onload  = () => resolve(window.google.maps)
    script.onerror = () => { _promise = null; reject(new Error('Google Maps failed to load')) }
    document.head.appendChild(script)
  })
  return _promise
}

/**
 * Draw a road-following route using Directions API.
 * Falls back to a straight Polyline if the API call fails.
 * Returns an object with setMap(null) to remove the route.
 */
export function drawRoadRoute(gmaps, map, origin, destination, { strokeColor = '#259658', strokeWeight = 3 } = {}) {
  return new Promise((resolve) => {
    const ds = new gmaps.DirectionsService()
    const dr = new gmaps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor, strokeWeight, strokeOpacity: 0.85 },
    })
    ds.route(
      { origin, destination, travelMode: gmaps.TravelMode.DRIVING },
      (result, status) => {
        if (status === 'OK') {
          dr.setDirections(result)
          resolve({ setMap: (m) => dr.setMap(m) })
        } else {
          // Fallback: straight geodesic line
          const line = new gmaps.Polyline({ path: [origin, destination], strokeColor, strokeOpacity: 0.6, strokeWeight })
          line.setMap(map)
          resolve(line)
        }
      }
    )
  })
}
