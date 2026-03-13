import { Link, useLocation, useNavigate } from 'react-router-dom'

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Study Sheets', to: '/study-sheets' },
  { label: 'Practice Tests', to: '/practice-tests' },
  { label: 'Syllabus', to: '/syllabus' }
]

export default function Navbar({ user, onLogout }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  function isActive(linkPath) {
    if (linkPath === '/') {
      return pathname === '/'
    }

    return pathname === linkPath || pathname.startsWith(`${linkPath}/`)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')

    if (typeof onLogout === 'function') {
      onLogout()
      return
    }

    navigate('/')
  }

  return (
    <nav style={styles.nav}>
      <div style={styles.navInner}>

        <Link to="/" style={styles.logo}>
          <div style={styles.logoIconWrap} aria-hidden="true">
            <i className="fa-solid fa-book-open" style={styles.logoIcon} />
          </div>
          <span style={styles.logoText}>
            Study<span style={styles.logoAccent}>Hub</span>
          </span>
        </Link>

        <div style={styles.linksWrap}>
          {NAV_LINKS.map((link) => {
            const active = isActive(link.to)

            return (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  ...styles.navLink,
                  ...(active ? styles.navLinkActive : null)
                }}
                onMouseEnter={(event) => {
                  if (!active) {
                    event.currentTarget.style.color = 'var(--navy)'
                    event.currentTarget.style.background = 'var(--slate-light)'
                  }
                }}
                onMouseLeave={(event) => {
                  if (!active) {
                    event.currentTarget.style.color = 'var(--slate)'
                    event.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                {link.label}
              </Link>
            )
          })}
        </div>

        <div style={styles.authWrap}>
          {user ? (
            <>
              <Link
                to="/dashboard"
                style={styles.userChip}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'var(--border)'
                  event.currentTarget.style.color = 'var(--navy)'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'var(--slate-light)'
                  event.currentTarget.style.color = 'var(--slate)'
                }}
              >
                <div style={styles.userAvatar}>
                  {user.username?.[0]?.toUpperCase()}
                </div>
                <span style={styles.userName}>{user.username}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                style={styles.logoutBtn}
                onMouseEnter={(event) => {
                  event.currentTarget.style.borderColor = 'var(--red)'
                  event.currentTarget.style.color = 'var(--red)'
                  event.currentTarget.style.background = '#fff5f5'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = 'var(--border)'
                  event.currentTarget.style.color = 'var(--slate)'
                  event.currentTarget.style.background = 'transparent'
                }}
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                style={styles.loginBtn}
                onMouseEnter={(event) => {
                  event.currentTarget.style.borderColor = '#cbd5e1'
                  event.currentTarget.style.color = 'var(--navy)'
                  event.currentTarget.style.background = '#f8fafc'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = 'var(--border)'
                  event.currentTarget.style.color = 'var(--slate)'
                  event.currentTarget.style.background = 'transparent'
                }}
              >
                Login
              </Link>
              <Link
                to="/register"
                style={styles.registerBtn}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = 'translateY(-1px)'
                  event.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.45)'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = 'translateY(0)'
                  event.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.35)'
                }}
              >
                Sign Up Free
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

const styles = {
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 200,
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(226,232,240,0.8)',
    boxShadow: '0 1px 12px rgba(0,0,0,0.06)',
    fontFamily: 'var(--font)'
  },
  navInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 32px',
    height: 68,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
    flexShrink: 0
  },
  logoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(135deg, var(--blue-dark), var(--blue))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(59,130,246,0.35)'
  },
  logoIcon: {
    fontSize: 16,
    color: 'var(--white)'
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--navy)',
    letterSpacing: '-0.4px'
  },
  logoAccent: {
    color: 'var(--blue)'
  },
  linksWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minWidth: 0
  },
  navLink: {
    padding: '7px 14px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--slate)',
    background: 'transparent',
    textDecoration: 'none',
    transition: 'all 0.15s'
  },
  navLinkActive: {
    color: 'var(--blue-dark)',
    background: 'var(--blue-light)',
    fontWeight: 600
  },
  authWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0
  },
  userChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 14px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--slate)',
    background: 'var(--slate-light)',
    textDecoration: 'none',
    transition: 'all 0.15s',
    maxWidth: 220
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--blue), var(--purple))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--white)',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0
  },
  userName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  logoutBtn: {
    padding: '7px 16px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--slate)',
    transition: 'all 0.15s'
  },
  loginBtn: {
    padding: '7px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--slate)',
    background: 'transparent',
    border: '1px solid var(--border)',
    transition: 'all 0.15s',
    textDecoration: 'none'
  },
  registerBtn: {
    padding: '8px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--white)',
    background: 'linear-gradient(135deg, var(--blue-dark), var(--blue))',
    boxShadow: '0 4px 12px rgba(59,130,246,0.35)',
    transition: 'all 0.15s',
    textDecoration: 'none'
  }
}