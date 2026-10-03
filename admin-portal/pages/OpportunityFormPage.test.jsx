import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, renderRoute } from '../../creator-portal/javascript/test/renderRoute'

const ADMIN = { email: 'staff@lyfego.test', name: 'Staff Member' }
const EMPTY_LIST = { counts: { total: 0, live: 0, draft: 0, closed: 0, applications: 0 }, opportunities: [] }

// What the form sends for a blank Opportunity: only the Figma's defaults.
const BLANK_REQUEST = {
  title: '', partner: '', category: 'Sport', subcategory: '', heroImage: '', aboutExperience: '',
  compensationType: 'Barter', whatCreatorReceives: '', currency: 'SGD', paymentAmount: '', paymentBasis: null,
  paymentNotes: '', collaborationType: 'One-off', deliverableType: 'Fixed', deliverableNote: '', deliverables: [''],
  experienceLevels: ['All Levels'], additionalInfo: [],
  scheduleType: 'specific',
  sessions: [{ date: '', start: '', end: '', slots: '' }],
  recurring: { days: [], start: '', end: '', startDate: '', endDate: '', slots: '' },
  weeklySessions: [],
  venueName: '', fullAddress: '', area: '', publishingStatus: 'Draft',
}

const TENNIS = {
  id: '1',
  version: '2026-09-14T23:30:00',
  publishingStatus: 'Draft',
  title: 'Tennis Group Class',
  partner: 'The Best Group',
  category: 'Sport',
  subcategory: 'Tennis',
  heroImage: 'https://images.example/tennis.jpg',
  aboutExperience: 'A group tennis class.',
  compensationType: 'Paid',
  whatCreatorReceives: '',
  currency: 'SGD',
  paymentAmount: 150,
  paymentBasis: 'Per post',
  paymentNotes: '',
  collaborationType: 'One-off',
  deliverableType: 'Fixed',
  deliverableNote: '',
  deliverables: ['1 × Instagram Reel'],
  experienceLevels: ['Beginner', 'Advanced'],
  additionalInfo: [{ label: 'Equipment', value: 'Racquets provided' }],
  scheduleType: 'recurring',
  sessions: [{ id: '7', date: '2026-09-30', start: '20:00', end: '21:00', slots: null }], // a Draft may leave slots blank
  recurring: { days: ['Sat'], start: '20:00', end: '21:00', startDate: '2026-09-26', endDate: null, slots: 3 },
  weeklySessions: [],
  venueName: 'Kallang Tennis Centre',
  fullAddress: '',
  area: 'Kallang',
}

const LIVE = { ...TENNIS, publishingStatus: 'Live' }

// The signed-in API, with `extra` stubs; every save is recorded in `saves`, and
// every check-only save (`?check=true`, answered by the same stub) in `checks`.
function adminApi(extra = {}) {
  const saves = []
  const checks = []
  const record = (respond) => async (request) => {
    if (request.method === 'GET') return respond()
    const body = await request.json()
    const check = new URL(request.url).searchParams.get('check') === 'true'
    ;(check ? checks : saves).push({ method: request.method, body })
    return respond(body)
  }
  return {
    saves,
    checks,
    api: {
      'GET /api/admin/session': ADMIN,
      'GET /api/admin/opportunities': EMPTY_LIST,
      'GET /api/admin/opportunities/1': TENNIS,
      'POST /api/admin/opportunities': record(() => jsonResponse({ ...TENNIS, id: '12' }, 201)),
      'PUT /api/admin/opportunities/1': record(() => TENNIS),
      ...Object.fromEntries(Object.entries(extra).map(([key, respond]) => [key, record(respond)])),
    },
  }
}

const section = (name) => screen.getByRole('region', { name })
const pressed = (group) => within(group).getByRole('button', { pressed: true })
const saveDraft = (user) => user.click(screen.getAllByRole('button', { name: 'Save Draft' })[0])
// Clicks `name` in the pop-up asking `question`, once it opens.
async function answer(user, question, name) {
  const dialog = await screen.findByRole('dialog', { name: question })
  await user.click(within(dialog).getByRole('button', { name }))
  return dialog
}

