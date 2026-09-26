import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, renderRoute } from '../javascript/test/renderRoute'

function session(overrides = {}) {
  return {
    id: '11',
    date: '2026-09-24',
    start: '10:00',
    end: '11:00',
    slotsLeft: 3,
    status: 'available',
    ...overrides,
  }
}

function detail(overrides = {}) {
  return {
    id: '1',
    title: 'Tennis Group Class',
    partner: 'Kallang Tennis Centre',
    category: 'Sport',
    subcategory: 'Tennis',
    compensationType: 'Barter',
    whatCreatorReceives: 'Complimentary group tennis class (1 hour)',
    payment: null,
    area: 'Kallang',
    heroImage: 'https://images.example/tennis.jpg',
    nextSession: { date: '2026-09-24', start: '10:00', end: '11:00' },
    moreSessionsCount: 1,
    slotsLeft: 5,
    limitedSpots: false,
    aboutExperience: 'A group tennis class.',
    collaborationType: 'One-off',
    deliverableType: 'Fixed',
    deliverableNote: null,
    deliverables: ['Post 1 × Instagram Reel featuring the class'],
    experienceLevels: ['Beginner'],
    additionalInfo: [],
    venueName: 'Kallang Tennis Centre',
    fullAddress: 'Stadium Road, Singapore 397630',
    availability: 'open',
    weeklyClasses: [],
    sessions: [session(), session({ id: '12', date: '2026-09-26', slotsLeft: 2 })],
    ...overrides,
  }
}

// A promise the test settles by hand, to observe the page while a request is in flight.
function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// From the detail page: choose the second Session, then Register.
async function openForm({ api = {} } = {}) {
  const view = renderRoute('/opportunity/1', {
    api: { 'GET /api/opportunities/1': detail(), ...api },
  })
  const { user } = view
  await screen.findByRole('heading', { level: 1, name: 'Tennis Group Class' })
  await user.click(screen.getAllByRole('radio')[1])
  await user.click(screen.getAllByRole('button', { name: /Register for Opportunity/ })[0])
  await screen.findByRole('button', { name: 'Submit Registration' })
  return view
}

async function fillForm(user) {
  await user.type(screen.getByLabelText(/Full Name/), 'Jamie Tan')
  await user.type(screen.getByLabelText(/Instagram Handle/), '@jamie.moves')
  await user.type(screen.getByLabelText(/Email Address/), 'jamie@example.com')
  await user.type(screen.getByLabelText(/Mobile/), '+65 9123 4567')
  await user.type(screen.getByLabelText(/Note for LyfeGo/), 'Weekly tennis content')
}

function submitButton() {
  return screen.getByRole('button', { name: /Submit Registration|Submitting/ })
}

function posted(fetch) {
  return fetch.mock.calls
    .map(([input, init]) => new Request(new URL(input, 'http://localhost'), init))
    .filter((request) => request.method === 'POST')
}

