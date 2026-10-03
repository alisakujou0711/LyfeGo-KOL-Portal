import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDayMonthYear, formatPayment, formatSchedule } from '../../creator-portal/javascript/lib/format'
import { PageHeader } from '../javascript/components/AdminLayout'
import { StatusBadge, TagBadge } from '../javascript/components/AdminBadges'
import { FilterSelect, ListFooter, LoadError, MessageRow, SearchField } from '../javascript/components/AdminControls'
import ConfirmDialog from '../javascript/components/ConfirmDialog'
import { CONFIRM_CLOSE, CONFIRM_PUBLISH } from '../javascript/components/OpportunityForm'
import RowMenu from '../javascript/components/RowMenu'
import { useApiQuery } from '../javascript/hooks/useApiQuery'
import {
  ApiError,
  closeOpportunity,
  deleteOpportunity,
  duplicateOpportunity,
  listOpportunities,
  publishOpportunity,
} from '../javascript/lib/api'

const NO_FILTERS = { search: '', status: '', category: '', compensation: '', collaborationType: '' }

// Each filter's label, "all" option and options as [value, label], in the Figma's order.
const FILTERS = [
  { name: 'status', label: 'Status', all: 'All statuses', options: ['Live', 'Draft', 'Closed'] },
  { name: 'category', label: 'Category', all: 'All categories', options: ['Sport', 'Lifestyle'] },
  { name: 'compensation', label: 'Compensation', all: 'All compensation', options: ['Paid', 'Barter'] },
  {
    name: 'collaborationType',
    label: 'Collab type',
    all: 'All collab types',
    options: ['One-off', 'Ongoing', ['One-off or Ongoing', 'One-off or ongoing']],
  },
]

const SUMMARY = [
  ['total', 'Total'],
  ['live', 'Live'],
  ['draft', 'Draft'],
  ['closed', 'Closed'],
  ['applications', 'Applications'],
]

// The last, unnamed column holds each row's menu.
const COLUMNS = ['Opportunity', 'Category', 'Compensation', 'Collab Type', 'Schedule', 'Applications', 'Status', 'Last Updated', '']

