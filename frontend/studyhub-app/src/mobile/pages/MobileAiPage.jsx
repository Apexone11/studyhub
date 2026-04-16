// src/mobile/pages/MobileAiPage.jsx
// Hub AI tab — minimal wrapper that lazy-loads the web AiPage.
// Provides mobile-specific top bar while reusing the full AI chat.

import { Suspense, lazy } from 'react'
import MobileTopBar from '../components/MobileTopBar'

const AiPage = lazy(() => import('../../pages/ai/AiPage'))

function AiLoadingFallback() {
  return (
    <div className="mob-page-placeholder" style={{ opacity: 1 }}>
      <div className="mob-feed-spinner" style={{ margin: '0 auto' }} />
      <p className="mob-page-placeholder-text" style={{ marginTop: 'var(--space-4)' }}>
        Loading Hub AI...
      </p>
    </div>
  )
}

export default function MobileAiPage() {
  return (
    <>
      <MobileTopBar title="Hub AI" />
      <div className="mob-ai-wrap">
        <Suspense fallback={<AiLoadingFallback />}>
          <AiPage />
        </Suspense>
      </div>
    </>
  )
}
