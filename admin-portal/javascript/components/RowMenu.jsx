import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

// The Opportunities list's "⋯" row menu, with the actions FS §4.4 gives each
// Publishing Status (to_ask.md A7, A8), in the Figma's look. It opens over the
// page, below the button or above it when there's no room, so the table never
// clips it.

// The last item: the Publishing Status change, or Delete Draft for a Draft
// that can be deleted. Close and Delete are red.
const LAST_ACTION = {
  Draft: ['delete', 'Delete Draft'],
  Live: ['close', 'Close Opportunity'],
  Closed: ['reopen', 'Reopen Opportunity'],
}
const DANGER = new Set(['close', 'delete'])

const WIDTH = 160
const GAP = 4
const MARGIN = 8

const ITEM = 'block w-full text-left px-3.5 py-2 text-sm transition-colors focus:outline-none'
const ITEM_PLAIN = `${ITEM} text-gray-700 hover:bg-gray-50 focus:bg-gray-50`
const ITEM_DANGER = `${ITEM} text-red-600 hover:bg-red-50 focus:bg-red-50`

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="3.5" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

// `onAction(action)` runs 'duplicate', 'close', 'reopen' or 'delete'; the page
// asks first where the FS says so.
export default function RowMenu({ opportunity, onAction }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const label = `Actions for ${opportunity.title}`
  const id = encodeURIComponent(opportunity.id)
  const draft = opportunity.publishingStatus === 'Draft'
  const [lastAction, lastLabel] =
    draft && !opportunity.canDelete ? [] : LAST_ACTION[opportunity.publishingStatus] ?? []

  const close = ({ refocus = false } = {}) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  // Place it under the button's right edge, or above when it would run off the
  // bottom. Set before the browser paints, so it never shows out of place, and
  // never hidden, so its first item can take focus straight after.
  useLayoutEffect(() => {
    if (!open) return
    const button = buttonRef.current.getBoundingClientRect()
    const menu = menuRef.current
    const below = button.bottom + GAP
    const top =
      below + menu.offsetHeight > window.innerHeight - MARGIN ? Math.max(MARGIN, button.top - GAP - menu.offsetHeight) : below
    menu.style.top = `${top}px`
    menu.style.left = `${Math.max(MARGIN, button.right - WIDTH)}px`
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    menuRef.current.querySelector('[role="menuitem"]')?.focus()
    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) close()
    }
    const closeNow = () => close()
    document.addEventListener('mousedown', closeOutside)
    window.addEventListener('scroll', closeNow, true)
    window.addEventListener('resize', closeNow)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      window.removeEventListener('scroll', closeNow, true)
      window.removeEventListener('resize', closeNow)
    }
  }, [open])

  function handleKeyDown(event) {
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    const moves = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }
    if (event.key in moves) {
      event.preventDefault()
      items[moves[event.key]].focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close({ refocus: true })
    } else if (event.key === 'Tab') {
      // Back on the button first, so Tab carries on from the row instead of from the closed menu.
      close({ refocus: true })
    }
  }

  const act = (action) => {
    close()
    onAction(action)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${
          open ? 'text-gray-700 bg-gray-100' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        <DotsIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={handleKeyDown}
            style={{ position: 'fixed', width: WIDTH }}
            className="z-50 bg-white rounded-xl border border-line-strong shadow-lg py-1 overflow-hidden"
          >
            <Link role="menuitem" tabIndex={-1} to={`/admin/edit-opportunity/${id}`} onClick={() => close()} className={ITEM_PLAIN}>
              Edit
            </Link>
            {/* A Draft has no Applications to view (FS §4.4). */}
            {!draft && (
              <Link
                role="menuitem"
                tabIndex={-1}
                to={`/admin/applications?opportunityId=${id}`}
                onClick={() => close()}
                className={ITEM_PLAIN}
              >
                View Applications
              </Link>
            )}
            {/* The creator page; a signed-in Admin sees Drafts there too (to_ask.md D2). */}
            <a
              role="menuitem"
              tabIndex={-1}
              href={`/opportunity/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => close()}
              className={ITEM_PLAIN}
            >
              Preview Listing
            </a>
            <div role="separator" className="border-t border-line-soft my-1" />
            <button role="menuitem" tabIndex={-1} type="button" onClick={() => act('duplicate')} className={ITEM_PLAIN}>
              Duplicate
            </button>
            {lastAction && (
              <button
                role="menuitem"
                tabIndex={-1}
                type="button"
                onClick={() => act(lastAction)}
                className={DANGER.has(lastAction) ? ITEM_DANGER : ITEM_PLAIN}
              >
                {lastLabel}
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
