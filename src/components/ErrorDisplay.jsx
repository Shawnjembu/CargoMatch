import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ErrorDisplay({ 
  title = 'Something went wrong',
  message = 'An error occurred while loading this page.',
  onRetry = null,
  showHomeLink = false,
  className = ''
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
        <AlertTriangle size={28} className="text-rose-500" />
      </div>
      <h3 className="font-display font-700 text-stone-900 text-lg mb-2">{title}</h3>
      <p className="text-stone-500 text-sm text-center max-w-sm mb-6">{message}</p>
      
      <div className="flex flex-col sm:flex-row gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-forest-500 hover:bg-forest-600 text-white font-medium text-sm rounded-xl transition-colors"
          >
            <RefreshCw size={14} /> Try Again
          </button>
        )}
        {showHomeLink && (
          <Link
            to="/"
            className="flex items-center justify-center gap-2 px-5 py-2.5 border border-stone-200 text-stone-600 font-medium text-sm rounded-xl hover:bg-stone-50 transition-colors"
          >
            <Home size={14} /> Go Home
          </Link>
        )}
      </div>
    </div>
  )
}

export function InlineError({ message, onDismiss = null, className = '' }) {
  if (!message) return null
  
  return (
    <div className={`flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm ${className}`}>
      <AlertTriangle size={16} className="flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-rose-400 hover:text-rose-600">
          ×
        </button>
      )}
    </div>
  )
}