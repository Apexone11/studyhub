import React, { useState } from 'react'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { usePageTitle } from '../../lib/usePageTitle'
import { useResponsiveAppLayout } from '../../lib/ui'
import { Link } from 'react-router-dom'
import { LogoMark } from '../../components/Icons'

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
    desc: 'Publish your projects with a unique URL. Fork other students\' work to learn and improve.',
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

export default function PlaygroundPage() {
  usePageTitle('Playground')
  const layout = useResponsiveAppLayout()

  return (
    <>
      <Navbar />
      <div style={s.pageWrapper}>
        <AppSidebar mode={layout.sidebarMode} />
        <main style={s.page}>
          {/* ── HERO ─────────────────────────────────────── */}
          <section style={s.hero}>
            <div style={s.heroWatermark}>
              <LogoMark size={280} />
            </div>
            <div style={s.heroInner}>
              <div style={s.heroBadge}>Coming Soon</div>
              <h1 style={s.heroH1}>Code Playground</h1>
              <p style={s.heroSub}>Write, run, and share code right in your browser</p>
            </div>
          </section>

          {/* ── MOCK EDITOR ──────────────────────────────── */}
          <section style={s.editorSection}>
            <div style={s.editorContainer}>
              <div style={s.editorMockup}>
                <div style={s.editorWatermark}>Coming Soon</div>

                {/* Left pane: Code editor */}
                <div style={s.editorLeft}>
                  <div style={s.editorHeader}>
                    <div style={s.editorTab}>index.js</div>
                  </div>
                  <pre style={s.codeBlock}>{codeExample}</pre>
                </div>

                {/* Right pane: Output */}
                <div style={s.editorRight}>
                  <div style={s.editorHeader}>
                    <div style={s.outputTab}>Output</div>
                  </div>
                  <div style={s.outputPanel}>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(0) = 0</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(1) = 1</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(2) = 1</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(3) = 2</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(4) = 3</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(5) = 5</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(6) = 8</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(7) = 13</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(8) = 21</span>
                    </div>
                    <div style={s.outputLine}>
                      <span style={s.outputLabel}>console.log</span>
                      <span style={s.outputValue}> fib(9) = 34</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── FEATURES GRID ───────────────────────────── */}
          <section style={s.featuresSection}>
            <div style={s.sectionInner}>
              <h2 style={s.sectionH2}>What You Can Do</h2>
              <div style={s.featuresGrid}>
                {FEATURES.map((feature, i) => (
                  <FeatureCard key={i} {...feature} />
                ))}
              </div>
            </div>
          </section>

          {/* ── EARLY ACCESS CTA ────────────────────────── */}
          <section style={s.ctaSection}>
            <div style={s.ctaInner}>
              <p style={s.ctaText}>Want to be the first to try it?</p>
              <Link to="/pricing" style={s.ctaButton}>Notify Me</Link>
            </div>
          </section>

          {/* ── FOOTER ──────────────────────────────────── */}
          <footer style={s.footer}>
            <div style={s.footerLinks}>
              <Link to="/" style={s.footerLink}>Home</Link>
              <Link to="/feed" style={s.footerLink}>Browse</Link>
              <Link to="/privacy" style={s.footerLink}>Privacy</Link>
              <Link to="/terms" style={s.footerLink}>Terms</Link>
              <Link to="/guidelines" style={s.footerLink}>Guidelines</Link>
            </div>
            <p style={s.footerCopy}>Code Playground · StudyHub · Open Source</p>
          </footer>
        </main>
      </div>
    </>
  )
}

