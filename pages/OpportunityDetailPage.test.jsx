import { screen, within } from '@testing-library/react'
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
    aboutExperience: 'A group tennis class led by an experienced instructor.',
    collaborationType: 'One-off',
    deliverableType: 'Fixed',
    deliverableNote: null,
    deliverables: ['Post 1 × Instagram Reel featuring the class'],
    experienceLevels: ['Beginner', 'Intermediate'],
    additionalInfo: [{ label: 'Equipment', value: 'Racquets can be provided' }],
    venueName: 'Kallang Tennis Centre Court 3',
    fullAddress: 'Stadium Road, Singapore 397630',
    availability: 'open',
    weeklyClasses: [],
    sessions: [session(), session({ id: '12', date: '2026-09-26', slotsLeft: 2 })],
    ...overrides,
  }
}

const PAID = detail({
  id: '5',
  title: 'Activewear Campaign',
  category: 'Lifestyle',
  subcategory: 'Activewear',
  compensationType: 'Paid',
  whatCreatorReceives: null,
  payment: {
    currency: 'SGD',
    amount: 150,
    basis: 'Per completed collaboration',
    note: 'Activewear set (yours to keep)',
  },
  experienceLevels: ['Not Applicable'],
  additionalInfo: [{ label: 'Min. following', value: '1,000+ on Instagram or TikTok' }],
})

// Saturdays 8–9pm from 26 Sep for seven weeks; the second is Filled.
const SATURDAYS = {
  id: '3',
  day: 'Saturday',
  start: '20:00',
  end: '21:00',
  sessions: ['26', '03', '10', '17', '24', '31'].map((day, i) =>
    session({
      id: `3${i}`,
      date: i === 0 ? '2026-09-26' : `2026-10-${day}`,
      start: '20:00',
      end: '21:00',
      ...(i === 1 && { slotsLeft: 0, status: 'filled' }),
    }),
  ).concat(session({ id: '36', date: '2026-11-07', start: '20:00', end: '21:00' })),
}

function renderDetail(body = detail()) {
  return renderRoute(`/opportunity/${body.id}`, {
    api: { [`GET /api/opportunities/${body.id}`]: body },
  })
}

// "What You Receive" and "Who This Is For" appear in the mobile layout and in
// the desktop sidebar.
function sidebarCards(name) {
  return screen.getAllByRole('region', { name })
}

// Some content is repeated for the mobile and desktop layouts.
function expectShown(text) {
  expect(screen.getAllByText(text)[0]).toBeInTheDocument()
}

function registerButtons() {
  return screen.getAllByRole('button', { name: /Register for Opportunity/ })
}

async function findTitle(title = 'Tennis Group Class') {
  return screen.findByRole('heading', { level: 1, name: title })
}

