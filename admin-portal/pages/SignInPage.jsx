import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../creator-portal/javascript/components/Button'
import FormField from '../../creator-portal/javascript/components/FormField'
import { AdminLogo } from '../javascript/components/AdminLayout'
import { ApiError, signIn } from '../javascript/lib/api'

const HOME = '/admin/opportunities'

// Only ever return to an Admin page: `next` comes from the URL, so anything
// else (another site, the sign-in page itself) goes to Opportunities.
function destination(next) {
  const isAdminPage = next === '/admin' || next?.startsWith('/admin/') || next?.startsWith('/admin?')
  return isAdminPage && !next.startsWith('/admin/login') ? next : HOME
}

// There is no Figma for this page (to_ask.md D1): the portal's own card and form styles.
export default function SignInPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(destination(searchParams.get('next')), { replace: true })
    } catch (failure) {
      setSubmitting(false)
      // A 401's message is the server's one fixed text, which never says whether the email exists.
      setError(
        failure instanceof ApiError && failure.status === 401
          ? failure.message
          : "We couldn't sign you in. Check your connection and try again.",
      )
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex justify-center mb-6">
          <AdminLogo />
        </div>
        <div className="bg-white rounded-2xl border border-line p-7 shadow-sm">
          <h1 className="font-display text-xl font-bold text-gray-900">Sign in to the Admin Portal</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">For LyfeGo staff only.</p>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <FormField
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <FormField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting} className="mt-1">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
