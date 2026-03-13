import Navbar from '../components/Navbar'
import { Link } from 'react-router-dom'

function PrivacyPage() {
  return (
    <div style={styles.page}>
      <Navbar />
      <div style={styles.container}>

        <h1 style={styles.h1}>Privacy Policy</h1>
        <p style={styles.updated}>Last updated: March 2026</p>

        <div style={styles.alert}>
          <i className="fas fa-shield-halved"></i>&nbsp;
          StudyHub is built by students who care about privacy.
          We collect only what we absolutely need. We never sell your data.
        </div>

        <Section title="1. What We Collect">
          <p>When you create an account we collect:</p>
          <ul style={styles.ul}>
            <li><strong>Username</strong> — your chosen display name</li>
            <li><strong>Password</strong> — stored as a secure hash, never plain text</li>
            <li><strong>School and course selections</strong> — to personalize your dashboard</li>
            <li><strong>Content you upload</strong> — study sheets, notes, practice tests</li>
            <li><strong>Activity data</strong> — which content you view, test scores</li>
          </ul>
          <p style={{ marginTop: '12px' }}>We do <strong>not</strong> collect your
          email address, phone number, real name, or any payment information.</p>
        </Section>

        <Section title="2. How We Use Your Data">
          <ul style={styles.ul}>
            <li>To display your dashboard and personalized course content</li>
            <li>To save your notes, test attempts, and contributions</li>
            <li>To show your public profile and contributions to other users</li>
            <li>To improve the platform based on usage patterns</li>
          </ul>
        </Section>

        <Section title="3. What Is Public">
          <p>The following information is visible to all users of StudyHub:</p>
          <ul style={styles.ul}>
            <li>Your username</li>
            <li>Study sheets and content you publish</li>
            <li>Your contribution history</li>
            <li>Your profile picture (if you set one)</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            Your personal notes are <strong>private by default</strong> and
            only visible to you unless you choose to share them.
          </p>
        </Section>

        <Section title="4. Data Security">
          <ul style={styles.ul}>
            <li>Passwords are hashed with bcrypt and never stored in plain text</li>
            <li>Sessions use secure JWT tokens stored in httpOnly cookies</li>
            <li>Uploaded HTML files run in sandboxed environments</li>
            <li>Rate limiting protects against brute force attacks</li>
            <li>All connections use HTTPS in production</li>
          </ul>
        </Section>

        <Section title="5. Data Retention">
          <p>Your data is kept as long as your account is active. You can request
          full deletion of your account and all associated data at any time by
          opening a GitHub Issue tagged with your username.</p>
        </Section>

        <Section title="6. Third Parties">
          <p>StudyHub does not sell, rent, or share your personal data with
          third parties for advertising or marketing purposes. The only
          third-party service currently used is the Anthropic API for the
          AI assistant feature — your questions are sent to their API but
          not stored with any identifying information.</p>
        </Section>

        <Section title="7. Your Rights">
          <ul style={styles.ul}>
            <li>Request a copy of all data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and all data</li>
            <li>Opt out of any public display of your contributions</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            To exercise these rights, open a GitHub Issue or contact
            the maintainer through GitHub.
          </p>
        </Section>

        <Section title="8. Changes to This Policy">
          <p>We will announce significant changes to this policy through
          the platform's announcement system. Your continued use of
          StudyHub after changes constitutes acceptance.</p>
        </Section>

        <div style={styles.backLinks}>
          <Link to="/terms" style={styles.link}>Terms of Use</Link>
          <span style={{ color: '#d1d5db' }}>·</span>
          <Link to="/guidelines" style={styles.link}>Community Guidelines</Link>
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
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#15803d',
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

export default PrivacyPage