import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Clock, AlertTriangle } from 'lucide-react'

export default function TrialBanner({ daysRemaining }) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('trial_banner_dismissed') === 'true'
  )

  if (dismissed) return null

  const dismiss = () => {
    sessionStorage.setItem('trial_banner_dismissed', 'true')
    setDismissed(true)
  }

  const urgent = daysRemaining <= 3

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-6 border animate-fadeIn ${
      urgent
        ? 'bg-rose-50 border-rose-200 text-rose-800'
        : 'bg-amber-50 border-amber-200 text-amber-800'
    }`}>
      <div className="flex-shrink-0">
        {urgent
          ? <AlertTriangle size={16} className="text-rose-500" />
          : <Clock size={16} className="text-amber-500" />
        }
      </div>

      <p className="text-sm font-medium flex-1 min-w-0">
        {daysRemaining <= 0
          ? <>Your free trial has ended. </>
          : <>You have <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong> left on your free trial. </>
        }
        <Link
          to="/carrier/subscription"
          className={`underline underline-offset-2 font-semibold ${urgent ? 'text-rose-700 hover:text-rose-900' : 'text-amber-700 hover:text-amber-900'}`}
        >
          Upgrade to keep full access.
        </Link>
      </p>

      <button
        onClick={dismiss}
        className={`flex-shrink-0 p-1 rounded-lg transition-colors ${urgent ? 'hover:bg-rose-100' : 'hover:bg-amber-100'}`}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
