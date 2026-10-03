import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, renderRoute } from '../../creator-portal/javascript/test/renderRoute'
import { ADMIN, bodyRows } from '../javascript/test/adminFixtures'

function row(overrides) {
  return {
    id: '1',
    title: 'Tennis Group Class',
    partner: 'The Best Group',
    heroImage: 'https://images.example/tennis.jpg',
    category: 'Sport',
    compensationType: 'Barter',
    whatCreatorReceives: 'Complimentary group tennis class',
    payment: null,
    collaborationType: 'One-off',
    schedule: {
      nextSession: { date: '2026-09-26', start: '20:00', end: '21:00' },
      availableDates: ['2026-09-26'],
      weeklyClasses: [],
    },
    applicationsCount: 0,
    publishingStatus: 'Live',
    availability: 'open',
    lastUpdated: '2026-09-14',
    ...overrides,
  }
}

const TENNIS = row({
  id: '1',
  compensationType: 'Paid',
  whatCreatorReceives: null,
  payment: { currency: 'SGD', amount: 150, basis: 'Per post', note: null },
  schedule: {
    nextSession: { date: '2026-09-26', start: '20:00', end: '21:00' },
    availableDates: ['2026-09-26', '2026-10-03'],
    weeklyClasses: [{ days: ['Saturday'], start: '20:00', end: '21:00' }],
  },
  applicationsCount: 12,
})
const PILATES = row({
  id: '2',
  title: 'Reformer Pilates Experience',
  partner: 'CARVE Pilates Studio',
  whatCreatorReceives: 'Complimentary reformer class',
  schedule: {
    nextSession: { date: '2026-09-26', start: '10:00', end: '11:00' },
    availableDates: ['2026-09-26', '2026-10-03'],
    weeklyClasses: [],
  },
  publishingStatus: 'Draft',
  canDelete: true,
  lastUpdated: '2026-09-12',
})
const BOULDERING = row({
  id: '3',
  title: 'Bouldering Experience',
  partner: 'Boulder Movement',
  schedule: {
    nextSession: { date: '2026-09-24', start: '10:00', end: '11:00' },
    availableDates: ['2026-09-24', '2026-09-26'],
    weeklyClasses: [],
  },
})
const COFFEE = row({
  id: '4',
  title: 'Specialty Coffee Experience for Two',
  partner: 'Kurasu Singapore',
  category: 'Lifestyle',
  collaborationType: 'One-off or Ongoing',
  schedule: {
    nextSession: { date: '2026-09-24', start: '10:00', end: '11:00' },
    availableDates: ['2026-09-24'],
    weeklyClasses: [],
  },
  publishingStatus: 'Closed',
})
const ACTIVEWEAR = row({
  id: '5',
  title: 'Activewear Creator Campaign',
  partner: 'FullOut Activewear',
  heroImage: null,
  category: 'Lifestyle',
  collaborationType: 'Ongoing',
  schedule: null,
})

const ALL = [TENNIS, PILATES, BOULDERING, COFFEE, ACTIVEWEAR]
const COUNTS = { total: 5, live: 3, draft: 1, closed: 1, applications: 65 }

const FILTER_FIELDS = {
  status: 'publishingStatus',
  category: 'category',
  compensation: 'compensationType',
  collaborationType: 'collaborationType',
}

// A stand-in for the list endpoint: filters `rows` the way the API does and
// records each request's query.
function listApi(rows = ALL) {
  const queries = []
  const handler = (request) => {
    const params = new URL(request.url).searchParams
    queries.push(Object.fromEntries(params))
    const search = (params.get('search') ?? '').trim().toLowerCase()
    const matching = rows.filter(
      (r) =>
        Object.entries(FILTER_FIELDS).every(([param, field]) => !params.get(param) || r[field] === params.get(param)) &&
        (!search || `${r.title}\n${r.partner}`.toLowerCase().includes(search)),
    )
    return { counts: COUNTS, opportunities: matching }
  }
  return { handler, queries }
}

function renderList(rows) {
  const { handler, queries } = listApi(rows)
  const view = renderRoute('/admin/opportunities', {
    api: { 'GET /api/admin/session': ADMIN, 'GET /api/admin/opportunities': handler },
  })
  return { ...view, queries }
}

