/* ═══════════════════════════════════════════════════════════════════════════
 * TestsPage.jsx — Practice tests landing with teaser cards
 *
 * Layout: PageShell (sidebar + main) with 2-column card grid on desktop,
 * single column on phone. Each card shows a "Version 2" badge indicating
 * AI-generated tests are planned.
 *
 * Tab bar: All Tests | My Attempts | Leaderboard (UI only, not yet wired).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { PageShell, TeaserCard } from '../shared/pageScaffold'
import { PAGE_FONT } from '../shared/pageUtils'

export default function TestsPage() {
  const [browseTab, setBrowseTab] = useState('all')

  return (
    <PageShell nav={<Navbar crumbs={[{ label: 'Practice Tests', to: '/tests' }]} hideTabs />} sidebar={<AppSidebar />}>
      {/* Page header with tab bar */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Practice Tests</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>Course-linked tests with instant scoring. Planned for Version 2.</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            ['all', 'All Tests'],
            ['attempts', 'My Attempts'],
            ['leaderboard', 'Leaderboard'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setBrowseTab(id)}
              style={{
                padding: '6px 16px',
                borderRadius: 99,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: PAGE_FONT,
                background: browseTab === id ? '#0f172a' : '#fff',
                color: browseTab === id ? '#fff' : '#64748b',
                boxShadow: browseTab === id ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Test cards in 2-column grid (responsive via CSS) */}
      <div className="tests-card-grid">
        <TeaserCard
          title="CMSC131 Final Exam Prep"
          sub="20 questions · Multiple choice · Based on CMSC131 Complete Study Guide"
          chips={[
            { label: 'CMSC131', bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
            { label: '20 questions' },
            { label: '~15 min' },
          ]}
        />
        <TeaserCard
          title="MATH140 Derivatives Quick Quiz"
          sub="15 questions · Short answer · AI-generated from Limits & Derivatives sheet"
          chips={[
            { label: 'MATH140', bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
            { label: '15 questions' },
          ]}
        />
        <TeaserCard
          title="CMSC131 Recursion Drills"
          sub="10 trace-through problems · Based on Recursion Cheatsheet"
          chips={[
            { label: 'CMSC131', bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
            { label: '10 problems' },
            { label: 'Intermediate' },
          ]}
        />
      </div>

      {/* Version 2 promo banner */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', borderRadius: 16, padding: '24px 28px', marginTop: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>AI-Generated Tests in Version 2</div>
        <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 400, margin: '0 auto', lineHeight: 1.7 }}>
          Claude AI will read your study sheets and automatically generate practice questions with instant scoring and detailed explanations.
        </div>
      </div>
    </PageShell>
  )
}
