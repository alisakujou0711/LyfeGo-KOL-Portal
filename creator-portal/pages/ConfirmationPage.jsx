import { Link, Navigate, useParams } from 'react-router-dom'
import OpportunitySummary from '../javascript/components/OpportunitySummary'
import { useRegistration } from '../javascript/context/RegistrationContext'
import { useOpportunity } from '../javascript/hooks/useOpportunity'
import NotFoundPage from './NotFoundPage'

const NEXT_STEPS = [
  'LyfeGo reviews your registration and confirms your participation.',
  "You'll be contacted via the email or WhatsApp number you provided once a decision has been made.",
  "If approved, you'll receive the participation details, content brief and any next steps needed before your session.",
]

function SuccessMark() {
  return (
    <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center animate-pop-in">
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <path
          d="M6 15l6.5 6.5L24 9"
          stroke="#F05A28"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="40"
          className="animate-draw-check"
        />
      </svg>
    </div>
  )
}

export default function ConfirmationPage() {
  const { id } = useParams()
  const { status, opportunity } = useOpportunity(id)
  const { submitted } = useRegistration()

  // Only reachable right after a successful submit for this opportunity.
  if (!submitted || submitted.opportunityId !== id) {
    return <Navigate to={`/opportunity/${id}`} replace />
  }
  if (status === 'loading') return null
  if (status === 'notFound') return <NotFoundPage />

  // The Session as the creator chose it; it may have filled since.
  const session = submitted.session
  const firstName = submitted.fullName.split(/\s+/)[0]

  return (
    <div className="max-w-lg mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6">
      <div className="text-center flex flex-col items-center gap-4">
        <SuccessMark />
        <div className="flex flex-col gap-1.5 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <h1 className="font-display text-2xl font-bold text-gray-900">Registration received</h1>
          <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
            Thanks, {firstName}, for registering for this opportunity. LyfeGo will review your
            registration and contact you once your participation is confirmed. Submitting does not
            guarantee your place.
          </p>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: '250ms' }}>
        {opportunity && <OpportunitySummary opportunity={opportunity} session={session} />}
      </div>

      <div
        className="bg-white rounded-2xl border border-line p-4 flex flex-col gap-3.5 animate-fade-up"
        style={{ animationDelay: '330ms' }}
      >
        <h3 className="font-display text-sm font-semibold text-gray-900">What happens next</h3>
        <ol className="flex flex-col gap-3">
          {NEXT_STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-gray-600 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </div>

      <Link
        to="/"
        className="w-full py-3.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark active:scale-[0.985] transition-all text-center animate-fade-up focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
        style={{ animationDelay: '400ms' }}
      >
        Browse More Opportunities
      </Link>
    </div>
  )
}
