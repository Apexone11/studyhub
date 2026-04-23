import { useState } from 'react'
import { createPortal } from 'react-dom'
import { formatSessionTime, formatDuration, getSessionStatusLabel } from './studyGroupsHelpers'
import { styles } from './GroupDetailTabs.styles'

export function GroupSessionsTab({ groupId, sessions, onAdd, onRsvp, isAdminOrMod, isMember }) {
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    duration: '60',
    location: '',
    recurring: 'none',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAddClick = () => {
    setFormData({
      title: '',
      description: '',
      date: '',
      time: '',
      duration: '60',
      location: '',
      recurring: 'none',
    })
    setError('')
    setAddModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }

    if (!formData.date) {
      setError('Date is required')
      return
    }

    if (!formData.time) {
      setError('Time is required')
      return
    }

    setSubmitting(true)
    try {
      await onAdd({
        ...formData,
        groupId,
      })
      setAddModalOpen(false)
      setFormData({
        title: '',
        description: '',
        date: '',
        time: '',
        duration: '60',
        location: '',
        recurring: 'none',
      })
    } catch (err) {
      setError(err.message || 'Failed to schedule session')
    } finally {
      setSubmitting(false)
    }
  }

  const upcomingSessions = sessions?.filter((s) => s.status === 'upcoming') || []
  const completedSessions = sessions?.filter((s) => s.status === 'completed') || []

  if (!sessions || (upcomingSessions.length === 0 && completedSessions.length === 0)) {
    return (
      <div style={styles.tabContainer}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon} aria-label="Calendar icon">
            Schedule
          </div>
          <div style={styles.emptyTitle}>No Sessions Scheduled</div>
          <p style={styles.emptyText}>
            {isAdminOrMod ? 'Schedule your first group session!' : 'No sessions scheduled yet'}
          </p>
          {isAdminOrMod && (
            <button
              onClick={handleAddClick}
              style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 'var(--space-4)' }}
            >
              Schedule Session
            </button>
          )}
        </div>
        {createPortal(
          addModalOpen && (
            <div style={styles.modalOverlay} onClick={() => setAddModalOpen(false)}>
              <div
                style={styles.modalContent}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="schedule-session-title-1"
              >
                <h3 style={styles.sectionTitle} id="schedule-session-title-1">
                  Schedule Session
                </h3>
                {error && <div style={styles.error}>{error}</div>}
                <form onSubmit={handleSubmit}>
                  <div style={styles.formGroup}>
                    <label htmlFor="session-title" style={styles.label}>
                      Title
                    </label>
                    <input
                      id="session-title"
                      type="text"
                      style={styles.input}
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      maxLength={100}
                      placeholder="Session title"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="session-description" style={styles.label}>
                      Description
                    </label>
                    <textarea
                      id="session-description"
                      style={styles.textarea}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      maxLength={500}
                      placeholder="What will you discuss?"
                    />
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div style={styles.formGroup}>
                      <label htmlFor="session-date" style={styles.label}>
                        Date
                      </label>
                      <input
                        id="session-date"
                        type="date"
                        style={styles.input}
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label htmlFor="session-time" style={styles.label}>
                        Time
                      </label>
                      <input
                        id="session-time"
                        type="time"
                        style={styles.input}
                        value={formData.time}
                        onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div style={styles.formGroup}>
                      <label htmlFor="session-duration" style={styles.label}>
                        Duration (minutes)
                      </label>
                      <input
                        id="session-duration"
                        type="number"
                        style={styles.input}
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                        min="15"
                        max="480"
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label htmlFor="session-recurring" style={styles.label}>
                        Recurring
                      </label>
                      <select
                        id="session-recurring"
                        style={styles.select}
                        value={formData.recurring}
                        onChange={(e) => setFormData({ ...formData, recurring: e.target.value })}
                      >
                        <option value="none">None</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-weekly</option>
                      </select>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="session-location" style={styles.label}>
                      Location
                    </label>
                    <input
                      id="session-location"
                      type="text"
                      style={styles.input}
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Physical or virtual location"
                    />
                  </div>

                  <div style={styles.formActions}>
                    <button
                      type="button"
                      onClick={() => setAddModalOpen(false)}
                      style={{ ...styles.button, ...styles.buttonSecondary }}
                      aria-label="Close Schedule Session dialog"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ ...styles.button, ...styles.buttonPrimary }}
                    >
                      {submitting ? 'Scheduling...' : 'Schedule Session'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ),
          document.body,
        )}
      </div>
    )
  }

  return (
    <div style={styles.tabContainer}>
      {isAdminOrMod && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <button
            onClick={handleAddClick}
            style={{ ...styles.button, ...styles.buttonPrimary }}
            aria-label="Schedule a new session"
          >
            Schedule Session
          </button>
        </div>
      )}

      {upcomingSessions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Upcoming</h2>
          {upcomingSessions.map((session) => (
            <div key={session.id} style={styles.sessionCard}>
              <div style={styles.sessionHeader}>
                <div>
                  <div style={styles.sessionTitle}>{session.title}</div>
                  <div style={styles.sessionDetails}>
                    <span>{formatSessionTime(session.scheduledAt)}</span>
                    <span>{session.location || 'No location specified'}</span>
                    <span>
                      Duration:{' '}
                      {formatDuration(parseInt(session.durationMins || session.duration, 10))}
                    </span>
                    <span>
                      {session.rsvpCount || 0} going
                      {session.rsvpMaybeCount ? `, ${session.rsvpMaybeCount} maybe` : ''}
                    </span>
                  </div>
                </div>
                <span style={styles.badge}>{getSessionStatusLabel(session.status)}</span>
              </div>

              {isMember && (
                <div
                  style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}
                >
                  {['going', 'maybe', 'not_going'].map((status) => {
                    const isSelected = session.userRsvpStatus === status
                    const label =
                      status === 'not_going'
                        ? 'Not Going'
                        : status.charAt(0).toUpperCase() + status.slice(1)
                    return (
                      <button
                        key={status}
                        onClick={() => onRsvp(session.id, status)}
                        style={{
                          ...styles.button,
                          ...styles.buttonSmall,
                          ...(isSelected
                            ? {
                                backgroundColor: 'var(--sh-brand)',
                                color: 'white',
                                border: '1px solid var(--sh-brand)',
                              }
                            : styles.buttonSecondary),
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {completedSessions.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Completed</h2>
          {completedSessions.map((session) => (
            <div key={session.id} style={styles.sessionCard}>
              <div style={styles.sessionHeader}>
                <div>
                  <div style={styles.sessionTitle}>{session.title}</div>
                  <div style={styles.sessionDetails}>
                    <span>{formatSessionTime(session.scheduledAt)}</span>
                    <span>{session.location || 'No location specified'}</span>
                  </div>
                </div>
                <span style={styles.badge}>{getSessionStatusLabel(session.status)}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {createPortal(
        addModalOpen && (
          <div style={styles.modalOverlay} onClick={() => setAddModalOpen(false)}>
            <div
              style={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="schedule-session-title-2"
            >
              <h3 style={styles.sectionTitle} id="schedule-session-title-2">
                Schedule Session
              </h3>
              {error && <div style={styles.error}>{error}</div>}
              <form onSubmit={handleSubmit}>
                <div style={styles.formGroup}>
                  <label htmlFor="session-title" style={styles.label}>
                    Title
                  </label>
                  <input
                    id="session-title"
                    type="text"
                    style={styles.input}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    maxLength={100}
                    placeholder="Session title"
                  />
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="session-description" style={styles.label}>
                    Description
                  </label>
                  <textarea
                    id="session-description"
                    style={styles.textarea}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    maxLength={500}
                    placeholder="What will you discuss?"
                  />
                </div>

                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}
                >
                  <div style={styles.formGroup}>
                    <label htmlFor="session-date" style={styles.label}>
                      Date
                    </label>
                    <input
                      id="session-date"
                      type="date"
                      style={styles.input}
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="session-time" style={styles.label}>
                      Time
                    </label>
                    <input
                      id="session-time"
                      type="time"
                      style={styles.input}
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    />
                  </div>
                </div>

                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}
                >
                  <div style={styles.formGroup}>
                    <label htmlFor="session-duration" style={styles.label}>
                      Duration (minutes)
                    </label>
                    <input
                      id="session-duration"
                      type="number"
                      style={styles.input}
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      min="15"
                      max="480"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label htmlFor="session-recurring" style={styles.label}>
                      Recurring
                    </label>
                    <select
                      id="session-recurring"
                      style={styles.select}
                      value={formData.recurring}
                      onChange={(e) => setFormData({ ...formData, recurring: e.target.value })}
                    >
                      <option value="none">None</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label htmlFor="session-location" style={styles.label}>
                    Location
                  </label>
                  <input
                    id="session-location"
                    type="text"
                    style={styles.input}
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Physical or virtual location"
                  />
                </div>

                <div style={styles.formActions}>
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    style={{ ...styles.button, ...styles.buttonSecondary }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ ...styles.button, ...styles.buttonPrimary }}
                  >
                    {submitting ? 'Scheduling...' : 'Schedule Session'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ),
        document.body,
      )}
    </div>
  )
}
