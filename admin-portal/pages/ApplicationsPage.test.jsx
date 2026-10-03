import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, renderRoute } from '../../creator-portal/javascript/test/renderRoute'
import { ADMIN, bodyRows } from '../javascript/test/adminFixtures'

const TENNIS = { id: '1', title: 'Tennis Group Class', partner: 'The Best Group', category: 'Sport', compensationType: 'Paid' }
const COFFEE = {
  id: '5',
  title: 'Specialty Coffee Experience for Two',
  partner: 'Kurasu Singapore',
  category: 'Lifestyle',
  compensationType: 'Barter',
}
const OPPORTUNITIES = [TENNIS, COFFEE]

const contact = (fullName, instagram, tiktok, email, phone) => ({ fullName, instagram, tiktok, email, phone })

const TENNIS_SNAPSHOT = {
  opportunity: { title: 'Tennis Group Class', partner: 'The Best Group', category: 'Sport', subcategory: 'Tennis' },
  compensation: {
    type: 'Paid',
    whatCreatorReceives: null,
    payment: { currency: 'SGD', amount: 150, basis: 'Per post', note: 'Racquet to keep' },
  },
  collaboration: {
    collaborationType: 'One-off',
    deliverableType: 'Fixed',
    deliverableNote: null,
    deliverables: ['Post 1 × Instagram Reel', 'Tag @lyfego.sg'],
  },
  requirements: { experienceLevels: ['Beginner'], additionalInfo: [{ label: 'Equipment', value: 'Racquets provided' }] },
  session: { date: '2026-09-23', start: '19:00', end: '20:00' },
  location: { venueName: 'Kallang Tennis Centre', fullAddress: '52 Stadium Road, Singapore 397724', area: 'Kallang' },
}

// The stored Applications, as the detail endpoint returns them, newest first.
function applications() {
  const joanna = contact('Joanna Chen', 'joannaactive', null, 'joanna.chen@email.com', '+65 9333 4455')
  const ben = contact('Ben Koh', 'benkoh.sg', 'benkoh', 'ben.koh@email.com', '+65 9222 3344')
  const sarah = contact('Sarah Tan', 'sarahtan.fit', 'sarahtan.fit', 'sarah.tan@gmail.com', '+65 9111 2233')
  const joannaSession = { id: '21', date: '2026-09-27', start: '20:00', end: '21:00' }
  const benSession = { id: '41', date: '2026-10-02', start: '10:00', end: '11:00' }
  const sarahSession = { id: '31', date: '2026-09-23', start: '19:00', end: '20:00' }
  return [
    {
      id: '12',
      status: 'New',
      contact: joanna,
      original: joanna,
      note: null,
      submittedOn: '2026-09-14',
      opportunity: TENNIS,
      session: joannaSession,
      originalSession: joannaSession,
      // An older snapshot, without the later groups.
      snapshot: { opportunity: TENNIS_SNAPSHOT.opportunity, session: TENNIS_SNAPSHOT.session },
      otherSessions: [],
    },
    {
      id: '11',
      status: 'Reviewing',
      contact: ben,
      original: ben,
      note: null,
      submittedOn: '2026-09-13',
      opportunity: COFFEE,
      session: benSession,
      originalSession: benSession,
      snapshot: {},
      otherSessions: [{ id: '42', date: '2026-10-09', start: '10:00', end: '11:00', slots: 1, accepted: 1 }],
    },
    {
      id: '10',
      status: 'Accepted',
      contact: sarah,
      original: sarah,
      note: 'I love how photogenic outdoor court sessions are.',
      submittedOn: '2026-09-10',
      opportunity: TENNIS,
      session: sarahSession,
      originalSession: sarahSession,
      snapshot: TENNIS_SNAPSHOT,
      otherSessions: [
        { id: '32', date: '2026-09-26', start: '20:00', end: '21:00', slots: 2, accepted: 2 },
        { id: '33', date: '2026-09-30', start: '19:00', end: '20:00', slots: 3, accepted: 1 },
      ],
    },
  ]
}

