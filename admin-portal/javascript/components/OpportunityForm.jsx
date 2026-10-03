import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, IMAGE_TYPES, MAX_IMAGE_BYTES, uploadImage } from '../lib/api'
import { formatSessionLine } from '../lib/format'
import ConfirmDialog from './ConfirmDialog'

// The Figma's Create / Edit Opportunity form: seven sections with an index,
// and Cancel / Save Draft / Publish at the top and bottom. "Save Draft" saves
// as Draft and shows only on a new Opportunity or a Draft; Publish saves with
// the status chosen in section 7, and the API runs the Live checks when that's
// Live (to_ask.md B10). The status moves only Draft → Live → Closed, and
// Closed → Live, so the others are greyed out (FS §2.1, to_ask.md A4).
//
// It asks first (to_ask.md C6) before publishing or reopening, saving a Live
// Opportunity, closing, and leaving with unsaved changes. A save that asks
// first checks without storing anything, so it only asks once the save would
// go through; confirming saves, which checks again.

// Match the API's limits (backend/app/admin_opportunities.py).
const SHORT = 255
const LONG = 5000
const URL_LENGTH = 500
const ITEM_LENGTH = 500
const MAX_ROWS = 10

// The API's reasons for refusing an upload, checked here first so a wrong file is never sent.
const WRONG_IMAGE_TYPE = 'Upload a JPEG, PNG or WebP image'
const IMAGE_TOO_LARGE = 'The image must be 5 MB or smaller'
const UPLOAD_FAILED = "Couldn't upload the image. Check your connection and try again."

const SAVE_FAILED = {
  draft: "Couldn't save the draft. Check your connection and try again.",
  publish: "Couldn't save the opportunity. Check your connection and try again.",
}

// The pop-ups, shared with the Opportunities list's row menu.
export const CONFIRM_PUBLISH = {
  title: 'Publish this opportunity?',
  body: 'It becomes visible to creators straight away.',
  confirmLabel: 'Publish',
}
export const CONFIRM_CLOSE = {
  title: 'Close this opportunity?',
  body: "Creators can't apply any more. Existing applications are kept and can still be reviewed.",
  confirmLabel: 'Close Opportunity',
  danger: true,
}
const CONFIRM_UPDATE_LIVE = {
  title: 'Update this Live opportunity?',
  body: 'Changes are visible to creators straight away. Applications already submitted keep the terms they applied under.',
  confirmLabel: 'Update',
}
const CONFIRM_DISCARD = {
  title: 'Discard your changes?',
  body: "What you've changed since opening this page won't be saved.",
  confirmLabel: 'Discard',
  cancelLabel: 'Keep editing',
}

// The statuses each stored status can be saved as (null: a new Opportunity),
// and why the others can't, as the API says (FS §2.1).
const ALLOWED_STATUSES = {
  null: ['Draft', 'Live'],
  Draft: ['Draft', 'Live'],
  Live: ['Live', 'Closed'],
  Closed: ['Closed', 'Live'],
}
const REFUSED_STATUS = {
  null: 'A new opportunity can only be saved as Draft or Live',
  Draft: 'A Draft has to go Live before it can be closed',
  Live: "A Live opportunity can't go back to Draft",
  Closed: 'A Closed opportunity can only be reopened to Live',
}

// The pop-up a save in `status` asks first with, or null when it just saves.
function confirmationFor(storedStatus, status) {
  if (status === 'Live') return storedStatus === 'Live' ? CONFIRM_UPDATE_LIVE : CONFIRM_PUBLISH
  if (status === 'Closed' && storedStatus === 'Live') return CONFIRM_CLOSE
  return null
}

const SECTIONS = [
  ['basic', 'Basic Info'],
  ['collaboration', 'Collaboration'],
  ['deliverables', 'Deliverables'],
  ['requirements', 'Requirements'],
  ['schedule', 'Schedule'],
  ['location', 'Location'],
  ['publishing', 'Publishing'],
]

const COLLABORATION_TYPES = ['One-off', 'One-off or Ongoing', 'Ongoing']
const PAYMENT_BASES = ['Per completed collaboration', 'Per post', 'Flat fee']
const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All Levels', 'Not Applicable']
// Picked on their own: picking one clears the rest (FS-ADM-FLD-005, to_ask.md A9).
const LEVELS_ON_THEIR_OWN = ['All Levels', 'Not Applicable']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// List rows get a key of their own, so removing one never moves another's typing.
let lastKey = 0
const withKey = (row) => ({ ...row, key: ++lastKey })

const blankSession = () => withKey({ date: '', start: '', end: '', slots: '' })
const blankRecurring = () => ({ days: [], start: '', end: '', startDate: '', endDate: '', slots: '' })

// A stored number as its text box shows it; blank for none.
const numberText = (number) => (number === null || number === undefined ? '' : String(number))

// The form a new Opportunity starts with: the Figma's defaults.
export function blankForm() {
  return {
    title: '',
    partner: '',
    category: 'Sport',
    subcategory: '',
    heroImage: '',
    aboutExperience: '',
    compensationType: 'Barter',
    whatCreatorReceives: '',
    currency: 'SGD',
    paymentAmount: '',
    paymentBasis: null,
    paymentNotes: '',
    collaborationType: 'One-off',
    deliverableType: 'Fixed',
    deliverableNote: '',
    deliverables: [withKey({ text: '' })],
    experienceLevels: ['All Levels'],
    additionalInfo: [],
    scheduleType: 'specific',
    sessions: [blankSession()],
    recurring: blankRecurring(),
    weeklySessions: [],
    venueName: '',
    fullAddress: '',
    area: '',
    publishingStatus: 'Draft',
  }
}

