import { Link, useLocation, useNavigate } from 'react-router-dom'
import LogoDark from '../assets/logo-dark.svg'

const NAV_LINKS = [
  { label: 'Home',           to: '/'             },
  { label: 'Study Sheets',   to: '/sheets'        },
  { label: 'Practice Tests', to: '/tests'         },
  { label: 'Announcements',  to: '/announcements' },
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
          <img src={LogoDark} height="36" alt="StudyHub" style={styles.logoImage} />
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
                    event.currentTarget.style.color = '#ffffff'
                    event.currentTarget.style.background = 'rgba(148, 163, 184, 0.2)'
                  }
                }}
                onMouseLeave={(event) => {
                  if (!active) {
                    event.currentTarget.style.color = 'rgba(255, 255, 255, 0.86)'
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
                  event.currentTarget.style.background = '#1f2937'
                  event.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                  event.currentTarget.style.color = '#ffffff'
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
                  event.currentTarget.style.borderColor = '#f87171'
                  event.currentTarget.style.color = '#fecaca'
                  event.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'
                  event.currentTarget.style.color = '#ffffff'
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
                  event.currentTarget.style.borderColor = '#93c5fd'
                  event.currentTarget.style.color = '#ffffff'
                  event.currentTarget.style.background = 'rgba(59, 130, 246, 0.18)'
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'
                  event.currentTarget.style.color = '#ffffff'
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
    background: '#000000',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid #1f2937',
    boxShadow: '0 1px 12px rgba(0,0,0,0.45)',
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
    gap: 0,
    textDecoration: 'none',
    flexShrink: 0
  },
  logoImage: {
    display: 'block'
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
    color: 'rgba(255, 255, 255, 0.86)',
    background: 'transparent',
    textDecoration: 'none',
    transition: 'all 0.15s'
  },
  navLinkActive: {
    color: '#ffffff',
    background: 'rgba(59, 130, 246, 0.32)',
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
    color: '#ffffff',
    background: 'rgba(255, 255, 255, 0.08)',
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
    border: '1px solid rgba(255, 255, 255, 0.25)',
    color: '#ffffff',
    transition: 'all 0.15s'
  },
  loginBtn: {
    padding: '7px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: '#ffffff',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.25)',
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