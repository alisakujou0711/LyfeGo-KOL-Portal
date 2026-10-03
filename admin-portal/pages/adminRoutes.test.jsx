import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, renderRoute } from '../../creator-portal/javascript/test/renderRoute'
import { ADMIN } from '../javascript/test/adminFixtures'

const NOT_SIGNED_IN = jsonResponse({ detail: 'Sign in as an Admin to continue.' }, 401)
const EMPTY_LIST = { counts: { total: 0, live: 0, draft: 0, closed: 0, applications: 0 }, opportunities: [] }

// The API as a browser sees it: signed out until a sign-in with `password` succeeds.
function adminApi({ signedIn = false, password = 'right password' } = {}) {
  return {
    'GET /api/admin/session': () => (signedIn ? ADMIN : NOT_SIGNED_IN.clone()),
    'POST /api/admin/session': async (request) => {
      const body = await request.json()
      if (body.password !== password) {
        return jsonResponse({ detail: 'Incorrect email or password.' }, 401)
      }
      signedIn = true
      return ADMIN
    },
    'GET /api/admin/opportunities': () => (signedIn ? EMPTY_LIST : NOT_SIGNED_IN.clone()),
  }
}

async function signIn(user, password = 'right password') {
  await user.type(screen.getByLabelText('Email'), ADMIN.email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Admin sign-in', () => {
  it('sends a signed-out visitor to sign in, then back to the page they wanted', async () => {
    const { user, location } = renderRoute('/admin/applications?opportunityId=3', { api: adminApi() })

    expect(await screen.findByRole('heading', { name: 'Sign in to the Admin Portal' })).toBeInTheDocument()
    expect(location().pathname).toBe('/admin/login')

    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Applications' })).toBeInTheDocument()
    expect(location()).toMatchObject({ pathname: '/admin/applications', search: '?opportunityId=3' })
  })

  it('shows one error for a wrong email or password and stays on the sign-in page', async () => {
    const { user, location } = renderRoute('/admin/login', { api: adminApi() })

    await signIn(user, 'wrong password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(location().pathname).toBe('/admin/login')
  })

  it('asks for both fields before contacting the server', async () => {
    const { user, fetch } = renderRoute('/admin/login', { api: adminApi() })

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and password.')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lands on Opportunities when there is no page to go back to', async () => {
    const { user, location } = renderRoute('/admin/login', { api: adminApi() })

    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Creator Opportunities' })).toBeInTheDocument()
    expect(location().pathname).toBe('/admin/opportunities')
  })

  it('never sends a signed-in Admin off the Admin Portal', async () => {
    const { user, location } = renderRoute('/admin/login?next=https://evil.example/admin', {
      api: adminApi(),
    })

    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Creator Opportunities' })).toBeInTheDocument()
    expect(location().pathname).toBe('/admin/opportunities')
  })

  it('offers a retry when the sign-in check cannot reach the server', async () => {
    let attempts = 0
    const { user } = renderRoute('/admin/overview', {
      api: {
        'GET /api/admin/session': () => {
          attempts += 1
          return attempts === 1 ? Promise.reject(new TypeError('Failed to fetch')) : ADMIN
        },
      },
    })

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
  })
})

describe('Admin Portal shell', () => {
  it('opens Opportunities from /admin', async () => {
    const { location } = renderRoute('/admin', { api: adminApi({ signedIn: true }) })

    expect(await screen.findByRole('heading', { name: 'Creator Opportunities' })).toBeInTheDocument()
    expect(screen.getByText('Manage and track all collaboration opportunities')).toBeInTheDocument()
    expect(location().pathname).toBe('/admin/opportunities')
  })

  it('reaches every page from the sidebar and marks the current one', async () => {
    const { user } = renderRoute('/admin/opportunities', { api: adminApi({ signedIn: true }) })
    const sidebar = await screen.findByRole('navigation', { name: 'Admin Portal' })

    await user.click(within(sidebar).getByRole('link', { name: 'Overview' }))
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('Dashboard analytics and summary — coming soon.')).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(sidebar).getByRole('link', { name: 'Applications' }))
    expect(screen.getByRole('heading', { name: 'Applications' })).toBeInTheDocument()

    await user.click(within(sidebar).getByRole('link', { name: 'Creators' }))
    expect(screen.getByRole('heading', { name: 'Creators' })).toBeInTheDocument()
    expect(screen.getByText('Creator profiles and engagement history — coming soon.')).toBeInTheDocument()

    await user.click(within(sidebar).getByRole('link', { name: 'Opportunities' }))
    expect(screen.getByRole('heading', { name: 'Creator Opportunities' })).toBeInTheDocument()
  })

  it('shows the LyfeGo Admin Portal logo, linking to Opportunities', async () => {
    renderRoute('/admin/overview', { api: adminApi({ signedIn: true }) })

    const logo = await screen.findByRole('link', { name: /LyfeGo.*Admin Portal/ })
    expect(logo).toHaveAttribute('href', '/admin/opportunities')
  })

  it('opens the Creator Portal in a new tab', async () => {
    renderRoute('/admin/opportunities', { api: adminApi({ signedIn: true }) })

    const link = await screen.findByRole('link', { name: 'View Creator Portal' })
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