describe('Create Opportunity', () => {
  it('saves an untouched form as a Draft and returns to the list', async () => {
    const { api, saves } = adminApi()
    const { user, location } = renderRoute('/admin/create-opportunity', { api })

    expect(await screen.findByText('New Opportunity')).toBeInTheDocument()
    await saveDraft(user)

    expect(await screen.findByRole('heading', { name: 'Creator Opportunities' })).toBeInTheDocument()
    expect(location().pathname).toBe('/admin/opportunities')
    expect(saves).toEqual([{ method: 'POST', body: BLANK_REQUEST }])
  })

  it('opens from the list and has all seven sections with Cancel and Save Draft top and bottom', async () => {
    const { api } = adminApi()
    const { user } = renderRoute('/admin/opportunities', { api })

    await user.click(await screen.findByRole('link', { name: 'Create Opportunity' }))

    for (const name of ['1. Basic Information', '2. Collaboration', '3. Content Deliverables', '4. Creator Requirements',
      '5. Schedule & Availability', '6. Location', '7. Publishing']) {
      expect(section(name)).toBeInTheDocument()
    }
    expect(screen.getByRole('navigation', { name: 'Form sections' })).toHaveTextContent(/7\s+Publishing/)
    expect(screen.getAllByRole('link', { name: 'Cancel' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Save Draft' })).toHaveLength(2)
  })

  it('shows What the Creator Receives for Barter, and currency, amount, basis and notes for Paid', async () => {
    const { api, saves } = adminApi()
    const { user } = renderRoute('/admin/create-opportunity', { api })
    const collaboration = await screen.findByRole('region', { name: '2. Collaboration' })

    expect(within(collaboration).getByLabelText('What the Creator Receives')).toBeInTheDocument()
    expect(within(collaboration).queryByLabelText('Payment Amount')).not.toBeInTheDocument()

    await user.click(within(collaboration).getByRole('button', { name: 'Paid' }))
    expect(within(collaboration).queryByLabelText('What the Creator Receives')).not.toBeInTheDocument()
    await user.click(within(collaboration).getByRole('button', { name: 'USD' }))
    await user.type(within(collaboration).getByLabelText('Payment Amount'), '100.50')
    const basis = within(collaboration).getByRole('group', { name: 'Payment Basis' })
    expect(within(basis).queryByRole('button', { pressed: true })).not.toBeInTheDocument()
    await user.click(within(basis).getByRole('button', { name: 'Per completed collaboration' }))
    await user.click(within(basis).getByRole('button', { name: 'Flat fee' }))
    expect(pressed(basis)).toHaveTextContent('Flat fee')
    await user.type(within(collaboration).getByLabelText('Payment Conditions / Notes', { exact: false }), 'Within 14 days')
    await user.click(within(collaboration).getByRole('button', { name: 'One-off or Ongoing' }))
    await saveDraft(user)

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body).toMatchObject({
      compensationType: 'Paid', currency: 'USD', paymentAmount: '100.50', paymentBasis: 'Flat fee',
      paymentNotes: 'Within 14 days',
      collaborationType: 'One-off or Ongoing',
    })
  })

  it('picks several of Beginner, Intermediate and Advanced, or All Levels or Not Applicable on its own', async () => {
    const { api, saves } = adminApi()
    const { user } = renderRoute('/admin/create-opportunity', { api })
    const levels = within(await screen.findByRole('region', { name: '4. Creator Requirements' }))
      .getByRole('group', { name: 'Experience / Skill Level' })
    const level = (name) => within(levels).getByRole('button', { name })
    const picked = () => within(levels).getAllByRole('button', { pressed: true }).map((button) => button.textContent)

    expect(picked()).toEqual(['All Levels'])
    await user.click(level('Advanced'))
    await user.click(level('Beginner'))
    expect(picked()).toEqual(['Beginner', 'Advanced'])

    await user.click(level('Not Applicable'))
    expect(picked()).toEqual(['Not Applicable'])
    await user.click(level('Intermediate'))
    expect(picked()).toEqual(['Intermediate'])
    await user.click(level('Intermediate')) // the last one stays picked
    expect(picked()).toEqual(['Intermediate'])
    await user.click(level('All Levels'))
    await user.click(level('All Levels'))
    expect(picked()).toEqual(['All Levels'])

    await user.click(level('Beginner'))
    await user.click(level('Advanced'))
    await user.click(level('Beginner')) // unpicks it, as another is picked
    await saveDraft(user)
    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.experienceLevels).toEqual(['Advanced'])
  })

  it('adds and removes deliverables and requirements, up to 10 each', async () => {
    const { api, saves } = adminApi()
    const { user } = renderRoute('/admin/create-opportunity', { api })
    const deliverables = await screen.findByRole('region', { name: '3. Content Deliverables' })
    const requirements = section('4. Creator Requirements')

    expect(within(deliverables).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    for (let i = 1; i < 10; i++) await user.click(within(deliverables).getByRole('button', { name: 'Add Deliverable' }))
    expect(within(deliverables).getAllByRole('textbox', { name: /^Deliverable \d+$/ })).toHaveLength(10)
    expect(within(deliverables).queryByRole('button', { name: 'Add Deliverable' })).not.toBeInTheDocument()

    await user.type(within(deliverables).getByLabelText('Deliverable 1'), 'Reel')
    await user.type(within(deliverables).getByLabelText('Deliverable 2'), 'Stories')
    await user.click(within(deliverables).getByRole('button', { name: 'Remove deliverable 1' }))
    expect(within(deliverables).getByLabelText('Deliverable 1')).toHaveValue('Stories')
    expect(within(deliverables).getByRole('button', { name: 'Add Deliverable' })).toBeInTheDocument()

    for (let i = 0; i < 10; i++) await user.click(within(requirements).getByRole('button', { name: 'Add Requirement' }))
    expect(within(requirements).queryByRole('button', { name: 'Add Requirement' })).not.toBeInTheDocument()
    for (let i = 10; i > 1; i--) await user.click(within(requirements).getByRole('button', { name: `Remove requirement ${i}` }))
    await user.type(within(requirements).getByLabelText('Requirement 1 label'), 'Equipment')
    await user.type(within(requirements).getByLabelText('Requirement 1 value'), 'Shoes provided')
    await saveDraft(user)

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.deliverables).toEqual(['Stories', '', '', '', '', '', '', '', ''])
    expect(saves[0].body.additionalInfo).toEqual([{ label: 'Equipment', value: 'Shoes provided' }])
  })

  it('switches between session rows and the recurring schedule', async () => {
    const { api, saves } = adminApi()
    const { user } = renderRoute('/admin/create-opportunity', { api })
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    const first = within(schedule).getByRole('group', { name: 'Session 1' })
    expect(within(first).getByLabelText('Creator Slots')).toHaveAccessibleDescription('At least 1')
    await user.click(within(schedule).getByRole('button', { name: 'Add Session' }))
    await user.click(within(schedule).getByRole('button', { name: 'Remove session 2' }))
    expect(within(schedule).queryByLabelText('Day(s) of Week')).not.toBeInTheDocument()

    await user.click(within(schedule).getByRole('button', { name: /Recurring Schedule/ }))
    expect(within(schedule).queryByRole('group', { name: 'Session 1' })).not.toBeInTheDocument()
    const days = within(schedule).getByRole('group', { name: 'Day(s) of Week' })
    await user.click(within(days).getByRole('button', { name: 'Sat' }))
    await user.click(within(days).getByRole('button', { name: 'Tue' }))
    expect(within(schedule).getByLabelText('Creator Slots per Session')).toHaveAccessibleDescription('At least 1')
    await user.type(within(schedule).getByLabelText('Creator Slots per Session'), '4')
    await saveDraft(user)

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body).toMatchObject({
      scheduleType: 'recurring',
      recurring: { days: ['Sat', 'Tue'], start: '', end: '', startDate: '', endDate: '', slots: '4' },
    })
  })

  it('keeps every typed value and shows the errors when a save is refused', async () => {
    const { api } = adminApi({
      'POST /api/admin/opportunities': () => jsonResponse({
        detail: 'Please check the highlighted fields.',
        errors: { title: 'Title must be 255 characters or fewer', 'sessions.0.start': 'Enter a start time' },
      }, 422),
    })
    const { user, location } = renderRoute('/admin/create-opportunity', { api })

    await user.type(await screen.findByLabelText('Opportunity Title'), 'Padel Social')
    await user.type(screen.getByLabelText('Area / Neighbourhood'), 'Bukit Timah')
    await saveDraft(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Please check the highlighted fields.')
    expect(screen.getByLabelText('Opportunity Title')).toHaveValue('Padel Social')
    expect(screen.getByLabelText('Opportunity Title')).toHaveAccessibleDescription('Title must be 255 characters or fewer')
    expect(screen.getByLabelText('Area / Neighbourhood')).toHaveAccessibleDescription(/^Short label shown/)
    const first = within(section('5. Schedule & Availability')).getByRole('group', { name: 'Session 1' })
    expect(within(first).getByLabelText('Start Time')).toHaveAccessibleDescription('Enter a start time')
    expect(screen.getByLabelText('Area / Neighbourhood')).toHaveValue('Bukit Timah')
    expect(location().pathname).toBe('/admin/create-opportunity')
    expect(screen.getAllByRole('button', { name: 'Save Draft' })[0]).toBeEnabled()
  })

  it('says the save failed, without saying saved, when the server can’t be reached', async () => {
    const { api } = adminApi({ 'POST /api/admin/opportunities': () => Promise.reject(new TypeError('Failed to fetch')) })
    const { user } = renderRoute('/admin/create-opportunity', { api })

    await user.type(await screen.findByLabelText('Opportunity Title'), 'Padel Social')
    await saveDraft(user)

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the draft.")
    expect(screen.getByLabelText('Opportunity Title')).toHaveValue('Padel Social')
    expect(screen.queryByText(/^saved/i)).not.toBeInTheDocument()
  })

  it('cancels back to the list at once when nothing has changed', async () => {
    const { api, saves } = adminApi()
    const { user, location } = renderRoute('/admin/create-opportunity', { api })

    await screen.findByText('New Opportunity')
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[1])

    expect(location().pathname).toBe('/admin/opportunities')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saves).toEqual([])
  })

  it('asks before discarding changes, from Cancel or the breadcrumb', async () => {
    const { api, saves } = adminApi()
    const { user, location } = renderRoute('/admin/create-opportunity', { api })

    await user.type(await screen.findByLabelText('Opportunity Title'), 'Padel Social')
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0])
    await answer(user, 'Discard your changes?', 'Keep editing')

    expect(location().pathname).toBe('/admin/create-opportunity')
    expect(screen.getByLabelText('Opportunity Title')).toHaveValue('Padel Social')

    await user.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Opportunities' }))
    await answer(user, 'Discard your changes?', 'Discard')

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(location().pathname).toBe('/admin/opportunities')
    expect(saves).toEqual([])
  })

  it('doesn’t count typing something and taking it out again as a change', async () => {
    const { api } = adminApi()
    const { user, location } = renderRoute('/admin/edit-opportunity/1', { api })

    const venue = await screen.findByLabelText('Venue Name', { exact: false })
    await user.type(venue, 'x')
    await user.type(venue, '{Backspace}')
    await user.click(screen.getAllByRole('link', { name: 'Cancel' })[0])

    expect(location().pathname).toBe('/admin/opportunities')
  })
})

