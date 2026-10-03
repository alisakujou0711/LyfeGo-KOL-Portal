import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatDayMonthYear } from '../../creator-portal/javascript/lib/format'
import { PageHeader } from '../javascript/components/AdminLayout'
import { StatusBadge } from '../javascript/components/AdminBadges'
import { FilterSelect, ListFooter, LoadError, MessageRow, SearchField } from '../javascript/components/AdminControls'
import ApplicationPanel from '../javascript/components/ApplicationPanel'
import { useApiQuery } from '../javascript/hooks/useApiQuery'
import { APPLICATION_STATUSES, listApplications } from '../javascript/lib/api'
import { formatHandle, formatSessionLine } from '../javascript/lib/format'

// "Clear all filters" resets these; the status has its own "View all", as in the Figma.
const NO_FILTERS = { search: '', partner: '', category: '' }

// The count tabs as [status filter, label, counts key]. The tabs and the
// Status dropdown are one filter (to_ask.md D7).
const STATUS_TABS = [
  ['', 'All Applications', 'all'],
  ...APPLICATION_STATUSES.map((status) => [status, status, status.toLowerCase()]),
]

const COLUMNS = ['Creator', 'Opportunity', 'Partner', 'Session / Schedule', 'Handle', 'Date', 'Status', '']

