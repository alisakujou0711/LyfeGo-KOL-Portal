const STYLES = {
  Sport: 'bg-blue-50/90 text-blue-600',
  Lifestyle: 'bg-violet-50/90 text-violet-600',
  Barter: 'bg-emerald-50/90 text-emerald-700',
  Paid: 'bg-amber-50/90 text-amber-700',
}

export default function Badge({ label }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
        STYLES[label] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {label}
    </span>
  )
}

export function BadgeRow({ opportunity, className = '' }) {
  return (
    <div className={`flex gap-1.5 ${className}`}>
      <Badge label={opportunity.category} />
      <Badge label={opportunity.collab} />
    </div>
  )
}