describe('Edit Opportunity', () => {
  it('shows the stored fields, with the title in the breadcrumb', async () => {
    const { api } = adminApi()
    renderRoute('/admin/edit-opportunity/1', { api })

    const crumb = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(crumb).toHaveTextContent('Opportunities/Tennis Group Class')
    expect(screen.getByLabelText('Opportunity Title')).toHaveValue('Tennis Group Class')
    expect(screen.getByLabelText('Payment Amount')).toHaveValue('150')
    expect(pressed(screen.getByRole('group', { name: 'Payment Basis' }))).toHaveTextContent('Per post')
    expect(within(screen.getByRole('group', { name: 'Experience / Skill Level' }))
      .getAllByRole('button', { pressed: true }).map((button) => button.textContent)).toEqual(['Beginner', 'Advanced'])
    expect(screen.getByLabelText('Deliverable 1')).toHaveValue('1 × Instagram Reel')
    expect(screen.getByLabelText('Requirement 1 value')).toHaveValue('Racquets provided')
    expect(pressed(screen.getByRole('group', { name: 'Status' }))).toHaveTextContent('Draft')
  })

  it('shows both the recurring schedule and the one-off sessions when it has both', async () => {
    const { api } = adminApi()
    renderRoute('/admin/edit-opportunity/1', { api })
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    expect(pressed(within(schedule).getByRole('group', { name: 'Schedule Type' }))).toHaveTextContent('Recurring Schedule')
    expect(pressed(within(schedule).getByRole('group', { name: 'Day(s) of Week' }))).toHaveTextContent('Sat')
    expect(within(schedule).getByLabelText('Creator Slots per Session')).toHaveValue(3)
    const session = within(schedule).getByRole('group', { name: 'Session 1' })
    expect(within(session).getByLabelText('Date')).toHaveValue('2026-09-30')
    expect(within(session).getByLabelText(/Creator Slots/)).toHaveValue(null) // blank on a Draft
  })

  it('saves every field as a Draft with the version it was loaded with', async () => {
    const { api, saves } = adminApi()
    const { user, location } = renderRoute('/admin/edit-opportunity/1', { api })

    const title = await screen.findByLabelText('Opportunity Title')
    await user.clear(title)
    await user.type(title, 'Tennis for Two')
    await user.click(screen.getAllByRole('button', { name: 'Save Draft' })[1])

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(location().pathname).toBe('/admin/opportunities')
    const { id, ...stored } = TENNIS
    expect(saves).toEqual([{
      method: 'PUT',
      body: {
        ...stored,
        title: 'Tennis for Two',
        paymentAmount: '150',
        publishingStatus: 'Draft',
        sessions: [{ id: '7', date: '2026-09-30', start: '20:00', end: '21:00', slots: '' }],
        recurring: { ...TENNIS.recurring, endDate: '', slots: '3' },
      },
    }])
  })

  it('shows the API’s message when someone else saved first', async () => {
    const { api } = adminApi({
      'PUT /api/admin/opportunities/1': () => jsonResponse({ detail: 'Someone else saved this opportunity after you opened it.' }, 409),
    })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })

    await user.type(await screen.findByLabelText('Venue Name', { exact: false }), ' Court 3')
    await saveDraft(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else saved this opportunity')
    expect(screen.getByLabelText('Venue Name', { exact: false })).toHaveValue('Kallang Tennis Centre Court 3')
  })

  it('sends the session rows it keeps, with their ids, and leaves out removed ones', async () => {
    const sessions = [
      { id: '7', date: '2026-09-30', start: '20:00', end: '21:00', slots: 4 },
      { id: '8', date: '2026-10-07', start: '20:00', end: '21:00', slots: null },
    ]
    const { api, saves } = adminApi({ 'GET /api/admin/opportunities/1': () => ({ ...TENNIS, scheduleType: 'specific', sessions }) })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    await user.click(within(schedule).getByRole('button', { name: 'Remove session 1' }))
    const slots = within(within(schedule).getByRole('group', { name: 'Session 1' })).getByLabelText(/Creator Slots/)
    await user.type(slots, '6')
    await user.click(within(schedule).getByRole('button', { name: 'Add Session' }))
    const added = within(schedule).getByRole('group', { name: 'Session 2' })
    await user.type(within(added).getByLabelText('Date'), '2026-10-14')
    await saveDraft(user)

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.sessions).toEqual([
      { id: '8', date: '2026-10-07', start: '20:00', end: '21:00', slots: '6' },
      { date: '2026-10-14', start: '', end: '', slots: '' },
    ])
  })

  it('sends no session rows while it shows only the recurring schedule', async () => {
    const { api, saves } = adminApi({ 'GET /api/admin/opportunities/1': () => ({ ...TENNIS, sessions: [] }) })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    expect(within(schedule).queryByRole('group', { name: 'Session 1' })).not.toBeInTheDocument()
    await saveDraft(user)

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.sessions).toEqual([])
  })

  it('keeps showing the one-off sessions of a recurring opportunity after removing one', async () => {
    const { api } = adminApi()
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    await user.click(within(schedule).getByRole('button', { name: 'Add Session' }))
    await user.click(within(schedule).getByRole('button', { name: 'Remove session 1' }))

    expect(within(schedule).getByRole('group', { name: 'Session 1' })).toBeInTheDocument()
  })

  it('shows a session rule’s error on the row it belongs to', async () => {
    const sessions = [
      { id: '7', date: '2026-09-30', start: '20:00', end: '21:00', slots: 4 },
      { id: '8', date: '2026-10-07', start: '20:00', end: '21:00', slots: 3 },
    ]
    const { api } = adminApi({
      'GET /api/admin/opportunities/1': () => ({ ...TENNIS, scheduleType: 'specific', sessions }),
      'PUT /api/admin/opportunities/1': () => jsonResponse({
        detail: 'Please check the highlighted fields.',
        errors: { 'sessions.1.slots': "Creator Slots can't be lower than the 2 creators already accepted" },
      }, 422),
    })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    const second = within(schedule).getByRole('group', { name: 'Session 2' })
    await user.clear(within(second).getByLabelText(/Creator Slots/))
    await user.type(within(second).getByLabelText(/Creator Slots/), '1')
    await saveDraft(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Please check the highlighted fields.')
    expect(within(second).getByLabelText(/Creator Slots/))
      .toHaveAccessibleDescription(/Creator Slots can't be lower than the 2 creators already accepted/)
    const first = within(schedule).getByRole('group', { name: 'Session 1' })
    expect(within(first).getByLabelText(/Creator Slots/)).toHaveAccessibleDescription('At least 1')
  })

  it('says when the opportunity doesn’t exist', async () => {
    const { api } = adminApi({ 'GET /api/admin/opportunities/99': () => jsonResponse({ detail: 'Opportunity not found' }, 404) })
    renderRoute('/admin/edit-opportunity/99', { api })

    expect(await screen.findByRole('alert')).toHaveTextContent("This opportunity doesn't exist.")
    expect(screen.getByRole('link', { name: 'Back to Opportunities' })).toBeInTheDocument()
  })
})

