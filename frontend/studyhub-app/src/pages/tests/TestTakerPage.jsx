// TestTakerPage keeps the reserved test-taking route explicit until
// the full practice runtime ships in v2. Honest "planned for v2"
// holding page rather than a hidden stub. Tokens come from index.css
// so the placeholder themes correctly in both light and dark mode.
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import { PAGE_FONT } from '../shared/pageUtils'

export default function TestTakerPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: PAGE_FONT }}>
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
            background: 'var(--sh-surface)',
            borderRadius: 16,
            border: '1px solid var(--sh-border)',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--sh-heading)',
              marginBottom: 8,
            }}
          >
            Test interface planned for Version 2
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--sh-muted)',
              marginBottom: 20,
            }}
          >
            Multiple choice + short answer with instant AI scoring.
          </div>
          <Link
            to="/tests"
            style={{
              fontSize: 13,
              color: 'var(--sh-brand)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ← Back to Practice Tests
          </Link>
        </div>
      </div>
    </div>
  )
}
