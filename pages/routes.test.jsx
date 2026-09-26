import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../javascript/test/renderRoute'

describe('app routes', () => {
  it('shows Discover at the root path', () => {
    renderRoute('/', { api: { 'GET /api/opportunities': [] } })

    expect(
      screen.getByRole('heading', { name: 'Discover Creator Opportunities' }),
    ).toBeInTheDocument()
  })

  it('shows the LyfeGo logo in the header, linking home', () => {
    renderRoute('/', { api: { 'GET /api/opportunities': [] } })

    const home = screen.getByRole('link', { name: /LyfeGo.*Creator Opportunities/ })
    expect(home).toHaveAttribute('href', '/')
    expect(home.querySelector('img')).toHaveAttribute('src', '/images/logo.png')
  })

  it('shows the not-found page for an unknown path', () => {
    renderRoute('/no-such-page')

    expect(screen.getByText("This opportunity doesn't exist")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse opportunities' })).toHaveAttribute('href', '/')
  })
})
