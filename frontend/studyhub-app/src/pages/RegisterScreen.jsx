import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import Navbar from '../components/Navbar'

// ── SCHOOL DATA ──────────────────────────────────────────────
const SCHOOLS = [
  { id: 1,  name: 'University of Maryland, Baltimore County (UMBC)', short: 'UMBC'    },
  { id: 2,  name: 'University of Maryland, College Park (UMD)',      short: 'UMD'     },
  { id: 3,  name: 'Towson University',                               short: 'TU'      },
  { id: 4,  name: 'Morgan State University',                         short: 'Morgan'  },
  { id: 5,  name: 'Bowie State University',                          short: 'BSU'     },
  { id: 6,  name: 'Frostburg State University',                      short: 'FSU'     },
  { id: 7,  name: 'Salisbury University',                            short: 'SU'      },
  { id: 8,  name: 'Coppin State University',                         short: 'Coppin'  },
  { id: 9,  name: 'University of Baltimore',                         short: 'UB'      },
  { id: 10, name: 'Maryland Institute College of Art (MICA)',        short: 'MICA'    },
  { id: 11, name: 'Johns Hopkins University',                        short: 'JHU'     },
  { id: 12, name: 'Loyola University Maryland',                      short: 'Loyola'  },
  { id: 13, name: 'Stevenson University',                            short: 'SU'      },
  { id: 14, name: 'Hood College',                                    short: 'Hood'    },
  { id: 15, name: 'McDaniel College',                                short: 'McDaniel'},
  { id: 16, name: 'Washington College',                              short: 'WAC'     },
  { id: 17, name: "St. Mary's College of Maryland",                  short: 'SMCM'    },
  { id: 18, name: 'Notre Dame of Maryland University',               short: 'NDMU'    },
  { id: 19, name: 'Goucher College',                                 short: 'Goucher' },
  { id: 20, name: "Prince George's Community College",               short: 'PGCC'    },
  { id: 21, name: 'Montgomery College',                              short: 'MC'      },
  { id: 22, name: 'Howard Community College',                        short: 'HCC'     },
  { id: 23, name: 'Anne Arundel Community College',                  short: 'AACC'    },
  { id: 24, name: 'Community College of Baltimore County (CCBC)',    short: 'CCBC'    },
  { id: 25, name: 'Frederick Community College',                     short: 'FCC'     },
  { id: 26, name: 'Carroll Community College',                       short: 'CCC'     },
  { id: 27, name: 'Harford Community College',                       short: 'HCC'     },
  { id: 28, name: 'Chesapeake College',                              short: 'CC'      },
  { id: 29, name: 'College of Southern Maryland',                    short: 'CSM'     },
  { id: 30, name: 'Wor-Wic Community College',                       short: 'Wor-Wic' },
]

const COURSES_BY_SCHOOL = {
  1: [ // UMBC
    { code: 'CMSC101', name: 'Introduction to Computer Science'        },
    { code: 'CMSC201', name: 'Computer Science I'                      },
    { code: 'CMSC202', name: 'Computer Science II'                     },
    { code: 'CMSC203', name: 'Discrete Structures'                     },
    { code: 'CMSC331', name: 'Principles of Programming Languages'     },
    { code: 'CMSC341', name: 'Data Structures'                         },
    { code: 'CMSC411', name: 'Computer Architecture'                   },
    { code: 'MATH151', name: 'Calculus and Analytic Geometry I'        },
    { code: 'MATH152', name: 'Calculus and Analytic Geometry II'       },
    { code: 'ENGL100', name: 'Composition'                             },
    { code: 'ECON121', name: 'Principles of Microeconomics'            },
    { code: 'BIOL141', name: 'Foundations of Biology I'                },
    { code: 'PHYS121', name: 'Introductory Physics I'                  },
    { code: 'STAT355', name: 'Introduction to Probability & Statistics'},
  ],
  2: [ // UMD
    { code: 'CMSC131', name: 'Object-Oriented Programming I'           },
    { code: 'CMSC132', name: 'Object-Oriented Programming II'          },
    { code: 'CMSC216', name: 'Introduction to Computer Systems'        },
    { code: 'CMSC250', name: 'Discrete Structures'                     },
    { code: 'CMSC330', name: 'Organization of Programming Languages'   },
    { code: 'CMSC351', name: 'Algorithms'                              },
    { code: 'MATH140', name: 'Calculus I'                              },
    { code: 'MATH141', name: 'Calculus II'                             },
    { code: 'ENGL101', name: 'Academic Writing'                        },
    { code: 'PHYS161', name: 'General Physics I'                       },
  ],
}

