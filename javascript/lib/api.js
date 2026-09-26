// The only module that talks to the API (backend/, proxied at /api in dev).
// Pages depend on these functions, never on fetch or the database's naming.

export class ApiError extends Error {
  constructor(message, status, fieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

async function getJson(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiError(`GET ${path} failed`, response.status)
  return response.json()
}

// Card summaries of the Opportunities Discover shows, soonest next Available
// Session first:
// [{ id, title, partner, category, subcategory, compensationType,
//    whatCreatorReceives,                        // Barter, else null
//    payment: { currency, amount, basis, note }, // Paid, else null
//    area, heroImage, nextSession: { date, start, end },
//    moreSessionsCount, slotsLeft, limitedSpots,
//    experienceLevels: [string], deliverableType, collaborationType,
//    availableDates: [date],                     // distinct, sorted
//    weeklyClasses: [{ day, start, end }] }]     // with an Available Session, soonest first
export function listOpportunities() {
  return getJson('/api/opportunities')
}

// Full detail of a Live or Closed Opportunity, or null when it is a Draft or
// doesn't exist: every card field above plus
// { aboutExperience, deliverableNote, deliverables: [string],
//   additionalInfo: [{ label, value }], venueName, fullAddress,
//   availability: 'open' | 'fully_booked' | 'closed',
//   weeklyClasses: [{ id, day, start, end, sessions }],
//   sessions: [{ id, date, start, end, slotsLeft, status: 'available' | 'filled' }] }
// Here `weeklyClasses` (day is e.g. 'Saturday') hold each Recurring Schedule's
// Sessions and `sessions` only one-off ones: all upcoming and not cancelled,
// soonest first; a Closed Opportunity has none. `nextSession` is null unless
// `open`.
export async function getOpportunity(id) {
  try {
    return await getJson(`/api/opportunities/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

// Submits an Application for one Session and resolves { id } once it is stored:
// { opportunityId, sessionId, fullName, instagram, tiktok, email, phone, note,
//   submissionKey }
// Handles are sent without a leading "@"; tiktok and note may be ''. Resending
// the same submissionKey resolves the original { id } and stores nothing new,
// so retries must reuse it. Rejects with an ApiError whose status is 409 when
// the Session or Opportunity can no longer be applied for (`message` is
// creator-readable), or 422 with per-field messages in `fieldErrors`.
export async function submitApplication(application) {
  const response = await fetch('/api/applications', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(application),
  })
  const body = await response.json().catch(() => ({}))
  if (response.ok) return body
  const message = typeof body.detail === 'string' ? body.detail : 'POST /api/applications failed'
  throw new ApiError(message, response.status, body.errors ?? {})
}
