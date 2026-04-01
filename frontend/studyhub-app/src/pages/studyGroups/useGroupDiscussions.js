import { useState, useCallback, useEffect, useRef } from 'react';
import { API } from '../../config';
import { authHeaders } from '../shared/pageUtils';
import { showToast } from '../../lib/toast';
import { useSocket } from '../../lib/useSocket';

/**
 * Hook for managing group discussions (Q&A board)
 * Handles loading, creating, updating, deleting posts and replies
 * Includes real-time updates via Socket.io
 */
export function useGroupDiscussions(activeGroupId) {
  const [discussions, setDiscussions] = useState([]);
  const [discussionsLoading, setDiscussionsLoading] = useState(false);

  /**
   * Load discussions for active group
   */
  const loadDiscussions = useCallback(async (groupId) => {
    setDiscussionsLoading(true);
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/discussions`,
        {
          credentials: 'include',
          headers: authHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to load discussions');

      const data = await response.json();
      setDiscussions(data.discussions || []);
    } catch {
      showToast('Failed to load discussions', 'error');
    } finally {
      setDiscussionsLoading(false);
    }
  }, []);

  /**
   * Create a discussion post
   */
  const createPost = useCallback(async (groupId, postData) => {
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/discussions`,
        {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify(postData),
        }
      );

      if (!response.ok) throw new Error('Failed to create post');

      const newPost = await response.json();
      setDiscussions((prev) => [newPost, ...prev]);
      showToast('Post created successfully', 'success');
      return newPost;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * Update a discussion post
   */
  const updatePost = useCallback(async (groupId, postId, updates) => {
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/discussions/${postId}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: authHeaders(),
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) throw new Error('Failed to update post');

      const updatedPost = await response.json();
      setDiscussions((prev) =>
        prev.map((p) => (p.id === postId ? updatedPost : p))
      );
      showToast('Post updated successfully', 'success');
      return updatedPost;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * Delete a discussion post
   */
  const deletePost = useCallback(async (groupId, postId) => {
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/discussions/${postId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: authHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to delete post');

      setDiscussions((prev) => prev.filter((p) => p.id !== postId));
      showToast('Post deleted successfully', 'success');
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * Add a reply to a discussion post
   */
  const addReply = useCallback(
    async (groupId, postId, replyData) => {
      try {
        const response = await fetch(
          `${API}/api/study-groups/${groupId}/discussions/${postId}/replies`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(),
            body: JSON.stringify(replyData),
          }
        );

        if (!response.ok) throw new Error('Failed to add reply');

        const newReply = await response.json();
        showToast('Reply added successfully', 'success');
        // Reload discussions to reflect new reply
        await loadDiscussions(groupId);
        return newReply;
      } catch (error) {
        showToast(error.message, 'error');
        throw error;
      }
    },
    [loadDiscussions]
  );

  /**
   * Resolve a Q&A post
   */
  const resolvePost = useCallback(async (groupId, postId) => {
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/discussions/${postId}/resolve`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: authHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to resolve post');

      const resolvedPost = await response.json();
      setDiscussions((prev) =>
        prev.map((p) => (p.id === postId ? resolvedPost : p))
      );
      showToast('Post resolved successfully', 'success');
      return resolvedPost;
    } catch (error) {
      showToast(error.message, 'error');
      throw error;
    }
  }, []);

  /**
   * Toggle upvote on a discussion post
   */
  const toggleUpvote = useCallback(async (groupId, postId) => {
    try {
      const response = await fetch(
        `${API}/api/study-groups/${groupId}/discussions/${postId}/upvote`,
        {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
        }
      );
      if (response.ok) {
        const data = await response.json();
        setDiscussions((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, upvoteCount: data.upvoteCount, userHasUpvoted: data.upvoted }
              : p
          )
        );
        return data;
      }
    } catch {
      showToast('Failed to toggle upvote', 'error');
    }
    return null;
  }, []);

  // Real-time discussion updates via Socket.io
  const { socket } = useSocket();
  const activeGroupIdRef = useRef(activeGroupId);
  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    if (!socket) return;

    function handleNewDiscussion(post) {
      // Only update if we are viewing that group
      if (post.groupId !== activeGroupIdRef.current) return;
      setDiscussions((prev) => {
        // Deduplicate — avoid adding if already present (e.g. own post)
        if (prev.some((p) => p.id === post.id)) return prev;
        return [post, ...prev];
      });
    }

    function handleNewReply(reply) {
      if (reply.groupId !== activeGroupIdRef.current) return;
      setDiscussions((prev) =>
        prev.map((p) =>
          p.id === reply.postId
            ? { ...p, replyCount: (p.replyCount ?? 0) + 1 }
            : p
        )
      );
    }

    socket.on('group:discussion:new', handleNewDiscussion);
    socket.on('group:discussion:reply', handleNewReply);

    return () => {
      socket.off('group:discussion:new', handleNewDiscussion);
      socket.off('group:discussion:reply', handleNewReply);
    };
  }, [socket]);

  return {
    // State
    discussions,
    discussionsLoading,

    // Actions
    loadDiscussions,
    createPost,
    updatePost,
    deletePost,
    addReply,
    resolvePost,
    toggleUpvote,
  };
}