const PUBLISH_ERRORS = {
  title: 'Opportunity title is required',
  partner: 'Partner / brand name is required',
  deliverables: 'Add at least one deliverable',
  'sessions.0.end': 'End time must be after the start time',
  sessions: 'Add at least one future session',
  area: 'Area / neighbourhood is required',
}

const refusePublish = () => jsonResponse({ detail: 'Please check the highlighted fields.', errors: PUBLISH_ERRORS }, 422)
const chooseStatus = (user, status) =>
  user.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: status }))

describe('Session counts, cancelling and reopening', () => {
  const counts = (accepted, applications, undecided) => (
    { acceptedCount: accepted, applicationsCount: applications, undecidedCount: undecided })
  const WEEKLY = [
    { id: '21', date: '2026-09-26', start: '20:00', end: '21:00', slots: 3, cancelled: false, ...counts(1, 2, 1) },
    { id: '22', date: '2026-10-03', start: '20:00', end: '21:00', slots: 2, cancelled: false, ...counts(2, 5, 3) },
    { id: '23', date: '2026-10-10', start: '20:00', end: '21:00', slots: 3, cancelled: true, ...counts(0, 1, 0) },
  ]
  const ONE_OFF = [
    { id: '7', date: '2026-09-30', start: '20:00', end: '21:00', slots: 2, cancelled: false, ...counts(2, 5, 3) },
    { id: '8', date: '2026-10-07', start: '10:00', end: '11:00', slots: 3, cancelled: true, ...counts(0, 1, 1) },
  ]

  function renderEdit(loaded = {}, extra = {}) {
    const { api, saves } = adminApi({
      'GET /api/admin/opportunities/1': () => ({ ...TENNIS, sessions: ONE_OFF, weeklySessions: WEEKLY, ...loaded }),
      ...extra,
    })
    const view = renderRoute('/admin/edit-opportunity/1', { api })
    return { ...view, saves }
  }

  const weeklyList = () => screen.getByRole('list', { name: 'Weekly class sessions' })
  const weeklySession = (name) => within(weeklyList()).getByRole('group', { name })

  it('shows each one-off session’s accepted slots and applications, and a full one’s undecided applications', async () => {
    renderEdit()
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    const full = within(schedule).getByRole('group', { name: 'Session 1' })
    expect(full).toHaveTextContent('2 of 2 accepted · 5 applications')
    expect(full).toHaveTextContent('Full · 3 undecided')
    const cancelled = within(schedule).getByRole('group', { name: 'Session 2' })
    expect(cancelled).toHaveTextContent('Cancelled')
    expect(cancelled).toHaveTextContent('0 of 3 accepted · 1 application')
    expect(cancelled).not.toHaveTextContent('Full')
  })

  it('lists the weekly class’s sessions with their counts under the recurring settings', async () => {
    renderEdit()
    await screen.findByRole('region', { name: '5. Schedule & Availability' })

    const first = weeklySession('Saturday, 26 September · 8:00 PM – 9:00 PM')
    expect(first).toHaveTextContent('1 of 3 accepted · 2 applications')
    expect(within(first).getByLabelText('Creator Slots')).toHaveValue(3)
    expect(within(first).getByRole('button', { name: 'Cancel session' })).toBeInTheDocument()
    expect(weeklySession('Saturday, 3 October · 8:00 PM – 9:00 PM')).toHaveTextContent('Full · 3 undecided')
    const cancelled = weeklySession('Saturday, 10 October · 8:00 PM – 9:00 PM')
    expect(cancelled).toHaveTextContent('Cancelled')
    expect(within(cancelled).getByLabelText('Creator Slots')).toBeDisabled()
    expect(within(cancelled).getByRole('button', { name: 'Reopen session' })).toBeInTheDocument()
  })

  it('saves a weekly session’s own slots, cancelling one and reopening another', async () => {
    const { user, saves } = renderEdit()
    await screen.findByRole('region', { name: '5. Schedule & Availability' })

    const slots = within(weeklySession('Saturday, 26 September · 8:00 PM – 9:00 PM')).getByLabelText('Creator Slots')
    await user.clear(slots)
    await user.type(slots, '5')
    await user.click(within(weeklySession('Saturday, 3 October · 8:00 PM – 9:00 PM'))
      .getByRole('button', { name: 'Cancel session' }))
    await user.click(within(weeklySession('Saturday, 10 October · 8:00 PM – 9:00 PM'))
      .getByRole('button', { name: 'Reopen session' }))
    await saveDraft(user)

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.weeklySessions).toEqual([
      { id: '21', slots: '5', cancelled: false },
      { id: '22', slots: '2', cancelled: true },
      { id: '23', slots: '3', cancelled: false },
    ])
  })

  it('greys out a cancelled one-off session until it’s reopened, then sends it reopened', async () => {
    const { user, saves } = renderEdit()
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    const cancelled = within(schedule).getByRole('group', { name: 'Session 2' })
    expect(within(cancelled).getByLabelText('Date')).toBeDisabled()
    expect(within(cancelled).queryByRole('button', { name: 'Remove session 2' })).not.toBeInTheDocument()
    await user.click(within(cancelled).getByRole('button', { name: 'Reopen session 2' }))
    expect(within(cancelled).getByLabelText('Date')).toBeEnabled()
    expect(cancelled).not.toHaveTextContent('Cancelled')
    await saveDraft(user)

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.sessions).toEqual([
      { id: '7', date: '2026-09-30', start: '20:00', end: '21:00', slots: '2', cancelled: false },
      { id: '8', date: '2026-10-07', start: '10:00', end: '11:00', slots: '3', cancelled: false },
    ])
  })

  it('sends no weekly sessions once switched to specific dates', async () => {
    const { user, saves } = renderEdit()
    const schedule = await screen.findByRole('region', { name: '5. Schedule & Availability' })

    await user.click(within(schedule).getByRole('button', { name: /Specific Dates/ }))
    expect(screen.queryByRole('list', { name: 'Weekly class sessions' })).not.toBeInTheDocument()
    await saveDraft(user)

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.weeklySessions).toEqual([])
  })

  it('shows a weekly session’s error on its row and in the summary', async () => {
    const { user } = renderEdit({ publishingStatus: 'Live' }, {
      'PUT /api/admin/opportunities/1': () => jsonResponse({
        detail: 'Please check the highlighted fields.',
        errors: { 'weeklySessions.2.slots': 'This session is full. Raise its Creator Slots to reopen it.' },
      }, 422),
    })
    await screen.findByRole('region', { name: '5. Schedule & Availability' })

    await user.click(within(weeklySession('Saturday, 10 October · 8:00 PM – 9:00 PM'))
      .getByRole('button', { name: 'Reopen session' }))
    await user.click(screen.getAllByRole('button', { name: 'Update & Publish' })[0])

    const summary = await screen.findByRole('alert', { name: 'Fix the following before publishing:' })
    expect(summary).toHaveTextContent(
      'Weekly class session Saturday, 10 October · 8:00 PM – 9:00 PM: This session is full. Raise its Creator Slots to reopen it.')
    expect(within(weeklySession('Saturday, 10 October · 8:00 PM – 9:00 PM')).getByLabelText('Creator Slots'))
      .toHaveAccessibleDescription('This session is full. Raise its Creator Slots to reopen it.')
  })
})

