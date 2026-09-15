import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BadgeRow } from '../javascript/components/Badge'
import Button from '../javascript/components/Button'
import {
  CheckIcon,
  ChevronLeftIcon,
  DollarIcon,
  GiftIcon,
  MapPinIcon,
} from '../javascript/components/Icons'
import SessionPicker from '../javascript/components/SessionPicker'
import { useRegistration } from '../javascript/context/RegistrationContext'
import { getOpportunity, getSession, isFull } from '../javascript/data/opportunities'
import { formatLongDate, formatShortDate, formatTimeRange } from '../javascript/lib/format'
import NotFoundPage from './NotFoundPage'

function SectionTitle({ children, small = false }) {
  return small ? (
    <h3 className="font-display text-sm font-semibold text-gray-900">{children}</h3>
  ) : (
    <h2 className="font-display text-base font-semibold text-gray-900">{children}</h2>
  )
}

function Section({ title, children, delay = 0 }) {
  return (
    <section className="flex flex-col gap-3 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

function PerkBox({ opportunity, compact = false }) {
  const paid = opportunity.collab === 'Paid'
  return (
    <div
      className={`flex items-center gap-3 text-sm rounded-xl ${compact ? 'px-3 py-2.5' : 'px-4 py-3'} ${
        paid ? 'bg-amber-50 text-amber-800' : 'bg-surface text-gray-700'
      }`}
    >
      {paid ? <DollarIcon className="text-amber-500" /> : <GiftIcon className="text-gray-400" />}
      <span>{opportunity.perkDetail}</span>
    </div>
  )
}

function CollabNote({ opportunity, className = '' }) {
  const text =
    opportunity.collab === 'Paid'
      ? 'Paid collaboration — a fee is agreed with LyfeGo once your application is accepted.'
      : 'Barter collaboration — the experience is provided in exchange for agreed content deliverables.'
  return <p className={`text-xs text-gray-400 leading-relaxed ${className}`}>{text}</p>
}

function AudienceList({ rows, className = '' }) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {rows.map((row, i) => (
        <div key={row.label} className="contents">
          {i > 0 && <div className="border-t border-line-soft" />}
          <div className="flex items-start gap-3">
            <span className="text-sm text-gray-400 w-32 shrink-0">{row.label}</span>
            <span className="text-sm text-gray-700">{row.value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Deliverable({ item }) {
  let content = item
  if (typeof item === 'object') {
    const parts = item.text.split(/(\{\d\})/)
    content = parts.map((p, i) => {
      const m = p.match(/^\{(\d)\}$/)
      return m ? (
        <span key={i} className="font-medium text-gray-800">
          {item.handles[Number(m[1])]}
        </span>
      ) : (
        p
      )
    })
  }
  return (
    <div className="flex items-start gap-3 text-sm text-gray-600">
      <span className="mt-0.5 w-5 h-5 rounded-full bg-brand-100 text-brand flex items-center justify-center shrink-0">
        <CheckIcon />
      </span>
      <span>{content}</span>
    </div>
  )
}

function SpotsMeta({ opportunity }) {
  if (opportunity.collab === 'Paid') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
        Applications close {formatShortDate(opportunity.deadline)}
      </div>
    )
  }
  const n = opportunity.spotsLeft
  if (n === 0) {
    return (
      <div className="flex items-center gap-1.5 text-sm font-medium text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        All spots taken
      </div>
    )
  }
  const low = n <= 2
  return (
    <div
      className={`flex items-center gap-1.5 text-sm font-medium ${low ? 'text-amber-600' : 'text-gray-500'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${low ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      {n} creator {n === 1 ? 'spot' : 'spots'} left
    </div>
  )
}

export default function OpportunityDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const opportunity = getOpportunity(id)
  const { selectedSessionId, selectSession } = useRegistration()
  const [hint, setHint] = useState(0)

  if (!opportunity) return <NotFoundPage />

  const full = isFull(opportunity)
  const hasSessions = opportunity.sessions.length > 0
  const sessionId = selectedSessionId(opportunity.id)
  const session = getSession(opportunity, sessionId)
  const ready = full ? false : hasSessions ? Boolean(session) : true

  const handleRegister = () => {
    if (full) return
    if (hasSessions && !session) {
      setHint((n) => n + 1)
      document.getElementById('choose-session')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    navigate(`/opportunity/${opportunity.id}/register`)
  }

  const registerLabel = full
    ? 'Opportunity Full'
    : ready
      ? 'Register for Opportunity →'
      : 'Register for Opportunity'

  const registerButton = (
    <Button size="md" disabled={full} onClick={handleRegister}>
      {registerLabel}
    </Button>
  )

  return (
    <div className="pb-24 lg:pb-0">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors py-3 group"
          >
            <ChevronLeftIcon className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            Creator Opportunities
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div
        className="relative w-full bg-gray-900 overflow-hidden"
        style={{ height: 'clamp(220px, 40vw, 460px)' }}
      >
        <img
          src={opportunity.heroImage}
          alt={`${opportunity.title} at ${opportunity.partner}`}
          className="w-full h-full object-cover opacity-90 animate-fade-in"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-5 pt-12 max-w-6xl mx-auto animate-fade-up">
          <BadgeRow opportunity={opportunity} className="mb-3" />
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight mb-1">
            {opportunity.title}
          </h1>
          <p className="text-white/80 text-sm sm:text-base">{opportunity.partner}</p>
        </div>
      </div>

      {/* Meta strip */}
      <div className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <MapPinIcon className="text-gray-400" />
            {opportunity.location}
          </div>
          <SpotsMeta opportunity={opportunity} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-10 lg:items-start">
          {/* Main column */}
          <div className="flex flex-col gap-8">
            <Section title="About the Experience" delay={40}>
              <p className="text-sm text-gray-600 leading-relaxed">{opportunity.about}</p>
            </Section>

            {/* Mobile-only copies of the sidebar cards */}
            <div className="lg:hidden flex flex-col gap-4">
              <Section title="What You Receive" delay={80}>
                <div className="flex flex-col gap-2">
                  <PerkBox opportunity={opportunity} />
                  <CollabNote opportunity={opportunity} className="px-1" />
                </div>
              </Section>
              <Section title="Who This Is For" delay={100}>
                <AudienceList
                  rows={opportunity.audience}
                  className="bg-white rounded-xl border border-line px-4 py-3"
                />
              </Section>
            </div>

            <Section title="Content Deliverables" delay={120}>
              <div className="bg-white rounded-xl border border-line px-4 py-4 flex flex-col gap-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  In exchange for this experience, you agree to:
                </p>
                {opportunity.deliverables.map((d, i) => (
                  <Deliverable key={i} item={d} />
                ))}
              </div>
            </Section>

            {hasSessions && (
              <Section title="Choose a Session" delay={160}>
                <SessionPicker
                  sessions={opportunity.sessions}
                  selectedId={sessionId}
                  onSelect={(sid) => {
                    selectSession(opportunity.id, sid)
                    if (sid) setHint(0)
                  }}
                  showHint={hint > 0 && !session}
                  hintKey={hint}
                />
              </Section>
            )}

            <Section title="Location" delay={200}>
              <div className="bg-white rounded-xl border border-line px-4 py-3.5 flex items-start gap-3">
                <div className="mt-0.5">
                  <MapPinIcon className="text-brand" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{opportunity.partner}</p>
                  <p className="text-sm text-gray-500">{opportunity.address}</p>
                </div>
              </div>
            </Section>

            <div className="hidden lg:block">{registerButton}</div>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col gap-5 sticky top-24 animate-fade-up" style={{ animationDelay: '120ms' }}>
            <div className="bg-white rounded-2xl border border-line p-5 flex flex-col gap-4">
              <SectionTitle small>What You Receive</SectionTitle>
              <PerkBox opportunity={opportunity} compact />
              <CollabNote opportunity={opportunity} />
            </div>

            <div className="bg-white rounded-2xl border border-line p-5 flex flex-col gap-3">
              <SectionTitle small>Who This Is For</SectionTitle>
              <AudienceList rows={opportunity.audience} />
            </div>

            <div className="bg-white rounded-2xl border border-line p-5 flex flex-col gap-3">
              {full ? (
                <p className="text-sm text-gray-400">
                  All spots for this opportunity have been taken.
                </p>
              ) : session ? (
                <div
                  key={session.id}
                  className="bg-brand-50 rounded-xl px-3 py-2.5 text-sm text-brand font-medium animate-fade-up"
                >
                  {formatLongDate(session.date)}
                  <br />
                  <span className="font-normal text-gray-500">{formatTimeRange(session)}</span>
                </div>
              ) : hasSessions ? (
                <p className="text-sm text-gray-400">Select a session on the left to continue.</p>
              ) : (
                <p className="text-sm text-gray-400">
                  Apply by {formatShortDate(opportunity.deadline)}. No session booking needed.
                </p>
              )}
              {registerButton}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-line px-4 py-3 z-50 animate-slide-up">
        {session && (
          <p className="text-xs text-brand font-medium mb-2 truncate">
            {formatLongDate(session.date)} · {formatTimeRange(session)}
          </p>
        )}
        {registerButton}
      </div>
    </div>
  )
}
