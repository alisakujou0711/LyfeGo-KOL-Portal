import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import FormField from '../../../creator-portal/javascript/components/FormField'
import { formatDayMonthYear, formatPayment } from '../../../creator-portal/javascript/lib/format'
import { stripHandle, validateRegistration } from '../../../creator-portal/javascript/lib/validation'
import { useApiQuery } from '../hooks/useApiQuery'
import { APPLICATION_STATUSES, ApiError, getApplication, updateApplication } from '../lib/api'
import { formatHandle, formatSessionLine } from '../lib/format'
import { STATUS_STYLES, TagBadge } from './AdminBadges'
import { LoadError } from './AdminControls'
import ConfirmDialog from './ConfirmDialog'

// How long "Saved ✓" shows before the button reads "Save Changes" again.
const SAVED_MESSAGE_MS = 2500

const SAVE_FAILED = "Couldn't save the changes. Check your connection and try again."

// The API's message for a refused save, or ours when it gave none (FS-ADM-ERR-001/002).
const failureMessage = (error) => (error instanceof ApiError && error.status < 500 ? error.message : SAVE_FAILED)

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-gray-400" aria-hidden="true">
      <rect x="1.5" y="2" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 1v2M8 1v2M1.5 5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function SectionHeading({ id, children, className = 'mb-3' }) {
  return (
    <h3 id={id} className={`text-xs font-bold text-gray-400 uppercase tracking-wide ${className}`}>
      {children}
    </h3>
  )
}

const SMALL_BUTTON = 'text-xs font-medium text-brand hover:underline whitespace-nowrap'
const PRIMARY_BUTTON =
  'px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark active:scale-[0.98] transition-all disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed'
const SECONDARY_BUTTON =
  'px-4 py-2 rounded-xl border border-line-strong text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60'

function ErrorMessage({ children }) {
  return (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  )
}

// "2 of 3 accepted", and "· Full" once every Creator Slot is taken.
function sessionCount({ slots, accepted }) {
  const full = accepted >= (slots ?? 0)
  return { full, text: `${accepted} of ${slots ?? 0} accepted${full ? ' · Full' : ''}` }
}

