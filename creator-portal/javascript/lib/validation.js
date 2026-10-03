const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Loose international phone check: optional +, then 8–15 digits ignoring
// spaces, dashes and parentheses.
const PHONE_RE = /^\+?[\d\s()-]{8,20}$/

export const EMPTY_FORM = {
  fullName: '',
  instagram: '',
  tiktok: '',
  email: '',
  phone: '',
  note: '',
}

export function stripHandle(value) {
  return value.trim().replace(/^@+/, '')
}

export function validateRegistration(values) {
  const errors = {}

  if (!values.fullName.trim()) errors.fullName = 'Full name is required'

  if (!stripHandle(values.instagram)) errors.instagram = 'Instagram handle is required'
  else if (/\s/.test(stripHandle(values.instagram)))
    errors.instagram = 'Handles cannot contain spaces'

  if (stripHandle(values.tiktok) && /\s/.test(stripHandle(values.tiktok)))
    errors.tiktok = 'Handles cannot contain spaces'

  if (!values.email.trim()) errors.email = 'Email address is required'
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Please enter a valid email address'

  const digits = values.phone.replace(/\D/g, '')
  if (!values.phone.trim()) errors.phone = 'Mobile number is required'
  else if (!PHONE_RE.test(values.phone.trim()) || digits.length < 8)
    errors.phone = 'Please enter a valid mobile number'

  return errors
}
