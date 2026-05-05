/* ═══════════════════════════════════════════════════════════════════════════
 * PlaygroundPage.jsx — Code Playground coming-soon landing page
 *
 * Uses PageShell for consistent sidebar layout and responsive behavior.
 * All colors use CSS custom property tokens from index.css.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { PageShell } from '../shared/pageScaffold'
import { usePageTitle } from '../../lib/usePageTitle'
import { LogoMark } from '../../components/Icons'
import './PlaygroundPage.css'

const FEATURES = [
  {
    title: 'Browser-Based Editor',
    desc: 'Full-featured code editor with syntax highlighting, autocomplete, and error detection. No setup required.',
    icon: 'editor',
  },
  {
    title: 'Multiple Languages',
    desc: 'Write in JavaScript, Python, HTML/CSS, TypeScript, and SQL. More languages coming soon.',
    icon: 'languages',
  },
  {
    title: 'Live Preview',
    desc: 'See your HTML/CSS/JS projects render in real-time as you type.',
    icon: 'preview',
  },
  {
    title: 'Share and Fork',
    desc: "Publish your projects with a unique URL. Fork other students' work to learn and improve.",
    icon: 'fork',
  },
  {
    title: 'Sandboxed Execution',
    desc: 'All code runs in a secure browser sandbox. No access to your computer or network.',
    icon: 'sandbox',
  },
  {
    title: 'AI Code Review',
    desc: 'Get feedback from Hub AI on your code. Find bugs, optimize performance, and learn best practices.',
    icon: 'ai',
  },
  {
    title: 'Version History',
    desc: 'Track every change with automatic versioning. Compare diffs and roll back anytime.',
    icon: 'history',
  },
  {
    title: 'Course Exercises',
    desc: 'Practice coding with exercises linked to your CS courses. Get automated feedback.',
    icon: 'exercises',
  },
]

const CODE_EXAMPLE = `// StudyHub Code Playground
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`);
}`

const OUTPUT_LINES = Array.from({ length: 10 }, (_, i) => {
  const fibs = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
  return { label: 'console.log', value: ` fib(${i}) = ${fibs[i]}` }
})

export default function PlaygroundPage() {
  usePageTitle('Playground')

  return (
    <PageShell nav={<Navbar />} sidebar={<AppSidebar />}>
      {/* Hero */}
      <section className="playground-hero">
        <div className="playground-hero__watermark">
          <LogoMark size={280} />
        </div>
        <div className="playground-hero__inner">
          <div className="playground-hero__badge">Coming Soon</div>
          <h1 className="playground-hero__title">Code Playground</h1>
          <p className="playground-hero__subtitle">
            Write, run, and share code right in your browser
          </p>
        </div>
      </section>

      {/* Mock Editor — decorative preview, hidden from assistive tech so the
       * screen-reader flow stays on the heading + features grid. */}
      <section className="playground-editor-section" aria-hidden="true">
        <div className="playground-editor-container">
          <div className="playground-editor-mockup">
            <div className="playground-editor-mockup__watermark">Coming Soon</div>

            {/* Left pane: Code */}
            <div className="playground-editor__pane">
              <div className="playground-editor__header">
                <div className="playground-editor__tab">index.js</div>
              </div>
              <pre className="playground-editor__code">{CODE_EXAMPLE}</pre>
            </div>

            {/* Right pane: Output */}
            <div className="playground-editor__pane playground-editor__pane--right">
              <div className="playground-editor__header">
                <div className="playground-editor__tab">Output</div>
              </div>
              <div className="playground-editor__output">
                {OUTPUT_LINES.map((line, i) => (
                  <div key={i} className="playground-editor__output-line">
                    <span className="playground-editor__output-label">{line.label}</span>
                    <span className="playground-editor__output-value">{line.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="playground-features">
        <div className="playground-features__inner">
          <h2 className="playground-features__title">What You Can Do</h2>
          <div className="playground-features__grid">
            {FEATURES.map((feature, i) => (
              <div key={i} className="playground-feature-card">
                <div className="playground-feature-card__icon">{getFeatureIcon(feature.icon)}</div>
                <h3 className="playground-feature-card__title">{feature.title}</h3>
                <p className="playground-feature-card__desc">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Early Access CTA */}
      <section className="playground-cta" aria-labelledby="playground-cta-text">
        <div className="playground-cta__inner">
          <p id="playground-cta-text" className="playground-cta__text">
            Want to be the first to try it?
          </p>
          <Link
            to="/pricing"
            className="playground-cta__button"
            aria-label="View pricing plans for early access to the Playground"
          >
            Notify Me
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="playground-footer">
        <div className="playground-footer__links">
          <Link to="/" className="playground-footer__link">
            Home
          </Link>
          <Link to="/feed" className="playground-footer__link">
            Browse
          </Link>
          <Link to="/privacy" className="playground-footer__link">
            Privacy
          </Link>
          <Link to="/terms" className="playground-footer__link">
            Terms
          </Link>
          <Link to="/guidelines" className="playground-footer__link">
            Guidelines
          </Link>
        </div>
        <p className="playground-footer__copy">Code Playground -- StudyHub -- Open Source</p>
      </footer>
    </PageShell>
  )
}

function getFeatureIcon(name) {
  const iconProps = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    style: {
      stroke: 'currentColor',
      strokeWidth: '1.8',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  }

  switch (name) {
    case 'editor':
      return (
        <svg {...iconProps}>
          <path d="M5 3 L5 21 L19 21 L19 3 Z" />
          <line x1="5" y1="8" x2="19" y2="8" />
          <line x1="8" y1="12" x2="12" y2="12" />
          <line x1="8" y1="15" x2="15" y2="15" />
        </svg>
      )
    case 'languages':
      return (
        <svg {...iconProps}>
          <path d="M5 3 Q5 2 6 2 L18 2 Q19 2 19 3 L19 21 Q19 22 18 22 L6 22 Q5 22 5 21 Z" />
          <line x1="7" y1="6" x2="17" y2="6" />
          <line x1="7" y1="10" x2="17" y2="10" />
          <line x1="7" y1="14" x2="14" y2="14" />
        </svg>
      )
    case 'preview':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      )
    case 'fork':
      return (
        <svg {...iconProps}>
          <line x1="12" y1="19" x2="12" y2="14" />
          <path d="M12 14 Q12 9 7 6" fill="none" />
          <path d="M12 14 Q12 9 17 6" fill="none" />
          <circle cx="12" cy="19" r="2" fill="currentColor" />
          <circle cx="12" cy="14" r="2" fill="currentColor" />
          <circle cx="7" cy="6" r="2" fill="currentColor" />
          <circle cx="17" cy="6" r="2" fill="currentColor" />
        </svg>
      )
    case 'sandbox':
      return (
        <svg {...iconProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      )
    case 'ai':
      return (
        <svg {...iconProps}>
          <path
            d="M12 3 L13.7 8.3 L19 10 L13.7 11.7 L12 17 L10.3 11.7 L5 10 L10.3 8.3 Z"
            fill="none"
          />
          <path
            d="M18.5 3.5 L19.3 5.7 L21.5 6.5 L19.3 7.3 L18.5 9.5 L17.7 7.3 L15.5 6.5 L17.7 5.7 Z"
            fill="currentColor"
          />
          <path
            d="M5.5 15.5 L6.2 17.1 L7.8 17.8 L6.2 18.5 L5.5 20.1 L4.8 18.5 L3.2 17.8 L4.8 17.1 Z"
            fill="currentColor"
          />
        </svg>
      )
    case 'history':
      return (
        <svg {...iconProps}>
          <path d="M12 2 L12 7 L16 5" />
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="12" x2="12" y2="16" />
          <line x1="12" y1="12" x2="15" y2="12" />
        </svg>
      )
    case 'exercises':
      return (
        <svg {...iconProps}>
          <path d="M5 3 Q5 2 6 2 L18 2 Q19 2 19 3 L19 21 Q19 22 18 22 L6 22 Q5 22 5 21 Z" />
          <path d="M14 3 L14 7 L18 7" fill="none" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      )
    default:
      return null
  }
}
