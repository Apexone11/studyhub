import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'

const StudySheetsPage = () => (
  <div>
    <h1>Study Sheets</h1>
    <p>Study sheets content will be available here.</p>
  </div>
)

const PracticeTestsPage = () => (
  <div>
    <h1>Practice Tests</h1>
    <p>Practice tests content will be available here.</p>
  </div>
)

const SyllabusPage = () => (
  <div>
    <h1>Syllabus</h1>
    <p>Syllabus content will be available here.</p>
  </div>
)

const NotFoundPage = () => (
  <div>
    <h1>Page Not Found</h1>
    <p>The page you are looking for does not exist.</p>
  </div>
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"              element={<HomePage />} />
        <Route path="/login"         element={<LoginPage />} />
        <Route path="/register"      element={<RegisterPage />} />
        <Route path="/dashboard"     element={<DashboardPage />} />
        <Route path="/study-sheets"  element={<StudySheetsPage />} />
        <Route path="/practice-tests" element={<PracticeTestsPage />} />
        <Route path="/syllabus"      element={<SyllabusPage />} />
        <Route path="*"              element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App