import { Link, useLocation } from 'react-router-dom'

function Navbar() {
  const location = useLocation()

  return (
    <nav style={styles.nav}>

      {/* LOGO */}
      <Link to="/" style={styles.logo}>
        Study<span style={styles.logoSpan}>Hub</span>
      </Link>

      {/* NAV LINKS */}
      <ul style={styles.ul}>
        <li>
          <Link
            to="/"
            style={location.pathname === '/' ? styles.linkActive : styles.link}
          >
            Home
          </Link>
        </li>
        <li>
          <Link
            to="/study-sheets"
            style={location.pathname === '/study-sheets' ? styles.linkActive : styles.link}
          >
            Study Sheets
          </Link>
        </li>
        <li>
          <Link
            to="/practice-tests"
            style={location.pathname === '/practice-tests' ? styles.linkActive : styles.link}
          >
            Practice Tests
          </Link>
        </li>
        <li>
          <Link
            to="/syllabus"
            style={location.pathname === '/syllabus' ? styles.linkActive : styles.link}
          >
            Syllabus
          </Link>
        </li>
      </ul>

      {/* AUTH BUTTONS */}
      <div style={styles.authButtons}>
        <Link to="/login" style={styles.loginBtn}>
          Login
        </Link>
        <Link to="/register" style={styles.registerBtn}>
          Sign Up
        </Link>
      </div>

    </nav>
  )
}

const styles = {
  nav: {
    background: '#1e3a5f',
    padding: '16px 40px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    letterSpacing: '1px',
    textDecoration: 'none',
  },
  logoSpan: {
    color: '#60a5fa',
  },
  ul: {
    listStyle: 'none',
    display: 'flex',
    gap: '24px',
    margin: 0,
    padding: 0,
  },
  link: {
    color: '#cbd5e1',
    textDecoration: 'none',
    fontSize: '15px',
  },
  linkActive: {
    color: '#ffffff',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 'bold',
    borderBottom: '2px solid #60a5fa',
    paddingBottom: '2px',
  },
  authButtons: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  loginBtn: {
    color: '#ffffff',
    textDecoration: 'none',
    fontSize: '15px',
  },
  registerBtn: {
    background: '#2563eb',
    color: '#ffffff',
    textDecoration: 'none',
    fontSize: '15px',
    padding: '8px 20px',
    borderRadius: '6px',
  },
}

export default Navbar