// The form for an Opportunity loaded with getOpportunityForEditing. Its Sessions'
// counts aren't form fields: the form looks them up by id in the loaded Sessions.
export function formFrom(loaded) {
  const { id, version, ...fields } = loaded
  return {
    ...fields,
    paymentAmount: numberText(loaded.paymentAmount),
    deliverables: loaded.deliverables.length
      ? loaded.deliverables.map((text) => withKey({ text }))
      : [withKey({ text: '' })],
    additionalInfo: loaded.additionalInfo.map(withKey),
    sessions: loaded.sessions.length
      ? loaded.sessions.map(({ id: sessionId, date, start, end, slots, cancelled }) =>
          withKey({ id: sessionId, date, start, end, slots: numberText(slots), cancelled }))
      : [blankSession()],
    recurring: loaded.recurring
      ? { ...loaded.recurring, endDate: loaded.recurring.endDate ?? '', slots: numberText(loaded.recurring.slots) }
      : blankRecurring(),
    weeklySessions: loaded.weeklySessions.map(({ id: sessionId, slots, cancelled }) =>
      withKey({ id: sessionId, slots: numberText(slots), cancelled })),
  }
}

// What the API's save takes: the whole form, with the Publishing Status to save it in.
// The Session rows replace the Opportunity's future one-off Sessions: a row keeps
// its stored Session's id, and a stored Session left out is removed; a Cancelled
// row stays Cancelled until it's reopened. The weekly class Sessions send their
// own Creator Slots and whether they're Cancelled. Hidden rows aren't sent.
function requestFrom(form, publishingStatus, showSessions) {
  const withoutKey = ({ key, ...row }) => row
  return {
    ...form,
    deliverables: form.deliverables.map((row) => row.text),
    additionalInfo: form.additionalInfo.map(withoutKey),
    sessions: showSessions ? form.sessions.map(withoutKey) : [],
    weeklySessions: form.scheduleType === 'recurring' ? form.weeklySessions.map(withoutKey) : [],
    publishingStatus,
  }
}

// An API error as the summary at the top lists it, naming the row it's on.
// `weeklyLabel(index)` names a weekly class Session by its date and time.
const ROW_ERRORS = [
  [/^sessions\.(\d+)\./, 'Session'],
  [/^deliverables\.(\d+)$/, 'Deliverable'],
  [/^additionalInfo\.(\d+)\./, 'Requirement'],
]
function summaryLine(key, message, weeklyLabel) {
  if (key.startsWith('recurring.')) return `Recurring schedule: ${message}`
  const weekly = key.match(/^weeklySessions\.(\d+)/)
  if (weekly) return `Weekly class session ${weeklyLabel(Number(weekly[1]))}: ${message}`
  for (const [pattern, row] of ROW_ERRORS) {
    const match = key.match(pattern)
    if (match) return `${row} ${Number(match[1]) + 1}: ${message}`
  }
  return message
}

// A text box's look, then its usual size.
const INPUT_LOOK =
  'rounded-xl border text-sm text-gray-900 placeholder-gray-400 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed'
const INPUT = `w-full px-3.5 py-2.5 ${INPUT_LOOK}`
const INPUT_OK = 'border-line-strong hover:border-gray-300'
const INPUT_ERROR = 'border-red-400 bg-red-50/30'

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M9 11.5L4.5 7 9 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FieldLabel({ id, htmlFor, label, optional }) {
  const Tag = htmlFor ? 'label' : 'span'
  return (
    <div className="flex items-baseline gap-1.5">
      <Tag id={id} htmlFor={htmlFor} className="text-sm font-medium text-gray-800">
        {label}
      </Tag>
      {optional && <span className="text-xs text-gray-400">Optional</span>}
    </div>
  )
}

function FieldError({ id, error }) {
  if (!error) return null
  return (
    <p id={id} className="text-xs text-red-500">
      {error}
    </p>
  )
}

