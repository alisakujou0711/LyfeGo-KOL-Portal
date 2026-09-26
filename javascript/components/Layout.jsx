import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center">
        <Link to="/" className="flex items-center gap-2.5 group">
          {/* Decorative: the wordmark beside it names the link. */}
          <img
            src="/images/logo.png"
            alt=""
            className="h-8 w-auto transition-transform duration-300 group-hover:-translate-y-0.5"
          />
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-brand text-[18px] tracking-tight leading-none">
              LyfeGo
            </span>
            <span className="hidden sm:block w-px h-4 bg-gray-200 mx-0.5" />
            <span className="hidden sm:block text-sm font-medium text-gray-400">
              Creator Opportunities
            </span>
          </div>
        </Link>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-white mt-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/images/logo.png" alt="" className="h-5 w-auto" />
          <span className="font-display font-bold text-brand text-sm">LyfeGo</span>
        </div>
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} LyfeGo</p>
      </div>
    </footer>
  )
}

// Scroll to the top on every route change (but not on search-param-only
// changes, which the listing page uses for filters). If the URL carries a
// hash (e.g. "Change session" → #choose-session), scroll to that instead.
function useScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1))
      if (target) {
        // Wait a frame so the page has laid out before scrolling.
        requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        return
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])
}

export default function Layout() {
  useScrollToTop()
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />
      {/* Keyed on pathname so every page mounts fresh and plays its entrance animation. */}
      <div key={pathname} className="flex-1 flex flex-col animate-fade-in">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
