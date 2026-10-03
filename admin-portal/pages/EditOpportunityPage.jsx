import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { LoadError } from '../javascript/components/AdminControls'
import OpportunityForm, { formFrom } from '../javascript/components/OpportunityForm'
import { useApiQuery } from '../javascript/hooks/useApiQuery'
import { ApiError, getOpportunityForEditing, saveOpportunity } from '../javascript/lib/api'

function Message({ children }) {
  return <div className="p-8 text-sm text-gray-400">{children}</div>
}

// `publishErrors` are the Live checks' errors when the list's Reopen
// Opportunity was refused: the form opens showing them, with Live chosen, so
// Publish reopens it.
function EditForm({ loaded, publishErrors }) {
  const navigate = useNavigate()
  const initial = useMemo(
    () => ({ ...formFrom(loaded), ...(publishErrors ? { publishingStatus: 'Live' } : {}) }),
    [loaded, publishErrors],
  )
  // Their counts show on the form's Session rows and weekly class Sessions.
  const storedSessions = useMemo(() => [...loaded.sessions, ...loaded.weeklySessions], [loaded])
  const live = loaded.publishingStatus === 'Live'
  // The version it was loaded with, so someone else's save in between is refused (409).
  const withVersion = (request) => ({ ...request, version: loaded.version })

  async function save(request) {
    await saveOpportunity(loaded.id, withVersion(request))
    navigate('/admin/opportunities')
  }

  return (
    <OpportunityForm
      initial={initial}
      crumb={loaded.title || 'Untitled opportunity'}
      storedStatus={loaded.publishingStatus}
      storedSessions={storedSessions}
      // The Figma shows Preview only on a Live Opportunity's edit page (to_ask.md D2).
      previewHref={live ? `/opportunity/${encodeURIComponent(loaded.id)}` : undefined}
      refusedErrors={publishErrors}
      onCheck={(request) => saveOpportunity(loaded.id, withVersion(request), { check: true })}
      onSave={save}
    />
  )
}

// Figma "Edit Opportunity": the form filled in with the stored Opportunity.
// Saving it (a Draft as a Draft, or with the chosen status) returns to the
// Opportunities list; a Live Opportunity is updated in place.
export default function EditOpportunityPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { status, data, error, reload } = useApiQuery(getOpportunityForEditing, id)
  // Set by the list's Reopen Opportunity when the Live checks refused it. Kept here and
  // dropped from the history entry, so reloading the page doesn't show them again.
  const [publishErrors] = useState(() => location.state?.publishErrors ?? null)
  useEffect(() => {
    if (location.state?.publishErrors) navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location, navigate])

  if (status === 'error') {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <Message>
          <p role="alert">This opportunity doesn&apos;t exist.</p>
          <Link to="/admin/opportunities" className="mt-2 inline-block font-semibold text-brand hover:text-brand-dark">
            Back to Opportunities
          </Link>
        </Message>
      )
    }
    return <LoadError message="Couldn't load this opportunity. Check your connection." onRetry={reload} />
  }
  if (status === 'loading' || data?.id !== id) return <Message>Loading opportunity…</Message>
  return <EditForm key={`${data.id}:${data.version}`} loaded={data} publishErrors={publishErrors} />
}