const DEFAULT_COURSES = [
  { code: 'MATH101', name: 'College Mathematics'                },
  { code: 'ENG101',  name: 'English Composition'               },
  { code: 'CS101',   name: 'Introduction to Computer Science'  },
  { code: 'BIO101',  name: 'Introduction to Biology'           },
  { code: 'PHYS101', name: 'Physics I'                         },
]

// ── VALIDATION ───────────────────────────────────────────────
const RULES = {
  username: /^[a-zA-Z0-9_]{3,20}$/,
  password: /^(?=.*[A-Z])(?=.*\d).{8,}$/,
}

const COURSE_CODE_REGEX = /^[A-Z0-9-]{2,20}$/

function getStrength(pw) {
  let s = 0
  if (pw.length >= 8)            s++
  if (pw.length >= 12)           s++
  if (/[A-Z]/.test(pw))         s++
  if (/\d/.test(pw))            s++
  if (/[^a-zA-Z0-9]/.test(pw)) s++
  return s
}

const STRENGTH_LEVELS = [
  { label: 'Very Weak',   color: '#ef4444', width: '20%' },
  { label: 'Weak',        color: '#f97316', width: '40%' },
  { label: 'Fair',        color: '#eab308', width: '60%' },
  { label: 'Strong',      color: '#22c55e', width: '80%' },
  { label: 'Very Strong', color: '#16a34a', width: '100%'},
]