describe('Opportunity detail', () => {
  it('shows a placeholder while the opportunity loads', async () => {
    renderDetail()

    expect(screen.getByRole('status', { name: 'Loading opportunity' })).toBeInTheDocument()
    await findTitle()
    expect(screen.queryByRole('status', { name: 'Loading opportunity' })).not.toBeInTheDocument()
  })

  it('shows the opportunity from the API', async () => {
    renderDetail()

    await findTitle()
    expectShown('Kallang Tennis Centre')
    expectShown('Sport')
    expectShown('Barter')
    expect(screen.queryByText('Tennis')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Tennis Group Class/ })).toHaveAttribute(
      'src',
      'https://images.example/tennis.jpg',
    )
    expectShown('A group tennis class led by an experienced instructor.')
    expectShown('Racquets can be provided')
    expectShown('Kallang Tennis Centre Court 3')
    expectShown('Stadium Road, Singapore 397630')
    expectShown('Kallang')
  })

  it('shows no Location when there is no venue or address', async () => {
    renderDetail(detail({ area: 'Singapore', venueName: null, fullAddress: null }))

    await findTitle()
    expect(screen.queryByRole('region', { name: 'Location' })).not.toBeInTheDocument()
    expectShown('Singapore')
  })

  it('labels a Barter opportunity and shows what the creator receives', async () => {
    renderDetail()

    await findTitle()
    for (const card of sidebarCards('What You Receive')) {
      expect(within(card).getByText('Barter')).toBeInTheDocument()
      expect(within(card).getByText('Complimentary group tennis class (1 hour)')).toBeInTheDocument()
    }
  })

  it('labels a Paid opportunity with a note as Paid + Perk and shows amount, basis and note', async () => {
    renderDetail(PAID)

    await findTitle('Activewear Campaign')
    for (const card of sidebarCards('What You Receive')) {
      expect(within(card).getByText('Paid + Perk')).toBeInTheDocument()
      expect(within(card).getByText('S$150')).toBeInTheDocument()
      expect(within(card).getByText('per completed collaboration')).toBeInTheDocument()
      expect(within(card).getByText('Activewear set (yours to keep)')).toBeInTheDocument()
    }
  })

  it('labels a Paid opportunity without a note as Paid', async () => {
    renderDetail({ ...PAID, payment: { ...PAID.payment, note: null } })

    await findTitle('Activewear Campaign')
    for (const card of sidebarCards('What You Receive')) {
      expect(within(card).getByText('Paid')).toBeInTheDocument()
      expect(within(card).queryByText('Paid + Perk')).not.toBeInTheDocument()
      expect(within(card).getByText('S$150')).toBeInTheDocument()
    }
  })

  it('shows each level as a chip, then the Additional Information, with no Collaboration Type', async () => {
    renderDetail()

    await findTitle()
    for (const card of sidebarCards('Who This Is For')) {
      const text = within(card)
      expect(text.getByText('Level')).toBeInTheDocument()
      expect(text.getByText('Beginner')).toBeInTheDocument()
      expect(text.getByText('Intermediate')).toBeInTheDocument()
      expect(card).toHaveTextContent(/Level.*Beginner.*Intermediate.*Equipment.*Racquets can be provided/)
    }
    expect(screen.queryByText('Collaboration Type')).not.toBeInTheDocument()
    expect(screen.queryByText('One-off')).not.toBeInTheDocument()
  })

  it('leaves out the Level when it is Not Applicable', async () => {
    renderDetail(PAID)

    await findTitle('Activewear Campaign')
    for (const card of sidebarCards('Who This Is For')) {
      expect(within(card).queryByText('Level')).not.toBeInTheDocument()
      expect(within(card).queryByText('Not Applicable')).not.toBeInTheDocument()
      expect(within(card).getByText('1,000+ on Instagram or TikTok')).toBeInTheDocument()
    }
  })

  it('introduces Fixed deliverables as what the partner is looking for', async () => {
    renderDetail(detail({ deliverableType: 'Fixed' }))

    await findTitle()
    expect(screen.getByText('For this collaboration, the partner is looking for:')).toBeInTheDocument()
    expect(screen.queryByText('Suggested deliverables:')).not.toBeInTheDocument()
    expect(screen.getByText('Post 1 × Instagram Reel featuring the class')).toBeInTheDocument()
  })

  it('introduces Flexible deliverables as suggestions to be agreed', async () => {
    renderDetail(detail({ deliverableType: 'Flexible' }))

    await findTitle()
    expect(screen.getByText('Suggested deliverables:')).toBeInTheDocument()
    expect(
      screen.getByText('Final deliverables will be discussed and agreed with the partner.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('For this collaboration, the partner is looking for:'),
    ).not.toBeInTheDocument()
  })

  it('shows the note above the deliverables when there is one', async () => {
    renderDetail(detail({ deliverableNote: 'Content must be original.' }))
    await findTitle()
    expect(screen.getByText('Content must be original.')).toBeInTheDocument()
  })

  it('emphasises @handles in deliverables', async () => {
    renderDetail(
      detail({ deliverables: ['Tag @lyfego.sg and @kallangtennis in your caption.'] }),
    )

    await findTitle()
    expect(screen.getByText('@lyfego.sg').tagName).toBe('STRONG')
    expect(screen.getByText('@kallangtennis').tagName).toBe('STRONG')
  })

  it('lists sessions with date and time but no slot counts; Filled ones cannot be chosen', async () => {
    renderDetail(
      detail({
        sessions: [
          session({ id: '11', slotsLeft: 3 }),
          session({ id: '12', date: '2026-09-26', start: '19:00', end: '20:30', slotsLeft: 2 }),
          session({ id: '13', date: '2026-09-27', slotsLeft: 0, status: 'filled' }),
        ],
      }),
    )

    await findTitle()
    const [first, second, filled] = within(
      screen.getByRole('radiogroup', { name: 'Available sessions' }),
    ).getAllByRole('radio')

    expect(first).toHaveTextContent('Thursday, 24 September')
    expect(first).toHaveTextContent('10:00 AM – 11:00 AM')
    expect(first).toBeEnabled()
    expect(second).toHaveTextContent('7:00 PM – 8:30 PM')
    expect(screen.queryByText(/spots? left/)).not.toBeInTheDocument()
    expect(filled).toHaveTextContent('Filled')
    expect(filled).toBeDisabled()
  })

  it('groups weekly classes and one-off sessions under headings when both exist', async () => {
    renderDetail(detail({ weeklyClasses: [SATURDAYS] }))

    await findTitle()
    expect(screen.getByRole('heading', { name: 'Weekly classes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'One-off sessions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Every Saturday/ })).toHaveTextContent('8:00 PM – 9:00 PM')
  })

  it('shows no group headings when there are only one-off sessions or only weekly classes', async () => {
    const { unmount } = renderDetail()
    await findTitle()
    expect(screen.queryByRole('heading', { name: 'Weekly classes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'One-off sessions' })).not.toBeInTheDocument()
    unmount()

    renderDetail(detail({ weeklyClasses: [SATURDAYS], sessions: [] }))
    await findTitle()
    expect(screen.getByRole('button', { name: /Every Saturday/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Weekly classes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'One-off sessions' })).not.toBeInTheDocument()
  })

  it('expands a weekly class to five dates, then reveals the rest; Filled dates cannot be chosen', async () => {
    const { user } = renderDetail(detail({ weeklyClasses: [SATURDAYS], sessions: [] }))

    await findTitle()
    const weekly = screen.getByRole('button', { name: /Every Saturday/ })
    expect(weekly).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    await user.click(weekly)
    expect(weekly).toHaveAttribute('aria-expanded', 'true')
    const dates = screen.getAllByRole('radio')
    expect(dates.map((date) => date.textContent)).toEqual([
      'Sat, 26 Sep', 'Sat, 3 Oct', 'Sat, 10 Oct', 'Sat, 17 Oct', 'Sat, 24 Oct',
    ])
    expect(dates[0]).toBeEnabled()
    expect(dates[1]).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '+2 more' }))
    expect(screen.getAllByRole('radio')).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument()
  })

  it('registers for a chosen weekly class date like any session', async () => {
    const { user } = renderDetail(detail({ weeklyClasses: [SATURDAYS], sessions: [] }))

    await findTitle()
    await user.click(screen.getByRole('button', { name: /Every Saturday/ }))
    await user.click(screen.getByRole('radio', { name: 'Sat, 10 Oct' }))
    expect(screen.getByRole('radio', { name: 'Sat, 10 Oct' })).toHaveAttribute('aria-checked', 'true')
    await user.click(registerButtons()[0])

    expect(await screen.findByRole('button', { name: 'Submit Registration' })).toBeInTheDocument()
    expectShown(/Saturday, 10 October/)
  })

  it('reopens the weekly class holding the chosen date, past the first five, on returning from Register', async () => {
    const { user } = renderDetail(detail({ weeklyClasses: [SATURDAYS], sessions: [] }))

    await findTitle()
    await user.click(screen.getByRole('button', { name: /Every Saturday/ }))
    await user.click(screen.getByRole('button', { name: '+2 more' }))
    await user.click(screen.getByRole('radio', { name: 'Sat, 7 Nov' }))
    await user.click(registerButtons()[0])
    await user.click(await screen.findByRole('link', { name: 'Change session' }))

    await findTitle()
    expect(screen.getByRole('button', { name: /Every Saturday/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('radio')).toHaveLength(7)
    expect(screen.getByRole('radio', { name: 'Sat, 7 Nov' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument()
  })

  it('marks limited spots when the API says so', async () => {
    renderDetail(detail({ limitedSpots: true, slotsLeft: 2 }))

    await findTitle()
    expectShown('Limited spots')
  })

  it('asks for a session before registering, then goes to the form', async () => {
    const { user } = renderDetail()

    await findTitle()
    await user.click(registerButtons()[0])
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please select an available session before registering.',
    )
    expect(screen.queryByRole('button', { name: 'Submit Registration' })).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('radio')[1])
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true')
    await user.click(registerButtons()[0])

    expect(await screen.findByRole('button', { name: 'Submit Registration' })).toBeInTheDocument()
    expectShown(/Saturday, 26 September/)
  })

  it('marks a fully booked opportunity and disables Register', async () => {
    renderDetail(
      detail({
        availability: 'fully_booked',
        nextSession: null,
        moreSessionsCount: 0,
        slotsLeft: 0,
        sessions: [session({ slotsLeft: 0, status: 'filled' })],
      }),
    )

    await findTitle()
    expectShown('Fully booked')
    for (const button of registerButtons()) expect(button).toBeDisabled()
    expect(screen.getByRole('radio')).toBeDisabled()
  })

  it('marks a closed opportunity and disables Register', async () => {
    renderDetail(
      detail({
        availability: 'closed',
        nextSession: null,
        moreSessionsCount: 0,
        slotsLeft: 0,
        sessions: [],
      }),
    )

    await findTitle()
    expectShown('Closed')
    for (const button of registerButtons()) expect(button).toBeDisabled()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('shows the not-found page for a Draft or unknown opportunity', async () => {
    renderRoute('/opportunity/42', {
      api: { 'GET /api/opportunities/42': jsonResponse({ detail: 'Opportunity not found' }, 404) },
    })

    expect(await screen.findByText("This opportunity doesn't exist")).toBeInTheDocument()
  })

  it('offers a retry when the opportunity fails to load', async () => {
    let calls = 0
    const { user } = renderRoute('/opportunity/1', {
      api: {
        'GET /api/opportunities/1': () => {
          calls += 1
          return calls === 1 ? jsonResponse({ detail: 'boom' }, 500) : detail()
        },
      },
    })

    expect(await screen.findByText("Couldn't load this opportunity")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await findTitle()
    expect(calls).toBe(2)
  })
})