// A labelled text box (or `multiline` text area), with its helper text and error.
function TextField({ label, optional, hint, error, value, onChange, multiline = false, className = '', ...inputProps }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  const Control = multiline ? 'textarea' : 'input'
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <FieldLabel htmlFor={id} label={label} optional={optional} />
      <Control
        id={id}
        type={multiline ? undefined : inputProps.type ?? 'text'}
        rows={multiline ? 5 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={`${INPUT} ${error ? INPUT_ERROR : INPUT_OK} ${multiline ? 'resize-none' : ''}`}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-xs text-gray-400 leading-relaxed">
          {hint}
        </p>
      )}
      <FieldError id={errorId} error={error} />
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M5.5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 1.5h3.5V5M11.5 1.5L6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The Figma's Hero / Cover Image field: a preview with a remove button once
// there's an image, and an image URL box with "Upload file" beside it. An
// uploaded file is stored by the API, and its URL goes in the box (to_ask.md D3).
// `onUploading(true | false)` tells the form while an upload runs, so it can't
// be saved without the image being uploaded.
function ImageField({ value, error, uploading, onUploading, onChange }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const fileRef = useRef(null)
  // Bumped by every change, so an upload that finishes after the image was
  // changed some other way (typed, removed or uploaded again) is dropped.
  const changes = useRef(0)
  // Why the last chosen file wasn't uploaded; shown instead of the save's error.
  const [uploadError, setUploadError] = useState('')
  const shownError = uploadError || error

  async function upload(event) {
    const [file] = event.target.files
    event.target.value = '' // so choosing the same file again uploads it again
    if (!file) return
    // A file without a type is left to the API, which reads the type from the file itself.
    if (file.type && !IMAGE_TYPES.includes(file.type)) return setUploadError(WRONG_IMAGE_TYPE)
    if (file.size > MAX_IMAGE_BYTES) return setUploadError(IMAGE_TOO_LARGE)
    const change = ++changes.current
    setUploadError('')
    onUploading(true)
    try {
      const { url } = await uploadImage(file)
      if (change === changes.current) onChange(url)
    } catch (failure) {
      if (change === changes.current) {
        setUploadError(failure instanceof ApiError && failure.status < 500 ? failure.message : UPLOAD_FAILED)
      }
    } finally {
      if (change === changes.current) onUploading(false)
    }
  }

  const change = (url) => {
    changes.current += 1
    onUploading(false)
    setUploadError('')
    onChange(url)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} label="Hero / Cover Image" />
      <div className="flex flex-col gap-2.5">
        {value && (
          <div className="relative w-full h-44 rounded-xl overflow-hidden bg-gray-100">
            <img src={value} alt="Cover image preview" className="w-full h-full object-cover" />
            <button
              type="button"
              title="Remove"
              aria-label="Remove image"
              onClick={() => change('')}
              className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-lg text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            id={id}
            type="url"
            placeholder="https://images.unsplash.com/..."
            maxLength={URL_LENGTH}
            value={value}
            onChange={(event) => change(event.target.value)}
            aria-invalid={Boolean(shownError) || undefined}
            aria-describedby={[hintId, shownError && errorId].filter(Boolean).join(' ')}
            className={`${INPUT} flex-1 ${shownError ? INPUT_ERROR : INPUT_OK}`}
          />
          <button
            type="button"
            onClick={() => fileRef.current.click()}
            disabled={uploading}
            className="px-3.5 py-2.5 rounded-xl border border-line-strong text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
          >
            {uploading ? 'Uploading…' : 'Upload file'}
          </button>
          {/* Reached through "Upload file"; any image type, as in the Figma, so a wrong one gets a clear message. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-label="Cover image file"
            onChange={upload}
            className="sr-only"
          />
        </div>
      </div>
      <p id={hintId} className="text-xs text-gray-400 leading-relaxed">
        Upload a file or paste an image URL
      </p>
      <FieldError id={errorId} error={shownError} />
    </div>
  )
}

function ChoiceButton({ chosen, onClick, children, disabledReason, className = 'px-4' }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onClick}
      disabled={Boolean(disabledReason)}
      title={disabledReason}
      className={`${className} py-2 rounded-xl border text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        chosen ? 'bg-brand-100 border-brand text-brand' : 'border-line-strong text-gray-600 enabled:hover:border-gray-300 bg-white'
      }`}
    >
      {children}
    </button>
  )
}

// Exactly one of `options` (each a value, or [value, text]), as the Figma's pill
// buttons. `disabled` maps an option that can't be chosen to why, shown on hover.
function ChoiceField({ label, options, value, onChange, error, disabled = {} }) {
  const labelId = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={labelId} label={label} />
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const [optionValue, text] = Array.isArray(option) ? option : [option, option]
          return (
            <ChoiceButton
              key={optionValue}
              chosen={value === optionValue}
              disabledReason={disabled[optionValue]}
              onClick={() => onChange(optionValue)}
            >
              {text}
            </ChoiceButton>
          )
        })}
      </div>
      <FieldError error={error} />
    </div>
  )
}

// The Experience / Skill Levels: one or more of Beginner, Intermediate and
// Advanced, or All Levels or Not Applicable on its own. One is always picked.
function LevelsField({ value, onChange, error }) {
  const labelId = useId()
  const toggle = (level) => {
    if (LEVELS_ON_THEIR_OWN.includes(level)) return onChange([level])
    const others = value.filter((picked) => !LEVELS_ON_THEIR_OWN.includes(picked))
    const next = others.includes(level) ? others.filter((picked) => picked !== level) : [...others, level]
    if (next.length) onChange(EXPERIENCE_LEVELS.filter((known) => next.includes(known)))
  }
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={labelId} label="Experience / Skill Level" />
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {EXPERIENCE_LEVELS.map((level) => (
          <ChoiceButton key={level} chosen={value.includes(level)} onClick={() => toggle(level)}>
            {level}
          </ChoiceButton>
        ))}
      </div>
      <FieldError error={error} />
    </div>
  )
}

function AddButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-brand hover:text-brand-dark transition-colors mt-1"
    >
      <PlusIcon />
      {children}
    </button>
  )
}

function RemoveButton({ label, onClick }) {
  return (
    <button
      type="button"
      title="Remove"
      aria-label={label}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function Section({ id, title, description, children }) {
  const headingId = `${id}-heading`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="bg-white rounded-2xl border border-line p-6 flex flex-col gap-4 scroll-mt-20"
    >
      <div>
        <h2 id={headingId} className="font-display text-sm font-bold text-gray-900 uppercase tracking-wide">
          {title}
        </h2>
        {description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function CancelledTag() {
  return <span className="px-2 py-0.5 rounded-md bg-gray-200 text-[11px] font-semibold text-gray-600 normal-case tracking-normal">Cancelled</span>
}

// How full a stored Session is (FS-ADM-SES-023): its Accepted Count of its
// Creator Slots and its Applications; a full one still holding New or Reviewing
// Applications says so (FS-ADM-LST-006). `stored` is the Session as loaded.
function SessionCounts({ stored, cancelled }) {
  if (stored?.acceptedCount === undefined) return null
  const { slots, acceptedCount, applicationsCount, undecidedCount } = stored
  const full = !cancelled && slots !== null && acceptedCount >= slots && undecidedCount > 0
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
      <span>
        {`${slots === null ? acceptedCount : `${acceptedCount} of ${slots}`} accepted · `}
        {`${applicationsCount} application${applicationsCount === 1 ? '' : 's'}`}
      </span>
      {full && (
        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium">
          {`Full · ${undecidedCount} undecided`}
        </span>
      )}
    </p>
  )
}

// A one-off Session row. A Cancelled one is greyed out until it's reopened.
function SessionFields({ session, stored, index, errors, onChange, onRemove }) {
  const key = `sessions.${index}`
  const number = index + 1
  const { cancelled } = session
  return (
    <div
      role="group"
      aria-label={`Session ${number}`}
      className={`rounded-xl border border-line p-4 flex flex-col gap-3 ${cancelled ? 'bg-gray-50' : 'bg-surface-soft'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Session {number}
            {cancelled && <CancelledTag />}
          </p>
          <SessionCounts stored={stored} cancelled={cancelled} />
        </div>
        {cancelled ? (
          <button
            type="button"
            aria-label={`Reopen session ${number}`}
            onClick={() => onChange({ cancelled: false })}
            className="text-sm font-medium text-brand hover:text-brand-dark transition-colors"
          >
            Reopen
          </button>
        ) : (
          onRemove && <RemoveButton label={`Remove session ${number}`} onClick={onRemove} />
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <TextField type="date" label="Date" disabled={cancelled} value={session.date} error={errors[`${key}.date`]} onChange={(date) => onChange({ date })} />
        <TextField type="time" label="Start Time" disabled={cancelled} value={session.start} error={errors[`${key}.start`]} onChange={(start) => onChange({ start })} />
        <TextField type="time" label="End Time" disabled={cancelled} value={session.end} error={errors[`${key}.end`]} onChange={(end) => onChange({ end })} />
      </div>
      <TextField
        type="number"
        min="1"
        step="1"
        label="Creator Slots"
        placeholder="e.g. 3"
        hint="At least 1"
        disabled={cancelled}
        value={session.slots}
        error={errors[`${key}.slots`]}
        onChange={(slots) => onChange({ slots })}
      />
    </div>
  )
}

// One of the weekly class's future Sessions: its own Creator Slots, and Cancel or Reopen.
function WeeklySessionRow({ session, stored, index, errors, onChange }) {
  const id = useId()
  const errorId = `${id}-error`
  const key = `weeklySessions.${index}`
  const error = errors[`${key}.slots`] ?? errors[key]
  const { cancelled } = session
  return (
    <li>
      <div
        role="group"
        aria-label={formatSessionLine(stored)}
        className={`rounded-xl border border-line px-4 py-3 flex flex-col gap-1.5 ${cancelled ? 'bg-gray-50' : 'bg-surface-soft'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex flex-col gap-1">
            <p className={`flex items-center gap-2 text-sm font-medium ${cancelled ? 'text-gray-400' : 'text-gray-800'}`}>
              {formatSessionLine(stored)}
              {cancelled && <CancelledTag />}
            </p>
            <SessionCounts stored={stored} cancelled={cancelled} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor={id} className="text-xs text-gray-500 whitespace-nowrap">
              Creator Slots
            </label>
            <input
              id={id}
              type="number"
              min="1"
              step="1"
              disabled={cancelled}
              value={session.slots}
              onChange={(event) => onChange({ slots: event.target.value })}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              className={`${INPUT_LOOK} w-20 px-2.5 py-1.5 ${error ? INPUT_ERROR : INPUT_OK}`}
            />
            <button
              type="button"
              aria-label={cancelled ? 'Reopen session' : 'Cancel session'}
              onClick={() => onChange({ cancelled: !cancelled })}
              className={`w-16 text-sm font-medium transition-colors ${
                cancelled ? 'text-brand hover:text-brand-dark' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              {cancelled ? 'Reopen' : 'Cancel'}
            </button>
          </div>
        </div>
        <FieldError id={errorId} error={error} />
      </div>
    </li>
  )
}

function WeeklySessionsList({ sessions, storedById, errors, onChange }) {
  const headingId = useId()
  return (
    <div className="flex flex-col gap-2">
      <p id={headingId} className="text-sm font-medium text-gray-800">
        Weekly class sessions
      </p>
      <p className="text-xs text-gray-400 -mt-1 leading-relaxed">
        Change one session&apos;s Creator Slots, or cancel it. A session whose slots you change here stays as it is
        when the schedule changes.
      </p>
      <ul aria-labelledby={headingId} className="flex flex-col gap-2">
        {sessions.map((session, index) => (
          <WeeklySessionRow
            key={session.key}
            session={session}
            stored={storedById.get(session.id)}
            index={index}
            errors={errors}
            onChange={(change) => onChange(index, change)}
          />
        ))}
      </ul>
    </div>
  )
}

function RecurringFields({ recurring, errors, onChange }) {
  const daysLabelId = useId()
  const toggleDay = (day) =>
    onChange({ days: recurring.days.includes(day) ? recurring.days.filter((d) => d !== day) : [...recurring.days, day] })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel id={daysLabelId} label="Day(s) of Week" />
        <div role="group" aria-labelledby={daysLabelId} className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <ChoiceButton key={day} className="px-3.5" chosen={recurring.days.includes(day)} onClick={() => toggleDay(day)}>
              {day}
            </ChoiceButton>
          ))}
        </div>
        <FieldError error={errors['recurring.days']} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField type="time" label="Start Time" value={recurring.start} error={errors['recurring.start']} onChange={(start) => onChange({ start })} />
        <TextField type="time" label="End Time" value={recurring.end} error={errors['recurring.end']} onChange={(end) => onChange({ end })} />
        <TextField type="date" label="Start Date" value={recurring.startDate} error={errors['recurring.startDate']} onChange={(startDate) => onChange({ startDate })} />
        <TextField type="date" label="End Date" optional value={recurring.endDate} error={errors['recurring.endDate']} onChange={(endDate) => onChange({ endDate })} />
      </div>
      <TextField
        type="number"
        min="1"
        step="1"
        label="Creator Slots per Session"
        placeholder="e.g. 3"
        hint="At least 1"
        value={recurring.slots}
        error={errors['recurring.slots']}
        onChange={(slots) => onChange({ slots })}
      />
      <FieldError error={errors.recurring} />
    </div>
  )
}

function ScheduleTypeChoice({ value, onChange }) {
  const labelId = useId()
  const options = [
    ['specific', 'Specific Dates / Sessions', 'Set individual session dates and times'],
    ['recurring', 'Recurring Schedule', 'Repeating weekly or regular cadence'],
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={labelId} label="Schedule Type" />
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
        {options.map(([type, title, description]) => {
          const chosen = value === type
          return (
            <button
              key={type}
              type="button"
              aria-pressed={chosen}
              onClick={() => onChange(type)}
              className={`text-left p-3.5 rounded-xl border transition-colors ${
                chosen ? 'bg-brand-100 border-brand' : 'border-line-strong bg-white hover:border-gray-300'
              }`}
            >
              <p className={`text-sm font-semibold ${chosen ? 'text-brand' : 'text-gray-800'}`}>{title}</p>
              <p className={`text-xs mt-0.5 ${chosen ? 'text-brand/70' : 'text-gray-400'}`}>{description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// `saving` is the action under way ('draft' or 'publish'), or null.
// `busy`: the buttons can't save yet, e.g. while a cover image uploads.
// `onSaveDraft` is left out where Save Draft isn't offered.
function FormButtons({ saving, busy, publishLabel, onLeave, onSaveDraft, onPublish, large = false }) {
  const size = large ? 'px-4 py-2.5' : 'px-3.5 py-2'
  return (
    <>
      <Link
        to="/admin/opportunities"
        onClick={onLeave}
        className={`${size} rounded-xl border border-line-strong text-sm text-gray-600 hover:bg-gray-50 transition-colors`}
      >
        Cancel
      </Link>
      {onSaveDraft && (
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={Boolean(saving) || busy}
          className={`${size} rounded-xl border border-line-strong text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-wait`}
        >
          {saving === 'draft' ? 'Saving…' : 'Save Draft'}
        </button>
      )}
      <button
        type="button"
        onClick={onPublish}
        disabled={Boolean(saving) || busy}
        className={`${large ? 'flex-1 py-2.5' : 'px-4 py-2'} rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-wait`}
      >
        {saving === 'publish' ? 'Saving…' : publishLabel}
      </button>
    </>
  )
}

// The Figma's "Fix the following before publishing:" box: every error the API
// returned, in the form's order.
function ErrorSummary({ errors, weeklyLabel, summaryRef }) {
  const headingId = useId()
  return (
    <div
      ref={summaryRef}
      role="alert"
      aria-labelledby={headingId}
      tabIndex={-1}
      className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 scroll-mt-20 focus:outline-none"
    >
      <p id={headingId} className="text-sm font-semibold text-red-700 mb-1.5">
        Fix the following before publishing:
      </p>
      <ul className="text-sm text-red-600 space-y-0.5 list-disc list-inside">
        {Object.entries(errors).map(([key, message]) => (
          <li key={key}>{summaryLine(key, message, weeklyLabel)}</li>
        ))}
      </ul>
    </div>
  )
}

// `onSave(request)` stores the whole form and resolves once the API has saved
// it; until then nothing says saved. `onCheck(request)` checks it the same way
// without storing anything, before a save that asks first. A failed save keeps
// every value typed and shows the API's errors, under each field when it names
// them. A publish the Live checks refused also lists them all at the top and
// scrolls there, as the Figma does; `refusedErrors` opens the form that way (the
// list's Reopen Opportunity). `storedStatus` is the Opportunity's stored
// Publishing Status (null: a new one): Publish reads "Update & Publish" when
// it's Live. `previewHref` adds a Preview link opening it in a new tab.
// `storedSessions` are its future Sessions as loaded, with their counts.
export default function OpportunityForm({
  initial,
  crumb,
  storedStatus = null,
  storedSessions = [],
  previewHref,
  refusedErrors,
  onCheck,
  onSave,
}) {
  const navigate = useNavigate()
  const live = storedStatus === 'Live'
  const [form, setForm] = useState(initial)
  const storedById = useMemo(() => new Map(storedSessions.map((session) => [session.id, session])), [storedSessions])
  const weeklyLabel = (index) => {
    const stored = storedById.get(form.weeklySessions[index]?.id)
    return stored ? formatSessionLine(stored) : String(index + 1)
  }
  // The pop-up asking first: { ...its text, onConfirm }, or null.
  const [asking, setAsking] = useState(null)
  // state: idle | saving | failed | refused (a publish the Live checks refused)
  const [save, setSave] = useState(() =>
    refusedErrors
      ? { state: 'refused', action: 'publish', message: '', errors: refusedErrors }
      : { state: 'idle', action: null, message: '', errors: {} },
  )
  const { errors } = save
  const saving = save.state === 'saving' ? save.action : null
  const [uploading, setUploading] = useState(false)
  const summaryRef = useRef(null)

  useEffect(() => {
    if (save.state !== 'refused') return
    summaryRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    summaryRef.current?.focus({ preventScroll: true })
  }, [save])

  const update = (change) => setForm((current) => ({ ...current, ...change }))
  const updateRow = (list, index, change) =>
    setForm((current) => ({
      ...current,
      [list]: current[list].map((row, i) => (i === index ? { ...row, ...change } : row)),
    }))
  const removeRow = (list, index) =>
    setForm((current) => ({ ...current, [list]: current[list].filter((_, i) => i !== index) }))
  const addRow = (list, row) => setForm((current) => ({ ...current, [list]: [...current[list], withKey(row)] }))

  // B6: an Opportunity loaded with a Recurring Schedule and one-off Sessions shows both.
  const showSessions = form.scheduleType === 'specific' || initial.sessions.some((session) => session.id)

  // Unsaved changes: the form as it would be sent differs from how it opened.
  const opened = useMemo(() => JSON.stringify(requestFrom(initial, initial.publishingStatus, true)), [initial])
  const changed = JSON.stringify(requestFrom(form, form.publishingStatus, true)) !== opened

  // Cancel and the breadcrumb ask first when there are unsaved changes (FS-ADM-OPP-004).
  function handleLeave(event) {
    if (!changed) return
    event.preventDefault()
    setAsking({ ...CONFIRM_DISCARD, onConfirm: () => navigate('/admin/opportunities') })
  }

  // Shows a failed save or check of `publishingStatus` in the form.
  function showFailure(action, publishingStatus, error) {
    const known = error instanceof ApiError && error.status < 500
    const fieldErrors = known ? error.fieldErrors : {}
    const refused = publishingStatus === 'Live' && Object.keys(fieldErrors).length > 0
    setSave({
      state: refused ? 'refused' : 'failed',
      action,
      message: known ? error.message : SAVE_FAILED[action],
      errors: fieldErrors,
    })
  }

  // `action` is 'draft', which saves as Draft, or 'publish', which saves with
  // the chosen status. Publishing, saving a Live Opportunity and closing check
  // first and then ask; only confirming saves.
  async function handleSave(action) {
    if (saving || uploading) return
    const publishingStatus = action === 'draft' ? 'Draft' : form.publishingStatus
    const request = requestFrom(form, publishingStatus, showSessions)
    const confirmation = confirmationFor(storedStatus, publishingStatus)
    setSave({ state: 'saving', action, message: '', errors: {} })
    if (!confirmation) {
      try {
        await onSave(request)
      } catch (error) {
        showFailure(action, publishingStatus, error)
      }
      return
    }
    try {
      await onCheck(request)
    } catch (error) {
      return showFailure(action, publishingStatus, error)
    }
    setSave({ state: 'idle', action: null, message: '', errors: {} })
    setAsking({
      ...confirmation,
      // A failure shows inside the pop-up, except field errors (e.g. a Session
      // started meanwhile), which close it and show in the form.
      onConfirm: async () => {
        try {
          await onSave(request)
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length > 0)) throw error
          setAsking(null)
          showFailure(action, publishingStatus, error)
        }
      },
    })
  }
  const canSaveDraft = storedStatus === null || storedStatus === 'Draft'
  const buttons = {
    saving,
    busy: uploading,
    onLeave: handleLeave,
    onSaveDraft: canSaveDraft ? () => handleSave('draft') : undefined,
    onPublish: () => handleSave('publish'),
  }
  const allowed = ALLOWED_STATUSES[storedStatus]
  const refusedStatuses = Object.fromEntries(
    ['Draft', 'Live', 'Closed'].filter((status) => !allowed.includes(status)).map((s) => [s, REFUSED_STATUS[storedStatus]]),
  )

  const paid = form.compensationType === 'Paid'

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-line">
        <div className="px-8 py-3.5 flex items-center justify-between gap-4">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2.5 min-w-0">
            <Link
              to="/admin/opportunities"
              onClick={handleLeave}
              className="text-sm text-gray-400 hover:text-brand flex items-center gap-1 transition-colors shrink-0"
            >
              <BackIcon />
              Opportunities
            </Link>
            <span className="text-gray-300" aria-hidden="true">
              /
            </span>
            <span aria-current="page" className="text-sm font-semibold text-gray-900 truncate">
              {crumb}
            </span>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            {previewHref && (
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-line-strong text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExternalIcon />
                Preview
              </a>
            )}
            <FormButtons {...buttons} publishLabel={live ? 'Update & Publish' : 'Publish'} />
          </div>
        </div>
        {save.state === 'failed' && (
          <p role="alert" className="px-8 py-2.5 border-t border-red-100 bg-red-50 text-sm text-red-600">
            {save.message}
          </p>
        )}
      </div>

      <div className="flex items-start gap-6 px-8 py-6 max-w-5xl">
        <nav aria-label="Form sections" className="hidden xl:flex flex-col gap-0.5 w-44 shrink-0 sticky top-20 self-start pt-1">
          {SECTIONS.map(([id, label], index) => (
            <button
              key={id}
              type="button"
              onClick={() => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
              className="text-left text-[13px] px-3 py-2 rounded-lg text-gray-400 hover:text-brand hover:bg-brand-50 transition-colors"
            >
              {index + 1}&nbsp;&nbsp;{label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col gap-4 pb-16">
          {save.state === 'refused' && <ErrorSummary errors={errors} weeklyLabel={weeklyLabel} summaryRef={summaryRef} />}
          <Section id="basic" title="1. Basic Information">
            <TextField
              label="Opportunity Title"
              placeholder="e.g. Reformer Pilates Experience"
              maxLength={SHORT}
              value={form.title}
              error={errors.title}
              onChange={(title) => update({ title })}
            />
            <TextField
              label="Partner / Brand Name"
              placeholder="e.g. CARVE Pilates Studio"
              maxLength={SHORT}
              value={form.partner}
              error={errors.partner}
              onChange={(partner) => update({ partner })}
            />
            <div className="grid grid-cols-2 gap-4">
              <ChoiceField
                label="Category"
                options={['Sport', 'Lifestyle']}
                value={form.category}
                error={errors.category}
                onChange={(category) => update({ category })}
              />
              <TextField
                label="Subcategory / Activity"
                optional
                placeholder="e.g. Pilates, Boxing, Coffee"
                maxLength={SHORT}
                value={form.subcategory}
                error={errors.subcategory}
                onChange={(subcategory) => update({ subcategory })}
              />
            </div>
            <ImageField
              value={form.heroImage}
              error={errors.heroImage}
              uploading={uploading}
              onUploading={setUploading}
              onChange={(heroImage) => update({ heroImage })}
            />
            <TextField
              multiline
              label="About the Experience"
              placeholder="Describe the experience in detail…"
              hint="Describe the experience, what the creator will do, and why they should apply."
              maxLength={LONG}
              value={form.aboutExperience}
              error={errors.aboutExperience}
              onChange={(aboutExperience) => update({ aboutExperience })}
            />
          </Section>

          <Section id="collaboration" title="2. Collaboration">
            <ChoiceField
              label="Compensation Type"
              options={['Barter', 'Paid']}
              value={form.compensationType}
              error={errors.compensationType}
              onChange={(compensationType) => update({ compensationType })}
            />
            {paid ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-2">
                    <ChoiceField
                      label="Currency"
                      options={['SGD', 'USD']}
                      value={form.currency}
                      error={errors.currency}
                      onChange={(currency) => update({ currency })}
                    />
                  </div>
                  <TextField
                    className="col-span-3"
                    label="Payment Amount"
                    inputMode="decimal"
                    placeholder="e.g. 150"
                    maxLength={SHORT}
                    value={form.paymentAmount}
                    error={errors.paymentAmount}
                    onChange={(paymentAmount) => update({ paymentAmount })}
                  />
                </div>
                <ChoiceField
                  label="Payment Basis"
                  options={PAYMENT_BASES}
                  value={form.paymentBasis}
                  error={errors.paymentBasis}
                  onChange={(paymentBasis) => update({ paymentBasis })}
                />
                <TextField
                  label="Payment Conditions / Notes"
                  optional
                  placeholder="Optional conditions or payment notes"
                  hint="e.g. Payment processed within 14 days of content going live"
                  maxLength={LONG}
                  value={form.paymentNotes}
                  error={errors.paymentNotes}
                  onChange={(paymentNotes) => update({ paymentNotes })}
                />
              </div>
            ) : (
              <TextField
                label="What the Creator Receives"
                placeholder="e.g. 1x complimentary class (worth S$45)"
                hint="e.g. Complimentary day pass + intro session"
                maxLength={LONG}
                value={form.whatCreatorReceives}
                error={errors.whatCreatorReceives}
                onChange={(whatCreatorReceives) => update({ whatCreatorReceives })}
              />
            )}
            <ChoiceField
              label="Collaboration Type"
              options={COLLABORATION_TYPES}
              value={form.collaborationType}
              error={errors.collaborationType}
              onChange={(collaborationType) => update({ collaborationType })}
            />
          </Section>

          <Section id="deliverables" title="3. Content Deliverables">
            <ChoiceField
              label="Deliverable Type"
              options={['Fixed', 'Flexible']}
              value={form.deliverableType}
              error={errors.deliverableType}
              onChange={(deliverableType) => update({ deliverableType })}
            />
            <TextField
              label="Note above deliverables"
              optional
              placeholder="Optional note shown above the deliverable list"
              hint={'e.g. "Final deliverables will be agreed with the partner."'}
              maxLength={LONG}
              value={form.deliverableNote}
              error={errors.deliverableNote}
              onChange={(deliverableNote) => update({ deliverableNote })}
            />
            <div className="flex flex-col gap-2">
              <FieldLabel label="Deliverable Items" />
              <ol className="flex flex-col gap-2">
                {form.deliverables.map((row, index) => (
                  <li key={row.key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 text-right shrink-0" aria-hidden="true">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        aria-label={`Deliverable ${index + 1}`}
                        placeholder="e.g. 1 × Instagram Reel featuring the session"
                        maxLength={ITEM_LENGTH}
                        value={row.text}
                        onChange={(event) => updateRow('deliverables', index, { text: event.target.value })}
                        aria-invalid={Boolean(errors[`deliverables.${index}`]) || undefined}
                        className={`${INPUT} ${errors[`deliverables.${index}`] ? INPUT_ERROR : INPUT_OK}`}
                      />
                      {form.deliverables.length > 1 && (
                        <RemoveButton label={`Remove deliverable ${index + 1}`} onClick={() => removeRow('deliverables', index)} />
                      )}
                    </div>
                    <div className="pl-7">
                      <FieldError error={errors[`deliverables.${index}`]} />
                    </div>
                  </li>
                ))}
              </ol>
              <FieldError error={errors.deliverables} />
              {form.deliverables.length < MAX_ROWS && (
                <AddButton onClick={() => addRow('deliverables', { text: '' })}>Add Deliverable</AddButton>
              )}
            </div>
          </Section>

          <Section
            id="requirements"
            title="4. Creator Requirements"
            description="Specify eligibility and activity-specific information shown in the 'Who is this for' section."
          >
            <LevelsField
              value={form.experienceLevels}
              error={errors.experienceLevels}
              onChange={(experienceLevels) => update({ experienceLevels })}
            />
            <div className="flex flex-col gap-2">
              <FieldLabel label="Additional Requirements" optional />
              <p className="text-xs text-gray-400 -mt-1">
                Custom label/value rows for activity-specific details. E.g. &quot;Equipment&quot; → &quot;Climbing shoes provided&quot;.
              </p>
              {form.additionalInfo.length > 0 && (
                <ul className="flex flex-col gap-2 mt-1">
                  {form.additionalInfo.map((row, index) => {
                    const labelError = errors[`additionalInfo.${index}.label`]
                    const valueError = errors[`additionalInfo.${index}.value`]
                    return (
                      <li key={row.key} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            aria-label={`Requirement ${index + 1} label`}
                            placeholder="Label (e.g. Equipment)"
                            maxLength={SHORT}
                            value={row.label}
                            onChange={(event) => updateRow('additionalInfo', index, { label: event.target.value })}
                            aria-invalid={Boolean(labelError) || undefined}
                            className={`${INPUT} ${labelError ? INPUT_ERROR : INPUT_OK}`}
                          />
                          <span className="text-gray-300 shrink-0 text-sm" aria-hidden="true">
                            →
                          </span>
                          <input
                            type="text"
                            aria-label={`Requirement ${index + 1} value`}
                            placeholder="Value (e.g. Shoes provided)"
                            maxLength={ITEM_LENGTH}
                            value={row.value}
                            onChange={(event) => updateRow('additionalInfo', index, { value: event.target.value })}
                            aria-invalid={Boolean(valueError) || undefined}
                            className={`${INPUT} ${valueError ? INPUT_ERROR : INPUT_OK}`}
                          />
                          <RemoveButton label={`Remove requirement ${index + 1}`} onClick={() => removeRow('additionalInfo', index)} />
                        </div>
                        <FieldError error={labelError ?? valueError} />
                      </li>
                    )
                  })}
                </ul>
              )}
              <FieldError error={errors.additionalInfo} />
              {form.additionalInfo.length < MAX_ROWS && (
                <AddButton onClick={() => addRow('additionalInfo', { label: '', value: '' })}>Add Requirement</AddButton>
              )}
            </div>
          </Section>

          <Section id="schedule" title="5. Schedule & Availability">
            <ScheduleTypeChoice value={form.scheduleType} onChange={(scheduleType) => update({ scheduleType })} />
            {form.scheduleType === 'recurring' && (
              <RecurringFields
                recurring={form.recurring}
                errors={errors}
                onChange={(change) => update({ recurring: { ...form.recurring, ...change } })}
              />
            )}
            {form.scheduleType === 'recurring' && form.weeklySessions.length > 0 && (
              <WeeklySessionsList
                sessions={form.weeklySessions}
                storedById={storedById}
                errors={errors}
                onChange={(index, change) => updateRow('weeklySessions', index, change)}
              />
            )}
            {showSessions && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-gray-800">Sessions</p>
                {form.sessions.map((session, index) => (
                  <SessionFields
                    key={session.key}
                    session={session}
                    stored={session.id ? storedById.get(session.id) : undefined}
                    index={index}
                    errors={errors}
                    onChange={(change) => updateRow('sessions', index, change)}
                    onRemove={form.sessions.length > 1 ? () => removeRow('sessions', index) : undefined}
                  />
                ))}
                <FieldError error={errors.sessions} />
                <AddButton onClick={() => addRow('sessions', { date: '', start: '', end: '', slots: '' })}>Add Session</AddButton>
              </div>
            )}
          </Section>

          <Section id="location" title="6. Location">
            <TextField
              label="Venue Name"
              optional
              placeholder="e.g. Kallang Tennis Centre"
              hint="The actual venue, not the partner/brand name — unless they are the same"
              maxLength={SHORT}
              value={form.venueName}
              error={errors.venueName}
              onChange={(venueName) => update({ venueName })}
            />
            <TextField
              label="Full Address"
              optional
              placeholder="e.g. 52 Stadium Road, Singapore 397724"
              hint="Shown in the Location section on the opportunity detail page"
              maxLength={URL_LENGTH}
              value={form.fullAddress}
              error={errors.fullAddress}
              onChange={(fullAddress) => update({ fullAddress })}
            />
            <TextField
              label="Area / Neighbourhood"
              placeholder="e.g. Tanjong Pagar, Bugis, Orchard"
              hint="Short label shown on catalogue cards and used for location filtering"
              maxLength={SHORT}
              value={form.area}
              error={errors.area}
              onChange={(area) => update({ area })}
            />
          </Section>

          <Section id="publishing" title="7. Publishing">
            <ChoiceField
              label="Status"
              options={['Draft', 'Live', 'Closed']}
              value={form.publishingStatus}
              disabled={refusedStatuses}
              error={errors.publishingStatus}
              onChange={(publishingStatus) => update({ publishingStatus })}
            />
            <p className="text-xs text-gray-400 leading-relaxed -mt-1">
              <span className="font-semibold text-gray-600">Draft</span> — saved but not visible to creators.{' '}
              <span className="font-semibold text-gray-600">Live</span> — visible and accepting applications.{' '}
              <span className="font-semibold text-gray-600">Closed</span> — no longer accepting applications.
            </p>
            {save.state === 'refused' && (
              <p className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                Fix the errors above before publishing.
              </p>
            )}
            <div className="flex gap-2.5 pt-3 border-t border-line-soft">
              <FormButtons {...buttons} large publishLabel={live ? 'Update & Publish' : 'Publish Opportunity'} />
            </div>
          </Section>
        </div>
      </div>
      {asking && <ConfirmDialog failedMessage={SAVE_FAILED.publish} {...asking} onCancel={() => setAsking(null)} />}
    </div>
  )
}