// ── COMPONENT ────────────────────────────────────────────────
function RegisterScreen() {
  const [step, setStep]                   = useState(1)
  const schoolSearchRef                   = useRef(null)
  const courseSearchRef                   = useRef(null)

  // Step 1 fields
  const [username, setUsername]           = useState('')
  const [password, setPassword]           = useState('')
  const [confirm, setConfirm]             = useState('')
  const [terms, setTerms]                 = useState(false)
  const [showPass, setShowPass]           = useState(false)
  const [showConfirm, setShowConfirm]     = useState(false)

  // Step 2 fields
  const [schoolQuery, setSchoolQuery]     = useState('')
  const [schoolResults, setSchoolResults] = useState([])
  const [selectedSchool, setSelectedSchool] = useState(null)
  const [courseQuery, setCourseQuery]     = useState('')
  const [courseResults, setCourseResults] = useState([])
  const [selectedCourses, setSelectedCourses] = useState([])
  const [customCode, setCustomCode]       = useState('')
  const [customName, setCustomName]       = useState('')
  const [customCourses, setCustomCourses] = useState([])

  // UI state
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState(false)
  const [showSchoolDD, setShowSchoolDD]   = useState(false)
  const [showCourseDD, setShowCourseDD]   = useState(false)

  // ── Derived ──────────────────────────────────────────────
  const strength     = password ? getStrength(password) : 0
  const strengthInfo = STRENGTH_LEVELS[Math.min(strength - 1, 4)] || STRENGTH_LEVELS[0]

  const usernameValid = RULES.username.test(username)
  const passwordValid = RULES.password.test(password)
  const passwordsMatch = password === confirm && confirm.length > 0

  useEffect(() => {
    function handlePointerDown(event) {
      if (schoolSearchRef.current && !schoolSearchRef.current.contains(event.target)) {
        setShowSchoolDD(false)
      }

      if (courseSearchRef.current && !courseSearchRef.current.contains(event.target)) {
        setShowCourseDD(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setShowSchoolDD(false)
        setShowCourseDD(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // ── Step 1 → Step 2 ──────────────────────────────────────
  function goToStep2() {
    if (!username || !password || !confirm) { setError('Please fill in all fields.'); return }
    if (!usernameValid)   { setError('Username: 3–20 characters, letters/numbers/underscores only.'); return }
    if (!passwordValid)   { setError('Password needs 8+ characters, a capital letter, and a number.'); return }
    if (!passwordsMatch)  { setError('Passwords do not match.'); return }
    if (!terms)           { setError('Please agree to the Terms of Use.'); return }
    setError('')
    setStep(2)
  }

  // ── School search ─────────────────────────────────────────
  function handleSchoolSearch(q) {
    setSchoolQuery(q)
    if (!q.trim()) { setSchoolResults([]); setShowSchoolDD(false); return }
    const matches = SCHOOLS.filter(s =>
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.short.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8)
    setSchoolResults(matches)
    setShowSchoolDD(true)
  }

  function selectSchool(school) {
    setSelectedSchool(school)
    setSchoolQuery('')
    setSchoolResults([])
    setShowSchoolDD(false)
    setCourseQuery('')
    setSelectedCourses([])
    setCustomCourses([])
    setCustomCode('')
    setCustomName('')
    buildCourseResults('', school, [])
    setShowCourseDD(false)
  }

  function clearSchool() {
    setSelectedSchool(null)
    setSchoolQuery('')
    setShowSchoolDD(false)
    setSelectedCourses([])
    setCustomCourses([])
    setCustomCode('')
    setCustomName('')
    setCourseResults([])
    setShowCourseDD(false)
  }

  // ── Course search ─────────────────────────────────────────
  function buildCourseResults(q, school, alreadyPicked) {
    const pool = (school && COURSES_BY_SCHOOL[school.id]) || DEFAULT_COURSES
    const taken = alreadyPicked.map(c => c.code)
    const matches = pool.filter(c =>
      !taken.includes(c.code) &&
      (c.code.toLowerCase().includes(q.toLowerCase()) ||
       c.name.toLowerCase().includes(q.toLowerCase()))
    ).slice(0, 8)
    setCourseResults(matches)
  }

  function handleCourseSearch(q) {
    setCourseQuery(q)
    buildCourseResults(q, selectedSchool, selectedCourses)
    setShowCourseDD(true)
  }

  function addCourse(course) {
    if (selectedCourses.length + customCourses.length >= 10) {
      setError('Maximum 10 courses total (selected + custom).')
      return
    }

    if (selectedCourses.find(c => c.code === course.code)) return

    const normalizedCode = String(course.code || '').toUpperCase()

    if (customCourses.find(c => c.code === normalizedCode)) {
      setCustomCourses(prev => prev.filter(c => c.code !== normalizedCode))
    }

    const next = [...selectedCourses, course]
    setSelectedCourses(next)
    setCourseQuery('')
    buildCourseResults('', selectedSchool, next)
    setShowCourseDD(false)
    setError('')
  }

  function removeCourse(code) {
    const next = selectedCourses.filter(c => c.code !== code)
    setSelectedCourses(next)
    buildCourseResults(courseQuery, selectedSchool, next)
  }

  function addCustomCourse() {
    const code = customCode.trim().toUpperCase()
    const name = customName.trim()

    if (!code || !name) {
      setError('Enter both custom course code and name.')
      return
    }

    if (!COURSE_CODE_REGEX.test(code)) {
      setError('Custom course code must be 2-20 characters (A-Z, 0-9, or -).')
      return
    }

    if (name.length < 2 || name.length > 120) {
      setError('Custom course name must be between 2 and 120 characters.')
      return
    }

    if (selectedCourses.length + customCourses.length >= 10) {
      setError('Maximum 10 courses total (selected + custom).')
      return
    }

    if (selectedCourses.some(c => String(c.code).toUpperCase() === code)) {
      setError('This course is already selected from the list.')
      return
    }

    if (customCourses.some(c => c.code === code)) {
      setError('This custom course was already added.')
      return
    }

    setCustomCourses(prev => [...prev, { code, name }])
    setCustomCode('')
    setCustomName('')
    setError('')
  }

  function removeCustomCourse(code) {
    setCustomCourses(prev => prev.filter(c => c.code !== code))
  }

  // ── Final submit ──────────────────────────────────────────
  // Register with backend, persist auth data, and move user into the app.
  async function submitForm(skip = false) {
    if (!skip && selectedCourses.length === 0 && customCourses.length === 0 && selectedSchool) {
      setError('Add at least one course, or skip to do it later.')
      return
    }

    setError('')

    const selectedCourseIds = selectedCourses
      .map(course => Number(course.id))
      .filter(Number.isInteger)

    const fallbackCustomCourses = selectedCourses
      .filter(course => !course.id)
      .map(course => ({
        code: String(course.code || '').trim().toUpperCase(),
        name: String(course.name || course.code || 'Custom Course').trim()
      }))
      .filter(course => course.code && course.name)

    const customByCode = new Map()

    customCourses.forEach(course => {
      customByCode.set(course.code, course)
    })

    fallbackCustomCourses.forEach(course => {
      if (!customByCode.has(course.code)) {
        customByCode.set(course.code, course)
      }
    })

    const payloadCustomCourses = Array.from(customByCode.values())

    try {
      const res = await fetch('http://localhost:4000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          schoolId: selectedSchool?.id || null,
          courseIds: selectedCourseIds,
          customCourses: payloadCustomCourses
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        return
      }

      // Save token
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))

      setError('')
      setSuccess(true)
      setTimeout(() => { window.location.href = '/dashboard' }, 2000)
    } catch {
      setError('Could not connect to server. Make sure the backend is running.')
    }
  }

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <Navbar />

      <div style={s.center}>
        <div style={s.card}>

          {/* PROGRESS BAR */}
          <div style={s.progressWrap}>
            <div style={s.progressSteps}>
              <div style={{ ...s.circle, ...(step === 1 ? s.circleActive : s.circleDone) }}>
                {step === 1 ? '1' : <i className="fas fa-check" style={{ fontSize: '12px' }}></i>}
              </div>
              <div style={{ ...s.line, ...(step === 2 ? s.lineDone : {}) }} />
              <div style={{ ...s.circle, ...(step === 2 ? s.circleActive : {}) }}>2</div>
            </div>
            <div style={s.progressLabels}>
              <span style={{ ...s.stepLabel, ...(step === 1 ? s.stepLabelActive : s.stepLabelDone) }}>Account</span>
              <span style={{ ...s.stepLabel, ...(step === 2 ? s.stepLabelActive : {}) }}>Your Courses</span>
            </div>
          </div>

          {/* ALERTS */}
          {error && (
            <div style={s.errorBox}>
              <i className="fas fa-circle-exclamation" style={{ marginRight: '8px' }}></i>
              {error}
            </div>
          )}
          {success && (
            <div style={s.successBox}>
              <i className="fas fa-circle-check" style={{ marginRight: '8px' }}></i>
              Account created! Redirecting to dashboard...
            </div>
          )}

          {/* ════ STEP 1 ════ */}
          {step === 1 && (
            <div>
              <div style={s.panelTop}>
                <i className="fas fa-user-plus" style={s.panelIcon}></i>
                <h1 style={s.h1}>Create Account</h1>
                <p style={s.sub}>Join StudyHub — no email required</p>
              </div>

              {/* USERNAME */}
              <div style={s.formGroup}>
                <label style={s.label}>Username</label>
                <div style={s.inputWrap}>
                  <i className="fas fa-user" style={s.inputIcon}></i>
                  <input
                    type="text"
                    placeholder="Choose a username"
                    maxLength={20}
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError('') }}
                    style={{
                      ...s.input,
                      borderColor: username
                        ? (usernameValid ? '#16a34a' : '#dc2626')
                        : '#e5e7eb'
                    }}
                    onFocus={e => { if (!username) e.target.style.borderColor = '#2563eb' }}
                    onBlur={e  => { if (!username) e.target.style.borderColor = '#e5e7eb' }}
                  />
                  {username && (
                    <i className={`fas ${usernameValid ? 'fa-circle-check' : 'fa-circle-xmark'}`}
                       style={{ ...s.checkIcon, color: usernameValid ? '#16a34a' : '#dc2626' }} />
                  )}
                </div>
                <span style={s.hint}>3–20 characters. Letters, numbers, underscores only.</span>
              </div>

              {/* PASSWORD */}
              <div style={s.formGroup}>
                <label style={s.label}>Password</label>
                <div style={s.inputWrap}>
                  <i className="fas fa-lock" style={s.inputIcon}></i>
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Create a password"
                    maxLength={72}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    style={{
                      ...s.input,
                      paddingRight: '72px',
                      borderColor: password
                        ? (passwordValid ? '#16a34a' : '#dc2626')
                        : '#e5e7eb'
                    }}
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)} style={s.toggleBtn}>
                    <i className={showPass ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                  </button>
                  {password && (
                    <i className={`fas ${passwordValid ? 'fa-circle-check' : 'fa-circle-xmark'}`}
                       style={{ ...s.checkIcon, color: passwordValid ? '#16a34a' : '#dc2626', right: '38px' }} />
                  )}
                </div>
                {/* Strength bar */}
                {password && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={s.strengthTrack}>
                      <div style={{ ...s.strengthFill, width: strengthInfo.width, background: strengthInfo.color }} />
                    </div>
                    <span style={{ fontSize: '11px', color: strengthInfo.color }}>{strengthInfo.label}</span>
                  </div>
                )}
                <span style={s.hint}>Min 8 characters. Include a number and a capital letter.</span>
              </div>

              {/* CONFIRM PASSWORD */}
              <div style={s.formGroup}>
                <label style={s.label}>Confirm Password</label>
                <div style={s.inputWrap}>
                  <i className="fas fa-lock" style={s.inputIcon}></i>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    maxLength={72}
                    value={confirm}
                    onChange={e => { setConfirm(e.target.value); setError('') }}
                    style={{
                      ...s.input,
                      paddingRight: '72px',
                      borderColor: confirm
                        ? (passwordsMatch ? '#16a34a' : '#dc2626')
                        : '#e5e7eb'
                    }}
                  />
                  <button type="button" onClick={() => setShowConfirm(p => !p)} style={s.toggleBtn}>
                    <i className={showConfirm ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                  </button>
                  {confirm && (
                    <i className={`fas ${passwordsMatch ? 'fa-circle-check' : 'fa-circle-xmark'}`}
                       style={{ ...s.checkIcon, color: passwordsMatch ? '#16a34a' : '#dc2626', right: '38px' }} />
                  )}
                </div>
                {confirm && (
                  <span style={{ fontSize: '11px', color: passwordsMatch ? '#16a34a' : '#dc2626', marginTop: '4px', display: 'block' }}>
                    {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </span>
                )}
              </div>

              {/* TERMS */}
              <div style={s.termsRow}>
                <input
                  type="checkbox"
                  id="terms"
                  checked={terms}
                  onChange={e => setTerms(e.target.checked)}
                  style={{ accentColor: '#2563eb', width: '14px', height: '14px', flexShrink: 0, marginTop: '2px' }}
                />
                <label htmlFor="terms" style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5' }}>
                  I agree to the{' '}
                  <Link to="/terms" style={s.termsLink}>Terms of Use</Link> and{' '}
                  <Link to="/guidelines" style={s.termsLink}>Community Guidelines</Link>.
                  I understand my content may be visible to other students.
                </label>
              </div>

              <button onClick={goToStep2} style={s.btnPrimary}>
                Continue <i className="fas fa-arrow-right" style={{ marginLeft: '8px' }}></i>
              </button>

              <div style={s.dividerWrap}>
                <div style={s.divLine} /><span style={s.divText}>or</span><div style={s.divLine} />
              </div>
              <p style={{ textAlign: 'center', fontSize: '13px', color: '#6b7280', margin: 0 }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: '#2563eb', fontWeight: 'bold', textDecoration: 'none' }}>
                  Sign in here
                </Link>
              </p>
            </div>
          )}

          {/* ════ STEP 2 ════ */}
          {step === 2 && (
            <div>
              <div style={s.panelTop}>
                <i className="fas fa-graduation-cap" style={s.panelIcon}></i>
                <h1 style={s.h1}>Your Courses</h1>
                <p style={s.sub}>Find your school and add your courses</p>
              </div>

              {/* SCHOOL SEARCH */}
              <div style={s.formGroup}>
                <label style={s.label}>School</label>

                {!selectedSchool ? (
                  <div ref={schoolSearchRef} style={{ position: 'relative' }}>
                    <div style={s.inputWrap}>
                      <i className="fas fa-university" style={s.inputIcon}></i>
                      <input
                        type="text"
                        placeholder="Search your school (e.g. UMBC, Towson...)"
                        value={schoolQuery}
                        onChange={e => handleSchoolSearch(e.target.value)}
                        onFocus={() => schoolQuery && setShowSchoolDD(true)}
                        style={s.input}
                        autoComplete="off"
                      />
                    </div>
                    {showSchoolDD && schoolResults.length > 0 && (
                      <div style={s.dropdown}>
                        {schoolResults.map(school => (
                          <div key={school.id} style={s.dropdownItem}
                               onClick={() => selectSchool(school)}
                               onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                               onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <i className="fas fa-university" style={{ color: '#9ca3af', marginRight: '8px', fontSize: '12px' }}></i>
                            {school.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {showSchoolDD && schoolQuery && schoolResults.length === 0 && (
                      <div style={s.dropdown}>
                        <div style={s.dropdownEmpty}>No schools found — try a different search</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={s.selectedSchoolBadge}>
                    <i className="fas fa-university" style={{ color: '#2563eb' }}></i>
                    <span style={{ flex: 1, fontWeight: 'bold', fontSize: '13px' }}>{selectedSchool.name}</span>
                    <button onClick={clearSchool} style={s.clearBtn} title="Change school">
                      <i className="fas fa-xmark"></i>
                    </button>
                  </div>
                )}
              </div>

              {/* COURSES */}
              {selectedSchool && (
                <div style={s.formGroup}>
                  <label style={s.label}>
                    Your Courses{' '}
                    <span style={{ fontWeight: 'normal', color: '#9ca3af' }}>(up to 10)</span>
                  </label>

                  {/* Course tags */}
                  {selectedCourses.length > 0 && (
                    <div style={s.tagsRow}>
                      {selectedCourses.map(c => (
                        <div key={c.code} style={s.tag}>
                          {c.code}
                          <button onClick={() => removeCourse(c.code)} style={s.tagRemove}>
                            <i className="fas fa-xmark"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Course search */}
                  <div ref={courseSearchRef} style={{ position: 'relative' }}>
                    <div style={s.inputWrap}>
                      <i className="fas fa-search" style={s.inputIcon}></i>
                      <input
                        type="text"
                        placeholder="Search by course name or code..."
                        value={courseQuery}
                        onChange={e => handleCourseSearch(e.target.value)}
                        onFocus={() => { buildCourseResults(courseQuery, selectedSchool, selectedCourses); setShowCourseDD(true) }}
                        style={s.input}
                        autoComplete="off"
                      />
                    </div>
                    {showCourseDD && courseResults.length > 0 && (
                      <div style={s.dropdown}>
                        {courseResults.map(c => (
                          <div key={c.code} style={s.dropdownItem}
                               onClick={() => addCourse(c)}
                               onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                               onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <span style={{ fontWeight: 'bold', color: '#2563eb', marginRight: '8px' }}>{c.code}</span>
                            {c.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {showCourseDD && courseResults.length === 0 && (
                      <div style={s.dropdown}>
                        <div style={s.dropdownEmpty}>No courses found</div>
                      </div>
                    )}
                  </div>

                  <span style={s.hint}>
                    <i className="fas fa-info-circle" style={{ marginRight: '4px' }}></i>
                    Can't find your course? Add it below and we will save it.
                  </span>

                  {/* Custom course entry */}
                  <div style={s.customWrap}>
                    <label style={s.label}>Add Custom Course</label>
                    <div style={s.customRow}>
                      <input
                        type="text"
                        placeholder="Code (e.g. CMSC499)"
                        value={customCode}
                        onChange={e => setCustomCode(e.target.value.toUpperCase())}
                        style={s.customCodeInput}
                      />
                      <input
                        type="text"
                        placeholder="Course name"
                        value={customName}
                        onChange={e => setCustomName(e.target.value)}
                        style={s.customNameInput}
                      />
                      <button type="button" onClick={addCustomCourse} style={s.customAddBtn}>
                        Add
                      </button>
                    </div>

                    {customCourses.length > 0 && (
                      <div style={s.tagsRow}>
                        {customCourses.map(course => (
                          <div key={course.code} style={s.customTag} title={course.name}>
                            {course.code}
                            <button onClick={() => removeCustomCourse(course.code)} style={s.tagRemove}>
                              <i className="fas fa-xmark"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* BACK + SUBMIT */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => { setStep(1); setError('') }} style={s.btnSecondary}>
                  <i className="fas fa-arrow-left"></i> Back
                </button>
                <button onClick={() => submitForm(false)} style={{ ...s.btnPrimary, flex: 1 }}>
                  <i className="fas fa-user-plus" style={{ marginRight: '8px' }}></i>
                  Create Account
                </button>
              </div>

              <p style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>
                <span
                  onClick={() => submitForm(true)}
                  style={{ color: '#6b7280', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Skip for now — I'll add courses later
                </span>
              </p>
            </div>
          )}

        </div>
      </div>

      <footer style={s.footer}>
        Built by students, for students ·{' '}
        <span style={{ color: '#60a5fa' }}>StudyHub</span> · Open Source on GitHub
      </footer>
    </div>
  )
}

// ── STYLES ────────────────────────────────────────────────────
const s = {
  page:           { minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', background: '#f0f4f8', color: '#111827' },
  center:         { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' },
  card:           { background: 'white', borderRadius: '16px', padding: '48px 40px', width: '100%', maxWidth: '500px', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' },
  progressWrap:   { marginBottom: '32px' },
  progressSteps:  { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '10px' },
  circle:         { width: '34px', height: '34px', borderRadius: '50%', border: '2px solid #e5e7eb', background: 'white', color: '#9ca3af', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  circleActive:   { borderColor: '#2563eb', background: '#2563eb', color: 'white' },
  circleDone:     { borderColor: '#16a34a', background: '#16a34a', color: 'white' },
  line:           { flex: 1, height: '2px', background: '#e5e7eb', maxWidth: '80px', transition: 'background 0.3s' },
  lineDone:       { background: '#16a34a' },
  progressLabels: { display: 'flex', justifyContent: 'space-between', padding: '0 4px' },
  stepLabel:      { fontSize: '11px', color: '#9ca3af', textAlign: 'center', width: '80px' },
  stepLabelActive:{ color: '#2563eb', fontWeight: 'bold' },
  stepLabelDone:  { color: '#16a34a' },
  errorBox:       { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' },
  successBox:     { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' },
  panelTop:       { textAlign: 'center', marginBottom: '24px' },
  panelIcon:      { fontSize: '36px', color: '#2563eb', marginBottom: '10px', display: 'block' },
  h1:             { fontSize: '24px', color: '#1e3a5f', marginBottom: '4px', fontWeight: 'bold' },
  sub:            { fontSize: '13px', color: '#6b7280', margin: 0 },
  formGroup:      { marginBottom: '16px' },
  label:          { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#374151', marginBottom: '6px' },
  inputWrap:      { position: 'relative' },
  inputIcon:      { position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '14px' },
  input:          { width: '100%', padding: '11px 14px 11px 38px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#111827', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' },
  checkIcon:      { position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px' },
  toggleBtn:      { position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '14px', padding: 0 },
  strengthTrack:  { height: '4px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' },
  strengthFill:   { height: '100%', borderRadius: '999px', transition: 'width 0.3s, background 0.3s' },
  hint:           { fontSize: '11px', color: '#9ca3af', marginTop: '4px', display: 'block' },
  termsRow:       { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '18px' },
  termsLink:      { color: '#2563eb', textDecoration: 'none' },
  btnPrimary:     { width: '100%', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '13px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' },
  btnSecondary:   { background: 'white', color: '#374151', border: '2px solid #e5e7eb', borderRadius: '8px', padding: '13px 20px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' },
  dividerWrap:    { display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' },
  divLine:        { flex: 1, height: '1px', background: '#e5e7eb' },
  divText:        { fontSize: '12px', color: '#9ca3af' },
  dropdown:       { position: 'absolute', top: '100%', left: 0, right: 0, border: '2px solid #e5e7eb', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', background: 'white', zIndex: 100, marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
  dropdownItem:   { padding: '10px 14px', fontSize: '13px', cursor: 'pointer', background: 'white', transition: 'background 0.15s' },
  dropdownEmpty:  { padding: '12px 14px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' },
  selectedSchoolBadge: { display: 'flex', alignItems: 'center', gap: '10px', background: '#eff6ff', border: '2px solid #2563eb', borderRadius: '8px', padding: '10px 14px', color: '#1e3a5f' },
  clearBtn:       { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '14px', padding: 0, marginLeft: 'auto' },
  tagsRow:        { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' },
  tag:            { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a5f', borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' },
  customWrap:     { marginTop: '10px', padding: '10px', border: '1px dashed #d1d5db', borderRadius: '8px', background: '#f8fafc' },
  customRow:      { display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginBottom: '8px' },
  customCodeInput:{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none' },
  customNameInput:{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', outline: 'none' },
  customAddBtn:   { background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' },
  customTag:      { background: '#ecfeff', border: '1px solid #99f6e4', color: '#115e59', borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' },
  tagRemove:      { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '11px', padding: 0 },
  footer:         { background: '#1e3a5f', color: '#94a3b8', textAlign: 'center', padding: '20px', fontSize: '13px' },
}

export default RegisterScreen