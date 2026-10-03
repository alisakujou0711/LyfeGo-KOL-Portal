// The only Admin Portal module that talks to the API (backend/, /api/admin/*).
// Every Admin endpoint needs the HTTP-only session cookie that signing in sets;
// the browser sends it by itself on same-origin requests.
import { ApiError, request as send } from '../../../creator-portal/javascript/lib/api'

export { ApiError }

// The API's message for a request it refused (a 4xx explains why), or
// `fallback` for a server error or no connection (FS-ADM-ERR-001/002).
export function messageOr(error, fallback) {
  return error instanceof ApiError && error.status < 500 ? error.message : fallback
}

// A 422's per-field messages, or null for any other failure.
export function fieldErrorsOf(error) {
  const refused = error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length > 0
  return refused ? error.fieldErrors : null
}

// The choices the API takes, in the Figma's order.
export const CATEGORIES = ['Sport', 'Lifestyle']
export const COMPENSATION_TYPES = ['Barter', 'Paid']
export const CURRENCIES = ['SGD', 'USD']
export const PAYMENT_BASES = ['Per completed collaboration', 'Per post', 'Flat fee']
export const COLLABORATION_TYPES = ['One-off', 'One-off or Ongoing', 'Ongoing']
export const DELIVERABLE_TYPES = ['Fixed', 'Flexible']
export const PUBLISHING_STATUSES = ['Draft', 'Live', 'Closed']

// `path` with the non-empty `params` as its query string.
function withQuery(path, params) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString()
  return query ? `${path}?${query}` : path
}

