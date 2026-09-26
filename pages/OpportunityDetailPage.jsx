import { useId, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BadgeRow } from '../javascript/components/Badge'
import Button from '../javascript/components/Button'
import { CheckIcon, ChevronLeftIcon, GiftIcon, MapPinIcon } from '../javascript/components/Icons'
import OpportunityLoadError from '../javascript/components/OpportunityLoadError'
import SessionPicker from '../javascript/components/SessionPicker'
import { useRegistration } from '../javascript/context/RegistrationContext'
import { availableSession, useOpportunity } from '../javascript/hooks/useOpportunity'
import {
  compensationLabel,
  formatAmount,
  formatBasis,
  formatLongDate,
  formatTimeRange,
  visibleExperienceLevels,
} from '../javascript/lib/format'
import NotFoundPage from './NotFoundPage'

// Flexible deliverables are subject to later agreement (FS-ADM-FLD-008).
const DELIVERABLES_INTRO = {
  Fixed: { heading: 'For this collaboration, the partner is looking for:' },
  Flexible: {
    heading: 'Suggested deliverables:',
    followUp: 'Final deliverables will be discussed and agreed with the partner.',
  },
}

// An @handle not preceded by a word character (so emails don't match) and
// not ending in a full stop.
const HANDLE_RE = /(?<![\w@])(@[A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?)/

function Section({ title, children, delay = 0 }) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 id={id} className="font-display text-base font-semibold text-gray-900">
        {title}
      </h2>
      {children}
    </section>
  )
}

function SidebarCard({ title, children, gap = 'gap-3' }) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={`bg-white rounded-2xl border border-line p-5 flex flex-col ${gap}`}
    >
      <h3 id={id} className="font-display text-sm font-semibold text-gray-900">
        {title}
      </h3>
      {children}
    </section>
  )
}

function ReceivedItem({ children }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-gray-800 font-medium">
      <GiftIcon className="text-gray-400" />
      <span>{children}</span>
    </div>
  )
}

// The BARTER / PAID / PAID + PERK label, then what the creator receives.
function WhatYouReceive({ opportunity }) {
  const { payment } = opportunity
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start items-center px-2.5 py-1 rounded-lg bg-surface border border-line">
        <span className="text-[10px] font-bold tracking-widest uppercase text-brand">
          {compensationLabel(opportunity)}
        </span>
      </div>
      {payment ? (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-base font-bold text-gray-900">
              {formatAmount(payment)}
            </span>
            <p className="text-sm text-gray-400">{formatBasis(payment)}</p>
          </div>
          {payment.note && <ReceivedItem>{payment.note}</ReceivedItem>}
        </>
      ) : (
        <ReceivedItem>{opportunity.whatCreatorReceives}</ReceivedItem>
      )}
    </div>
  )
}

