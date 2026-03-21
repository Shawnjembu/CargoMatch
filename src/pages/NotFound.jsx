import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { Truck, ArrowRight } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream font-body">
      <Navbar />
      <div className="max-w-lg mx-auto px-6 pt-40 pb-16 text-center">
        <div className="w-20 h-20 bg-forest-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-forest-100">
          <Truck size={36} className="text-forest-400" />
        </div>
        <p className="text-forest-500 font-display font-800 text-6xl mb-2">404</p>
        <h1 className="font-display text-2xl font-800 text-stone-900 mb-3">Road ends here.</h1>
        <p className="text-stone-400 text-sm mb-10 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.<br />
          Let's get you back on route.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/"
            className="inline-flex items-center justify-center gap-2 bg-forest-500 hover:bg-forest-600 text-white font-display font-700 px-6 py-3 rounded-xl transition-all">
            Back to Home <ArrowRight size={16} />
          </Link>
          <Link to="/shipper"
            className="inline-flex items-center justify-center gap-2 bg-white border border-stone-200 hover:border-forest-300 text-stone-700 font-medium px-6 py-3 rounded-xl transition-all">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
