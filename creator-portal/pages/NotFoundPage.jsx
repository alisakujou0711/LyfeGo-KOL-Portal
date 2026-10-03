import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-24 text-center animate-fade-up">
      <p className="font-display text-6xl font-bold text-brand/20 mb-2">404</p>
      <p className="font-display text-gray-700 text-xl font-semibold mb-2">
        This opportunity doesn't exist
      </p>
      <p className="text-gray-400 text-sm mb-6">
        It may have been removed, or the link you followed is broken.
      </p>
      <Link
        to="/"
        className="inline-block text-sm font-semibold bg-brand text-white px-5 py-2.5 rounded-full hover:bg-brand-dark active:scale-95 transition-all"
      >
        Browse opportunities
      </Link>
    </main>
  )
}
