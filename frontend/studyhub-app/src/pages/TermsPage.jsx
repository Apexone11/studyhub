import Navbar from '../components/Navbar'
import { Link } from 'react-router-dom'

function TermsPage() {
  return (
    <div style={styles.page}>
      <Navbar />
      <div style={styles.container}>

        <h1 style={styles.h1}>Terms of Use</h1>
        <p style={styles.updated}>Last updated: March 2026</p>

        <div style={styles.alert}>
          <i className="fas fa-info-circle"></i>&nbsp;
          StudyHub is a student-built, open-source platform. By using it
          you agree to these terms. If you disagree, please do not use the platform.
        </div>

        <Section title="1. Who Can Use StudyHub">
          <p>StudyHub is open to any student, educator, or learner. You must be at
          least 13 years old to create an account. By registering you confirm
          you meet this requirement.</p>
        </Section>

        <Section title="2. Your Account">
          <p>You are responsible for keeping your username and password secure.
          Do not share your credentials. You are responsible for all activity
          that happens under your account. If you believe your account has been
          compromised, contact an administrator immediately through GitHub Issues.</p>
        </Section>

        <Section title="3. Content You Upload">
          <p>When you upload study sheets, practice tests, notes, or any other
          content to StudyHub you agree that:</p>
          <ul style={styles.ul}>
            <li>The content is your own original work or properly attributed</li>
            <li>You are not violating any copyright or intellectual property rights</li>
            <li>You are not uploading content from textbooks, commercial sources,
                or publishers without explicit permission</li>
            <li>You grant StudyHub a non-exclusive license to display your content
                to other users on the platform</li>
            <li>You can request removal of your content at any time</li>
          </ul>
        </Section>

        <Section title="4. Prohibited Content">
          <p>You may not upload or post content that:</p>
          <ul style={styles.ul}>
            <li>Contains malicious code, scripts, or anything designed to harm users</li>
            <li>Harasses, bullies, or targets other users</li>
            <li>Is sexually explicit or inappropriate</li>
            <li>Promotes violence, discrimination, or hate</li>
            <li>Violates any applicable law</li>
            <li>Is designed to cheat or deceive other students academically</li>
          </ul>
          <p style={{ marginTop: '12px' }}>Violations will result in content removal
          and account suspension.</p>
        </Section>

        <Section title="5. HTML File Safety">
          <p>StudyHub allows users to upload HTML files for study sheets and practice
          tests. All uploaded HTML files are:</p>
          <ul style={styles.ul}>
            <li>Run inside a sandboxed environment that cannot access your account data</li>
            <li>Scanned for malicious code before being made public</li>
            <li>Subject to removal if found to contain harmful scripts</li>
          </ul>
          <p style={{ marginTop: '12px' }}>Never upload HTML files designed to steal
          data, redirect users, or perform any action outside the study content itself.</p>
        </Section>

        <Section title="6. Downloads">
          <p>StudyHub allows users to download study materials for personal offline use.
          Downloaded content remains subject to the original contributor's rights.
          You may not redistribute downloaded content as your own work.</p>
        </Section>

        <Section title="7. Open Source">
          <p>StudyHub's codebase is open source under the MIT License. You are free
          to inspect, fork, and contribute to the code on GitHub. The MIT License
          applies to the code only — not to user-submitted content.</p>
        </Section>

        <Section title="8. No Warranty">
          <p>StudyHub is provided as-is by student developers. We make no guarantees
          about uptime, accuracy of content, or fitness for any particular purpose.
          Study materials are user-generated and have not been verified by educators.</p>
        </Section>

        <Section title="9. Changes to These Terms">
          <p>These terms may be updated as the platform grows. Significant changes
          will be announced via the platform's announcement system. Continued use
          after changes constitutes acceptance.</p>
        </Section>

        <Section title="10. Contact">
          <p>For questions about these terms, open a GitHub Issue on the StudyHub
          repository or contact the maintainer directly through GitHub.</p>
        </Section>

        <div style={styles.backLinks}>
          <Link to="/privacy" style={styles.link}>Privacy Policy</Link>
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
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1e40af',
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

export default TermsPage