import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AdminRoutes from '../../admin-portal/javascript/AdminRoutes'
import Layout from './components/Layout'
import { RegistrationProvider } from './context/RegistrationContext'
import ConfirmationPage from '../pages/ConfirmationPage'
import NotFoundPage from '../pages/NotFoundPage'
import OpportunitiesPage from '../pages/OpportunitiesPage'
import OpportunityDetailPage from '../pages/OpportunityDetailPage'
import RegisterPage from '../pages/RegisterPage'

// Everything below the router, so tests can mount the same routes inside a
// MemoryRouter (see javascript/test/renderRoute.jsx). The Admin Portal lives
// under /admin with its own layout; this is the only place the Creator Portal
// refers to admin-portal/.
export function AppRoutes() {
  return (
    <RegistrationProvider>
      <Routes>
        <Route path="admin/*" element={<AdminRoutes />} />
        <Route element={<Layout />}>
          <Route index element={<OpportunitiesPage />} />
          <Route path="opportunity/:id" element={<OpportunityDetailPage />} />
          <Route path="opportunity/:id/register" element={<RegisterPage />} />
          <Route path="opportunity/:id/confirmation" element={<ConfirmationPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </RegistrationProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
