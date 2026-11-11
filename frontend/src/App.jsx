
import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API = 'http://localhost:8080'

function App() {
  const [classes, setClasses] = useState([])
  const [studentId, setStudentId] = useState('')
  const [myHolds, setMyHolds] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activePage, setActivePage] = useState('dashboard')
  const [accountLoaded, setAccountLoaded] = useState(false)

  // API Request
  async function request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Student-Id': studentId.trim(),
      ...options.headers
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers
    })

    const text = await response.text()

    let data = null

    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { message: text }
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.title ||
        data?.detail ||
        data?.error ||
        `HTTP ${response.status}`
      )
    }

    return data
  }

  // Handle API list response
  function getList(data) {
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.value)) return data.value
    if (Array.isArray(data?.items)) return data.items
    if (Array.isArray(data?.classes)) return data.classes
    if (Array.isArray(data?.holds)) return data.holds

    return []
  }

  // Validate Registration Number
  function validateStudentId() {
    if (!/^\d{17}$/.test(studentId.trim())) {
      setError(
        'Please enter a valid 17-digit Birth Registration Number.'
      )
      return false
    }

    return true
  }

  // Load Classes
  async function loadClasses() {
    const response = await fetch(`${API}/classes`)

    if (!response.ok) {
      throw new Error(
        `Unable to load classes. HTTP ${response.status}`
      )
    }

    const data = await response.json()

    setClasses(getList(data))
  }

  // Load Student Applications
  async function fetchMyHolds() {
    const data = await request('/me/holds')

    const applications = getList(data)

    setMyHolds(applications)
    setAccountLoaded(true)

    return applications
  }

  // Load My Applications
  async function loadMyHolds() {
    if (!validateStudentId()) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const applications = await fetchMyHolds()

      setMessage(
        applications.length > 0
          ? `${applications.length} application(s) found successfully!`
          : 'No applications found for this Student ID.'
      )

      setActivePage('applications')
    } catch (err) {
      setAccountLoaded(false)
      setMyHolds([])

      setError(
        `Could not load applications: ${err.message}`
      )
    } finally {
      setLoading(false)
    }
  }

  // Initial Classes Load
  useEffect(() => {
    loadClasses().catch(err => {
      setError(err.message)
    })
  }, [])

  // Registration Number Change
  function handleStudentIdChange(value) {
    setStudentId(
      value.replace(/\D/g, '').slice(0, 17)
    )

    setMyHolds([])
    setAccountLoaded(false)
    setMessage('')
    setError('')
  }

  // Refresh Dashboard
  async function refreshData() {
    setLoading(true)
    setError('')
    setMessage('')

    try {
      await loadClasses()

      if (/^\d{17}$/.test(studentId.trim())) {
        await fetchMyHolds()
      }

      setMessage('Dashboard refreshed successfully!')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Reserve Seat
  async function apply(classId) {
    if (!validateStudentId()) {
      document.getElementById('profile')?.scrollIntoView({
        behavior: 'smooth'
      })
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const data = await request(
        `/classes/${encodeURIComponent(classId)}/holds`,
        {
          method: 'POST'
        }
      )

      setMessage(
        `Seat reserved successfully! Hold ID: ${data?.holdId || 'Created'}`
      )

      await loadClasses()

      await fetchMyHolds()

      setActivePage('applications')

      document.getElementById('applications')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })

    } catch (err) {
      setError(`Reservation failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Confirm Admission
  async function confirm(holdId) {
    setLoading(true)
    setError('')
    setMessage('')

    try {
      await request(
        `/holds/${encodeURIComponent(holdId)}/confirm`,
        {
          method: 'POST'
        }
      )

      setMessage('Admission confirmed successfully!')

      await loadClasses()
      await fetchMyHolds()

    } catch (err) {
      setError(
        `Confirmation failed: ${err.message}`
      )
    } finally {
      setLoading(false)
    }
  }

  // Cancel Application
  async function cancel(holdId) {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this application?'
    )

    if (!confirmed) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      await request(
        `/holds/${encodeURIComponent(holdId)}`,
        {
          method: 'DELETE'
        }
      )

      setMessage('Application cancelled successfully!')

      await loadClasses()
      await fetchMyHolds()

    } catch (err) {
      setError(
        `Cancellation failed: ${err.message}`
      )
    } finally {
      setLoading(false)
    }
  }

  // Dashboard Statistics
  const stats = useMemo(() => ({
    totalClasses: classes.length,

    totalSeats: classes.reduce(
      (sum, item) =>
        sum + (Number(item.totalSeats) || 0),
      0
    ),

    availableSeats: classes.reduce(
      (sum, item) =>
        sum + (Number(item.availableSeats) || 0),
      0
    ),

    applications: myHolds.length,

    confirmed: myHolds.filter(
      item => item.status === 'CONFIRMED'
    ).length,

    pending: myHolds.filter(
      item => item.status === 'HELD'
    ).length

  }), [classes, myHolds])

  // Navigation Items
  const navItems = [
    {
      id: 'dashboard',
      icon: '▦',
      label: 'Dashboard',
      target: 'dashboard'
    },
    {
      id: 'classes',
      icon: '▤',
      label: 'Available Classes',
      target: 'classes'
    },
    {
      id: 'applications',
      icon: '▣',
      label: 'My Applications',
      target: 'applications'
    },
    {
      id: 'profile',
      icon: '♙',
      label: 'Student Profile',
      target: 'profile'
    }
  ]

  // UPDATED NAVIGATION FUNCTION
  function navigate(item) {
    setActivePage(item.id)
    setMenuOpen(false)

    // Automatically load applications
    // when My Applications is clicked
    if (item.id === 'applications') {

      if (!/^\d{17}$/.test(studentId.trim())) {
        setError(
          'Please enter your 17-digit Birth Registration Number first.'
        )

        document.getElementById('profile')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })

        return
      }

      loadMyHolds()
    }

    document.getElementById(item.target)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }

  // Student Initial
  const studentInitial = studentId
    ? studentId.slice(-2)
    : 'ST'

  // Format Date
  function formatDate(date) {
    if (!date) return '—'

    const parsed = new Date(date)

    return Number.isNaN(parsed.getTime())
      ? '—'
      : parsed.toLocaleString()
  }

  return (
    <div className="dashboard-layout">

      {/* Sidebar Overlay */}
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>

        <div className="sidebar-brand">
          <div className="brand-icon">S</div>

          <div>
            <h2>School Admission</h2>
            <span>Management Portal</span>
          </div>
        </div>

        <div className="sidebar-label">
          MAIN MENU
        </div>

        <nav className="sidebar-nav">

          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${
                activePage === item.id ? 'active' : ''
              }`}
              onClick={() => navigate(item)}
            >
              <span className="nav-icon">
                {item.icon}
              </span>

              {item.label}

              {activePage === item.id && (
                <span className="nav-indicator" />
              )}
            </button>
          ))}

        </nav>

        <div className="sidebar-help">
          <div className="help-icon">?</div>

          <h3>Need Help?</h3>

          <p>
            Contact your school admission office
            for assistance.
          </p>
        </div>

        <div className="sidebar-footer">
          <span className="online-dot" />
          System Online
          <span className="version">v1.0</span>
        </div>

      </aside>

      {/* Main Area */}
      <div className="main-area">

        {/* Header */}
        <header className="topbar">

          <div className="topbar-left">

            <button
              className="menu-toggle"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>

            <div>
              <span className="breadcrumb">
                School Admission /
              </span>

              <strong>
                {
                  navItems.find(
                    item => item.id === activePage
                  )?.label || 'Dashboard'
                }
              </strong>
            </div>

          </div>

          <div className="topbar-right">

            <span className="header-date">
              {new Date().toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}
            </span>

            <div className="profile-mini">

              <div className="avatar">
                {studentInitial}
              </div>

              <div className="profile-mini-text">
                <strong>Student Account</strong>

                <span>
                  {accountLoaded
                    ? 'Registered Student'
                    : 'Guest Student'}
                </span>
              </div>

            </div>

          </div>

        </header>

        {/* Dashboard Content */}
        <main
          className="dashboard-content"
          id="dashboard"
        >

          {/* Welcome Banner */}
          <section className="welcome-banner">

            <div className="welcome-content">

              <span className="welcome-tag">
                STUDENT DASHBOARD
              </span>

              <h1>
                Welcome to School Admission! 👋
              </h1>

              <p>
                Manage your admission journey, explore available
                classes and track your applications.
              </p>

              <button
                className="welcome-button"
                onClick={() => navigate(navItems[1])}
              >
                Explore Classes <span>→</span>
              </button>

            </div>

            <div className="welcome-decoration">
              🎓
            </div>

          </section>

          {/* Statistics */}
          <section className="stats-grid">

            <article className="stat-card">

              <div className="stat-icon blue">▤</div>

              <div>
                <span>Total Classes</span>
                <h2>{stats.totalClasses}</h2>
                <small>Available programs</small>
              </div>

            </article>

            <article className="stat-card">

              <div className="stat-icon purple">♙</div>

              <div>
                <span>My Applications</span>

                <h2>
                  {accountLoaded ? stats.applications : '—'}
                </h2>

                <small>All application records</small>
              </div>

            </article>

            <article className="stat-card">

              <div className="stat-icon green">✓</div>

              <div>
                <span>Confirmed</span>

                <h2>
                  {accountLoaded ? stats.confirmed : '—'}
                </h2>

                <small>Successful admissions</small>
              </div>

            </article>

            <article className="stat-card">

              <div className="stat-icon orange">◷</div>

              <div>
                <span>Pending Holds</span>

                <h2>
                  {accountLoaded ? stats.pending : '—'}
                </h2>

                <small>Awaiting confirmation</small>
              </div>

            </article>

          </section>

          {/* Student Profile */}
          <section
            className="profile-panel"
            id="profile"
          >

            <div className="panel-heading">

              <div>
                <span className="section-kicker">
                  STUDENT ACCOUNT
                </span>

                <h2>Student Profile</h2>
              </div>

              <span className="profile-badge">
                Student
              </span>

            </div>

            <div className="profile-details">

              <div className="profile-large-avatar">
                {studentInitial}
              </div>

              <div className="profile-info">

                <h3>
                  {accountLoaded
                    ? 'Registered Student'
                    : 'Welcome, Student'}
                </h3>

                <p>Birth Registration Number</p>

                <strong>
                  {accountLoaded
                    ? studentId
                    : 'Not provided yet'}
                </strong>

              </div>

              <form
                className="registration-form"
                onSubmit={e => {
                  e.preventDefault()
                  loadMyHolds()
                }}
              >

                <label htmlFor="studentId">
                  Update / Enter Registration Number
                </label>

                <div className="registration-input">

                  <input
                    id="studentId"
                    value={studentId}
                    onChange={e =>
                      handleStudentIdChange(e.target.value)
                    }
                    placeholder="Enter 17-digit number"
                    maxLength={17}
                    inputMode="numeric"
                  />

                  <button
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? 'Loading...'
                      : 'Load Account'}
                  </button>

                </div>

                <small className="input-hint">
                  Enter your 17-digit Birth Registration Number.
                </small>

              </form>

            </div>

          </section>

          {/* Success Message */}
          {message && (
            <div className="alert success" role="status">

              <span>✓</span>

              {message}

              <button
                onClick={() => setMessage('')}
                aria-label="Dismiss"
              >
                ×
              </button>

            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="alert error" role="alert">

              <span>!</span>

              {error}

              <button
                onClick={() => setError('')}
                aria-label="Dismiss"
              >
                ×
              </button>

            </div>
          )}

          {/* Available Classes */}
          <section
            className="content-section"
            id="classes"
          >

            <div className="section-heading">

              <div>
                <span className="section-kicker">
                  EXPLORE PROGRAMS
                </span>

                <h2>Available Classes</h2>

                <p>
                  Choose a class and reserve your admission seat.
                </p>
              </div>

              <button
                className="refresh-button"
                onClick={refreshData}
                disabled={loading}
              >
                ↻ {loading ? 'Loading...' : 'Refresh'}
              </button>

            </div>

            <div className="class-grid">

              {classes.map(item => {

                const isAvailable =
                  Number(item.availableSeats) > 0

                const percentage =
                  Number(item.totalSeats) > 0
                    ? Math.round(
                        (
                          Number(item.availableSeats) /
                          Number(item.totalSeats)
                        ) * 100
                      )
                    : 0

                return (
                  <article
                    className="class-card"
                    key={item.id}
                  >

                    <div className="class-card-top">

                      <div className="class-card-icon">
                        🎓
                      </div>

                      <span
                        className={`availability-badge ${
                          isAvailable ? 'available' : 'full'
                        }`}
                      >
                        <span />
                        {isAvailable ? 'Available' : 'Full'}
                      </span>

                    </div>

                    <h3>{item.name}</h3>

                    <p className="class-id">
                      Class ID: {item.id}
                    </p>

                    <div className="seat-summary">

                      <div>
                        <strong>
                          {item.availableSeats}
                        </strong>

                        <span>Seats left</span>
                      </div>

                      <div>
                        <strong>
                          {item.totalSeats}
                        </strong>

                        <span>Total seats</span>
                      </div>

                    </div>

                    <div
                      className="seat-progress"
                      role="progressbar"
                      aria-valuenow={percentage}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <div
                        className="seat-progress-fill"
                        style={{
                          width: `${percentage}%`
                        }}
                      />
                    </div>

                    <div className="class-stats">

                      <div>
                        <strong>{item.heldSeats}</strong>
                        <span>Held</span>
                      </div>

                      <div>
                        <strong>{item.confirmedSeats}</strong>
                        <span>Confirmed</span>
                      </div>

                      <div>
                        <strong>{item.availableSeats}</strong>
                        <span>Available</span>
                      </div>

                    </div>

                    <button
                      className="reserve-button"
                      disabled={loading || !isAvailable}
                      onClick={() => apply(item.id)}
                    >
                      {loading
                        ? 'Please wait...'
                        : isAvailable
                          ? 'Reserve Your Seat →'
                          : 'No Seats Available'}
                    </button>

                  </article>
                )
              })}

              {classes.length === 0 && (
                <div className="empty-state">

                  <span>📚</span>

                  <h3>No classes available</h3>

                  <p>
                    Refresh the page or check your backend server.
                  </p>

                  <button
                    onClick={refreshData}
                    disabled={loading}
                  >
                    Try Again
                  </button>

                </div>
              )}

            </div>

          </section>

          {/* My Applications */}
          <section
            className="content-section applications-panel"
            id="applications"
          >

            <div className="section-heading">

              <div>
                <span className="section-kicker">
                  ADMISSION TRACKER
                </span>

                <h2>My Applications</h2>

                <p>
                  View and manage your admission applications.
                </p>
              </div>

              <button
                className="refresh-button"
                onClick={loadMyHolds}
                disabled={
                  loading ||
                  !/^\d{17}$/.test(studentId.trim())
                }
              >
                ↻ Refresh
              </button>

            </div>

            {!accountLoaded ? (

              <div className="empty-state">

                <span>📋</span>

                <h3>No applications loaded</h3>

                <p>
                  Enter your registration number in Student Profile
                  to see your applications.
                </p>

              </div>

            ) : myHolds.length === 0 ? (

              <div className="empty-state">

                <span>📋</span>

                <h3>No applications found</h3>

                <p>
                  You have not reserved any seats yet.
                </p>

              </div>

            ) : (

              <div className="table-wrap">

                <table>

                  <thead>
                    <tr>
                      <th>Class Name</th>
                      <th>Hold ID</th>
                      <th>Status</th>
                      <th>Expires At</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>

                    {myHolds.map(hold => (

                      <tr key={hold.holdId}>

                        <td className="table-class-name">
                          {hold.className || '—'}
                        </td>

                        <td className="hold-id">
                          {hold.holdId}
                        </td>

                        <td>

                          <span
                            className={`status-badge ${
                              (hold.status || '').toLowerCase()
                            }`}
                          >
                            {hold.status}
                          </span>

                        </td>

                        <td>
                          {formatDate(hold.expiresAt)}
                        </td>

                        <td>

                          {hold.status === 'HELD' ? (

                            <div className="action-buttons">

                              <button
                                className="action-confirm"
                                disabled={loading}
                                onClick={() =>
                                  confirm(hold.holdId)
                                }
                              >
                                Confirm
                              </button>

                              <button
                                className="action-cancel"
                                disabled={loading}
                                onClick={() =>
                                  cancel(hold.holdId)
                                }
                              >
                                Cancel
                              </button>

                            </div>

                          ) : hold.status === 'CONFIRMED' ? (

                            <span className="completed-label">
                              ✓ Completed
                            </span>

                          ) : (

                            <span className="muted-label">
                              No action
                            </span>

                          )}

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            )}

          </section>

          {/* Bottom Summary */}
          <section className="bottom-summary">

            <div>
              <strong>{stats.availableSeats}</strong>
              <span>
                Available seats across all classes
              </span>
            </div>

            <div>
              <strong>{stats.totalSeats}</strong>
              <span>
                Total admission capacity
              </span>
            </div>

            <div>
              <strong>
                {accountLoaded ? stats.confirmed : '—'}
              </strong>

              <span>
                Your confirmed applications
              </span>
            </div>

          </section>

          {/* Footer */}
          <footer className="dashboard-footer">

            <span>
              © 2026 School Admission Management System
            </span>

            <span>
              Secure Admission Portal
            </span>

          </footer>

        </main>

      </div>

    </div>
  )
}

export default App