function row(application) {
  const { phone, ...shown } = application.contact
  const { category, compensationType, ...opportunity } = application.opportunity
  const { id, ...session } = application.session
  return { id: application.id, ...shown, opportunity, session, submittedOn: application.submittedOn, status: application.status }
}

// Stores a PATCH body as the API does.
function applyPatch(application, body) {
  if (body.status) application.status = body.status
  if (body.contact) application.contact = { ...body.contact, tiktok: body.contact.tiktok || null }
  if (body.sessionId) {
    const sessions = [application.session, ...application.otherSessions]
    const { slots, accepted, ...moved } = sessions.find((s) => s.id === body.sessionId)
    application.otherSessions = sessions
      .filter((s) => s.id !== body.sessionId)
      .map((s) => ({ slots: 3, accepted: 0, ...s }))
    application.session = moved
  }
}

// A stand-in for the Applications API: filters and searches the way the
// backend does, records each list query and each PATCH body, and saves
// changes so later reads see them. `onPatch(request, body)` may answer a PATCH
// itself (return a Response or a promise of one).
function applicationsApi({ stored = applications(), onPatch } = {}) {
  const queries = []
  const patches = []
  const list = (request) => {
    const params = new URL(request.url).searchParams
    queries.push(Object.fromEntries(params))
    const search = (params.get('search') ?? '').trim().toLowerCase().replace(/^@/, '')
    const matching = stored.filter(
      (a) =>
        (!params.get('opportunityId') || a.opportunity.id === params.get('opportunityId')) &&
        (!params.get('partner') || a.opportunity.partner === params.get('partner')) &&
        (!params.get('status') || a.status === params.get('status')) &&
        (!params.get('category') || a.opportunity.category === params.get('category')) &&
        (!search ||
          [a.contact.fullName, a.contact.instagram, a.contact.tiktok ?? '', a.opportunity.title, a.opportunity.partner]
            .join('\n')
            .toLowerCase()
            .includes(search)),
    )
    const count = (status) => stored.filter((a) => a.status === status).length
    return {
      counts: {
        all: stored.length,
        new: count('New'),
        reviewing: count('Reviewing'),
        accepted: count('Accepted'),
        declined: count('Declined'),
      },
      options: {
        opportunities: OPPORTUNITIES.map(({ id, title }) => ({ id, title })),
        partners: ['Kurasu Singapore', 'The Best Group'],
      },
      applications: matching.map(row),
    }
  }
  const byId = (request) => stored.find((a) => request.url.endsWith(`/${a.id}`))
  const api = {
    'GET /api/admin/session': ADMIN,
    'GET /api/admin/applications': list,
  }
  for (const application of stored) {
    api[`GET /api/admin/applications/${application.id}`] = (request) => byId(request)
    api[`PATCH /api/admin/applications/${application.id}`] = async (request) => {
      const body = await request.json()
      patches.push(body)
      const answer = onPatch && (await onPatch(request, body))
      if (answer) return answer
      applyPatch(byId(request), body)
      return byId(request)
    }
  }
  return { api, queries, patches }
}

function renderApplications(path = '/admin/applications', options) {
  const { api, queries, patches } = applicationsApi(options)
  return { ...renderRoute(path, { api }), queries, patches }
}

async function rowFor(name) {
  const cell = await screen.findByText(name, { selector: 'td *' })
  return cell.closest('tr')
}

// The "Showing X of Y" line, including the "View all" link inside it.
function findFooter(text) {
  return screen.findByText((_, element) => element.tagName === 'SPAN' && element.textContent === text)
}

function statusTabs() {
  return within(screen.getByRole('group', { name: 'Application status' }))
}

async function openPanel(user, name) {
  await user.click(within(await rowFor(name)).getByRole('button', { name: 'View' }))
  return within(await screen.findByRole('dialog', { name: `Application from ${name}` }))
}

