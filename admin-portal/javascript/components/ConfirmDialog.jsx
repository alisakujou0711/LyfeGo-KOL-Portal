import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { messageOr } from '../lib/api'

// The "Are you sure?" pop-up (FS-ADM-OPP-004, -006, -008, -011, -012; to_ask.md
// C6). There's no Figma design, so it's our choice: a centred white card over a
// dimmed page, with a title, a line or two of text, Cancel and a brand-coloured
// confirm button, red when `danger` (Close, Delete).
//
// It keeps focus inside, starts on Cancel, and Escape or the backdrop cancels.
// `onConfirm()` may return a promise: the confirm button says "Saving…" until
// it settles, and a rejection shows inside the pop-up (FS-ADM-ERR-001/002),
// the API's message when it gave one, with focus back on the confirm button.
// While it saves, the disabled buttons can't hold focus, so the card does. The caller closes it, from `onCancel` or
// once `onConfirm` has done its work.

const FAILED = "Couldn't save. Check your connection and try again."

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  failedMessage = FAILED,
  onConfirm,
  onCancel,
}) {
  const titleId = useId()
  const bodyId = useId()
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const [state, setState] = useState({ saving: false, error: '' })
  const mounted = useRef(true)

  // Start on Cancel, and give focus back to where it was when it closes.
  useEffect(() => {
    mounted.current = true
    const before = document.activeElement
    cancelRef.current?.focus()
    return () => {
      mounted.current = false
      if (before instanceof HTMLElement && before.isConnected) before.focus()
    }
  }, [])

  const cancel = () => {
    if (!state.saving) onCancel()
  }

  async function confirm() {
    if (state.saving) return
    dialogRef.current.focus() // the buttons are about to be disabled
    setState({ saving: true, error: '' })
    try {
      await onConfirm()
      if (mounted.current) setState({ saving: false, error: '' })
    } catch (error) {
      if (!mounted.current) return
      setState({ saving: false, error: messageOr(error, failedMessage) })
    }
  }

  // Back on the confirm button once a failed save shows its error, so Tab and
  // Escape work inside the pop-up again.
  useEffect(() => {
    if (state.error) confirmRef.current?.focus()
  }, [state.error])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    } else if (event.key === 'Tab') {
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return event.preventDefault()
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div aria-hidden="true" data-testid="dialog-backdrop" onClick={cancel} className="absolute inset-0 bg-gray-900/40" />
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-sm bg-white rounded-2xl border border-line shadow-xl p-6 flex flex-col gap-4 focus:outline-none"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id={titleId} className="font-display text-base font-bold text-gray-900">
            {title}
          </h2>
          <p id={bodyId} className="text-sm text-gray-500 leading-relaxed">
            {body}
          </p>
        </div>
        {state.error && (
          <p role="alert" className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-600">
            {state.error}
          </p>
        )}
        <div className="flex justify-end gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={cancel}
            disabled={state.saving}
            className="px-4 py-2 rounded-xl border border-line-strong text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={confirm}
            disabled={state.saving}
            className={`px-4 py-2 rounded-xl text-white text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-wait ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-dark'
            }`}
          >
            {state.saving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
