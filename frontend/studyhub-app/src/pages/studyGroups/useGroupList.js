import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API } from '../../config';
import { authHeaders } from '../shared/pageUtils';
import { showToast } from '../../lib/toast';

/**
 * Hook for managing study group list, filters, and pagination
 * Returns group list state, loading/error states, and filter/pagination utilities
 */
export function useGroupList() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Group list state
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState(null);
  const [groupsTotal, setGroupsTotal] = useState(0);

  // Extract filter params from URL
  const search = searchParams.get('search') || '';
  const courseId = searchParams.get('courseId') || '';
  const mine = searchParams.get('mine') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  /**
   * Load groups list with current filters
   */
  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (courseId) params.append('courseId', courseId);
      if (mine) params.append('mine', 'true');
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await fetch(`${API}/api/study-groups?${params}`, {
        credentials: 'include',
        headers: authHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load groups');

      const data = await response.json();
      setGroups(data.groups || []);
      setGroupsTotal(data.total || 0);
    } catch (error) {
      setGroupsError(error.message);
      showToast('Failed to load study groups', 'error');
    } finally {
      setGroupsLoading(false);
    }
  }, [search, courseId, mine, limit, offset]);

  /**
   * Create a new study group
   */
  const createGroup = useCallback(async (groupData) => {
    try {
      const response = await fetch(`${API}/api/study-groups`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(groupData),
      });

      if (!response.ok) throw new Error('Failed to create group');

      const newGroup = await response.json();
      setGroups((prev) => [newGroup, ...prev]);
      showToast('Study group created successfully', 'success');
      return newGroup;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * Update search filters and reset pagination
   */
  const setFilters = useCallback(
    (filters) => {
      const newParams = new URLSearchParams(searchParams);

      if (filters.search !== undefined) {
        if (filters.search) {
          newParams.set('search', filters.search);
        } else {
          newParams.delete('search');
        }
      }

      if (filters.courseId !== undefined) {
        if (filters.courseId) {
          newParams.set('courseId', filters.courseId);
        } else {
          newParams.delete('courseId');
        }
      }

      if (filters.mine !== undefined) {
        if (filters.mine) {
          newParams.set('mine', 'true');
        } else {
          newParams.delete('mine');
        }
      }

      // Reset pagination when filters change
      newParams.set('offset', '0');

      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  /**
   * Update pagination
   */
  const setPagination = useCallback(
    (newLimit, newOffset) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('limit', newLimit.toString());
      newParams.set('offset', newOffset.toString());
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Load groups when filters/pagination change
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return {
    // State
    groups,
    groupsLoading,
    groupsError,
    groupsTotal,

    // Actions
    loadGroups,
    createGroup,

    // Filters and pagination
    search,
    courseId,
    mine,
    limit,
    offset,
    setFilters,
    setPagination,
  };
}
