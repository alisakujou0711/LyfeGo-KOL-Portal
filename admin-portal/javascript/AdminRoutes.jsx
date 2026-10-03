import { Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'
import RequireAdmin from './components/RequireAdmin'
import ApplicationsPage from '../pages/ApplicationsPage'
import { CreatorsPage, OverviewPage } from '../pages/ComingSoonPage'
import CreateOpportunityPage from '../pages/CreateOpportunityPage'
import EditOpportunityPage from '../pages/EditOpportunityPage'
import OpportunitiesPage from '../pages/OpportunitiesPage'
import SignInPage from '../pages/SignInPage'

// Everything under /admin, mounted by the app's router
// (creator-portal/javascript/App.jsx) at `admin/*`, so paths here are relative.
export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<SignInPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/opportunities" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="opportunities" element={<OpportunitiesPage />} />
          <Route path="create-opportunity" element={<CreateOpportunityPage />} />
          <Route path="edit-opportunity/:id" element={<EditOpportunityPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="creators" element={<CreatorsPage />} />
          <Route path="*" element={<Navigate to="/admin/opportunities" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
