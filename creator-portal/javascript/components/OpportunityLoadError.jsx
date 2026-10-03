// Shown when an Opportunity fails to load (a network or server error, not "not found").
export default function OpportunityLoadError({ onRetry }) {
  return (
    <div role="alert" className="max-w-6xl mx-auto px-4 sm:px-6 text-center py-20 animate-fade-up">
      <p className="font-display text-gray-500 text-xl font-semibold mb-2">
        Couldn't load this opportunity
      </p>
      <p className="text-gray-400 text-sm mb-5">Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-semibold bg-brand text-white px-5 py-2.5 rounded-full hover:bg-brand-dark active:scale-95 transition-all"
      >
        Retry
      </button>
    </div>
  )
}
