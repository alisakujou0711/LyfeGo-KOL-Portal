import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OpportunityForm, { blankForm } from '../javascript/components/OpportunityForm'
import { createOpportunity } from '../javascript/lib/api'

// Figma "New Opportunity": a blank form. Saving it (as a Draft, or published
// as Live) creates the Opportunity and returns to the list.
export default function CreateOpportunityPage() {
  const navigate = useNavigate()
  const [initial] = useState(blankForm)

  async function save(request) {
    await createOpportunity(request)
    navigate('/admin/opportunities')
  }

  return (
    <OpportunityForm
      initial={initial}
      crumb="New Opportunity"
      onCheck={(request) => createOpportunity(request, { check: true })}
      onSave={save}
    />
  )
}
