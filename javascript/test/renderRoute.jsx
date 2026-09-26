import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { AppRoutes } from '../App'

// Test helper: renders the real app routes at `path`, with every network
// request answered by `api` stubs at the fetch boundary.
//
//   renderRoute('/opportunity/3', {
//     api: {
//       'GET /api/opportunities/3': { id: '3', title: 'Tennis' },       // 200 JSON
//       'POST /api/applications': jsonResponse({ detail: '…' }, 409),   // any status
//       'GET /api/opportunities': () => Promise.reject(new TypeError('Failed to fetch')),
//     },
//   })
//
// A stub value is a JSON body (200), a Response, or a function
// `(request) => Response | body | Promise<…>` called on every matching request.
// Keys are "METHOD /path"; the query string is ignored when matching.
// Any request without a stub fails the test loudly.
export function renderRoute(path, { api = {} } = {}) {
  const fetch = vi.fn(async (input, init) => {
    const request = new Request(
      input instanceof Request ? input : new URL(input, 'http://localhost'),
      init,
    )
    const key = `${request.method} ${new URL(request.url).pathname}`
    if (!(key in api)) throw new Error(`Unstubbed request: ${key}`)

    const stub = api[key]
    const result = typeof stub === 'function' ? await stub(request) : stub
    return result instanceof Response ? result : jsonResponse(result)
  })
  vi.stubGlobal('fetch', fetch)

  let current
  function LocationProbe() {
    current = useLocation()
    return null
  }

  const user = userEvent.setup()
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  )
  // `location()` returns the router's current location ({ pathname, search }).
  return { ...view, user, fetch, location: () => current }
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
