export { formatSessionLine } from '../../../creator-portal/javascript/lib/format'

// Handles are stored without their @.
export function formatHandle(handle) {
  return `@${handle}`
}