describe('Registering for an opportunity', () => {
  it('summarises the opportunity, the chosen Session and the compensation', async () => {
    await openForm({
      api: {
        'GET /api/opportunities/1': detail({
          compensationType: 'Paid',
          whatCreatorReceives: null,
          payment: {
            currency: 'SGD',
            amount: 150,
            basis: 'Per completed collaboration',
            note: 'Complimentary tennis class',
          },
        }),
      },
    })

    expect(screen.getByRole('heading', { level: 2, name: 'Tennis Group Class' })).toBeInTheDocument()
    expect(screen.getByText(/Saturday, 26 September/)).toBeInTheDocument()
    expect(screen.getByText('Kallang')).toBeInTheDocument()
    expect(
      screen.getByText('S$150 per completed collaboration + Complimentary tennis class'),
    ).toBeInTheDocument()
  })

  it('submits the Application and confirms only once the API has stored it', async () => {
    const response = deferred()
    const { user, fetch } = await openForm({
      api: { 'POST /api/applications': () => response.promise },
    })
    await fillForm(user)

    await user.click(submitButton())

    const [request] = posted(fetch)
    expect(new URL(request.url).pathname).toBe('/api/applications')
    const body = await request.json()
    expect(body).toEqual({
      opportunityId: '1',
      sessionId: '12',
      fullName: 'Jamie Tan',
      instagram: 'jamie.moves',
      tiktok: '',
      email: 'jamie@example.com',
      phone: '+65 9123 4567',
      note: 'Weekly tennis content',
      submissionKey: expect.any(String),
    })
    expect(body.submissionKey).not.toBe('')
    expect(screen.queryByText('Registration received')).not.toBeInTheDocument()

    response.resolve(jsonResponse({ id: '501' }, 201))

    expect(await screen.findByRole('heading', { name: 'Registration received' })).toBeInTheDocument()
    expect(screen.getByText(/Thanks, Jamie/)).toBeInTheDocument()
    expect(screen.getByText(/does not guarantee your place/)).toBeInTheDocument()
    expect(screen.getAllByText(/Saturday, 26 September/)[0]).toBeInTheDocument()
  })

  it('rechecks the Session on entry and sends the creator back with a notice if it has filled', async () => {
    let detailRequests = 0
    const { user } = renderRoute('/opportunity/1', {
      api: {
        'GET /api/opportunities/1': () => {
          detailRequests += 1
          return detailRequests === 1
            ? detail()
            : detail({ sessions: [session(), session({ id: '12', slotsLeft: 0, status: 'filled' })] })
        },
      },
    })
    await screen.findByRole('heading', { level: 1, name: 'Tennis Group Class' })
    await user.click(screen.getAllByRole('radio')[1])
    await user.click(screen.getAllByRole('button', { name: /Register for Opportunity/ })[0])

    expect(
      await screen.findByText(
        'The session you chose is no longer available. Please choose another session.',
      ),
    ).toBeInTheDocument()
    expect(detailRequests).toBe(3)
    expect(screen.getByRole('heading', { level: 1, name: 'Tennis Group Class' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit Registration' })).not.toBeInTheDocument()
  })

  it('offers a retry, keeping the chosen Session, when the recheck on entry fails', async () => {
    let detailRequests = 0
    const { user } = renderRoute('/opportunity/1', {
      api: {
        'GET /api/opportunities/1': () => {
          detailRequests += 1
          return detailRequests === 2 ? jsonResponse({ detail: 'boom' }, 500) : detail()
        },
      },
    })
    await screen.findByRole('heading', { level: 1, name: 'Tennis Group Class' })
    await user.click(screen.getAllByRole('radio')[1])
    await user.click(screen.getAllByRole('button', { name: /Register for Opportunity/ })[0])

    expect(await screen.findByText("Couldn't load this opportunity")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('button', { name: 'Submit Registration' })).toBeInTheDocument()
  })

  it('keeps what the creator typed and asks for another Session when theirs filled meanwhile', async () => {
    const { user } = await openForm({
      api: {
        'POST /api/applications': jsonResponse(
          { detail: 'This session is now full. Please choose another session.' },
          409,
        ),
      },
    })
    await fillForm(user)

    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This session is now full. Please choose another session.',
    )
    expect(screen.queryByText('Registration received')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Full Name/)).toHaveValue('Jamie Tan')
    expect(submitButton()).toBeEnabled()

    await user.click(screen.getByRole('link', { name: 'Choose another session' }))
    await screen.findByRole('heading', { level: 1, name: 'Tennis Group Class' })
    await user.click(screen.getAllByRole('radio')[0])
    await user.click(screen.getAllByRole('button', { name: /Register for Opportunity/ })[0])

    await screen.findByRole('button', { name: 'Submit Registration' })
    expect(screen.getByLabelText(/Full Name/)).toHaveValue('Jamie Tan')
    expect(screen.getByLabelText(/Email Address/)).toHaveValue('jamie@example.com')
  })

  it('disables Submit while the submission is in flight, so it is sent once', async () => {
    const response = deferred()
    const { user, fetch } = await openForm({
      api: { 'POST /api/applications': () => response.promise },
    })
    await fillForm(user)

    await user.click(submitButton())
    expect(submitButton()).toBeDisabled()
    expect(submitButton()).toHaveTextContent('Submitting…')
    await user.click(submitButton())
    await user.type(screen.getByLabelText(/Full Name/), '{Enter}')

    expect(posted(fetch)).toHaveLength(1)
    response.resolve(jsonResponse({ id: '501' }, 201))
    await screen.findByRole('heading', { name: 'Registration received' })
    expect(posted(fetch)).toHaveLength(1)
  })

  it('lets the creator retry a failed submission with the same submission key', async () => {
    let attempts = 0
    const { user, fetch } = await openForm({
      api: {
        'POST /api/applications': () => {
          attempts += 1
          if (attempts === 1) return Promise.reject(new TypeError('Failed to fetch'))
          return jsonResponse({ id: '501' }, 201)
        },
      },
    })
    await fillForm(user)

    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong while submitting. Please try again.',
    )
    expect(screen.getByLabelText(/Full Name/)).toHaveValue('Jamie Tan')
    await user.click(submitButton())

    await screen.findByRole('heading', { name: 'Registration received' })
    const [first, retry] = await Promise.all(posted(fetch).map((request) => request.json()))
    expect(retry.submissionKey).toBe(first.submissionKey)
  })

  it('shows the per-field messages the API rejects a submission with', async () => {
    const { user } = await openForm({
      api: {
        'POST /api/applications': jsonResponse(
          {
            detail: 'Please check the highlighted fields.',
            errors: { email: 'Please enter a valid email address' },
          },
          422,
        ),
      },
    })
    await fillForm(user)

    await user.click(submitButton())

    expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument()
    expect(screen.getByLabelText(/Email Address/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Registration received')).not.toBeInTheDocument()
  })

  it('shows a general error when the API rejects a field the creator cannot see', async () => {
    const { user } = await openForm({
      api: {
        'POST /api/applications': jsonResponse(
          {
            detail: 'Please check the highlighted fields.',
            errors: { sessionId: 'Please choose a session' },
          },
          422,
        ),
      },
    })
    await fillForm(user)

    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong while submitting. Please try again.',
    )
  })

  it('sends a refreshed confirmation page back to the opportunity without resubmitting', async () => {
    const { user, unmount } = await openForm({
      api: { 'POST /api/applications': jsonResponse({ id: '501' }, 201) },
    })
    await fillForm(user)
    await user.click(submitButton())
    await screen.findByRole('heading', { name: 'Registration received' })

    // A refresh: the app starts again at the same URL; sessionStorage survives.
    unmount()
    const { fetch } = renderRoute('/opportunity/1/confirmation', {
      api: { 'GET /api/opportunities/1': detail() },
    })

    await screen.findByRole('heading', { level: 1, name: 'Tennis Group Class' })
    expect(screen.queryByText('Registration received')).not.toBeInTheDocument()
    expect(posted(fetch)).toHaveLength(0)
  })
})