// Lets a test decide when a stubbed response arrives.
function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('Admin Applications list', () => {
  it('shows the Figma header and the five counts, which cover every Application', async () => {
    renderApplications()

    expect(await screen.findByRole('heading', { name: 'Applications' })).toBeInTheDocument()
    expect(screen.getByText('Creator registrations across all opportunities')).toBeInTheDocument()
    await screen.findByText('Showing 3 of 3 applications')
    expect(statusTabs().getAllByRole('button').map((tab) => tab.textContent)).toEqual([
      '3All Applications',
      '1New',
      '1Reviewing',
      '1Accepted',
      '0Declined',
    ])
  })

  it('lists rows in the order the API gives, with each column', async () => {
    renderApplications()

    const sarah = await rowFor('Sarah Tan')
    expect(bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Joanna Chenjoanna.chen@email.com',
      'Ben Kohben.koh@email.com',
      'Sarah Tansarah.tan@gmail.com',
    ])
    expect(within(sarah).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Sarah Tansarah.tan@gmail.com',
      'Tennis Group Class',
      'The Best Group',
      'Wednesday, 23 September · 7:00 PM – 8:00 PM',
      '@sarahtan.fit+TikTok',
      '10 Sep 2026',
      'Accepted',
      'View',
    ])
    expect(within(await rowFor('Joanna Chen')).getAllByRole('cell')[4]).toHaveTextContent(/^@joannaactive$/)
  })

  it('pre-selects the Opportunity filter from the URL', async () => {
    const { queries, user, location } = renderApplications('/admin/applications?opportunityId=5')

    expect(await screen.findByText('Showing 1 of 3 applications')).toBeInTheDocument()
    expect(queries.at(-1)).toEqual({ opportunityId: '5' })
    expect(screen.getByRole('combobox', { name: 'Opportunity' })).toHaveValue('5')

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }))

    expect(await screen.findByText('Showing 3 of 3 applications')).toBeInTheDocument()
    expect(location().search).toBe('')
  })

  it('filters by status from the count tabs, in step with the status filter', async () => {
    const { user, queries } = renderApplications()
    await screen.findByText('Showing 3 of 3 applications')
    expect(statusTabs().getByRole('button', { name: /All Applications/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(statusTabs().getByRole('button', { name: /Reviewing/ }))

    expect(await findFooter('Showing 1 of 3 applications · View all')).toBeInTheDocument()
    expect(queries.at(-1)).toEqual({ status: 'Reviewing' })
    expect(statusTabs().getByRole('button', { name: /Reviewing/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Reviewing')
    expect(statusTabs().getAllByRole('button').map((tab) => tab.textContent)[0]).toBe('3All Applications')
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Accepted')

    expect(await findFooter('Showing 1 of 3 applications · View all')).toBeInTheDocument()
    expect(statusTabs().getByRole('button', { name: /Accepted/ })).toHaveAttribute('aria-pressed', 'true')
    expect(queries.at(-1)).toEqual({ status: 'Accepted' })
  })

  it('resets the status with "View all", and everything else with "Clear all filters", as in the Figma', async () => {
    const { user } = renderApplications()
    await screen.findByText('Showing 3 of 3 applications')

    await user.click(statusTabs().getByRole('button', { name: /Accepted/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Lifestyle')
    expect(await screen.findByText('No applications match the current filters')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }))

    expect(await findFooter('Showing 1 of 3 applications · View all')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('')
    expect(statusTabs().getByRole('button', { name: /Accepted/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'View all' }))

    expect(await screen.findByText('Showing 3 of 3 applications')).toBeInTheDocument()
    expect(statusTabs().getByRole('button', { name: /All Applications/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('')
  })

  it('combines filters with search, and clears them all at once', async () => {
    const { user, queries } = renderApplications()
    await screen.findByText('Showing 3 of 3 applications')
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Partner' }), 'The Best Group')
    expect(await screen.findByText('Showing 2 of 3 applications')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Sport')
    await user.type(screen.getByRole('searchbox', { name: 'Search by creator, handle, or opportunity' }), '@sarah')
    expect(await screen.findByText('Showing 1 of 3 applications')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(1)
    expect(queries.at(-1)).toEqual({ partner: 'The Best Group', category: 'Sport', search: '@sarah' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Opportunity' }), 'Specialty Coffee Experience for Two')
    expect(await screen.findByText('No applications match the current filters')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }))

    expect(await screen.findByText('Showing 3 of 3 applications')).toBeInTheDocument()
    for (const name of ['Opportunity', 'Partner', 'Category']) {
      expect(screen.getByRole('combobox', { name })).toHaveValue('')
    }
    expect(screen.getByRole('searchbox', { name: 'Search by creator, handle, or opportunity' })).toHaveValue('')
  })

  it('offers a retry when the list cannot load', async () => {
    let attempts = 0
    const { api } = applicationsApi()
    const { user } = renderRoute('/admin/applications', {
      api: {
        ...api,
        'GET /api/admin/applications': (request) => {
          attempts += 1
          return attempts === 1 ? jsonResponse({ detail: 'boom' }, 500) : api['GET /api/admin/applications'](request)
        },
      },
    })

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Showing 3 of 3 applications')).toBeInTheDocument()
  })
})

function creatorDetails(panel) {
  return within(panel.getByRole('region', { name: 'Creator Details' }))
}

describe('Admin Application panel', () => {
  it('shows the Application, its Opportunity and Current Session, without Internal Notes or Skill Level', async () => {
    const { user } = renderApplications()

    const panel = await openPanel(user, 'Sarah Tan')

    expect(panel.getByRole('heading', { name: 'Sarah Tan' })).toBeInTheDocument()
    expect(panel.getByText('Sport')).toBeInTheDocument()
    expect(panel.getByText('Paid')).toBeInTheDocument()
    expect(panel.getByRole('link', { name: 'View opportunity →' })).toHaveAttribute('href', '/admin/edit-opportunity/1')
    expect(panel.getAllByText('Wednesday, 23 September · 7:00 PM – 8:00 PM')[0]).toBeInTheDocument()
    expect(panel.queryByText(/Originally applied for/)).not.toBeInTheDocument()

    const details = creatorDetails(panel)
    expect(details.getAllByRole('term').map((term) => term.textContent)).toEqual(['Full Name', 'Instagram', 'TikTok', 'Email', 'Mobile'])
    expect(details.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      'Sarah Tan',
      '@sarahtan.fit',
      '@sarahtan.fit',
      'sarah.tan@gmail.com',
      '+65 9111 2233',
    ])
    expect(panel.getByText('I love how photogenic outdoor court sessions are.')).toBeInTheDocument()
    expect(panel.getByText('Submitted 10 Sep 2026')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Accepted' })).toHaveAttribute('aria-pressed', 'true')
    expect(panel.queryByText(/Internal Notes/)).not.toBeInTheDocument()
    expect(panel.queryByRole('textbox')).not.toBeInTheDocument()
    expect(panel.queryByText(/Skill Level/)).not.toBeInTheDocument()
    expect(within(await rowFor('Sarah Tan')).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('links each contact detail, opening in a new tab', async () => {
    const { user } = renderApplications()

    const details = creatorDetails(await openPanel(user, 'Sarah Tan'))

    const links = details.getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['@sarahtan.fit', 'https://instagram.com/sarahtan.fit'],
      ['@sarahtan.fit', 'https://www.tiktok.com/@sarahtan.fit'],
      ['sarah.tan@gmail.com', 'mailto:sarah.tan@gmail.com'],
      ['+65 9111 2233', 'https://wa.me/6591112233'],
    ])
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('leaves out TikTok and the note when the Application has none', async () => {
    const { user } = renderApplications()

    const panel = await openPanel(user, 'Joanna Chen')

    expect(creatorDetails(panel).getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Full Name',
      'Instagram',
      'Email',
      'Mobile',
    ])
    expect(panel.queryByText('Note from Creator')).not.toBeInTheDocument()
  })

  it('shows the Opportunity as it was when the creator applied', async () => {
    const { user } = renderApplications()

    const panel = await openPanel(user, 'Sarah Tan')

    const snapshot = within(panel.getByRole('region', { name: 'Opportunity at Submission' }))
    expect(snapshot.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Opportunity',
      'Category',
      'Compensation',
      'Collaboration',
      'Deliverables',
      'Experience Level',
      'Additional Information',
      'Session Applied For',
      'Location',
    ])
    expect(snapshot.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      'Tennis Group Class · The Best Group',
      'Sport · Tennis',
      'S$150 · Per post + Racquet to keep',
      'One-off · Fixed deliverables',
      'Post 1 × Instagram ReelTag @lyfego.sg',
      'Beginner',
      'Equipment: Racquets provided',
      'Wednesday, 23 September · 7:00 PM – 8:00 PM',
      'Kallang Tennis Centre · 52 Stadium Road, Singapore 397724 · Kallang',
    ])
  })

  it('leaves out the groups an older snapshot lacks, and the section when it has none', async () => {
    const { user } = renderApplications()

    const joanna = await openPanel(user, 'Joanna Chen')
    const snapshot = within(joanna.getByRole('region', { name: 'Opportunity at Submission' }))
    expect(snapshot.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Opportunity',
      'Category',
      'Session Applied For',
    ])
    await user.click(screen.getByRole('button', { name: 'Close panel' }))

    const ben = await openPanel(user, 'Ben Koh')
    expect(ben.queryByRole('region', { name: 'Opportunity at Submission' })).not.toBeInTheDocument()
  })

  it('never changes an Application just by opening it', async () => {
    const { user, fetch } = renderApplications()

    await openPanel(user, 'Joanna Chen')

    expect(fetch.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true)
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('saves the status, and says Saved only once stored', async () => {
    const reply = deferred()
    const { user, patches } = renderApplications('/admin/applications', { onPatch: () => reply.promise })
    const panel = await openPanel(user, 'Joanna Chen')

    await user.click(panel.getByRole('button', { name: 'Accepted' }))
    await user.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(patches).toEqual([{ status: 'Accepted' }])
    expect(panel.queryByText('Saved ✓')).not.toBeInTheDocument()

    reply.resolve(undefined) // store it as sent
    expect(await panel.findByRole('button', { name: 'Saved ✓' })).toBeDisabled()
    await waitFor(() => expect(within(bodyRows()[0]).getAllByRole('cell')[6]).toHaveTextContent('Accepted'))
    expect(statusTabs().getAllByRole('button').map((tab) => tab.textContent)[3]).toBe('2Accepted')
  })

  it('keeps the edit and shows the error when a save fails', async () => {
    const { user } = renderApplications('/admin/applications', {
      onPatch: () => jsonResponse({ detail: "Can't accept: this session is already full." }, 409),
    })
    const panel = await openPanel(user, 'Ben Koh')

    await user.click(panel.getByRole('button', { name: 'Accepted' }))
    await user.click(panel.getByRole('button', { name: 'Save Changes' }))

    expect(await panel.findByRole('alert')).toHaveTextContent("Can't accept: this session is already full.")
    expect(panel.getByRole('button', { name: 'Accepted' })).toHaveAttribute('aria-pressed', 'true')
    expect(panel.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
    expect(panel.queryByText('Saved ✓')).not.toBeInTheDocument()
    expect(within(await rowFor('Ben Koh')).getAllByRole('cell')[6]).toHaveTextContent('Reviewing')
  })

  it('asks before changing an Accepted Application, and cancelling changes nothing', async () => {
    const { user, patches } = renderApplications()
    const panel = await openPanel(user, 'Sarah Tan')

    await user.click(panel.getByRole('button', { name: 'Reviewing' }))
    await user.click(panel.getByRole('button', { name: 'Save Changes' }))

    let ask = within(await screen.findByRole('dialog', { name: 'Change this accepted application?' }))
    expect(ask.getByText("This frees the creator's slot in their session.")).toBeInTheDocument()
    await user.click(ask.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Change this accepted application?' })).not.toBeInTheDocument()
    expect(patches).toEqual([])
    expect(within(await rowFor('Sarah Tan')).getAllByRole('cell')[6]).toHaveTextContent('Accepted')

    await user.click(panel.getByRole('button', { name: 'Save Changes' }))
    ask = within(await screen.findByRole('dialog', { name: 'Change this accepted application?' }))
    await user.click(ask.getByRole('button', { name: 'Change status' }))

    expect(await panel.findByRole('button', { name: 'Saved ✓' })).toBeInTheDocument()
    expect(patches).toEqual([{ status: 'Reviewing' }])
    expect(screen.queryByRole('dialog', { name: 'Change this accepted application?' })).not.toBeInTheDocument()
  })

  it('discards unsaved edits', async () => {
    const { user, patches } = renderApplications()
    const panel = await openPanel(user, 'Ben Koh')

    await user.click(panel.getByRole('button', { name: 'Declined' }))
    await user.click(panel.getByRole('button', { name: 'Discard' }))

    expect(panel.getByRole('button', { name: 'Reviewing' })).toHaveAttribute('aria-pressed', 'true')
    expect(panel.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
    expect(patches).toEqual([])
  })

  it('closes from its close button, the row, or Escape', async () => {
    const { user } = renderApplications()

    await openPanel(user, 'Ben Koh')
    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openPanel(user, 'Ben Koh')
    await user.click(within(await rowFor('Ben Koh')).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openPanel(user, 'Ben Koh')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Correcting creator details', () => {
  it('corrects only this Application, keeps the original, and shows it in the list', async () => {
    const { user, patches } = renderApplications()
    const panel = await openPanel(user, 'Sarah Tan')

    await user.click(creatorDetails(panel).getByRole('button', { name: 'Edit details' }))
    const mobile = panel.getByRole('textbox', { name: 'Mobile' })
    expect(mobile).toHaveValue('+65 9111 2233')
    expect(panel.queryByRole('textbox', { name: /note/i })).not.toBeInTheDocument()
    await user.clear(mobile)
    await user.type(mobile, '+65 9999 0000')
    await user.clear(panel.getByRole('textbox', { name: 'Full Name' }))
    await user.type(panel.getByRole('textbox', { name: 'Full Name' }), 'Sarah Tan Li Ying')
    await user.click(panel.getByRole('button', { name: 'Save details' }))

    expect(patches).toEqual([
      {
        contact: {
          fullName: 'Sarah Tan Li Ying',
          instagram: 'sarahtan.fit',
          tiktok: 'sarahtan.fit',
          email: 'sarah.tan@gmail.com',
          phone: '+65 9999 0000',
        },
      },
    ])
    const details = creatorDetails(panel)
    expect(await details.findByRole('link', { name: '+65 9999 0000' })).toHaveAttribute('href', 'https://wa.me/6599990000')
    expect(details.getByText('Originally: +65 9111 2233')).toBeInTheDocument()
    expect(details.getByText('Originally: Sarah Tan')).toBeInTheDocument()
    expect(details.queryByText(/Originally: sarah\.tan@gmail\.com/)).not.toBeInTheDocument()
    expect(await rowFor('Sarah Tan Li Ying')).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Accepted' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('refuses an invalid correction with the register form rules', async () => {
    const { user, patches } = renderApplications()
    const panel = await openPanel(user, 'Ben Koh')

    await user.click(creatorDetails(panel).getByRole('button', { name: 'Edit details' }))
    await user.clear(panel.getByRole('textbox', { name: 'Mobile' }))
    await user.type(panel.getByRole('textbox', { name: 'Mobile' }), '123')
    await user.clear(panel.getByRole('textbox', { name: 'Instagram' }))
    await user.click(panel.getByRole('button', { name: 'Save details' }))

    expect(panel.getByRole('textbox', { name: 'Mobile' })).toHaveAccessibleDescription('Please enter a valid mobile number')
    expect(panel.getByRole('textbox', { name: 'Instagram' })).toHaveAccessibleDescription('Instagram handle is required')
    expect(patches).toEqual([])
  })

  it("shows the API's errors under their fields", async () => {
    const { user } = renderApplications('/admin/applications', {
      onPatch: () =>
        jsonResponse(
          { detail: 'Please check the highlighted fields.', errors: { 'contact.email': 'Please enter a valid email address' } },
          422,
        ),
    })
    const panel = await openPanel(user, 'Ben Koh')

    await user.click(creatorDetails(panel).getByRole('button', { name: 'Edit details' }))
    await user.click(panel.getByRole('button', { name: 'Save details' }))

    await waitFor(() =>
      expect(panel.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription('Please enter a valid email address'),
    )
  })

  it('puts everything back on Cancel, and strips the @ from handles', async () => {
    const { user, patches } = renderApplications()
    const panel = await openPanel(user, 'Ben Koh')

    await user.click(creatorDetails(panel).getByRole('button', { name: 'Edit details' }))
    await user.clear(panel.getByRole('textbox', { name: 'Full Name' }))
    await user.click(panel.getByRole('button', { name: 'Cancel' }))

    expect(creatorDetails(panel).getAllByRole('definition')[0]).toHaveTextContent('Ben Koh')
    await user.click(creatorDetails(panel).getByRole('button', { name: 'Edit details' }))
    expect(panel.getByRole('textbox', { name: 'Full Name' })).toHaveValue('Ben Koh')
    await user.clear(panel.getByRole('textbox', { name: 'TikTok' }))
    await user.type(panel.getByRole('textbox', { name: 'TikTok' }), '@benkoh.new')
    await user.click(panel.getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].contact.tiktok).toBe('benkoh.new')
  })
})

describe('Moving an Application to another Session', () => {
  it('lists the other Sessions with their counts, and moves the Application', async () => {
    const { user, patches } = renderApplications()
    const panel = await openPanel(user, 'Sarah Tan')

    await user.click(panel.getByRole('button', { name: 'Change session' }))

    const choices = within(panel.getByRole('radiogroup', { name: 'Move to session' }))
    const full = choices.getByRole('radio', { name: /Saturday, 26 September/ })
    const open = choices.getByRole('radio', { name: /Wednesday, 30 September/ })
    expect(full).toHaveAccessibleName('Saturday, 26 September · 8:00 PM – 9:00 PM 2 of 2 accepted · Full')
    expect(full).toBeDisabled() // Sarah is Accepted
    expect(open).toHaveAccessibleName('Wednesday, 30 September · 7:00 PM – 8:00 PM 1 of 3 accepted')
    expect(panel.getByRole('button', { name: 'Move' })).toBeDisabled()

    await user.click(open)
    await user.click(panel.getByRole('button', { name: 'Move' }))

    expect(patches).toEqual([{ sessionId: '33' }])
    expect(await panel.findByText('Originally applied for: Wednesday, 23 September · 7:00 PM – 8:00 PM')).toBeInTheDocument()
    expect(panel.getByText('Wednesday, 30 September · 7:00 PM – 8:00 PM')).toBeInTheDocument()
    expect(panel.queryByRole('radiogroup')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(within(bodyRows()[2]).getAllByRole('cell')[3]).toHaveTextContent('Wednesday, 30 September · 7:00 PM – 8:00 PM'),
    )
  })

  it('lets an Application that is not Accepted move into a full Session', async () => {
    const { user } = renderApplications()
    const panel = await openPanel(user, 'Ben Koh')

    await user.click(panel.getByRole('button', { name: 'Change session' }))

    expect(panel.getByRole('radio', { name: /1 of 1 accepted · Full/ })).toBeEnabled()
  })

  it('says so when there is no other Session', async () => {
    const { user } = renderApplications()
    const panel = await openPanel(user, 'Joanna Chen')

    await user.click(panel.getByRole('button', { name: 'Change session' }))

    expect(panel.getByText('No other upcoming sessions.')).toBeInTheDocument()
  })

  it('shows why a move was refused, and stays on the Current Session', async () => {
    const { user } = renderApplications('/admin/applications', {
      onPatch: () => jsonResponse({ detail: 'That session is full. Choose another or add slots first.' }, 409),
    })
    const panel = await openPanel(user, 'Sarah Tan')

    await user.click(panel.getByRole('button', { name: 'Change session' }))
    await user.click(panel.getByRole('radio', { name: /Wednesday, 30 September/ }))
    await user.click(panel.getByRole('button', { name: 'Move' }))

    expect(await panel.findByRole('alert')).toHaveTextContent('That session is full. Choose another or add slots first.')
    expect(panel.queryByText(/Originally applied for/)).not.toBeInTheDocument()
  })
})
