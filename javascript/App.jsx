import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { RegistrationProvider } from './context/RegistrationContext'
import ConfirmationPage from '../pages/ConfirmationPage'
import NotFoundPage from '../pages/NotFoundPage'
import OpportunitiesPage from '../pages/OpportunitiesPage'
import OpportunityDetailPage from '../pages/OpportunityDetailPage'
import RegisterPage from '../pages/RegisterPage'

// Everything below the router, so tests can mount the same routes inside a
// MemoryRouter (see javascript/test/renderRoute.jsx).
export function AppRoutes() {
  return (
    <RegistrationProvider>
      <Routes>
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
