import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

const ICON_PROPS = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', className: 'shrink-0', 'aria-hidden': true }
const STROKE = { stroke: 'currentColor', strokeWidth: 1.4 }

function OverviewIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" {...STROKE} />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" {...STROKE} />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" {...STROKE} />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" {...STROKE} />
    </svg>
  )
}

function OpportunitiesIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 1.5L14 4.5L8 7.5L2 4.5L8 1.5Z" {...STROKE} strokeLinejoin="round" />
      <path d="M2 8L8 11L14 8" {...STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 11.5L8 14.5L14 11.5" {...STROKE} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ApplicationsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" {...STROKE} />
      <path d="M1.5 9.5h3.5l1.5 2h3l1.5-2H14.5" {...STROKE} strokeLinejoin="round" />
    </svg>
  )
}

function CreatorsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="6" cy="5" r="2.5" {...STROKE} />
      <path d="M1 13.5c0-2.76 2.24-5 5-5s5 2.24 5 5" {...STROKE} strokeLinecap="round" />
      <path d="M11 2.5a2.5 2.5 0 0 1 0 5M15 13.5c0-2.24-1.57-4.13-3.73-4.78" {...STROKE} strokeLinecap="round" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0" aria-hidden="true">
      <path d="M5.5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7.5" {...STROKE} strokeLinecap="round" />
      <path d="M8 1.5h3.5V5M11.5 1.5L6.5 6.5" {...STROKE} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const NAV = [
  { to: '/admin/overview', label: 'Overview', Icon: OverviewIcon },
  { to: '/admin/opportunities', label: 'Opportunities', Icon: OpportunitiesIcon },
  { to: '/admin/applications', label: 'Applications', Icon: ApplicationsIcon },
  { to: '/admin/creators', label: 'Creators', Icon: CreatorsIcon },
]

export function AdminLogo({ to }) {
  const logo = (
    <>
      {/* Decorative: the wordmark beside it names the link. */}
      <img src="/images/logo.png" alt="" className="h-7 w-auto" />
      <div>
        <p className="font-display font-bold text-gray-900 text-sm leading-none">LyfeGo</p>
        <p className="text-[10px] font-semibold text-brand uppercase tracking-wider mt-0.5">Admin Portal</p>
      </div>
    </>
  )
  if (!to) return <div className="flex items-center gap-2.5">{logo}</div>
  return (
    <Link to={to} className="flex items-center gap-2.5">
      {logo}
    </Link>
  )
}

function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-full w-60 bg-white border-r border-line flex flex-col z-40">
      <div className="px-4 py-4 border-b border-line">
        <AdminLogo to="/admin/opportunities" />
      </div>
      <nav aria-label="Admin Portal" className="flex-1 p-2 flex flex-col gap-0.5">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-100 text-brand' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-2">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand px-3 py-2.5 rounded-lg hover:bg-brand-50 transition-colors"
        >
          <ExternalIcon />
          View Creator Portal
        </a>
      </div>
    </aside>
  )
}

// The Admin Portal's desktop layout: the Figma sidebar beside the page.
export default function AdminLayout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="ml-60 flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}

// The Figma's page heading: an Outfit title with an optional grey subtitle.
export function PageHeader({ title, subtitle }) {
  return (
    <div>
      <h1 className="font-display text-xl font-bold text-gray-900">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}