function StatusTabs({ counts, value, onChange }) {
  return (
    <div role="group" aria-label="Application status" className="flex border-b border-line -mx-8 px-8 overflow-x-auto">
      {STATUS_TABS.map(([status, label, key]) => {
        const chosen = status === value
        return (
          <button
            key={key}
            type="button"
            aria-pressed={chosen}
            onClick={() => onChange(status)}
            className={`flex flex-col items-start gap-1 px-5 py-4 border-b-2 transition-colors ${
              chosen ? 'border-brand bg-white' : 'border-transparent hover:bg-gray-50'
            }`}
          >
            <span className={`font-display text-2xl font-bold ${chosen ? 'text-brand' : 'text-gray-900'}`}>
              {counts ? counts[key] : '–'}
            </span>
            <span className={`text-xs font-semibold uppercase tracking-wide ${chosen ? 'text-brand' : 'text-gray-500'}`}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FilterBar({ filters, opportunityId, status, options, onChange, onOpportunityChange, onStatusChange }) {
  return (
    <div className="px-5 py-4 border-b border-line flex items-center gap-3 flex-wrap">
      <SearchField
        label="Search by creator, handle, or opportunity"
        placeholder="Search by creator, handle, or opportunity…"
        value={filters.search}
        onChange={(search) => onChange({ search })}
      />
      <FilterSelect
        label="Opportunity"
        all="All opportunities"
        options={(options?.opportunities ?? []).map(({ id, title }) => [id, title])}
        value={opportunityId}
        onChange={onOpportunityChange}
      />
      <FilterSelect
        label="Partner"
        all="All partners"
        options={options?.partners ?? []}
        value={filters.partner}
        onChange={(partner) => onChange({ partner })}
      />
      <FilterSelect
        label="Status"
        all="All statuses"
        options={APPLICATION_STATUSES}
        value={status}
        onChange={onStatusChange}
      />
      <FilterSelect
        label="Category"
        all="All categories"
        options={['Sport', 'Lifestyle']}
        value={filters.category}
        onChange={(category) => onChange({ category })}
      />
    </div>
  )
}

function ApplicationRow({ application, isOpen, onToggle }) {
  const session = formatSessionLine(application.session)
  return (
    <tr
      onClick={onToggle}
      className={`cursor-pointer transition-colors ${isOpen ? 'bg-brand-50' : 'hover:bg-surface-soft'}`}
    >
      <td className="pl-5 pr-4 py-3.5">
        <p className="font-semibold text-gray-900 whitespace-nowrap">{application.fullName}</p>
        <p className="text-xs text-gray-400 mt-0.5">{application.email}</p>
      </td>
      <td className="px-4 py-3.5 max-w-[180px]">
        <p className="text-gray-800 font-medium truncate" title={application.opportunity.title}>
          {application.opportunity.title}
        </p>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">{application.opportunity.partner}</td>
      <td className="px-4 py-3.5 max-w-[200px]">
        <span className="text-xs text-gray-500 block truncate" title={session}>
          {session}
        </span>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="text-gray-600">{formatHandle(application.instagram)}</span>
        {application.tiktok && <span className="block text-xs text-gray-400 mt-0.5">+TikTok</span>}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-gray-400">{formatDayMonthYear(application.submittedOn)}</td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <StatusBadge status={application.status} />
      </td>
      <td className="pl-2 pr-4 py-3.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          className="text-xs font-medium text-brand hover:underline whitespace-nowrap"
        >
          {isOpen ? 'Close' : 'View'}
        </button>
      </td>
    </tr>
  )
}

// The Admin Applications list (Figma "Applications"): status counts that also
// filter, search and filters worked out by the API, and a side panel where the
// Admin sets the Application Status, corrects contact details and moves the
// Application to another Session. `?opportunityId=`
// sets the Opportunity filter, so links from the Opportunities list land
// pre-filtered. As in the Figma, "· View all" resets the status and "Clear all
// filters" resets everything else.
export default function ApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const opportunityId = searchParams.get('opportunityId') ?? ''
  const [filters, setFilters] = useState(NO_FILTERS)
  const [applicationStatus, setApplicationStatus] = useState('')
  const { status, data: list, reload } = useApiQuery(listApplications, {
    ...filters,
    opportunityId,
    status: applicationStatus,
  })
  const [open, setOpen] = useState(null) // { id, name } of the Application in the panel
  const closePanel = useCallback(() => setOpen(null), [])

  const hasFilters = opportunityId !== '' || Object.values(filters).some((value) => value.trim())
  const updateFilters = (change) => setFilters((current) => ({ ...current, ...change }))
  const setOpportunity = (id) => setSearchParams(id ? { opportunityId: id } : {}, { replace: true })
  const clearFilters = () => {
    setFilters(NO_FILTERS)
    setOpportunity('')
  }

  return (
    <div>
      <div className="px-8 pt-8">
        <div className="mb-5">
          <PageHeader title="Applications" subtitle="Creator registrations across all opportunities" />
        </div>
        <StatusTabs counts={list?.counts} value={applicationStatus} onChange={setApplicationStatus} />
      </div>

      <div className="p-8">
        <div className="bg-white rounded-2xl border border-line overflow-hidden">
          <FilterBar
            filters={filters}
            opportunityId={opportunityId}
            status={applicationStatus}
            options={list?.options}
            onChange={updateFilters}
            onOpportunityChange={setOpportunity}
            onStatusChange={setApplicationStatus}
          />

          {status === 'error' ? (
            <LoadError message="Couldn't load applications. Check your connection." onRetry={reload} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-busy={status === 'loading'}>
                  <thead>
                    <tr className="border-b border-line bg-surface-soft">
                      {COLUMNS.map((column, index) => (
                        <th
                          key={column || index}
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
                      <MessageRow columns={COLUMNS.length}>Loading applications…</MessageRow>
                    ) : list.applications.length === 0 ? (
                      <MessageRow columns={COLUMNS.length}>No applications match the current filters</MessageRow>
                    ) : (
                      list.applications.map((application) => (
                        <ApplicationRow
                          key={application.id}
                          application={application}
                          isOpen={open?.id === application.id}
                          onToggle={() =>
                            setOpen((current) =>
                              current?.id === application.id ? null : { id: application.id, name: application.fullName },
                            )
                          }
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {list && (
                <ListFooter
                  shown={list.applications.length}
                  total={list.counts.all}
                  noun="applications"
                  onClear={hasFilters ? clearFilters : undefined}
                >
                  {applicationStatus && (
                    <>
                      {' · '}
                      <button type="button" onClick={() => setApplicationStatus('')} className="text-brand hover:underline">
                        View all
                      </button>
                    </>
                  )}
                </ListFooter>
              )}
            </>
          )}
        </div>
      </div>

      {open && (
        <ApplicationPanel
          key={open.id}
          applicationId={open.id}
          name={open.name}
          onClose={closePanel}
          onSaved={reload}
        />
      )}
    </div>
  )
}
