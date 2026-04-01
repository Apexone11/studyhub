import { useState, useCallback } from 'react';
import { API } from '../../config';
import { authHeaders } from '../shared/pageUtils';
import { showToast } from '../../lib/toast';

/**
 * Hook for managing group study sessions (scheduled meetings)
 * Handles loading, creating, updating, deleting sessions and RSVP
 */
export function useGroupSessions() {
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  /**
   * Load study sessions for active group
   */
  const loadSessions = useCallback(async (groupId) => {
    setSessionsLoading(true);
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/sessions`,
        {
          credentials: 'include',
          headers: authHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to load sessions');

      const data = await response.json();
      setSessions(data.sessions || []);
    } catch {
      showToast('Failed to load sessions', 'error');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  /**
   * Create a study session
   */
  const createSession = useCallback(async (groupId, sessionData) => {
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/sessions`,
        {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify(sessionData),
        }
      );

      if (!response.ok) throw new Error('Failed to create session');

      const newSession = await response.json();
      setSessions((prev) => [newSession, ...prev]);
      showToast('Session created successfully', 'success');
      return newSession;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * Update a study session
   */
  const updateSession = useCallback(async (groupId, sessionId, updates) => {
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/sessions/${sessionId}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) throw new Error('Failed to update session');

      const updatedSession = await response.json();
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? updatedSession : s))
      );
      showToast('Session updated successfully', 'success');
      return updatedSession;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * Delete a study session
   */
  const deleteSession = useCallback(async (groupId, sessionId) => {
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/sessions/${sessionId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to delete session');

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showToast('Session deleted successfully', 'success');
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * RSVP to a study session
   */
  const rsvpSession = useCallback(
    async (groupId, sessionId, status) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/sessions/${sessionId}/rsvp`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify({ status }),
          }
        );

        if (!response.ok) throw new Error('Failed to RSVP');

        showToast('RSVP updated successfully', 'success');
        // Reload sessions to reflect RSVP change
        await loadSessions(groupId);
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    [loadSessions]
  );

  return {
    // State
    sessions,
    sessionsLoading,

    // Actions
    loadSessions,
    createSession,
    updateSession,
    deleteSession,
    rsvpSession,
  };
}
