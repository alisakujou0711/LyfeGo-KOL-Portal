import { screen, within } from '@testing-library/react'

// The signed-in Admin that tests stub 'GET /api/admin/session' with.
export const ADMIN = { email: 'staff@lyfego.test', name: 'Staff Member' }

// A list page's table rows, without its header row.
export function bodyRows() {
  const [, body] = screen.getAllByRole('rowgroup')
  return within(body).getAllByRole('row')
}
