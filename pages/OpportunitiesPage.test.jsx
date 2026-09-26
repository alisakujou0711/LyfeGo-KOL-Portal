import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, renderRoute } from '../javascript/test/renderRoute'

function card(overrides = {}) {
  return {
    id: '1',
    title: 'Tennis Group Class',
    partner: 'Kallang Tennis Centre',
    category: 'Sport',
    subcategory: 'Tennis',
    compensationType: 'Barter',
    whatCreatorReceives: 'Complimentary group tennis class',
    payment: null,
    area: 'Kallang',
    heroImage: 'https://images.example/tennis.jpg',
    nextSession: { date: '2026-09-24', start: '10:00', end: '11:00' },
    moreSessionsCount: 0,
    slotsLeft: 5,
    limitedSpots: false,
    experienceLevels: ['Beginner', 'Intermediate'],
    deliverableType: 'Fixed',
    collaborationType: 'One-off',
    availableDates: ['2026-09-24'],
    weeklyClasses: [],
    ...overrides,
  }
}

const PAID = card({
  id: '5',
  title: 'Activewear Campaign',
  partner: 'FullOut Activewear',
  category: 'Lifestyle',
  subcategory: 'Activewear',
  compensationType: 'Paid',
  whatCreatorReceives: null,
  payment: { currency: 'SGD', amount: 150, basis: 'Flat fee', note: 'Plus an activewear set' },
  experienceLevels: ['Not Applicable'],
  deliverableType: 'Flexible',
  collaborationType: 'Ongoing',
})

function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

async function findCard(title) {
  return screen.findByRole('link', { name: new RegExp(title) })
}

