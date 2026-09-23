import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Button from '../javascript/components/Button'
import FormField from '../javascript/components/FormField'
import { ChevronLeftIcon } from '../javascript/components/Icons'
import OpportunitySummary from '../javascript/components/OpportunitySummary'
import { useRegistration } from '../javascript/context/RegistrationContext'
import { getOpportunity, getSession, isFull } from '../javascript/data/opportunities'
import { submitRegistration } from '../javascript/lib/api'
import { EMPTY_FORM, stripHandle, validateRegistration } from '../javascript/lib/validation'
import NotFoundPage from './NotFoundPage'

export default function RegisterPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const opportunity = getOpportunity(id)
  const { selectedSessionId, draft, saveDraft, setSubmitted } = useRegistration()

  const [values, setValues] = useState(() => ({ ...EMPTY_FORM, ...(draft(id) ?? {}) }))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const formRef = useRef(null)

  // After a failed submit, move focus to the first invalid field (runs after
  // React has rendered the error state).
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [attempt])

  // Persist the draft as the user types so navigating back to change the
  // session doesn't wipe the form.
  useEffect(() => {
    if (opportunity) saveDraft(opportunity.id, values)
  }, [values, opportunity, saveDraft])

  if (!opportunity) return <NotFoundPage />

  const hasSessions = opportunity.sessions.length > 0
  const session = getSession(opportunity, selectedSessionId(opportunity.id))

  // Guard: can't register for a full opportunity, or without a session where one is required.
  if (isFull(opportunity) || (hasSessions && !session)) {
    return <Navigate to={`/opportunity/${opportunity.id}`} replace />
  }

  const update = (field) => (e) => {
    const value = e.target.value
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((err) => ({ ...err, [field]: undefined }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = validateRegistration(values)
    setErrors(nextErrors)
    setSubmitError('')

    if (Object.keys(nextErrors).length > 0) {
      setAttempt((n) => n + 1)
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        opportunityId: opportunity.id,
        sessionId: session?.id ?? null,
        fullName: values.fullName.trim(),
        instagram: stripHandle(values.instagram),
        tiktok: stripHandle(values.tiktok),
        email: values.email.trim(),
        phone: values.phone.trim(),
        note: values.note.trim(),
      }
      const result = await submitRegistration(payload)
      setSubmitted({ ...payload, id: result.id, submittedAt: Date.now() })
      navigate(`/opportunity/${opportunity.id}/confirmation`, { replace: true })
    } catch {
      setSubmitError('Something went wrong while submitting. Please try again.')
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
              hasSessions && (
                <Link
                  to={`/opportunity/${opportunity.id}#choose-session`}
                  className="self-start text-xs font-medium text-brand hover:underline"
                >
                  Change session
                </Link>
              )
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
            />
          </div>

          <div className="flex flex-col gap-3">
            {submitError && (
              <p role="alert" className="text-sm text-red-500 text-center animate-shake">
                {submitError}
              </p>
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
