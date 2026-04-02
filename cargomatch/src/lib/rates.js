// Botswana road distances (km) between major cities
const ROAD_KM = {
  'Gaborone|Francistown':   400,
  'Gaborone|Maun':          700,
  'Gaborone|Kasane':        900,
  'Gaborone|Lobatse':        70,
  'Gaborone|Palapye':       270,
  'Gaborone|Serowe':        270,
  'Gaborone|Jwaneng':       140,
  'Gaborone|Kanye':         140,
  'Gaborone|Molepolole':     60,
  'Gaborone|Mahalapye':     200,
  'Gaborone|Mochudi':        40,
  'Francistown|Maun':       460,
  'Francistown|Kasane':     510,
  'Francistown|Palapye':    130,
  'Francistown|Serowe':     170,
  'Francistown|Mahalapye':  270,
  'Maun|Kasane':            200,
  'Palapye|Serowe':          40,
  'Palapye|Mahalapye':       70,
  'Lobatse|Kanye':           70,
}

/**
 * Calculate minimum acceptable bid in BWP.
 *
 * Formula:
 *   rate_per_km = 2.50 + min(weight_kg × 0.003, 15)  (P/km)
 *   min_rate    = max(800, round(dist × rate, nearest 50))
 *
 * Examples:
 *   Gaborone → Francistown, 2 000 kg  → P 2 800
 *   Gaborone → Maun,        5 000 kg  → P 8 750
 */
export function calcMinRate(fromLocation = '', toLocation = '', weightKg = 0) {
  const from = fromLocation.split(',')[0].trim()
  const to   = toLocation.split(',')[0].trim()

  const key1 = `${from}|${to}`
  const key2 = `${to}|${from}`
  const dist  = ROAD_KM[key1] || ROAD_KM[key2] || 300

  const ratePerKm = 2.50 + Math.min((weightKg || 0) * 0.003, 15)
  const raw       = dist * ratePerKm

  return Math.max(800, Math.round(raw / 50) * 50)
}

/** Format as "P 1 200" */
export function fmtBWP(n) {
  return `P ${Number(n).toLocaleString('en-BW', { maximumFractionDigits: 0 })}`
}