async function rowFor(title) {
  const cell = await screen.findByText(title, { selector: 'td *' })
  return cell.closest('tr')
}

describe('Admin Opportunities list', () => {
  it('shows the Figma header with a Create Opportunity link', async () => {
    renderList()

    expect(await screen.findByRole('heading', { name: 'Creator Opportunities' })).toBeInTheDocument()
    expect(screen.getByText('Manage and track all collaboration opportunities')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create Opportunity' })).toHaveAttribute(
      'href',
      '/admin/create-opportunity',
    )
  })

  it('shows the summary counts from the API', async () => {
    renderList()
    await screen.findByText('Showing 5 of 5 opportunities')

    const counts = screen.getByRole('list', { name: 'Summary' })
    const items = within(counts).getAllByRole('listitem').map((item) => item.textContent)
    expect(items).toEqual(['Total5', 'Live3', 'Draft1', 'Closed1', 'Applications65'])
  })

  it('lists every row in the order the API gives, with each column', async () => {
    renderList()

    const tennis = await rowFor('Tennis Group Class')
    expect(bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Tennis Group ClassThe Best Group',
      'Reformer Pilates ExperienceCARVE Pilates Studio',
      'Bouldering ExperienceBoulder Movement',
      'Specialty Coffee Experience for TwoKurasu Singapore',
      'Activewear Creator CampaignFullOut Activewear',
    ])
    const cells = within(tennis).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells.slice(1, 8)).toEqual([
      'Sport',
      'PaidS$150 · Per post',
      'One-off',
      'Weekly · Sat 8–9pm',
      '12received',
      'Live',
      '14 Sep 2026',
    ])
    expect(within(await rowFor('Reformer Pilates Experience')).getByText('Complimentary reformer class')).toBeInTheDocument()
    expect(within(await rowFor('Specialty Coffee Experience for Two')).getByText('One-off or Ongoing')).toBeInTheDocument()
  })

  it('words the schedule like the Creator Portal cards, and leaves it blank without Sessions', async () => {
    renderList()

    const schedule = async (title) => within(await rowFor(title)).getAllByRole('cell')[4].textContent
    expect(await schedule('Tennis Group Class')).toBe('Weekly · Sat 8–9pm')
    expect(await schedule('Reformer Pilates Experience')).toBe('Saturdays from 26 Sep')
    expect(await schedule('Bouldering Experience')).toBe('Multiple dates available')
    expect(await schedule('Specialty Coffee Experience for Two')).toBe('Thu, 24 Sep · 10:00 AM')
    expect(await schedule('Activewear Creator Campaign')).toBe('')
  })

  it('says a Live opportunity has no available sessions, under its Live badge', async () => {
    renderList([
      row({ id: '1', title: 'Full Class', availability: 'fully_booked', schedule: null }),
      row({ id: '2', title: 'Past Class', availability: 'closed', schedule: null }),
      row({ id: '3', title: 'Open Class' }),
      row({ id: '4', title: 'Closed Class', publishingStatus: 'Closed', availability: 'closed' }),
    ])

    const status = async (title) => within(await rowFor(title)).getAllByRole('cell')[6].textContent
    expect(await status('Full Class')).toBe('LiveNo available sessions')
    expect(await status('Past Class')).toBe('LiveNo available sessions')
    expect(await status('Open Class')).toBe('Live')
    expect(await status('Closed Class')).toBe('Closed')
  })

  it('names every weekday of a weekly class on several days', async () => {
    renderList([
      row({
        title: 'Padel Session',
        schedule: { ...TENNIS.schedule, weeklyClasses: [{ days: ['Tuesday', 'Thursday'], start: '18:00', end: '19:30' }] },
      }),
    ])

    expect(within(await rowFor('Padel Session')).getAllByRole('cell')[4]).toHaveTextContent('Weekly · Tue & Thu 6–7:30pm')
  })

  it('links "N received" to the Applications page for that Opportunity', async () => {
    const { user, location } = renderList()

    const link = within(await rowFor('Tennis Group Class')).getByRole('link', { name: '12 received' })
    expect(link).toHaveAttribute('href', '/admin/applications?opportunityId=1')

    await user.click(link)
    expect(location()).toMatchObject({ pathname: '/admin/applications', search: '?opportunityId=1' })
  })

  it('shows a grey image area when an Opportunity has no cover image', async () => {
    renderList()

    const activewear = await rowFor('Activewear Creator Campaign')
    expect(activewear.querySelector('img')).toBeNull()
    expect((await rowFor('Tennis Group Class')).querySelector('img')).toHaveAttribute(
      'src',
      'https://images.example/tennis.jpg',
    )
  })

  it('combines filters and search, and updates "Showing X of Y"', async () => {
    const { user, queries } = renderList()
    expect(await screen.findByText('Showing 5 of 5 opportunities')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Lifestyle')
    expect(await screen.findByText('Showing 2 of 5 opportunities')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Collab type' }), 'One-off or ongoing')
    expect(await screen.findByText('Showing 1 of 5 opportunities')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(1)
    expect(screen.getByText('Specialty Coffee Experience for Two')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search opportunities or partners' }), 'tennis')
    expect(await screen.findByText('Showing 0 of 5 opportunities')).toBeInTheDocument()
    expect(screen.getByText('No opportunities match the current filters')).toBeInTheDocument()
    expect(queries.at(-1)).toEqual({ category: 'Lifestyle', collaborationType: 'One-off or Ongoing', search: 'tennis' })
  })

  it('filters by status and compensation', async () => {
    const { user } = renderList()
    await rowFor('Tennis Group Class')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Draft')
    expect(await screen.findByText('Showing 1 of 5 opportunities')).toBeInTheDocument()
    expect(screen.getByText('Reformer Pilates Experience')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'All statuses')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Compensation' }), 'Paid')
    expect(await screen.findByText('Showing 1 of 5 opportunities')).toBeInTheDocument()
    expect(screen.getByText('Tennis Group Class')).toBeInTheDocument()
  })

  it('clears every filter at once', async () => {
    const { user } = renderList()
    await rowFor('Tennis Group Class')
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Closed')
    await user.type(screen.getByRole('searchbox', { name: 'Search opportunities or partners' }), 'zzz')
    await user.click(await screen.findByRole('button', { name: 'Clear all filters' }))

    expect(await screen.findByText('Showing 5 of 5 opportunities')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('')
    expect(screen.getByRole('searchbox', { name: 'Search opportunities or partners' })).toHaveValue('')
  })

  it('offers a retry when the list cannot load', async () => {
    let attempts = 0
    const { handler } = listApi()
    const { user } = renderRoute('/admin/opportunities', {
      api: {
        'GET /api/admin/session': ADMIN,
        'GET /api/admin/opportunities': (request) => {
          attempts += 1
          return attempts === 1 ? jsonResponse({ detail: 'boom' }, 500) : handler(request)
        },
      },
    })

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Showing 5 of 5 opportunities')).toBeInTheDocument()
  })
})

// The list with the row-menu endpoints stubbed; `actions` records each action
// as "METHOD /path?query".
function renderWithActions(respond = () => ({}), rows = ALL) {
  const { handler } = listApi(rows)
  const actions = []
  let loads = 0
  const action = async (request) => {
    const url = new URL(request.url)
    actions.push(`${request.method} ${url.pathname}${url.search}`)
    return respond(request)
  }
  const api = {
    'GET /api/admin/session': ADMIN,
    'GET /api/admin/opportunities': (request) => {
      loads += 1
      return handler(request)
    },
  }
  for (const id of ['1', '2', '4']) {
    for (const name of ['publish', 'close', 'duplicate']) {
      api[`POST /api/admin/opportunities/${id}/${name}`] = action
    }
    api[`DELETE /api/admin/opportunities/${id}`] = action
  }
  const view = renderRoute('/admin/opportunities', { api })
  return { ...view, actions, loads: () => loads }
}

async function openMenu(user, title) {
  await user.click(within(await rowFor(title)).getByRole('button', { name: `Actions for ${title}` }))
  return screen.getByRole('menu', { name: `Actions for ${title}` })
}

const itemNames = (menu) => within(menu).getAllByRole('menuitem').map((item) => item.textContent)

async function choose(user, title, item) {
  await user.click(within(await openMenu(user, title)).getByRole('menuitem', { name: item }))
}

describe('Row menu', () => {
  it('offers each Publishing Status the FS’s actions', async () => {
    const { user } = renderList()

    expect(itemNames(await openMenu(user, 'Reformer Pilates Experience'))).toEqual([
      'Edit', 'Preview Listing', 'Duplicate', 'Delete Draft',
    ])
    await user.keyboard('{Escape}')
    expect(itemNames(await openMenu(user, 'Tennis Group Class'))).toEqual([
      'Edit', 'View Applications', 'Preview Listing', 'Duplicate', 'Close Opportunity',
    ])
    await user.keyboard('{Escape}')
    expect(itemNames(await openMenu(user, 'Specialty Coffee Experience for Two'))).toEqual([
      'Edit', 'View Applications', 'Preview Listing', 'Duplicate', 'Reopen Opportunity',
    ])
  })

  it('leaves out Delete Draft when the Draft can’t be deleted', async () => {
    const { user } = renderList([{ ...PILATES, canDelete: false }])

    expect(itemNames(await openMenu(user, 'Reformer Pilates Experience'))).toEqual([
      'Edit', 'Preview Listing', 'Duplicate',
    ])
  })

  it('opens with the first item focused, moves with the arrow keys and closes on Escape', async () => {
    const { user } = renderList()

    const menu = await openMenu(user, 'Tennis Group Class')
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(within(menu).getByRole('menuitem', { name: 'Close Opportunity' })).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'View Applications' })).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Tennis Group Class' })).toHaveFocus()
  })

  it('closes on Tab, back on its button so Tab carries on from the row', async () => {
    const { user } = renderList()

    await openMenu(user, 'Tennis Group Class')
    await user.tab()

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const nextRow = await rowFor('Reformer Pilates Experience')
    expect(within(nextRow).getByRole('link', { name: '0 received' })).toHaveFocus()
  })

  it('closes when clicking outside it', async () => {
    const { user } = renderList()

    await openMenu(user, 'Tennis Group Class')
    await user.click(screen.getByRole('heading', { name: 'Creator Opportunities' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('links to the edit page, the filtered Applications and the creator page in a new tab', async () => {
    const { user, location } = renderList()

    const menu = await openMenu(user, 'Tennis Group Class')
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toHaveAttribute('href', '/admin/edit-opportunity/1')
    expect(within(menu).getByRole('menuitem', { name: 'View Applications' })).toHaveAttribute(
      'href',
      '/admin/applications?opportunityId=1',
    )
    const preview = within(menu).getByRole('menuitem', { name: 'Preview Listing' })
    expect(preview).toHaveAttribute('href', '/opportunity/1')
    expect(preview).toHaveAttribute('target', '_blank')

    await user.click(within(menu).getByRole('menuitem', { name: 'View Applications' }))
    expect(location()).toMatchObject({ pathname: '/admin/applications', search: '?opportunityId=1' })
  })

  it('duplicates at once, with no pop-up, and reloads the list', async () => {
    const { user, actions, loads } = renderWithActions()

    await openMenu(user, 'Tennis Group Class')
    const before = loads()
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }))

    expect(actions).toEqual(['POST /api/admin/opportunities/1/duplicate'])
    await vi.waitFor(() => expect(loads()).toBe(before + 1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['Tennis Group Class', 'Close Opportunity', 'Close this opportunity?',
      "Creators can't apply any more. Existing applications are kept and can still be reviewed.",
      ['POST /api/admin/opportunities/1/close']],
    ['Reformer Pilates Experience', 'Delete Draft', 'Delete this draft?', "This can't be undone.",
      ['DELETE /api/admin/opportunities/2']],
    ['Specialty Coffee Experience for Two', 'Reopen Opportunity', 'Publish this opportunity?',
      'It becomes visible to creators straight away.',
      ['POST /api/admin/opportunities/4/publish?check=true', 'POST /api/admin/opportunities/4/publish']],
  ])('on %s, %s asks first, and only confirming acts and reloads the list', async (title, item, question, body, calls) => {
    const { user, actions, loads } = renderWithActions()

    await choose(user, title, item)
    const dialog = await screen.findByRole('dialog', { name: question })
    expect(dialog).toHaveAccessibleDescription(body)
    expect(actions).toEqual(calls.slice(0, -1))
    const before = loads()
    await user.click(within(dialog).getByRole('button', { name: item === 'Reopen Opportunity' ? 'Publish' : item }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(actions).toEqual(calls)
    await vi.waitFor(() => expect(loads()).toBe(before + 1))
  })

  it.each([
    ['Tennis Group Class', 'Close Opportunity'],
    ['Reformer Pilates Experience', 'Delete Draft'],
    ['Specialty Coffee Experience for Two', 'Reopen Opportunity'],
  ])('on %s, cancelling %s’s pop-up changes nothing', async (title, item) => {
    const { user, actions } = renderWithActions()

    await choose(user, title, item)
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actions.filter((call) => !call.endsWith('?check=true'))).toEqual([])
  })

  it('shows why a confirmed action was refused inside the pop-up', async () => {
    const { user } = renderWithActions(() =>
      jsonResponse({ detail: 'This opportunity is Closed now. Reload the page to see its current status.' }, 409),
    )

    await choose(user, 'Tennis Group Class', 'Close Opportunity')
    const dialog = await screen.findByRole('dialog', { name: 'Close this opportunity?' })
    await user.click(within(dialog).getByRole('button', { name: 'Close Opportunity' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This opportunity is Closed now.')
    expect(within(dialog).getByRole('button', { name: 'Close Opportunity' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Close Opportunity' })).toHaveFocus()
  })

  it('reloads the list behind the pop-up when a confirmed action fails', async () => {
    const { user, loads } = renderWithActions(() => jsonResponse({ detail: 'This opportunity is Closed now.' }, 409))

    await choose(user, 'Tennis Group Class', 'Close Opportunity')
    const dialog = await screen.findByRole('dialog', { name: 'Close this opportunity?' })
    const before = loads()
    await user.click(within(dialog).getByRole('button', { name: 'Close Opportunity' }))

    await vi.waitFor(() => expect(loads()).toBe(before + 1))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says “Saving…” on the confirm button until the API answers', async () => {
    let answer
    const { user } = renderWithActions(() => new Promise((resolve) => { answer = resolve }))

    await choose(user, 'Reformer Pilates Experience', 'Delete Draft')
    const dialog = await screen.findByRole('dialog', { name: 'Delete this draft?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete Draft' }))

    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    answer(jsonResponse({}))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows why a reopen’s check was refused, with no pop-up', async () => {
    const { user } = renderWithActions(() =>
      jsonResponse({ detail: 'This opportunity is Live now. Reload the page to see its current status.' }, 409),
    )

    await choose(user, 'Specialty Coffee Experience for Two', 'Reopen Opportunity')

    expect(await screen.findByRole('alert')).toHaveTextContent('This opportunity is Live now.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says an action failed when the server can’t be reached', async () => {
    const { user } = renderWithActions(() => Promise.reject(new TypeError('Failed to fetch')))

    await choose(user, 'Tennis Group Class', 'Duplicate')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't duplicate Tennis Group Class. Check your connection and try again.")
  })
})

describe('Confirmation pop-up', () => {
  it('starts on Cancel, keeps focus inside and closes on Escape, back where it was', async () => {
    const { user, actions } = renderWithActions()

    await choose(user, 'Tennis Group Class', 'Close Opportunity')
    const dialog = await screen.findByRole('dialog', { name: 'Close this opportunity?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const confirm = within(dialog).getByRole('button', { name: 'Close Opportunity' })
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actions).toEqual([])
  })

  it('closes when clicking the dimmed page around it', async () => {
    const { user, actions } = renderWithActions()

    await choose(user, 'Tennis Group Class', 'Close Opportunity')
    await screen.findByRole('dialog')
    await user.click(screen.getByTestId('dialog-backdrop'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actions).toEqual([])
  })
})
