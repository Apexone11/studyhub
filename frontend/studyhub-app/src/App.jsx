import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterScreen'
import DashboardPage from './pages/DashboardPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import GuidelinesPage from './pages/GuidelinesPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<HomePage />} />
        <Route path="/login"     element={<LoginPage />} />
        <Route path="/register"  element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/terms"     element={<TermsPage/>} />
        <Route path="/privacy"    element={<PrivacyPage />} />
        <Route path="/guidelines" element={<GuidelinesPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App