describe('Publishing', () => {
  it('has Publish at the top and Publish Opportunity at the bottom of a new opportunity', async () => {
    const { api } = adminApi()
    renderRoute('/admin/create-opportunity', { api })

    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument()
    expect(within(section('7. Publishing')).getByRole('button', { name: 'Publish Opportunity' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update & Publish' })).not.toBeInTheDocument()
  })

  it('has Update & Publish top and bottom when editing a Live opportunity', async () => {
    const { api } = adminApi({ 'GET /api/admin/opportunities/1': () => LIVE })
    renderRoute('/admin/edit-opportunity/1', { api })

    expect(await screen.findAllByRole('button', { name: 'Update & Publish' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^Publish/ })).not.toBeInTheDocument()
  })

  it.each(['Draft', 'Closed'])('has Publish and Publish Opportunity when editing a %s opportunity', async (status) => {
    const { api } = adminApi({ 'GET /api/admin/opportunities/1': () => ({ ...TENNIS, publishingStatus: status }) })
    renderRoute('/admin/edit-opportunity/1', { api })

    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish Opportunity' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update & Publish' })).not.toBeInTheDocument()
  })

  it('saves a Draft without asking, while Publish checks, asks and only then saves as Live', async () => {
    const { api, saves, checks } = adminApi()
    const { user, location } = renderRoute('/admin/create-opportunity', { api })

    await screen.findByText('New Opportunity')
    await chooseStatus(user, 'Live')
    await saveDraft(user)
    await user.click(await screen.findByRole('link', { name: 'Create Opportunity' }))
    await screen.findByText('New Opportunity')
    await chooseStatus(user, 'Live')
    await user.click(screen.getByRole('button', { name: 'Publish Opportunity' }))

    const dialog = await screen.findByRole('dialog', { name: 'Publish this opportunity?' })
    expect(dialog).toHaveAccessibleDescription('It becomes visible to creators straight away.')
    expect(checks.map((check) => check.body.publishingStatus)).toEqual(['Live'])
    expect(saves.map((save) => save.body.publishingStatus)).toEqual(['Draft'])
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(location().pathname).toBe('/admin/opportunities')
    expect(saves.map((save) => save.body.publishingStatus)).toEqual(['Draft', 'Live'])
  })

  it('stores nothing when the publish pop-up is cancelled', async () => {
    const { api, saves } = adminApi()
    const { user, location } = renderRoute('/admin/edit-opportunity/1', { api })

    await screen.findByLabelText('Opportunity Title')
    await chooseStatus(user, 'Live')
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await answer(user, 'Publish this opportunity?', 'Cancel')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saves).toEqual([])
    expect(location().pathname).toBe('/admin/edit-opportunity/1')
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
  })

  it('asks before updating a Live opportunity, then saves it with the version it was loaded with', async () => {
    const { api, saves, checks } = adminApi({ 'GET /api/admin/opportunities/1': () => LIVE })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })

    const title = await screen.findByLabelText('Opportunity Title')
    await user.clear(title)
    await user.type(title, 'Tennis for Two')
    await user.click(screen.getAllByRole('button', { name: 'Update & Publish' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Update this Live opportunity?' })
    expect(dialog).toHaveAccessibleDescription(
      'Changes are visible to creators straight away. Applications already submitted keep the terms they applied under.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    const sent = { title: 'Tennis for Two', publishingStatus: 'Live', version: TENNIS.version }
    expect(checks).toMatchObject([{ method: 'PUT', body: sent }])
    expect(saves).toMatchObject([{ method: 'PUT', body: sent }])
  })

  it('asks before closing a Live opportunity', async () => {
    const { api, saves } = adminApi({ 'GET /api/admin/opportunities/1': () => LIVE })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })

    await screen.findByLabelText('Opportunity Title')
    await chooseStatus(user, 'Closed')
    await user.click(screen.getAllByRole('button', { name: 'Update & Publish' })[1])
    await answer(user, 'Close this opportunity?', 'Close Opportunity')

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves).toMatchObject([{ method: 'PUT', body: { publishingStatus: 'Closed' } }])
  })

  it.each([
    ['Live', 'Update this Live opportunity?'],
    ['Closed', 'Close this opportunity?'],
  ])('stores nothing when a Live opportunity’s save as %s is cancelled', async (status, question) => {
    const { api, saves } = adminApi({ 'GET /api/admin/opportunities/1': () => LIVE })
    const { user, location } = renderRoute('/admin/edit-opportunity/1', { api })

    await screen.findByLabelText('Opportunity Title')
    await chooseStatus(user, status)
    await user.click(screen.getAllByRole('button', { name: 'Update & Publish' })[0])
    await answer(user, question, 'Cancel')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saves).toEqual([])
    expect(location().pathname).toBe('/admin/edit-opportunity/1')
  })

  it('says a confirmed save failed inside the pop-up when the server can’t be reached', async () => {
    let unreachable = false
    const { api } = adminApi({
      'GET /api/admin/opportunities/1': () => LIVE,
      'PUT /api/admin/opportunities/1': () => (unreachable ? Promise.reject(new TypeError('Failed to fetch')) : LIVE),
    })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })

    await user.click((await screen.findAllByRole('button', { name: 'Update & Publish' }))[0])
    unreachable = true
    const dialog = await answer(user, 'Update this Live opportunity?', 'Update')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Couldn't save the opportunity. Check your connection and try again.",
    )
  })

  it('saves a Closed opportunity as Closed without asking', async () => {
    const { api, saves, checks } = adminApi({ 'GET /api/admin/opportunities/1': () => ({ ...TENNIS, publishingStatus: 'Closed' }) })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })

    await screen.findByLabelText('Opportunity Title')
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(checks).toEqual([])
    expect(saves).toMatchObject([{ method: 'PUT', body: { publishingStatus: 'Closed' } }])
  })

  it.each([
    ['a new opportunity', null, ['Draft', 'Live'], 'A new opportunity can only be saved as Draft or Live'],
    ['a Draft', 'Draft', ['Draft', 'Live'], 'A Draft has to go Live before it can be closed'],
    ['a Live opportunity', 'Live', ['Live', 'Closed'], "A Live opportunity can't go back to Draft"],
    ['a Closed opportunity', 'Closed', ['Live', 'Closed'], 'A Closed opportunity can only be reopened to Live'],
  ])('greys out the statuses %s can’t move to', async (_, status, allowed, reason) => {
    const { api } = adminApi({ 'GET /api/admin/opportunities/1': () => ({ ...TENNIS, publishingStatus: status }) })
    renderRoute(status ? '/admin/edit-opportunity/1' : '/admin/create-opportunity', { api })

    await screen.findByLabelText('Opportunity Title')
    const group = screen.getByRole('group', { name: 'Status' })
    for (const option of ['Draft', 'Live', 'Closed']) {
      const button = within(group).getByRole('button', { name: option })
      if (allowed.includes(option)) {
        expect(button).toBeEnabled()
      } else {
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute('title', reason)
      }
    }
  })

  it.each(['Live', 'Closed'])('has no Save Draft when editing a %s opportunity', async (status) => {
    const { api } = adminApi({ 'GET /api/admin/opportunities/1': () => ({ ...TENNIS, publishingStatus: status }) })
    renderRoute('/admin/edit-opportunity/1', { api })

    await screen.findByLabelText('Opportunity Title')
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Cancel' })).toHaveLength(2)
  })

  it('has Save Draft top and bottom when editing a Draft', async () => {
    const { api } = adminApi()
    renderRoute('/admin/edit-opportunity/1', { api })

    await screen.findByLabelText('Opportunity Title')
    expect(screen.getAllByRole('button', { name: 'Save Draft' })).toHaveLength(2)
  })

  it('shows why a confirmed save failed inside the pop-up, keeping it open', async () => {
    let refuse = false
    const { api } = adminApi({
      'GET /api/admin/opportunities/1': () => LIVE,
      'PUT /api/admin/opportunities/1': () => (refuse
        ? jsonResponse({ detail: 'Someone else saved this opportunity after you opened it.' }, 409)
        : LIVE),
    })
    const { user, location } = renderRoute('/admin/edit-opportunity/1', { api })

    await user.click((await screen.findAllByRole('button', { name: 'Update & Publish' }))[0])
    const dialog = await screen.findByRole('dialog', { name: 'Update this Live opportunity?' })
    refuse = true
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Someone else saved this opportunity')
    expect(location().pathname).toBe('/admin/edit-opportunity/1')
  })

  it('closes the pop-up and shows the errors in the form when the save’s checks fail after all', async () => {
    let refuse = false
    const { api } = adminApi({
      'GET /api/admin/opportunities/1': () => LIVE,
      'PUT /api/admin/opportunities/1': () => (refuse ? refusePublish() : LIVE),
    })
    const { user } = renderRoute('/admin/edit-opportunity/1', { api })

    await user.click((await screen.findAllByRole('button', { name: 'Update & Publish' }))[0])
    refuse = true
    await answer(user, 'Update this Live opportunity?', 'Update')

    expect(await screen.findByRole('alert', { name: 'Fix the following before publishing:' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists every error at the top, under each field and by the bottom buttons, and scrolls to the first', async () => {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { api, saves } = adminApi({ 'POST /api/admin/opportunities': refusePublish })
    const { user, location } = renderRoute('/admin/create-opportunity', { api })

    await user.type(await screen.findByLabelText('Subcategory / Activity', { exact: false }), 'Padel')
    await chooseStatus(user, 'Live')
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    const summary = await screen.findByRole('alert', { name: 'Fix the following before publishing:' })
    expect(within(summary).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Opportunity title is required',
      'Partner / brand name is required',
      'Add at least one deliverable',
      'Session 1: End time must be after the start time',
      'Add at least one future session',
      'Area / neighbourhood is required',
    ])
    expect(scrolled.mock.contexts.at(-1)).toBe(summary)
    expect(screen.getByLabelText('Opportunity Title')).toHaveAccessibleDescription('Opportunity title is required')
    expect(screen.getByLabelText('Partner / Brand Name')).toHaveAccessibleDescription('Partner / brand name is required')
    expect(screen.getByLabelText('Area / Neighbourhood')).toHaveAccessibleDescription(/Area \/ neighbourhood is required$/)
    const schedule = section('5. Schedule & Availability')
    expect(within(within(schedule).getByRole('group', { name: 'Session 1' })).getByLabelText('End Time'))
      .toHaveAccessibleDescription('End time must be after the start time')
    expect(within(schedule).getByText('Add at least one future session')).toBeInTheDocument()
    expect(within(section('3. Content Deliverables')).getByText('Add at least one deliverable')).toBeInTheDocument()
    expect(within(section('7. Publishing')).getByText('Fix the errors above before publishing.')).toBeInTheDocument()
    expect(screen.getByLabelText('Subcategory / Activity', { exact: false })).toHaveValue('Padel')
    expect(location().pathname).toBe('/admin/create-opportunity')
    // The check refused it, so nothing asked and nothing was saved.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saves).toEqual([])
    scrolled.mockRestore()
  })

  it('publishes when sent again after a refused publish', async () => {
    let refuse = true
    const { api } = adminApi({
      'GET /api/admin/opportunities/1': () => LIVE,
      'PUT /api/admin/opportunities/1': () => (refuse ? refusePublish() : LIVE),
    })
    const { user, location } = renderRoute('/admin/edit-opportunity/1', { api })

    await user.click((await screen.findAllByRole('button', { name: 'Update & Publish' }))[1])
    expect(await screen.findByText('Fix the errors above before publishing.')).toBeInTheDocument()
    refuse = false
    await user.click(screen.getAllByRole('button', { name: 'Update & Publish' })[1])
    await answer(user, 'Update this Live opportunity?', 'Update')

    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(location().pathname).toBe('/admin/opportunities')
  })
})

