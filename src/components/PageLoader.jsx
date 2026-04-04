import { Loader } from 'lucide-react'

export default function PageLoader({ message = 'Loading...' }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center">
      <Loader size={28} className="text-forest-500 animate-spin mb-3" />
      <p className="text-sm text-stone-400">{message}</p>
    </div>
  )
}

export function InlineLoader({ size = 16, className = '' }) {
  return <Loader size={size} className={`animate-spin ${className}`} />
}

export function ButtonLoader({ size = 14 }) {
  return <Loader size={size} className="animate-spin" />
}