// The signed-in Admin { email, name }, or null when nobody is signed in.
export async function getAdminSession() {
  try {
    return await send('GET', '/api/admin/session')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

// Signs in and resolves the Admin { email, name }; the session lasts until the
// browser closes. Rejects with an ApiError whose status is 401 when the email
// or password is wrong (the message never says which).
export function signIn(email, password) {
  return send('POST', '/api/admin/session', { email, password })
}

// The Opportunities list: every Opportunity matching `filters`, oldest first,
// and the summary counts, which always cover everything:
// { counts: { total, live, draft, closed, applications },
//   opportunities: [{ id, title, partner, heroImage, category, compensationType,
//     whatCreatorReceives,                        // Barter, else null
//     payment: { currency, amount, basis, note }, // Paid, else null
//     collaborationType,
//     schedule: { nextSession, availableDates, weeklyClasses } | null,
//                                                 // from future, non-cancelled Sessions
//     applicationsCount, publishingStatus,
//     canDelete,                                  // a Draft never Live and without
//                                                 // Applications, which Delete Draft takes
//     lastUpdated }] }                            // "2026-09-14", SGT
// `filters` is { search, status, category, compensation, collaborationType };
// empty ones are left out.
export function listOpportunities(filters = {}) {
  return send('GET', withQuery('/api/admin/opportunities', filters))
}

// One Opportunity as the Create / Edit form shows it, with the version token
// a save must send back:
// { id, version, publishingStatus,                       // Draft | Live | Closed
//   title, partner, category, subcategory, heroImage, aboutExperience,
//   compensationType, whatCreatorReceives, currency,
//   paymentAmount, paymentBasis,                        // a number and 'Per completed collaboration' |
//                                                       // 'Per post' | 'Flat fee'; null when not set
//   paymentNotes, collaborationType, deliverableType, deliverableNote,
//   deliverables: [text], additionalInfo: [{ label, value }],
//   experienceLevels: ['Beginner', 'Advanced'],         // or ['All Levels'] or ['Not Applicable']
//   scheduleType,                                       // 'specific' | 'recurring'
//   sessions: [{ id, date, start, end, slots }],        // future, non-cancelled one-off Sessions;
//                                                       // slots null = not set yet (a Draft)
//   recurring: { days: ['Tue', 'Sat'], start, end, startDate, endDate, slots } | null,
//   venueName, fullAddress, area }                      // text fields are '' when empty
// Rejects with an ApiError whose status is 404 when there's no such Opportunity.
export function getOpportunityForEditing(id) {
  return send('GET', `/api/admin/opportunities/${encodeURIComponent(id)}`)
}

// `{ check: true }` makes a save only check: it stores nothing and resolves
// once every check passes, or rejects as the save would. The "Are you sure?"
// pop-ups run it first, so they only ask about a save that would go through.
const checking = (path, check) => (check ? `${path}?check=true` : path)

// Saves the whole form (the shape above, without id and version; slots may
// be text) as a new Opportunity in its `publishingStatus` (Draft or Live) and
// resolves it as getOpportunityForEditing does. Rejects with an ApiError: 422
// with `fieldErrors` keyed by field in the form's order, e.g. "title",
// "sessions.0.date" or, from the Live checks, "sessions" and "recurring".
export function createOpportunity(form, { check = false } = {}) {
  return send('POST', checking('/api/admin/opportunities', check), form)
}

// Saves the whole form over an Opportunity, as createOpportunity, with the
// `version` it was loaded with. Its status moves only Draft → Live → Closed,
// and Closed → Live; any other is refused with 422 on "publishingStatus".
// Rejects with an ApiError: 422 as above, or 409 when someone else saved it
// since (the message says so).
export function saveOpportunity(id, form, { check = false } = {}) {
  return send('PUT', checking(`/api/admin/opportunities/${encodeURIComponent(id)}`, check), form)
}

// The row menu's actions on one Opportunity; each resolves it as
// getOpportunityForEditing does. Each rejects with an ApiError whose status is
// 409 when the Opportunity's status has changed since the list was loaded (the
// message says so) or 404 when it no longer exists.
//
// Publish (the menu's Reopen Opportunity) makes a Closed Opportunity Live as it
// is stored; it rejects with 422 and `fieldErrors` keyed as the edit page shows
// them when the Live checks refuse it. It takes `{ check: true }` as a save does.
export function publishOpportunity(id, { check = false } = {}) {
  return send('POST', checking(`/api/admin/opportunities/${encodeURIComponent(id)}/publish`, check))
}

// Closes a Live Opportunity, keeping its Sessions and Applications.
export function closeOpportunity(id) {
  return send('POST', `/api/admin/opportunities/${encodeURIComponent(id)}/close`)
}

// Deletes a Draft that has never been Live or had an Application (canDelete),
// with everything it has; resolves once it's gone. Rejects with an ApiError
// whose status is 409 for any other Opportunity (the message says so).
export function deleteOpportunity(id) {
  return send('DELETE', `/api/admin/opportunities/${encodeURIComponent(id)}`)
}

// Copies an Opportunity into a new Draft (no one-off Sessions or Applications)
// and resolves the copy.
export function duplicateOpportunity(id) {
  return send('POST', `/api/admin/opportunities/${encodeURIComponent(id)}/duplicate`)
}

// The largest cover image the API takes, and the types it takes.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Uploads a cover image `file` and resolves { url } to save as the heroImage.
// Rejects with an ApiError whose status is 422 when it isn't a JPEG, PNG or
// WebP of at most 5 MB (the message says which).
export function uploadImage(file) {
  return send('POST', '/api/admin/uploads', file)
}

// Every Application Status, in the Figma's order.
export const APPLICATION_STATUSES = ['New', 'Reviewing', 'Accepted', 'Declined']

// The Applications list: every Application matching `filters`, newest
// submitted first; the status counts, which always cover everything; and the
// Opportunity and Partner filter options:
// { counts: { all, new, reviewing, accepted, declined },
//   options: { opportunities: [{ id, title }], partners: [name] },
//   applications: [{ id, fullName, email, instagram, tiktok,  // handles without @; tiktok may be null
//     opportunity: { id, title, partner },
//     session: { date, start, end },                        // the Current Session
//     submittedOn,                                          // "2026-09-10", SGT
//     status }] }                                           // New | Reviewing | Accepted | Declined
// `filters` is { search, opportunityId, partner, status, category }; empty ones are left out.
export function listApplications(filters = {}) {
  return send('GET', withQuery('/api/admin/applications', filters))
}

// One Application as the detail panel shows it; opening it changes nothing:
// { id, status,
//   contact: { fullName, instagram, tiktok, email, phone }, // as now, with any correction
//   original: { ... },                                      // as submitted; tiktok may be null
//   note,                                                   // may be null
//   submittedOn,
//   opportunity: { id, title, partner, category, compensationType },
//   session: { id, date, start, end },                      // the Current Session
//   originalSession: { id, date, start, end },
//   snapshot: { opportunity, compensation, collaboration,   // the Historical Snapshot; groups
//     requirements, session, location },                    // an older one lacks are left out
//   otherSessions: [{ id, date, start, end, slots, accepted }] } // future, non-cancelled,
//                                                           // soonest first: where it can move
export function getApplication(id) {
  return send('GET', `/api/admin/applications/${encodeURIComponent(id)}`)
}

// Saves any of { status, contact: { fullName, instagram, tiktok, email, phone },
// sessionId } and resolves the updated Application (as getApplication).
// Rejects with an ApiError: 422 with `fieldErrors` such as "contact.phone";
// 409 when accepting or moving would overbook, or the Session has started, is
// Cancelled or belongs to another Opportunity; the message says which.
export function updateApplication(id, changes) {
  return send('PATCH', `/api/admin/applications/${encodeURIComponent(id)}`, changes)
}