describe('Preview', () => {
  it('opens a Live opportunity’s creator page in a new tab from its edit page', async () => {
    const { api } = adminApi({ 'GET /api/admin/opportunities/1': () => LIVE })
    renderRoute('/admin/edit-opportunity/1', { api })

    const preview = await screen.findByRole('link', { name: 'Preview' })
    expect(preview).toHaveAttribute('href', '/opportunity/1')
    expect(preview).toHaveAttribute('target', '_blank')
  })

  it.each(['Draft', 'Closed'])('isn’t on the edit page of a %s opportunity, as in the Figma', async (status) => {
    const { api } = adminApi({ 'GET /api/admin/opportunities/1': () => ({ ...TENNIS, publishingStatus: status }) })
    renderRoute('/admin/edit-opportunity/1', { api })

    await screen.findByLabelText('Opportunity Title')
    expect(screen.queryByRole('link', { name: 'Preview' })).not.toBeInTheDocument()
  })
})

describe('Reopen Opportunity from the list’s row menu', () => {
  const CLOSED = { ...TENNIS, publishingStatus: 'Closed' }
  const LIST = {
    counts: { total: 1, live: 0, draft: 0, closed: 1, applications: 0 },
    opportunities: [{
      id: '1', title: 'Tennis Group Class', partner: 'The Best Group', heroImage: null, category: 'Sport',
      compensationType: 'Paid', whatCreatorReceives: null,
      payment: { currency: 'SGD', amount: 150, basis: 'Per post', note: null },
      collaborationType: 'One-off', schedule: null, applicationsCount: 0, publishingStatus: 'Closed',
      canDelete: false, lastUpdated: '2026-09-14',
    }],
  }

  it('opens the edit page with every error when the Live checks refuse it, ready to publish again', async () => {
    const { api, saves } = adminApi({
      'GET /api/admin/opportunities': () => LIST,
      'GET /api/admin/opportunities/1': () => CLOSED,
    })
    api['POST /api/admin/opportunities/1/publish'] = refusePublish
    const { user, location } = renderRoute('/admin/opportunities', { api })

    await user.click(await screen.findByRole('button', { name: 'Actions for Tennis Group Class' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reopen Opportunity' }))

    const summary = await screen.findByRole('alert', { name: 'Fix the following before publishing:' })
    expect(location().pathname).toBe('/admin/edit-opportunity/1')
    expect(within(summary).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByLabelText('Area / Neighbourhood')).toHaveAccessibleDescription(/Area \/ neighbourhood is required$/)
    expect(pressed(screen.getByRole('group', { name: 'Status' }))).toHaveTextContent('Live')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await answer(user, 'Publish this opportunity?', 'Publish')
    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves.at(-1)).toMatchObject({ method: 'PUT', body: { publishingStatus: 'Live', version: TENNIS.version } })
  })

  it('opens the edit page with the errors when the checks fail after confirming', async () => {
    let refuse = false
    const { api } = adminApi({
      'GET /api/admin/opportunities': () => LIST,
      'GET /api/admin/opportunities/1': () => CLOSED,
    })
    api['POST /api/admin/opportunities/1/publish'] = () => (refuse ? refusePublish() : jsonResponse({}))
    const { user, location } = renderRoute('/admin/opportunities', { api })

    await user.click(await screen.findByRole('button', { name: 'Actions for Tennis Group Class' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reopen Opportunity' }))
    refuse = true
    await answer(user, 'Publish this opportunity?', 'Publish')

    expect(await screen.findByRole('alert', { name: 'Fix the following before publishing:' })).toBeInTheDocument()
    expect(location().pathname).toBe('/admin/edit-opportunity/1')
  })

  it('stays on the list when reopening worked', async () => {
    const { api } = adminApi({ 'GET /api/admin/opportunities': () => LIST })
    api['POST /api/admin/opportunities/1/publish'] = { ...TENNIS }
    const { user, location } = renderRoute('/admin/opportunities', { api })

    await user.click(await screen.findByRole('button', { name: 'Actions for Tennis Group Class' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reopen Opportunity' }))
    await answer(user, 'Publish this opportunity?', 'Publish')

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(location().pathname).toBe('/admin/opportunities')
  })
})

describe('Cover image', () => {
  const image = (name, type, size = 1024) => new File([new Uint8Array(size)], name, { type })
  const fileInput = () => screen.getByLabelText('Cover image file')
  const urlInput = () => screen.getByLabelText('Hero / Cover Image', { exact: false })

  function uploadApi(respond = () => jsonResponse({ url: '/api/uploads/abc.png' }, 201)) {
    const uploads = []
    const { api, saves } = adminApi()
    api['POST /api/admin/uploads'] = (request) => {
      uploads.push(request.headers.get('Content-Type'))
      return respond()
    }
    return { api, saves, uploads }
  }

  it('uploads a chosen file and saves its URL, with a preview', async () => {
    const { api, saves, uploads } = uploadApi()
    const { user } = renderRoute('/admin/create-opportunity', { api })

    await user.upload(await screen.findByLabelText('Cover image file'), image('court.png', 'image/png'))

    await vi.waitFor(() => expect(urlInput()).toHaveValue('/api/uploads/abc.png'))
    expect(uploads).toEqual(['image/png'])
    expect(screen.getByRole('img', { name: 'Cover image preview' })).toHaveAttribute('src', '/api/uploads/abc.png')
    await saveDraft(user)
    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.heroImage).toBe('/api/uploads/abc.png')
  })

  it('can’t be saved until the upload finishes, and a URL typed meanwhile wins', async () => {
    let finish
    const { api, saves } = uploadApi(() => new Promise((resolve) => {
      finish = () => resolve(jsonResponse({ url: '/api/uploads/abc.png' }, 201))
    }))
    const { user } = renderRoute('/admin/create-opportunity', { api })

    await user.upload(await screen.findByLabelText('Cover image file'), image('court.png', 'image/png'))

    expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: 'Save Draft' })) expect(button).toBeDisabled()
    await user.type(urlInput(), 'https://images.example/a.jpg')
    finish()
    await vi.waitFor(() => expect(screen.getAllByRole('button', { name: 'Save Draft' })[0]).toBeEnabled())
    expect(urlInput()).toHaveValue('https://images.example/a.jpg')
    await saveDraft(user)
    await screen.findByRole('heading', { name: 'Creator Opportunities' })
    expect(saves[0].body.heroImage).toBe('https://images.example/a.jpg')
  })

  it('still takes a pasted URL, and the preview’s remove button clears it', async () => {
    const { api } = uploadApi()
    const { user } = renderRoute('/admin/create-opportunity', { api })

    await user.type(await screen.findByLabelText('Hero / Cover Image', { exact: false }), 'https://images.example/a.jpg')
    expect(screen.getByRole('img', { name: 'Cover image preview' })).toHaveAttribute('src', 'https://images.example/a.jpg')
    await user.click(screen.getByRole('button', { name: 'Remove image' }))

    expect(urlInput()).toHaveValue('')
    expect(screen.queryByRole('img', { name: 'Cover image preview' })).not.toBeInTheDocument()
  })

  it.each([
    ['a GIF', image('spin.gif', 'image/gif'), 'Upload a JPEG, PNG or WebP image'],
    ['a file over 5 MB', image('huge.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1), 'The image must be 5 MB or smaller'],
  ])('refuses %s without uploading it', async (_, file, message) => {
    const { api, uploads } = uploadApi()
    const { user } = renderRoute('/admin/create-opportunity', { api })

    await user.upload(await screen.findByLabelText('Cover image file'), file)

    expect(urlInput()).toHaveAccessibleDescription(new RegExp(message))
    expect(urlInput()).toHaveValue('')
    expect(uploads).toEqual([])
  })

  it('shows the API’s reason when it refuses the upload', async () => {
    const { api } = uploadApi(() => jsonResponse({ detail: 'Upload a JPEG, PNG or WebP image' }, 422))
    const { user } = renderRoute('/admin/create-opportunity', { api })

    await user.upload(await screen.findByLabelText('Cover image file'), image('fake.png', 'image/png'))

    await vi.waitFor(() => expect(urlInput()).toHaveAccessibleDescription(/Upload a JPEG, PNG or WebP image/))
    expect(urlInput()).toHaveValue('')
  })
})
