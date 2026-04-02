import Navbar from '../../components/navbar/Navbar'
import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: 'fa-code',
    title: 'Browser-Based Editor',
    desc: 'Full-featured code editor with syntax highlighting, autocomplete, and error detection. No setup required.',
  },
  {
    icon: 'fa-language',
    title: 'Multiple Languages',
    desc: 'Write in JavaScript, Python, HTML/CSS, TypeScript, and SQL. More languages coming soon.',
  },
  {
    icon: 'fa-eye',
    title: 'Live Preview',
    desc: 'See your HTML/CSS/JS projects render in real-time as you type.',
  },
  {
    icon: 'fa-code-branch',
    title: 'Share and Fork',
    desc: 'Publish your projects with a unique URL. Fork other students\' work to learn and improve.',
  },
  {
    icon: 'fa-lock',
    title: 'Sandboxed Execution',
    desc: 'All code runs in a secure browser sandbox. No access to your computer or network.',
  },
  {
    icon: 'fa-sparkles',
    title: 'AI Code Review',
    desc: 'Get feedback from Hub AI on your code. Find bugs, optimize performance, and learn best practices.',
  },
  {
    icon: 'fa-clock',
    title: 'Version History',
    desc: 'Track every change with automatic versioning. Compare diffs and roll back anytime.',
  },
  {
    icon: 'fa-graduation-cap',
    title: 'Course Exercises',
    desc: 'Practice coding with exercises linked to your CS courses. Get automated feedback.',
  },
]

export default function PlaygroundPage() {
  return (
    <div style={s.page}>
      <Navbar />

      {/* ── HERO ─────────────────────────────────────── */}
      <section style={s.hero}>
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
    </div>
  )
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={s.featureCard}>
      <div style={s.featureIconWrap}>
        <i className={`fas ${icon}`} style={s.featureIcon}></i>
      </div>
      <h3 style={s.featureTitle}>{title}</h3>
      <p style={s.featureDesc}>{desc}</p>
    </div>
  )
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
  page: {
    minHeight: '100vh',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
  },

  /* HERO */
  hero: {
    background: 'linear-gradient(135deg, var(--sh-slate-900) 0%, var(--sh-slate-800) 100%)',
    padding: '100px 20px 60px',
    textAlign: 'center',
  },
  heroInner: {
    maxWidth: 720,
    margin: '0 auto',
  },
  heroBadge: {
    display: 'inline-block',
    background: 'var(--sh-brand)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    padding: '6px 16px',
    borderRadius: 20,
    marginBottom: 24,
    letterSpacing: 1,
  },
  heroH1: {
    fontSize: 'clamp(32px, 5vw, 54px)',
    fontWeight: 'bold',
    color: '#fff',
    margin: '0 0 16px',
    lineHeight: 1.15,
  },
  heroSub: {
    fontSize: 18,
    color: 'var(--sh-slate-400)',
    margin: 0,
    lineHeight: 1.6,
  },

  /* MOCK EDITOR */
  editorSection: {
    padding: '80px 20px',
    background: 'var(--sh-bg)',
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
    border: '1px solid var(--sh-slate-700)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
    background: 'var(--sh-slate-800)',
    transform: 'perspective(1000px) rotateX(5deg) rotateY(-2deg)',
    transformStyle: 'preserve-3d',
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
    borderRight: '1px solid var(--sh-slate-700)',
    display: 'flex',
    flexDirection: 'column',
  },
  editorHeader: {
    background: 'var(--sh-slate-900)',
    borderBottom: '1px solid var(--sh-slate-700)',
    padding: '12px 16px',
    display: 'flex',
    gap: 8,
  },
  editorTab: {
    fontSize: 13,
    color: 'var(--sh-slate-400)',
    padding: '4px 12px',
    borderRadius: 6,
    background: 'rgba(100, 116, 139, 0.2)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  },
  codeBlock: {
    flex: 1,
    margin: 0,
    padding: 20,
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--sh-slate-300)',
    background: 'transparent',
    whiteSpace: 'pre',
  },

  /* Editor right pane */
  editorRight: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(15, 23, 42, 0.5)',
  },
  outputTab: {
    fontSize: 13,
    color: 'var(--sh-slate-400)',
    padding: '4px 12px',
    borderRadius: 6,
    background: 'rgba(100, 116, 139, 0.2)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    display: 'inline-block',
  },
  outputPanel: {
    flex: 1,
    padding: 20,
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.8,
  },
  outputLine: {
    color: 'var(--sh-slate-300)',
    marginBottom: 4,
  },
  outputLabel: {
    color: '#818cf8',
  },
  outputValue: {
    color: '#86efac',
  },

  /* FEATURES SECTION */
  featuresSection: {
    padding: '80px 20px',
    background: 'var(--sh-surface)',
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
    background: 'var(--sh-slate-800)',
    border: '1px solid var(--sh-slate-700)',
    borderRadius: 12,
    padding: '28px 24px',
    transition: 'all 0.3s ease',
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(59, 130, 246, 0.15)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    marginBottom: 16,
  },
  featureIcon: {
    color: '#3b82f6',
    fontSize: 20,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: 'bold',
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
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)',
    textAlign: 'center',
    borderTop: '1px solid var(--sh-slate-700)',
    borderBottom: '1px solid var(--sh-slate-700)',
  },
  ctaInner: {
    maxWidth: 600,
    margin: '0 auto',
  },
  ctaText: {
    fontSize: 18,
    color: 'var(--sh-heading)',
    margin: '0 0 24px',
    fontWeight: 'bold',
  },
  ctaButton: {
    display: 'inline-block',
    background: 'var(--sh-brand)',
    color: '#fff',
    textDecoration: 'none',
    padding: '14px 36px',
    borderRadius: 10,
    fontWeight: 'bold',
    fontSize: 15,
    transition: 'all 0.3s ease',
  },

  /* FOOTER */
  footer: {
    background: 'linear-gradient(135deg, var(--sh-slate-900) 0%, var(--sh-slate-800) 100%)',
    padding: '40px 20px',
    textAlign: 'center',
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  footerLink: {
    color: 'var(--sh-slate-400)',
    textDecoration: 'none',
    fontSize: 14,
    transition: 'color 0.3s ease',
  },
  footerCopy: {
    color: 'var(--sh-slate-500)',
    fontSize: 12,
    margin: 0,
  },
}