function FeatureCard({ icon, title, desc }) {
  const [isHovered, setIsHovered] = useState(false)
  const iconSvg = getFeatureIcon(icon)

  return (
    <div
      style={{
        ...s.featureCard,
        ...(isHovered && {
          transform: 'translateY(-4px)',
          borderColor: 'var(--sh-brand)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        })
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={s.featureIconWrap}>
        {iconSvg}
      </div>
      <h3 style={s.featureTitle}>{title}</h3>
      <p style={s.featureDesc}>{desc}</p>
    </div>
  )
}

function getFeatureIcon(name) {
  const iconProps = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', style: { stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' } }

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
          <path d="M12 3 L13.7 8.3 L19 10 L13.7 11.7 L12 17 L10.3 11.7 L5 10 L10.3 8.3 Z" fill="none" />
          <path d="M18.5 3.5 L19.3 5.7 L21.5 6.5 L19.3 7.3 L18.5 9.5 L17.7 7.3 L15.5 6.5 L17.7 5.7 Z" fill="currentColor" />
          <path d="M5.5 15.5 L6.2 17.1 L7.8 17.8 L6.2 18.5 L5.5 20.1 L4.8 18.5 L3.2 17.8 L4.8 17.1 Z" fill="currentColor" />
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

const codeExample = `// StudyHub Code Playground
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`);
}`

const s = {
  pageWrapper: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    minHeight: '100vh',
    background: 'var(--sh-page-bg)',
  },

  page: {
    minHeight: '100vh',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    background: 'var(--sh-page-bg)',
    color: 'var(--sh-text)',
  },

  /* HERO */
  hero: {
    background: 'linear-gradient(135deg, var(--sh-brand) 0%, #7c3aed 100%)',
    padding: '100px 20px 80px',
    textAlign: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    opacity: 0.05,
    color: 'white',
    pointerEvents: 'none',
    zIndex: 0,
    animation: 'float 8s ease-in-out infinite',
  },
  heroInner: {
    maxWidth: 720,
    margin: '0 auto',
    position: 'relative',
    zIndex: 1,
  },
  heroBadge: {
    display: 'inline-block',
    background: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    padding: '8px 16px',
    borderRadius: 20,
    marginBottom: 24,
    letterSpacing: 1,
    backdropFilter: 'blur(10px)',
  },
  heroH1: {
    fontSize: 'clamp(36px, 6vw, 60px)',
    fontWeight: 'bold',
    color: '#fff',
    margin: '0 0 16px',
    lineHeight: 1.15,
    letterSpacing: '-1px',
  },
  heroSub: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.95)',
    margin: 0,
    lineHeight: 1.6,
    fontWeight: 400,
  },

  /* MOCK EDITOR */
  editorSection: {
    padding: '80px 20px',
    background: 'var(--sh-page-bg)',
  },
  editorContainer: {
    maxWidth: 1100,
    margin: '0 auto',
  },
  editorMockup: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 0,
    borderRadius: 16,
    overflow: 'hidden',
    border: '1px solid var(--sh-border)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
    background: 'var(--sh-surface)',
  },
  editorWatermark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: 48,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.08)',
    pointerEvents: 'none',
    zIndex: 10,
    textAlign: 'center',
    textShadow: '0 0 40px rgba(0, 0, 0, 0.5)',
  },

  /* Editor left pane */
  editorLeft: {
    borderRight: '1px solid var(--sh-border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--sh-surface)',
  },
  editorHeader: {
    background: 'var(--sh-soft)',
    borderBottom: '1px solid var(--sh-border)',
    padding: '12px 16px',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  editorTab: {
    fontSize: 13,
    color: 'var(--sh-text)',
    padding: '6px 12px',
    borderRadius: 6,
    background: 'var(--sh-surface)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontWeight: 500,
  },
  codeBlock: {
    flex: 1,
    margin: 0,
    padding: 20,
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--sh-text)',
    background: 'transparent',
    whiteSpace: 'pre',
  },

  /* Editor right pane */
  editorRight: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--sh-soft)',
  },
  outputTab: {
    fontSize: 13,
    color: 'var(--sh-text)',
    padding: '6px 12px',
    borderRadius: 6,
    background: 'var(--sh-surface)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    display: 'inline-block',
    fontWeight: 500,
  },
  outputPanel: {
    flex: 1,
    padding: 20,
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.8,
    background: 'var(--sh-soft)',
  },
  outputLine: {
    color: 'var(--sh-text)',
    marginBottom: 4,
  },
  outputLabel: {
    color: 'var(--sh-brand)',
    fontWeight: 500,
  },
  outputValue: {
    color: 'var(--sh-success-text)',
  },

  /* FEATURES SECTION */
  featuresSection: {
    padding: '80px 20px',
    background: 'var(--sh-page-bg)',
  },
  sectionInner: {
    maxWidth: 1100,
    margin: '0 auto',
  },
  sectionH2: {
    fontSize: 'clamp(24px, 3vw, 36px)',
    fontWeight: 'bold',
    color: 'var(--sh-heading)',
    margin: '0 0 48px',
    textAlign: 'center',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 24,
  },
  featureCard: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 12,
    padding: '28px 24px',
    transition: 'all 0.3s ease',
    cursor: 'default',
  },
  featureCard__hover: {
    transform: 'translateY(-4px)',
    borderColor: 'var(--sh-brand)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--sh-brand-soft)',
    border: '1px solid var(--sh-brand-border)',
    marginBottom: 16,
    color: 'var(--sh-brand)',
    transition: 'all 0.3s ease',
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'var(--sh-heading)',
    margin: '0 0 12px',
  },
  featureDesc: {
    fontSize: 14,
    color: 'var(--sh-muted)',
    margin: 0,
    lineHeight: 1.6,
  },

  /* CTA SECTION */
  ctaSection: {
    padding: '80px 20px',
    background: 'linear-gradient(135deg, var(--sh-brand) 0%, #7c3aed 100%)',
    textAlign: 'center',
    borderTop: '1px solid var(--sh-border)',
  },
  ctaInner: {
    maxWidth: 600,
    margin: '0 auto',
  },
  ctaText: {
    fontSize: 20,
    color: '#fff',
    margin: '0 0 24px',
    fontWeight: 'bold',
  },
  ctaButton: {
    display: 'inline-block',
    background: 'rgba(255, 255, 255, 0.2)',
    border: '2px solid rgba(255, 255, 255, 0.4)',
    color: 'white',
    textDecoration: 'none',
    padding: '14px 36px',
    borderRadius: 10,
    fontWeight: 'bold',
    fontSize: 15,
    transition: 'all 0.3s ease',
    backdropFilter: 'blur(10px)',
  },

  /* FOOTER */
  footer: {
    background: 'var(--sh-surface)',
    padding: '40px 20px',
    textAlign: 'center',
    borderTop: '1px solid var(--sh-border)',
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  footerLink: {
    color: 'var(--sh-muted)',
    textDecoration: 'none',
    fontSize: 14,
    transition: 'color 0.3s ease',
  },
  footerCopy: {
    color: 'var(--sh-muted)',
    fontSize: 12,
    margin: 0,
  },
}

// Add keyframe animation to document
if (typeof window !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    @keyframes float {
      0%, 100% {
        transform: translate(-50%, -50%);
      }
      50% {
        transform: translate(-50%, -55%);
      }
    }
  `
  if (!document.head.querySelector('style[data-playground]')) {
    styleSheet.setAttribute('data-playground', 'true')
    document.head.appendChild(styleSheet)
  }
}
