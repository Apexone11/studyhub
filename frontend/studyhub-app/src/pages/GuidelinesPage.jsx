import Navbar from '../components/Navbar'
import { Link } from 'react-router-dom'

function GuidelinesPage() {
  return (
    <div style={styles.page}>
      <Navbar />
      <div style={styles.container}>

        <h1 style={styles.h1}>Community Guidelines</h1>
        <p style={styles.updated}>Last updated: March 2026</p>

        <div style={styles.alert}>
          <i className="fas fa-people-group"></i>&nbsp;
          StudyHub works because students help each other. These guidelines
          keep it a safe, useful, and welcoming place for everyone.
        </div>

        <Section title="🎯 The Golden Rule">
          <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e3a5f' }}>
            Contribute content you would want to find yourself.
          </p>
          <p style={{ marginTop: '8px' }}>
            Every study sheet, practice test, and note you upload helps
            real students. Make it accurate, clear, and honest.
          </p>
        </Section>

        <Section title="✅ What We Encourage">
          <ul style={styles.ul}>
            <li>Uploading original study guides and notes for your courses</li>
            <li>Forking and improving existing study materials</li>
            <li>Writing clear, well-organized practice test questions</li>
            <li>Leaving constructive comments on study materials</li>
            <li>Reporting content that violates these guidelines</li>
            <li>Helping classmates understand difficult concepts</li>
            <li>Contributing to courses at your school and beyond</li>
          </ul>
        </Section>

        <Section title="❌ What Is Not Allowed">
          <ul style={styles.ul}>
            <li>Uploading copyrighted textbook content or publisher materials</li>
            <li>Posting answers to graded exams or assignments (academic dishonesty)</li>
            <li>Uploading fake, misleading, or intentionally wrong study content</li>
            <li>Harassing, bullying, or disrespecting other users</li>
            <li>Spamming the platform with duplicate or low-quality content</li>
            <li>Uploading malicious HTML files or files designed to harm users</li>
            <li>Creating fake accounts or impersonating others</li>
            <li>Using the platform for anything unrelated to studying and learning</li>
          </ul>
        </Section>

        <Section title="📄 Content Quality Standards">
          <p>Good study content on StudyHub should:</p>
          <ul style={styles.ul}>
            <li>Be clearly titled with the course and topic</li>
            <li>Use your own words — not copied from textbooks</li>
            <li>Include examples where possible</li>
            <li>Be organized with headings and sections</li>
            <li>Be accurate to the best of your knowledge</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            Low quality or duplicate content may be removed by moderators.
            This is not a punishment — it keeps the platform useful for everyone.
          </p>
        </Section>

        <Section title="🔁 Forking & Attribution">
          <p>When you fork someone's study sheet:</p>
          <ul style={styles.ul}>
            <li>The original author is automatically credited</li>
            <li>You can improve, expand, or adapt the content freely</li>
            <li>Do not remove attribution from forked content</li>
            <li>If you make major improvements, consider submitting back</li>
          </ul>
        </Section>

        <Section title="🛡️ Reporting Violations">
          <p>If you see content that violates these guidelines:</p>
          <ul style={styles.ul}>
            <li>Use the Report button on any study sheet or post</li>
            <li>Open a GitHub Issue with the label "content-report"</li>
            <li>Moderators will review and act within a reasonable time</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            False or malicious reports are themselves a violation of these guidelines.
          </p>
        </Section>

        <Section title="⚖️ Enforcement">
          <p>Violations are handled progressively:</p>
          <ul style={styles.ul}>
            <li><strong>First offense:</strong> Content removed, warning issued</li>
            <li><strong>Second offense:</strong> Temporary upload restriction</li>
            <li><strong>Severe or repeated violations:</strong> Account suspension</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            Appeals can be made through GitHub Issues. We believe in fairness
            and will always explain our decisions.
          </p>
        </Section>

        <div style={styles.backLinks}>
          <Link to="/terms" style={styles.link}>Terms of Use</Link>
          <span style={{ color: '#d1d5db' }}>·</span>
          <Link to="/privacy" style={styles.link}>Privacy Policy</Link>
          <span style={{ color: '#d1d5db' }}>·</span>
          <Link to="/" style={styles.link}>Back to Home</Link>
        </div>

      </div>
      <footer style={styles.footer}>
        <span style={{ color: '#60a5fa' }}>StudyHub</span> · Open Source on GitHub
      </footer>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#1e3a5f',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '2px solid #e5e7eb'
      }}>
        {title}
      </h2>
      <div style={{ fontSize: '15px', color: '#374151', lineHeight: '1.7' }}>
        {children}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Arial, sans-serif',
    background: '#f0f4f8',
  },
  container: {
    maxWidth: '780px',
    margin: '0 auto',
    padding: '48px 24px',
    flex: 1,
  },
  h1: {
    fontSize: '36px',
    color: '#1e3a5f',
    marginBottom: '8px',
    fontWeight: 'bold',
  },
  updated: {
    fontSize: '13px',
    color: '#9ca3af',
    marginBottom: '28px',
  },
  alert: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: '#92400e',
    borderRadius: '8px',
    padding: '14px 18px',
    fontSize: '14px',
    marginBottom: '32px',
    lineHeight: '1.6',
  },
  ul: {
    paddingLeft: '20px',
    marginTop: '10px',
    lineHeight: '2',
  },
  backLinks: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginTop: '40px',
    paddingTop: '24px',
    borderTop: '1px solid #e5e7eb',
  },
  link: {
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
  },
  footer: {
    background: '#111827',
    color: '#94a3b8',
    textAlign: 'center',
    padding: '20px',
    fontSize: '13px',
  },
}

export default GuidelinesPage