// Each row-menu action's call, the verb a failure message uses, and the
// pop-up that asks first (FS-ADM-OPP-011, -012; Delete is our choice, as it
// can't be undone). Reopen runs the Live checks before asking.
const ACTIONS = {
  duplicate: { call: duplicateOpportunity, verb: 'duplicate' },
  close: { call: closeOpportunity, verb: 'close', confirm: CONFIRM_CLOSE },
  reopen: { call: publishOpportunity, verb: 'reopen', confirm: CONFIRM_PUBLISH, check: true },
  delete: {
    call: deleteOpportunity,
    verb: 'delete',
    confirm: { title: 'Delete this draft?', body: "This can't be undone.", confirmLabel: 'Delete Draft', danger: true },
  },
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function Summary({ counts }) {
  return (
    <ul aria-label="Summary" className="grid grid-cols-5 gap-3">
      {SUMMARY.map(([key, label]) => (
        <li key={key} className="bg-white rounded-xl border border-line px-5 py-4 flex flex-col gap-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`font-display text-2xl font-bold ${key === 'applications' ? 'text-brand' : 'text-gray-900'}`}>
            {counts ? counts[key] : '–'}
          </p>
        </li>
      ))}
    </ul>
  )
}

function FilterBar({ filters, onChange }) {
  return (
    <div className="px-5 py-4 border-b border-line flex items-center gap-3 flex-wrap">
      <SearchField
        label="Search opportunities or partners"
        placeholder="Search opportunities or partners..."
        value={filters.search}
        onChange={(search) => onChange({ search })}
      />
      {FILTERS.map(({ name, ...filter }) => (
        <FilterSelect key={name} {...filter} value={filters[name]} onChange={(value) => onChange({ [name]: value })} />
      ))}
    </div>
  )
}

function OpportunityRow({ opportunity, onAction }) {
  const compensationText =
    // "S$150 · Per post" (our choice, to_ask.md A2)
    opportunity.compensationType === 'Paid' ? formatPayment(opportunity.payment) : opportunity.whatCreatorReceives
  const schedule = opportunity.schedule ? formatSchedule(opportunity.schedule) : ''

  return (
    <tr className="hover:bg-surface-soft transition-colors">
      <td className="pl-5 pr-4 py-3.5">
        <div className="flex items-center gap-3">
          {/* Without a cover image, the plain grey square shows instead. */}
          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-100">
            {opportunity.heroImage && (
              <img src={opportunity.heroImage} alt="" loading="lazy" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-snug whitespace-nowrap max-w-[180px] truncate" title={opportunity.title}>
              {opportunity.title}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{opportunity.partner}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <TagBadge label={opportunity.category} />
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-0.5 items-start">
          <TagBadge label={opportunity.compensationType} />
          {compensationText && (
            <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap max-w-[120px] truncate" title={compensationText}>
              {compensationText}
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">{opportunity.collaborationType}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-gray-600 max-w-[130px]">
        <span className="block truncate" title={schedule || undefined}>
          {schedule}
        </span>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <Link
          to={`/admin/applications?opportunityId=${encodeURIComponent(opportunity.id)}`}
          aria-label={`${opportunity.applicationsCount} received`}
          className="inline-flex items-center gap-1 text-brand font-semibold hover:underline"
        >
          {opportunity.applicationsCount}
          <span className="text-xs font-normal text-gray-400">received</span>
        </Link>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <StatusBadge status={opportunity.publishingStatus} />
        {/* Derived, not a status: it's still Live, just not on Discover (FS-ADM-SES-020, LST-004). */}
        {opportunity.publishingStatus === 'Live' && opportunity.availability !== 'open' && (
          <p className="mt-1 text-[11px] text-gray-400">No available sessions</p>
        )}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-400">
        {formatDayMonthYear(opportunity.lastUpdated)}
      </td>
      <td className="pl-2 pr-4 py-3.5">
        <RowMenu opportunity={opportunity} onAction={(action) => onAction(opportunity, action)} />
      </td>
    </tr>
  )
}

// The Live checks' errors from a refused Reopen, or null for any other failure.
const liveCheckErrors = (error) =>
  error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length > 0 ? error.fieldErrors : null

// The Admin Opportunities list (Figma "Creator Opportunities"): summary counts,
// search and filters, all worked out by the API, and a menu on each row.
// Duplicate happens straight away; Close, Reopen and Delete ask first. Each
// reloads the list. A Reopen the Live checks refuse opens the edit page with
// the errors instead, with Live chosen (to_ask.md A8).
export default function OpportunitiesPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState(NO_FILTERS)
  const [actionError, setActionError] = useState('')
  // The pop-up asking about an action: { opportunity, action }, or null.
  const [asking, setAsking] = useState(null)
  const { status, data: list, reload } = useApiQuery(listOpportunities, filters)
  const hasFilters = Object.values(filters).some((value) => value.trim())
  const updateFilters = (change) => setFilters((current) => ({ ...current, ...change }))

  const editWithErrors = (opportunity, publishErrors) =>
    navigate(`/admin/edit-opportunity/${encodeURIComponent(opportunity.id)}`, { state: { publishErrors } })

  const unreachable = (opportunity, action) =>
    `Couldn't ${ACTIONS[action].verb} ${opportunity.title}. Check your connection and try again.`
  const failure = (opportunity, action, error) =>
    error instanceof ApiError && error.status < 500 ? error.message : unreachable(opportunity, action)

  async function runAction(opportunity, action) {
    const { call, confirm, check } = ACTIONS[action]
    setActionError('')
    try {
      if (check) await call(opportunity.id, { check: true })
    } catch (error) {
      const errors = liveCheckErrors(error)
      if (errors) return editWithErrors(opportunity, errors)
      setActionError(failure(opportunity, action, error))
      return reload()
    }
    if (confirm) return setAsking({ opportunity, action })
    try {
      await call(opportunity.id)
    } catch (error) {
      setActionError(failure(opportunity, action, error))
    }
    reload()
  }

  // The pop-up's confirm: a failure shows inside it, and the list reloads
  // behind it to show what changed; a checked action's Live checks failing
  // after all (Reopen) open the edit page instead.
  async function confirmAction() {
    const { opportunity, action } = asking
    try {
      await ACTIONS[action].call(opportunity.id)
    } catch (error) {
      const errors = ACTIONS[action].check && liveCheckErrors(error)
      if (!errors) {
        reload()
        throw error
      }
      setAsking(null)
      return editWithErrors(opportunity, errors)
    }
    setAsking(null)
    reload()
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Creator Opportunities" subtitle="Manage and track all collaboration opportunities" />
        <Link
          to="/admin/create-opportunity"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark active:scale-[0.98] transition-all"
        >
          <PlusIcon />
          Create Opportunity
        </Link>
      </div>

      <Summary counts={list?.counts} />
      {asking && (
        <ConfirmDialog
          {...ACTIONS[asking.action].confirm}
          failedMessage={unreachable(asking.opportunity, asking.action)}
          onConfirm={confirmAction}
          onCancel={() => setAsking(null)}
        />
      )}

      <div className="bg-white rounded-2xl border border-line overflow-hidden">
        <FilterBar filters={filters} onChange={updateFilters} />
        {actionError && (
          <p role="alert" className="px-5 py-2.5 border-b border-red-100 bg-red-50 text-sm text-red-600">
            {actionError}
          </p>
        )}

        {status === 'error' ? (
          <LoadError message="Couldn't load opportunities. Check your connection." onRetry={reload} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-busy={status === 'loading'}>
                <thead>
                  <tr className="border-b border-line bg-surface-soft">
                    {COLUMNS.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap first:pl-5"
                      >
                        {column || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-faint">
                  {list === null ? (
                    <MessageRow columns={COLUMNS.length}>Loading opportunities…</MessageRow>
                  ) : list.opportunities.length === 0 ? (
                    <MessageRow columns={COLUMNS.length}>No opportunities match the current filters</MessageRow>
                  ) : (
                    list.opportunities.map((opportunity) => (
                      <OpportunityRow key={opportunity.id} opportunity={opportunity} onAction={runAction} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {list && (
              <ListFooter
                shown={list.opportunities.length}
                total={list.counts.total}
                noun="opportunities"
                onClear={hasFilters ? () => setFilters(NO_FILTERS) : undefined}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
