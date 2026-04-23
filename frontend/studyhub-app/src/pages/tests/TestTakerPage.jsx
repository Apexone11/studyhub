// TestTakerPage keeps the reserved test-taking route explicit until the full practice runtime ships.
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { PAGE_FONT } from '../shared/pageUtils'

export default function TestTakerPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: PAGE_FONT }}>
      <Navbar
        crumbs={[
          { label: 'Practice Tests', to: '/tests' },
          { label: 'Taking test…', to: null },
        ]}
        hideTabs
        hideSearch
      />
      <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px' }}>
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            Test interface planned for Version 2
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            Multiple choice + short answer with instant AI scoring.
          </div>
          <Link
            to="/tests"
            style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}
          >
            ← Back to Practice Tests
          </Link>
        </div>
      </div>
    </div>
  )
}
