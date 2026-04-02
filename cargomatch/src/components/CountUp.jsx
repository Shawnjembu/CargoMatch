import { useState, useEffect, useRef } from 'react'

/**
 * Animates a number from 0 to `to` with ease-out-quart.
 * Re-triggers whenever `to` changes.
 */
export default function CountUp({ to = 0, duration = 1300, decimals = 0, prefix = '', suffix = '' }) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  const prev = useRef(0)

  useEffect(() => {
    if (to === 0 && prev.current === 0) return
    cancelAnimationFrame(raf.current)
    const from  = prev.current
    prev.current = to
    const start = performance.now()

    const step = (now) => {
      const t      = Math.min((now - start) / duration, 1)
      const eased  = 1 - Math.pow(1 - t, 4)          // ease-out quart
      const current = from + (to - from) * eased
      setVal(decimals > 0 ? parseFloat(current.toFixed(decimals)) : Math.round(current))
      if (t < 1) raf.current = requestAnimationFrame(step)
    }

    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [to])

  const display = decimals > 0 ? val.toFixed(decimals) : val.toLocaleString()

  return <>{prefix}{display}{suffix}</>
}