// Moving the Application to another future, non-cancelled Session of its
// Opportunity (FS-ADM-APP-026..030). An Accepted Application needs a free slot,
// so full Sessions can't be picked for it. The creator isn't told.
function SessionMover({ application, onMoved, onCancel }) {
  const groupName = useId()
  const [choice, setChoice] = useState('')
  const [save, setSave] = useState({ saving: false, error: '' })
  const sessions = application.otherSessions

  async function move() {
    setSave({ saving: true, error: '' })
    try {
      onMoved(await updateApplication(application.id, { sessionId: choice }))
    } catch (error) {
      setSave({ saving: false, error: failureMessage(error) })
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <p className="text-xs text-gray-500">No other upcoming sessions.</p>
        <button type="button" onClick={onCancel} className={SMALL_BUTTON}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-2.5">
      <div role="radiogroup" aria-label="Move to session" className="flex flex-col gap-1.5">
        {sessions.map((session) => {
          const count = sessionCount(session)
          const blocked = application.status === 'Accepted' && count.full
          return (
            <label
              key={session.id}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border bg-white text-xs ${
                blocked ? 'border-line text-gray-400 cursor-not-allowed' : 'border-line-strong text-gray-700 cursor-pointer hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name={groupName}
                value={session.id}
                checked={choice === session.id}
                disabled={blocked}
                onChange={() => setChoice(session.id)}
                className="mt-0.5 accent-brand"
              />
              <span className="flex flex-col gap-0.5">
                <span>{formatSessionLine(session)}</span>{' '}
                <span className={count.full ? 'text-gray-400' : 'text-gray-500'}>{count.text}</span>
              </span>
            </label>
          )
        })}
      </div>
      {save.error && <ErrorMessage>{save.error}</ErrorMessage>}
      <div className="flex gap-2">
        <button type="button" onClick={move} disabled={!choice || save.saving} className={PRIMARY_BUTTON}>
          {save.saving ? 'Moving…' : 'Move'}
        </button>
        <button type="button" onClick={onCancel} disabled={save.saving} className={SECONDARY_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function OpportunityCard({ application, onSaved }) {
  const { opportunity } = application
  const [moving, setMoving] = useState(false)
  const moved = application.originalSession.id !== application.session.id
  return (
    <div className="mx-6 mt-5 mb-1 bg-surface-soft rounded-xl border border-line p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex gap-1.5 mb-1.5">
            <TagBadge label={opportunity.category} />
            <TagBadge label={opportunity.compensationType} />
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">{opportunity.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{opportunity.partner}</p>
        </div>
        <Link
          to={`/admin/edit-opportunity/${encodeURIComponent(opportunity.id)}`}
          className="shrink-0 text-xs font-medium text-brand hover:underline whitespace-nowrap"
        >
          View opportunity →
        </Link>
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <CalendarIcon />
            <span>{formatSessionLine(application.session)}</span>
          </div>
          {!moving && (
            <button type="button" onClick={() => setMoving(true)} className={SMALL_BUTTON}>
              Change session
            </button>
          )}
        </div>
        {moved && (
          <p className="text-xs text-gray-400 pl-5">
            {`Originally applied for: ${formatSessionLine(application.originalSession)}`}
          </p>
        )}
      </div>
      {moving && (
        <SessionMover
          application={application}
          onCancel={() => setMoving(false)}
          onMoved={(updated) => {
            setMoving(false)
            onSaved(updated)
          }}
        />
      )}
    </div>
  )
}

// Each contact detail, its label, how it shows and where it links (FS-ADM-APP-031):
// all open in a new tab.
const CONTACT_FIELDS = [
  { field: 'fullName', label: 'Full Name' },
  { field: 'instagram', label: 'Instagram', show: formatHandle, href: (handle) => `https://instagram.com/${encodeURIComponent(handle)}` },
  { field: 'tiktok', label: 'TikTok', show: formatHandle, href: (handle) => `https://www.tiktok.com/@${encodeURIComponent(handle)}` },
  { field: 'email', label: 'Email', href: (email) => `mailto:${email}` },
  { field: 'phone', label: 'Mobile', href: (phone) => `https://wa.me/${phone.replace(/\D/g, '')}` },
]

function ContactValue({ show = (value) => value, href, value }) {
  if (!value) return '—'
  if (!href) return show(value)
  return (
    <a href={href(value)} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
      {show(value)}
    </a>
  )
}

// The form values for `contact`, which has null for a missing TikTok handle.
const contactForm = (contact) => ({ ...contact, tiktok: contact.tiktok ?? '' })

// Correcting the creator's contact details (FS-ADM-APP-022..025) with the
// register form's rules. Only this Application changes, and the original
// submission is kept; the creator's note is never editable.
function ContactEditor({ application, onSaved, onCancel }) {
  const [values, setValues] = useState(() => contactForm(application.contact))
  const [errors, setErrors] = useState({})
  const [save, setSave] = useState({ saving: false, error: '' })

  const edit = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))

  async function handleSave(event) {
    event.preventDefault()
    const found = validateRegistration({ ...values, note: '' })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSave({ saving: true, error: '' })
    try {
      const contact = {
        fullName: values.fullName.trim(),
        instagram: stripHandle(values.instagram),
        tiktok: stripHandle(values.tiktok),
        email: values.email.trim(),
        phone: values.phone.trim(),
      }
      onSaved(await updateApplication(application.id, { contact }))
    } catch (error) {
      const fieldErrors = Object.fromEntries(
        Object.entries(error instanceof ApiError ? error.fieldErrors : {})
          .filter(([key]) => key.startsWith('contact.'))
          .map(([key, message]) => [key.slice('contact.'.length), message]),
      )
      setErrors(fieldErrors)
      setSave({ saving: false, error: Object.keys(fieldErrors).length > 0 ? '' : failureMessage(error) })
    }
  }

  return (
    <form onSubmit={handleSave} noValidate className="flex flex-col gap-3">
      {CONTACT_FIELDS.map(({ field, label }) => (
        <FormField
          key={field}
          label={label}
          type={field === 'email' ? 'email' : 'text'}
          inputMode={field === 'phone' ? 'tel' : undefined}
          prefix={field === 'instagram' || field === 'tiktok' ? '@' : undefined}
          value={values[field]}
          onChange={edit(field)}
          error={errors[field]}
        />
      ))}
      {save.error && <ErrorMessage>{save.error}</ErrorMessage>}
      <div className="flex gap-2">
        <button type="submit" disabled={save.saving} className={PRIMARY_BUTTON}>
          {save.saving ? 'Saving…' : 'Save details'}
        </button>
        <button type="button" onClick={onCancel} disabled={save.saving} className={SECONDARY_BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function CreatorDetails({ application, onSaved }) {
  const headingId = useId()
  const [editing, setEditing] = useState(false)
  const { contact, original } = application
  // A detail shows when it has a value now or had one when submitted.
  const details = CONTACT_FIELDS.filter(({ field }) => contact[field] || original[field])

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <SectionHeading id={headingId} className="">
          Creator Details
        </SectionHeading>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className={SMALL_BUTTON}>
            Edit details
          </button>
        )}
      </div>
      {editing ? (
        <ContactEditor
          application={application}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setEditing(false)
            onSaved(updated)
          }}
        />
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">
          {details.map((detail) => {
            const { field, label, show = (value) => value } = detail
            const corrected = contact[field] !== original[field]
            return (
              <div key={field} className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
                <dd className="text-sm text-gray-800 break-words">
                  <ContactValue {...detail} value={contact[field]} />
                  {corrected && (
                    // Our choice: no Figma design shows a correction (to_ask.md C1).
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {`Originally: ${original[field] ? show(original[field]) : '—'}`}
                    </span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </section>
  )
}

// The Historical Snapshot's rows (FS-ADM-APP-010, HIS-001), leaving out any an
// older snapshot lacks.
function snapshotRows({ opportunity, compensation, collaboration, requirements, session, location }) {
  const joined = (...parts) => parts.filter(Boolean).join(' · ')
  const rows = []
  if (opportunity) {
    rows.push(['Opportunity', joined(opportunity.title, opportunity.partner)])
    rows.push(['Category', joined(opportunity.category, opportunity.subcategory)])
  }
  if (compensation) {
    const { payment } = compensation
    rows.push([
      'Compensation',
      compensation.type === 'Paid' && payment
        ? `${formatPayment(payment)}${payment.note ? ` + ${payment.note}` : ''}`
        : compensation.whatCreatorReceives,
    ])
  }
  if (collaboration) {
    rows.push([
      'Collaboration',
      joined(collaboration.collaborationType, collaboration.deliverableType && `${collaboration.deliverableType} deliverables`),
    ])
    if (collaboration.deliverableNote || collaboration.deliverables?.length) {
      rows.push([
        'Deliverables',
        <>
          {collaboration.deliverableNote && <p>{collaboration.deliverableNote}</p>}
          <ul className="list-disc pl-4">
            {(collaboration.deliverables ?? []).map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </>,
      ])
    }
  }
  if (requirements) {
    rows.push(['Experience Level', (requirements.experienceLevels ?? []).join(', ')])
    if (requirements.additionalInfo?.length) {
      rows.push([
        'Additional Information',
        requirements.additionalInfo.map(({ label, value }, index) => <p key={index}>{`${label}: ${value}`}</p>),
      ])
    }
  }
  if (session?.date) rows.push(['Session Applied For', formatSessionLine(session)])
  if (location) rows.push(['Location', joined(location.venueName, location.fullAddress, location.area)])
  return rows.filter(([, value]) => value)
}

function SubmissionSnapshot({ snapshot }) {
  const headingId = useId()
  const rows = snapshotRows(snapshot)
  if (rows.length === 0) return null
  return (
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Opportunity at Submission</SectionHeading>
      <dl className="flex flex-col gap-2.5 bg-surface-soft rounded-xl border border-line px-4 py-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
            <dd className="text-sm text-gray-700 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function StatusChoice({ value, onChange }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Application Status</SectionHeading>
      <div role="group" aria-labelledby={headingId} className="grid grid-cols-2 gap-2">
        {APPLICATION_STATUSES.map((status) => {
          const chosen = status === value
          const style = STATUS_STYLES[status]
          return (
            <button
              key={status}
              type="button"
              aria-pressed={chosen}
              onClick={() => onChange(status)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                chosen ? `${style.pill} border-current` : 'border-line-strong bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${chosen ? style.dot : 'bg-gray-300'}`} aria-hidden="true" />
              {status}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// The Application Status. "Saved ✓" shows only once the API has stored it; a
// failed save keeps the edit and shows why. Moving an Application away from
// Accepted asks first, as it frees the creator's slot (FS-ADM-APP-015).
function ReviewForm({ application, onSaved }) {
  const [saved, setSaved] = useState(application.status)
  const [draft, setDraft] = useState(saved)
  const [save, setSave] = useState({ state: 'idle' }) // idle | saving | saved | failed (with message)
  const [asking, setAsking] = useState(false)
  const changed = draft !== saved

  useEffect(() => {
    if (save.state !== 'saved') return undefined
    const timer = setTimeout(() => setSave({ state: 'idle' }), SAVED_MESSAGE_MS)
    return () => clearTimeout(timer)
  }, [save.state])

  const choose = (status) => {
    setDraft(status)
    if (save.state !== 'saving') setSave({ state: 'idle' })
  }

  async function store() {
    const updated = await updateApplication(application.id, { status: draft })
    setSaved(updated.status)
    setDraft(updated.status)
    setSave({ state: 'saved' })
    onSaved(updated)
  }

  async function handleSave() {
    if (saved === 'Accepted') {
      setAsking(true)
      return
    }
    setSave({ state: 'saving' })
    try {
      await store()
    } catch (error) {
      setSave({ state: 'failed', message: failureMessage(error) })
    }
  }

  const label = { saving: 'Saving…', saved: 'Saved ✓' }[save.state] ?? 'Save Changes'
  const canSave = changed && save.state !== 'saving'

  return (
    <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
      <StatusChoice value={draft} onChange={choose} />
      {save.state === 'failed' && <ErrorMessage>{save.message}</ErrorMessage>}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            canSave
              ? 'bg-brand text-white hover:bg-brand-dark active:scale-[0.98]'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {label}
        </button>
        {changed && save.state !== 'saving' && (
          <button
            type="button"
            onClick={() => {
              setDraft(saved)
              setSave({ state: 'idle' })
            }}
            className="px-4 py-2.5 rounded-xl border border-line-strong text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Discard
          </button>
        )}
      </div>
      {asking && (
        <ConfirmDialog
          title="Change this accepted application?"
          body="This frees the creator's slot in their session."
          confirmLabel="Change status"
          failedMessage={SAVE_FAILED}
          onConfirm={async () => {
            await store()
            setAsking(false)
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  )
}

function ApplicationDetail({ application, onSaved }) {
  const noteId = useId()
  return (
    <>
      <OpportunityCard application={application} onSaved={onSaved} />
      <div className="px-6 pt-5 pb-4 flex flex-col gap-5">
        <CreatorDetails application={application} onSaved={onSaved} />
        {application.note && (
          <section aria-labelledby={noteId}>
            <SectionHeading id={noteId} className="mb-2">
              Note from Creator
            </SectionHeading>
            <p className="bg-surface-soft rounded-xl border border-line px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {application.note}
            </p>
          </section>
        )}
        <SubmissionSnapshot snapshot={application.snapshot} />
        <p className="text-xs text-gray-400">Submitted {formatDayMonthYear(application.submittedOn)}</p>
      </div>
      <div className="mx-6 border-t border-line" />
      <ReviewForm application={application} onSaved={onSaved} />
    </>
  )
}

// The Figma's Application side panel. It loads the Application fresh, and
// opening it never changes it. `name` labels it while it loads; `onSaved` is
// called with the updated Application after each successful save.
export default function ApplicationPanel({ applicationId, name, onClose, onSaved }) {
  const { status, data, reload } = useApiQuery(getApplication, applicationId)
  // The Application as the last save returned it, which replaces the one loaded.
  const [latest, setLatest] = useState(null)
  const application = latest ?? data

  const handleSaved = (updated) => {
    setLatest(updated)
    onSaved(updated)
  }

  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Application from ${name}`}
        className="fixed top-0 right-0 h-full w-[480px] max-w-full bg-white border-l border-line z-50 flex flex-col shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-line shrink-0">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Application</p>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{application?.contact.fullName ?? name}</h2>
            {application && <p className="text-sm text-gray-500 mt-0.5">{formatHandle(application.contact.instagram)}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0 mt-0.5"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {status === 'loading' && !application && (
            <p className="px-6 py-12 text-center text-sm text-gray-400">Loading application…</p>
          )}
          {status === 'error' && <LoadError message="Couldn't load this application. Check your connection." onRetry={reload} />}
          {application && status !== 'error' && <ApplicationDetail application={application} onSaved={handleSaved} />}
        </div>
      </div>
    </>
  )
}