// A Level chip row (unless Not Applicable), then the Additional Information rows.
function WhoThisIsFor({ opportunity }) {
  const levels = visibleExperienceLevels(opportunity)
  return (
    <div className="flex flex-col gap-2.5">
      {levels.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 w-32 shrink-0">Level</span>
          <div className="flex flex-wrap gap-1.5">
            {levels.map((level) => (
              <span
                key={level}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand border border-brand/20"
              >
                {level}
              </span>
            ))}
          </div>
        </div>
      )}
      {opportunity.additionalInfo.map((row, i) => (
        <div key={`${row.label}-${i}`} className="contents">
          {(i > 0 || levels.length > 0) && <div className="border-t border-line-soft" />}
          <div className="flex items-start gap-3">
            <span className="text-sm text-gray-400 w-32 shrink-0">{row.label}</span>
            <span className="text-sm text-gray-700">{row.value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Deliverable({ text }) {
  const parts = text.split(HANDLE_RE)
  return (
    <div className="flex items-start gap-3 text-sm text-gray-600">
      <span className="mt-0.5 w-5 h-5 rounded-full bg-brand-100 text-brand flex items-center justify-center shrink-0">
        <CheckIcon />
      </span>
      <span>
        {/* split() with a capture group puts the handles at odd indexes */}
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <strong key={i} className="font-medium text-gray-800">
              {part}
            </strong>
          ) : (
            part
          ),
        )}
      </span>
    </div>
  )
}

function AvailabilityMeta({ opportunity }) {
  const { availability, limitedSpots } = opportunity
  if (availability !== 'open') {
    return (
      <div className="flex items-center gap-1.5 text-sm font-medium text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        {availability === 'fully_booked' ? 'Fully booked' : 'Closed'}
      </div>
    )
  }
  if (!limitedSpots) return null
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400" />
      Limited spots
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading opportunity" className="animate-pulse">
      <div className="w-full bg-gray-100" style={{ height: 'clamp(220px, 40vw, 460px)' }} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        <div className="h-6 w-1/2 rounded bg-gray-100" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
        <div className="h-24 rounded-xl bg-gray-100" />
      </div>
    </div>
  )
}

export default function OpportunityDetailPage() {
  const { id } = useParams()
  const { status, opportunity, retry } = useOpportunity(id)

  if (status === 'loading') return <DetailSkeleton />
  if (status === 'error') return <OpportunityLoadError onRetry={retry} />
  if (status === 'notFound') return <NotFoundPage />
  return <OpportunityDetail opportunity={opportunity} />
}

function OpportunityDetail({ opportunity }) {
  const navigate = useNavigate()
  // Set when the Register page sent the creator back, e.g. their Session filled.
  const notice = useLocation().state?.notice
  const { selectedSessionId, selectSession } = useRegistration()
  const [hint, setHint] = useState(0)

  const open = opportunity.availability === 'open'
  const intro = DELIVERABLES_INTRO[opportunity.deliverableType]
  const session = availableSession(opportunity, selectedSessionId(opportunity.id))

  const handleRegister = () => {
    if (!open) return
    if (!session) {
      setHint((n) => n + 1)
      document.getElementById('choose-session')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    navigate(`/opportunity/${opportunity.id}/register`)
  }

  const registerButton = (
    <Button size="md" disabled={!open} onClick={handleRegister}>
      {session ? 'Register for Opportunity →' : 'Register for Opportunity'}
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
          <BadgeRow
            category={opportunity.category}
            compensationType={opportunity.compensationType}
            className="mb-3"
          />
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
            {opportunity.area}
          </div>
          <AvailabilityMeta opportunity={opportunity} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {notice && (
          <p
            role="status"
            className="mb-6 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 animate-fade-up"
          >
            {notice}
          </p>
        )}
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-10 lg:items-start">
          {/* Main column */}
          <div className="flex flex-col gap-8">
            <Section title="About the Experience" delay={40}>
              <p className="text-sm text-gray-600 leading-relaxed">{opportunity.aboutExperience}</p>
            </Section>

            {/* Mobile-only copies of the sidebar cards */}
            <div className="lg:hidden flex flex-col gap-4">
              <Section title="What You Receive" delay={80}>
                <div className="bg-white rounded-xl border border-line px-4 py-3">
                  <WhatYouReceive opportunity={opportunity} />
                </div>
              </Section>
              <Section title="Who This Is For" delay={100}>
                <div className="bg-white rounded-xl border border-line px-4 py-3">
                  <WhoThisIsFor opportunity={opportunity} />
                </div>
              </Section>
            </div>

            <Section title="Content Deliverables" delay={120}>
              <div className="bg-white rounded-xl border border-line px-4 py-4 flex flex-col gap-3">
                {opportunity.deliverableNote && (
                  <p className="text-sm text-gray-600 leading-relaxed">{opportunity.deliverableNote}</p>
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {intro.heading}
                  </p>
                  {intro.followUp && <p className="text-xs text-gray-400">{intro.followUp}</p>}
                </div>
                {opportunity.deliverables.map((text, i) => (
                  <Deliverable key={i} text={text} />
                ))}
              </div>
            </Section>

            {(opportunity.weeklyClasses.length > 0 || opportunity.sessions.length > 0) && (
              <Section title="Choose a Session" delay={160}>
                <SessionPicker
                  weeklyClasses={opportunity.weeklyClasses}
                  sessions={opportunity.sessions}
                  selectedId={session?.id ?? null}
                  onSelect={(sid) => {
                    selectSession(opportunity.id, sid)
                    if (sid) setHint(0)
                  }}
                  showHint={hint > 0 && !session}
                  hintKey={hint}
                />
              </Section>
            )}

            {/* Only physical-attendance Opportunities have a venue; the Area is under the title either way. */}
            {(opportunity.venueName || opportunity.fullAddress) && (
              <Section title="Location" delay={200}>
                <div className="bg-white rounded-xl border border-line px-4 py-3.5 flex items-start gap-3">
                  <div className="mt-0.5">
                    <MapPinIcon className="text-brand" />
                  </div>
                  <div>
                    {opportunity.venueName && (
                      <p className="text-sm font-semibold text-gray-900">{opportunity.venueName}</p>
                    )}
                    {opportunity.fullAddress && (
                      <p className="text-sm text-gray-500">{opportunity.fullAddress}</p>
                    )}
                    <p className="text-sm text-gray-400">{opportunity.area}</p>
                  </div>
                </div>
              </Section>
            )}

            <div className="hidden lg:block">{registerButton}</div>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col gap-5 sticky top-24 animate-fade-up" style={{ animationDelay: '120ms' }}>
            <SidebarCard title="What You Receive" gap="gap-4">
              <WhatYouReceive opportunity={opportunity} />
            </SidebarCard>

            <SidebarCard title="Who This Is For">
              <WhoThisIsFor opportunity={opportunity} />
            </SidebarCard>

            <div className="bg-white rounded-2xl border border-line p-5 flex flex-col gap-3">
              {opportunity.availability === 'fully_booked' ? (
                <p className="text-sm text-gray-400">Every session of this opportunity is fully booked.</p>
              ) : opportunity.availability === 'closed' ? (
                <p className="text-sm text-gray-400">This opportunity is no longer accepting registrations.</p>
              ) : session ? (
                <div
                  key={session.id}
                  className="bg-brand-50 rounded-xl px-3 py-2.5 text-sm text-brand font-medium animate-fade-up"
                >
                  {formatLongDate(session.date)}
                  <br />
                  <span className="font-normal text-gray-500">{formatTimeRange(session)}</span>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Select a session on the left to continue.</p>
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
