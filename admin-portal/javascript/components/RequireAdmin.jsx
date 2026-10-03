import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useApiQuery } from '../hooks/useApiQuery'
import { getAdminSession } from '../lib/api'

// Renders the Admin pages only for a signed-in Admin. Anyone else goes to
// sign-in, carrying the page they wanted so sign-in can bring them back.
export default function RequireAdmin() {
  const location = useLocation()
  const { status, data: admin, reload } = useApiQuery(getAdminSession, null)

  if (status === 'loading') return <div className="min-h-screen bg-surface" />
  if (status === 'ready' && admin === null) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/admin/login?next=${next}`} replace />
  }
  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-surface px-4 text-center">
        <p className="text-sm text-gray-600">We couldn't reach the Admin Portal. Check your connection.</p>
        <button
          type="button"
          onClick={reload}
          className="text-sm font-semibold text-brand hover:text-brand-dark"
        >
          Try again
        </button>
      </div>
    )
  }
  return <Outlet />
}