describe('Discover', () => {
  it('shows placeholder cards while opportunities load', async () => {
    const response = deferred()
    renderRoute('/', { api: { 'GET /api/opportunities': () => response.promise } })

    expect(screen.getByRole('status', { name: 'Loading opportunities' })).toBeInTheDocument()

    response.resolve([card()])
    await findCard('Tennis Group Class')
    expect(screen.queryByRole('status', { name: 'Loading opportunities' })).not.toBeInTheDocument()
  })

  it('shows a card with its badges, title, Partner, Session, Area and rows', async () => {
    renderRoute('/', { api: { 'GET /api/opportunities': [card()] } })

    const tennis = within(await findCard('Tennis Group Class'))
    expect(tennis.getByText('Sport')).toBeInTheDocument()
    expect(tennis.getByText('Barter')).toBeInTheDocument()
    expect(tennis.getByRole('heading', { name: 'Tennis Group Class' })).toBeInTheDocument()
    expect(tennis.getByText('Kallang Tennis Centre')).toBeInTheDocument()
    expect(tennis.getByRole('img')).toHaveAttribute('src', 'https://images.example/tennis.jpg')
    expect(tennis.getByText('Thu, 24 Sep · 10:00 AM')).toBeInTheDocument()
    expect(tennis.getByText('Kallang')).toBeInTheDocument()
    expect(tennis.getByText('Level').parentElement).toHaveTextContent('Level·Beginner, Intermediate')
    expect(tennis.getByText('Deliverables').parentElement).toHaveTextContent('Deliverables·Fixed')
    expect(tennis.getByText('Collaboration').parentElement).toHaveTextContent('Collaboration·One-off')
    expect(tennis.getByText('View Opportunity →')).toBeInTheDocument()
  })

  it('leaves out the Subcategory, the compensation and Limited spots', async () => {
    renderRoute('/', {
      api: { 'GET /api/opportunities': [card({ limitedSpots: true, slotsLeft: 2 }), PAID] },
    })

    const tennis = within(await findCard('Tennis Group Class'))
    expect(tennis.queryByText('Tennis')).not.toBeInTheDocument()
    expect(tennis.queryByText('Complimentary group tennis class')).not.toBeInTheDocument()
    expect(tennis.queryByText('Limited spots')).not.toBeInTheDocument()
    const activewear = within(await findCard('Activewear Campaign'))
    expect(activewear.queryByText(/S\$150/)).not.toBeInTheDocument()
    expect(activewear.queryByText(/activewear set/)).not.toBeInTheDocument()
  })

  it('hides the Level row when the level is Not Applicable', async () => {
    renderRoute('/', { api: { 'GET /api/opportunities': [PAID] } })

    const activewear = within(await findCard('Activewear Campaign'))
    expect(activewear.queryByText('Level')).not.toBeInTheDocument()
    expect(activewear.getByText('Deliverables').parentElement).toHaveTextContent('Deliverables·Flexible')
    expect(activewear.getByText('Collaboration').parentElement).toHaveTextContent('Collaboration·Ongoing')
  })

  it('names the weekday when every available date falls on it', async () => {
    renderRoute('/', {
      api: {
        'GET /api/opportunities': [
          card({
            nextSession: { date: '2026-09-26', start: '09:00', end: '10:00' },
            moreSessionsCount: 2,
            availableDates: ['2026-09-26', '2026-10-03', '2026-10-10'],
          }),
        ],
      },
    })

    const tennis = within(await findCard('Tennis Group Class'))
    expect(tennis.getByText('Saturdays from 26 Sep')).toBeInTheDocument()
  })

  it('names the first weekly class when there is one', async () => {
    renderRoute('/', {
      api: {
        'GET /api/opportunities': [
          card({
            moreSessionsCount: 3,
            availableDates: ['2026-09-24', '2026-09-26', '2026-09-27', '2026-10-03'],
            weeklyClasses: [
              { day: 'Saturday', start: '20:00', end: '21:00' },
              { day: 'Sunday', start: '09:30', end: '10:30' },
            ],
          }),
        ],
      },
    })

    const tennis = within(await findCard('Tennis Group Class'))
    expect(tennis.getByText('Weekly · Sat 8–9pm')).toBeInTheDocument()
    expect(tennis.queryByText('Multiple dates available')).not.toBeInTheDocument()
  })

  it('says multiple dates are available when they fall on different weekdays', async () => {
    renderRoute('/', {
      api: {
        'GET /api/opportunities': [
          card({ moreSessionsCount: 1, availableDates: ['2026-09-24', '2026-09-26'] }),
        ],
      },
    })

    const tennis = within(await findCard('Tennis Group Class'))
    expect(tennis.getByText('Multiple dates available')).toBeInTheDocument()
    expect(tennis.queryByText(/Thu, 24 Sep/)).not.toBeInTheDocument()
  })

  it('links each card to its opportunity', async () => {
    renderRoute('/', { api: { 'GET /api/opportunities': [card({ id: '7' })] } })

    expect(await findCard('Tennis Group Class')).toHaveAttribute('href', '/opportunity/7')
  })

  it('shows the title, subtitle and count of opportunities', async () => {
    renderRoute('/', { api: { 'GET /api/opportunities': [card(), PAID] } })

    await findCard('Tennis Group Class')
    expect(screen.getByRole('heading', { level: 1, name: 'Discover Creator Opportunities' })).toBeInTheDocument()
    expect(screen.getByText(/Explore Sport and Lifestyle collaborations/)).toBeInTheDocument()
    expect(screen.getByText('2 opportunities')).toBeInTheDocument()
  })

  it('shows cards in the order the API returns them', async () => {
    renderRoute('/', {
      api: {
        'GET /api/opportunities': [card({ id: '2', title: 'Sooner' }), card({ id: '1', title: 'Later' })],
      },
    })

    await findCard('Sooner')
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Sooner', 'Later'])
  })

  it('offers a retry when opportunities fail to load', async () => {
    let calls = 0
    const { user } = renderRoute('/', {
      api: {
        'GET /api/opportunities': () => {
          calls += 1
          return calls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : [card()]
        },
      },
    })

    expect(await screen.findByText("Couldn't load opportunities")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await findCard('Tennis Group Class')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load opportunities")).not.toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it('treats a server error as a failed load', async () => {
    renderRoute('/', {
      api: { 'GET /api/opportunities': jsonResponse({ detail: 'boom' }, 500) },
    })

    expect(await screen.findByText("Couldn't load opportunities")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('Discover filters', () => {
  // "Today" is Thursday 10 September 2026 for the date filter.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 10, 9, 0))
  })
  afterEach(() => vi.useRealTimers())

  // A card whose Available Sessions fall on `dates`; the first is the next one.
  function listed(dates, overrides) {
    return card({
      ...overrides,
      nextSession: { date: dates[0], start: '10:00', end: '11:00' },
      moreSessionsCount: dates.length - 1,
      availableDates: dates,
    })
  }

  const LIST = [
    listed(['2026-09-12', '2026-09-26'], {
      id: '1',
      title: 'Tennis Group Class',
      area: 'Kallang',
    }),
    listed(['2026-09-18'], {
      id: '2',
      title: 'Boxing with Lionheart',
      subcategory: 'Boxing',
      area: 'Tanjong Pagar',
      collaborationType: 'Ongoing',
      deliverableType: 'Flexible',
    }),
    listed(['2026-10-03', '2026-10-10'], {
      id: '3',
      title: 'Running Campaign',
      subcategory: 'Running',
      compensationType: 'Paid',
      whatCreatorReceives: null,
      payment: { currency: 'SGD', amount: 200, basis: 'Per post', note: null },
      area: 'Marina Bay',
      collaborationType: 'One-off or Ongoing',
    }),
    listed(['2026-09-12', '2026-09-13', '2026-09-14'], {
      id: '4',
      title: 'Café Brunch',
      category: 'Lifestyle',
      subcategory: 'Café',
      area: 'Tanjong Pagar',
    }),
    listed(['2026-09-25'], { ...PAID, area: 'Orchard' }),
  ]
  const ALL = LIST.map((o) => o.title)

  function renderDiscover(path = '/') {
    return renderRoute(path, { api: { 'GET /api/opportunities': LIST } })
  }

  function visibleTitles() {
    return screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  }

  function chip(group, name) {
    return within(screen.getByRole('group', { name: group })).getByRole('button', { name })
  }

  function searchParams(location) {
    return Object.fromEntries(new URLSearchParams(location().search))
  }

  function dateButton() {
    return screen.getByRole('button', { name: /^Date:/ })
  }

  async function openDatePopover(user) {
    await user.click(dateButton())
    return within(screen.getByRole('dialog', { name: 'Date' }))
  }

  it('filters by Category and Compensation Type independently', async () => {
    const { user, location } = renderDiscover()
    await findCard('Tennis Group Class')

    await user.click(chip('Category', 'Lifestyle'))
    expect(visibleTitles()).toEqual(['Café Brunch', 'Activewear Campaign'])

    await user.click(chip('Compensation', 'Paid'))
    expect(visibleTitles()).toEqual(['Activewear Campaign'])
    expect(searchParams(location)).toEqual({ category: 'Lifestyle', compensation: 'Paid' })

    await user.click(chip('Category', 'All'))
    expect(visibleTitles()).toEqual(['Running Campaign', 'Activewear Campaign'])
    expect(chip('Compensation', 'Paid')).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores filters from the URL', async () => {
    renderDiscover('/?category=Sport&compensation=Paid')
    await findCard('Running Campaign')

    expect(visibleTitles()).toEqual(['Running Campaign'])
    expect(chip('Category', 'Sport')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Compensation', 'Paid')).toHaveAttribute('aria-pressed', 'true')
  })

  it('has no Subcategory filter, and ignores one in the URL', async () => {
    renderDiscover('/?subcategory=Tennis')
    await findCard('Tennis Group Class')

    expect(screen.queryByRole('combobox', { name: 'Subcategory' })).not.toBeInTheDocument()
    expect(visibleTitles()).toEqual(ALL)
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('matches the Area as a case-insensitive substring, suggesting loaded Areas', async () => {
    const { user, location } = renderDiscover()
    await findCard('Tennis Group Class')

    const area = screen.getByRole('combobox', { name: 'Area' })
    const suggestions = document.getElementById(area.getAttribute('list'))
    expect([...suggestions.querySelectorAll('option')].map((o) => o.value)).toEqual([
      'Kallang',
      'Marina Bay',
      'Orchard',
      'Tanjong Pagar',
    ])

    await user.type(area, 'TANJONG')
    expect(visibleTitles()).toEqual(['Boxing with Lionheart', 'Café Brunch'])
    expect(searchParams(location)).toEqual({ area: 'TANJONG' })
  })

  it('keeps Opportunities with an Available Session in each preset, listed once', async () => {
    const { user, location } = renderDiscover()
    await findCard('Tennis Group Class')
    expect(dateButton()).toHaveTextContent('Any date')

    await user.click((await openDatePopover(user)).getByRole('button', { name: 'This week' }))
    expect(screen.queryByRole('dialog', { name: 'Date' })).not.toBeInTheDocument()
    expect(visibleTitles()).toEqual(['Tennis Group Class', 'Café Brunch'])
    expect(searchParams(location)).toEqual({ date: 'week' })
    expect(dateButton()).toHaveTextContent('This week')

    await user.click((await openDatePopover(user)).getByRole('button', { name: 'Next 2 wks' }))
    expect(visibleTitles()).toEqual(['Tennis Group Class', 'Boxing with Lionheart', 'Café Brunch'])
    expect(searchParams(location)).toEqual({ date: '2weeks' })
    expect(dateButton()).toHaveTextContent('Next 2 weeks')

    await user.click((await openDatePopover(user)).getByRole('button', { name: 'This month' }))
    expect(visibleTitles()).toEqual([
      'Tennis Group Class',
      'Boxing with Lionheart',
      'Café Brunch',
      'Activewear Campaign',
    ])
    expect(searchParams(location)).toEqual({ date: 'month' })
  })

  it('counts the presets from today in Singapore, wherever the browser is', async () => {
    const browserZone = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      // Friday 11 September, 00:30 in Singapore; still Thursday 10 September in Los Angeles.
      vi.setSystemTime(new Date('2026-09-10T16:30:00Z'))
      const { user } = renderRoute('/', {
        api: {
          'GET /api/opportunities': [
            listed(['2026-09-10'], { id: '1', title: 'Yesterday in Singapore' }),
            listed(['2026-09-17'], { id: '2', title: 'Six days on in Singapore' }),
          ],
        },
      })
      await findCard('Six days on in Singapore')

      await user.click((await openDatePopover(user)).getByRole('button', { name: 'This week' }))

      expect(visibleTitles()).toEqual(['Six days on in Singapore'])
    } finally {
      process.env.TZ = browserZone
    }
  })

  it('matches a custom range on any Available Session, not just the next one', async () => {
    const { user, location } = renderDiscover()
    await findCard('Tennis Group Class')

    const popover = await openDatePopover(user)
    expect(popover.getByRole('button', { name: 'Apply' })).toBeDisabled()
    await user.click(popover.getByRole('button', { name: '27 September 2026' }))
    await user.click(popover.getByRole('button', { name: '25 September 2026' }))
    await user.click(popover.getByRole('button', { name: 'Apply' }))

    expect(screen.queryByRole('dialog', { name: 'Date' })).not.toBeInTheDocument()
    expect(visibleTitles()).toEqual(['Tennis Group Class', 'Activewear Campaign'])
    expect(searchParams(location)).toEqual({ date: 'range', from: '2026-09-25', to: '2026-09-27' })
    expect(dateButton()).toHaveTextContent('25 Sep – 27 Sep')
  })

  it('applies a single day picked in another month', async () => {
    const { user, location } = renderDiscover()
    await findCard('Tennis Group Class')

    const popover = await openDatePopover(user)
    expect(popover.getByText('September 2026')).toBeInTheDocument()
    await user.click(popover.getByRole('button', { name: 'Next month' }))
    expect(popover.getByText('October 2026')).toBeInTheDocument()
    await user.click(popover.getByRole('button', { name: '3 October 2026' }))
    await user.click(popover.getByRole('button', { name: 'Apply' }))

    expect(visibleTitles()).toEqual(['Running Campaign'])
    expect(searchParams(location)).toEqual({ date: 'range', from: '2026-10-03', to: '2026-10-03' })
    expect(dateButton()).toHaveTextContent('3 Oct')
  })

  it('ignores an impossible date range in the URL', async () => {
    renderDiscover('/?date=range&from=2026-13-45&to=2026-09-30')
    await findCard('Tennis Group Class')

    expect(visibleTitles()).toEqual(ALL)
    expect(dateButton()).toHaveTextContent('Any date')
  })

  it('clears the date from the popover', async () => {
    const { user, location } = renderDiscover(
      '/?date=range&from=2026-09-25&to=2026-09-27&category=Sport',
    )
    await findCard('Tennis Group Class')

    const popover = await openDatePopover(user)
    expect(popover.getByRole('button', { name: '25 September 2026' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(popover.getByRole('button', { name: 'Clear' }))

    expect(screen.queryByRole('dialog', { name: 'Date' })).not.toBeInTheDocument()
    expect(searchParams(location)).toEqual({ category: 'Sport' })
    expect(dateButton()).toHaveTextContent('Any date')
  })

  it('matches the Collaboration type and Deliverables exactly', async () => {
    const { user, location } = renderDiscover()
    await findCard('Tennis Group Class')

    const collaboration = screen.getByRole('combobox', { name: 'Collaboration type' })
    expect(within(collaboration).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any',
      'One-off',
      'Ongoing',
      'One-off or ongoing',
    ])
    const deliverables = screen.getByRole('combobox', { name: 'Deliverables' })
    expect(within(deliverables).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any',
      'Fixed',
      'Flexible',
    ])

    await user.selectOptions(collaboration, 'One-off or ongoing')
    expect(visibleTitles()).toEqual(['Running Campaign'])
    expect(searchParams(location)).toEqual({ collaboration: 'One-off or Ongoing' })

    await user.selectOptions(collaboration, 'Ongoing')
    expect(visibleTitles()).toEqual(['Boxing with Lionheart', 'Activewear Campaign'])

    await user.selectOptions(collaboration, 'Any')
    await user.selectOptions(deliverables, 'Fixed')
    expect(visibleTitles()).toEqual(['Tennis Group Class', 'Running Campaign', 'Café Brunch'])
    expect(searchParams(location)).toEqual({ deliverables: 'Fixed' })
  })

  it('restores every filter from the URL and combines them with AND', async () => {
    renderDiscover(
      '/?category=Lifestyle&compensation=Paid&area=orch&date=range&from=2026-09-20&to=2026-09-30&collaboration=Ongoing&deliverables=Flexible',
    )
    await findCard('Activewear Campaign')

    expect(visibleTitles()).toEqual(['Activewear Campaign'])
    expect(chip('Category', 'Lifestyle')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Compensation', 'Paid')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Area' })).toHaveValue('orch')
    expect(dateButton()).toHaveTextContent('20 Sep – 30 Sep')
    expect(screen.getByRole('combobox', { name: 'Collaboration type' })).toHaveValue('Ongoing')
    expect(screen.getByRole('combobox', { name: 'Deliverables' })).toHaveValue('Flexible')
  })

  it('clears every filter from the filter bar', async () => {
    const { user, location } = renderDiscover(
      '/?category=Sport&date=month&collaboration=Ongoing&deliverables=Flexible&area=tan',
    )
    await findCard('Boxing with Lionheart')

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(visibleTitles()).toEqual(ALL)
    expect(location().search).toBe('')
    expect(dateButton()).toHaveTextContent('Any date')
    expect(screen.getByRole('combobox', { name: 'Collaboration type' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Deliverables' })).toHaveValue('')
  })

  it('combines filters and offers to clear them when nothing matches', async () => {
    const { user, location } = renderDiscover('/?category=Lifestyle&area=kallang')

    expect(await screen.findByText('No opportunities found')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Area' })).toHaveValue('kallang')

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(visibleTitles()).toEqual(ALL)
    expect(location().search).toBe('')
    expect(screen.getByRole('combobox', { name: 'Area' })).toHaveValue('')
  })
})
