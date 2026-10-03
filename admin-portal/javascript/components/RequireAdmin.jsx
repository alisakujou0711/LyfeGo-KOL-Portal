import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAdminSession } from '../lib/api'

// Renders the Admin pages only for a signed-in Admin. Anyone else goes to
// sign-in, carrying the page they wanted so sign-in can bring them back.
export default function RequireAdmin() {
  const location = useLocation()
  const [state, setState] = useState({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    setState({ status: 'checking' })
    getAdminSession().then(
      (admin) => current && setState(admin ? { status: 'signed-in', admin } : { status: 'signed-out' }),
      () => current && setState({ status: 'failed' }),
    )
    return () => {
      current = false
    }
  }, [attempt])

  if (state.status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/admin/login?next=${next}`} replace />
  }
  if (state.status === 'failed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-surface px-4 text-center">
        <p className="text-sm text-gray-600">We couldn't reach the Admin Portal. Check your connection.</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="text-sm font-semibold text-brand hover:text-brand-dark"
        >
          Try again
        </button>
      </div>
    )
  }
  if (state.status === 'checking') return <div className="min-h-screen bg-surface" />
  return <Outlet context={{ admin: state.admin }} />
}
