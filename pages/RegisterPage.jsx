import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Button from '../javascript/components/Button'
import FormField from '../javascript/components/FormField'
import { ChevronLeftIcon } from '../javascript/components/Icons'
import OpportunityLoadError from '../javascript/components/OpportunityLoadError'
import OpportunitySummary from '../javascript/components/OpportunitySummary'
import { useRegistration } from '../javascript/context/RegistrationContext'
import { availableSession, useOpportunity } from '../javascript/hooks/useOpportunity'
import { ApiError, submitApplication } from '../javascript/lib/api'
import { EMPTY_FORM, stripHandle, validateRegistration } from '../javascript/lib/validation'
import NotFoundPage from './NotFoundPage'

// Whether the API rejected a field the creator can see and fix (not e.g. sessionId).
function hasFormField(fieldErrors) {
  return Object.keys(fieldErrors).some((field) => field in EMPTY_FORM)
}

const SESSION_UNAVAILABLE =
  'The session you chose is no longer available. Please choose another session.'

export default function RegisterPage() {
  const { id } = useParams()
  const { status, opportunity, retry } = useOpportunity(id)
  const { selectedSessionId } = useRegistration()

  if (status === 'loading') return null
  if (status === 'error') return <OpportunityLoadError onRetry={retry} />
  if (status === 'notFound') return <NotFoundPage />
  const chosenId = opportunity && selectedSessionId(opportunity.id)
  const session = chosenId && availableSession(opportunity, chosenId)
  // Guard: registering needs an open Opportunity and a chosen Session that is
  // still available now (the Opportunity was just refetched).
  if (!session || opportunity.availability !== 'open') {
    const state = chosenId ? { notice: SESSION_UNAVAILABLE } : undefined
    return <Navigate to={`/opportunity/${id}`} replace state={state} />
  }
  return <RegisterForm opportunity={opportunity} session={session} />
}

function RegisterForm({ opportunity, session }) {
  const id = opportunity.id
  const navigate = useNavigate()
  const { draft, saveDraft, setSubmitted } = useRegistration()

  const [values, setValues] = useState(() => ({ ...EMPTY_FORM, ...(draft(id) ?? {}) }))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // { message, conflict }: `conflict` when the Session can no longer be applied for.
  const [submitError, setSubmitError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  // One key per form instance, reused on every retry, so a retry of a
  // submission that actually reached the server never creates a duplicate.
  const [submissionKey] = useState(() => crypto.randomUUID())
  // Set synchronously, unlike `submitting`, so clicks that land before React
  // re-renders the disabled button can't send a second request.
  const inFlight = useRef(false)
  const formRef = useRef(null)

  // After a failed submit, move focus to the first invalid field (runs after
  // React has rendered the error state).
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [attempt])

  // Persist the draft as the user types so navigating back to change the
  // session doesn't wipe the form.
  useEffect(() => {
    saveDraft(id, values)
  }, [values, id, saveDraft])

  const update = (field) => (e) => {
    const value = e.target.value
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((err) => ({ ...err, [field]: undefined }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (inFlight.current) return
    const nextErrors = validateRegistration(values)
    setErrors(nextErrors)
    setSubmitError(null)

    if (Object.keys(nextErrors).length > 0) {
      setAttempt((n) => n + 1)
      return
    }

    inFlight.current = true
    setSubmitting(true)
    try {
      const payload = {
        opportunityId: opportunity.id,
        sessionId: session.id,
        fullName: values.fullName.trim(),
        instagram: stripHandle(values.instagram),
        tiktok: stripHandle(values.tiktok),
        email: values.email.trim(),
        phone: values.phone.trim(),
        note: values.note.trim(),
        submissionKey,
      }
      const result = await submitApplication(payload)
      setSubmitted({ ...payload, session, id: result.id, submittedAt: Date.now() })
      navigate(`/opportunity/${opportunity.id}/confirmation`, { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSubmitError({ message: error.message, conflict: true })
      } else if (error instanceof ApiError && error.status === 422 && hasFormField(error.fieldErrors)) {
        setErrors(error.fieldErrors)
        setAttempt((n) => n + 1)
        setSubmitError({ message: error.message })
      } else {
        setSubmitError({ message: 'Something went wrong while submitting. Please try again.' })
      }
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="pb-8">
      <div className="bg-white border-b border-line">
        <div className="max-w-lg mx-auto px-4 sm:px-6">
          <Link
            to={`/opportunity/${opportunity.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors py-3 group"
          >
            <ChevronLeftIcon className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            {opportunity.title}
          </Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-5">
        <div className="animate-fade-up">
          <OpportunitySummary
            opportunity={opportunity}
            session={session}
            action={
              <Link
                to={`/opportunity/${opportunity.id}#choose-session`}
                className="self-start text-xs font-medium text-brand hover:underline"
              >
                Change session
              </Link>
            }
          />
        </div>

        <form
          ref={formRef}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-6 animate-fade-up"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex flex-col gap-4">
            <FormField
              label="Full Name"
              required
              type="text"
              placeholder="Your full name"
              autoComplete="name"
              value={values.fullName}
              onChange={update('fullName')}
              error={errors.fullName}
            />
            <FormField
              label="Instagram Handle"
              required
              prefix="@"
              type="text"
              placeholder="yourhandle"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={values.instagram}
              onChange={update('instagram')}
              error={errors.instagram}
            />
            <FormField
              label="TikTok Handle"
              optional
              prefix="@"
              type="text"
              placeholder="yourhandle"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={values.tiktok}
              onChange={update('tiktok')}
              error={errors.tiktok}
            />
            <FormField
              label="Email Address"
              required
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              value={values.email}
              onChange={update('email')}
              error={errors.email}
            />
            <FormField
              label="Mobile / WhatsApp Number"
              required
              type="tel"
              placeholder="+65 9123 4567"
              autoComplete="tel"
              inputMode="tel"
              value={values.phone}
              onChange={update('phone')}
              error={errors.phone}
            />
            <FormField
              label="Note for LyfeGo"
              optional
              multiline
              placeholder="Anything you'd like LyfeGo to know — your content style, audience size, relevant experience, etc."
              value={values.note}
              onChange={update('note')}
              error={errors.note}
            />
          </div>

          <div className="flex flex-col gap-3">
            {submitError && (
              <div role="alert" className="text-sm text-red-500 text-center animate-shake">
                <p>{submitError.message}</p>
                {submitError.conflict && (
                  <Link
                    to={`/opportunity/${opportunity.id}#choose-session`}
                    className="mt-1 inline-block font-semibold text-brand hover:underline"
                  >
                    Choose another session
                  </Link>
                )}
              </div>
            )}
            <Button type="submit" size="lg" loading={submitting}>
              {submitting ? 'Submitting…' : 'Submit Registration'}
            </Button>
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              LyfeGo will review your registration and contact you once your participation is
              confirmed. Submitting does not automatically guarantee your place.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
