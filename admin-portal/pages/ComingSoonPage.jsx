// Overview and Creators: not part of the MVP, with the Figma's wording.
export default function ComingSoonPage({ title, text }) {
  return (
    <div className="p-8">
      <h1 className="font-display text-xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  )
}

export function OverviewPage() {
  return <ComingSoonPage title="Overview" text="Dashboard analytics and summary — coming soon." />
}

export function CreatorsPage() {
  return <ComingSoonPage title="Creators" text="Creator profiles and engagement history — coming soon." />
}
