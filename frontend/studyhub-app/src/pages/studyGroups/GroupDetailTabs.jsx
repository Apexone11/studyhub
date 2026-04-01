/* ═══════════════════════════════════════════════════════════════════════════
 * GroupDetailTabs.jsx — Orchestrator for study group detail tabs
 *
 * Thin orchestrator shell that renders tab navigation and conditionally
 * displays the correct tab component based on active tab state.
 *
 * Tab Components (delegated):
 * - GroupOverviewTab: group description, stats, recent activity
 * - GroupResourcesTab: resources list with add/edit/delete actions
 * - GroupSessionsTab: sessions list with RSVP and scheduling
 * - GroupDiscussionsTab: discussion posts with replies
 * - GroupMembersTab: member list and management
 *
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react'
import { PAGE_FONT } from '../shared/pageUtils'
import ComponentErrorBoundary from '../../components/ComponentErrorBoundary'
import { GroupOverviewTab } from './GroupOverviewTab'
import { GroupResourcesTab } from './GroupResourcesTab'
import { GroupSessionsTab } from './GroupSessionsTab'
import { GroupDiscussionsTab } from './GroupDiscussionsTab'
import { GroupMembersTab } from './GroupMembersTab'

const tabNavStyle = {
  display: 'flex',
  gap: 'var(--space-4)',
  borderBottom: '1px solid var(--sh-border)',
  paddingBottom: 'var(--space-3)',
  marginBottom: 'var(--space-6)',
  fontFamily: PAGE_FONT,
  flexWrap: 'wrap',
}

const tabButtonStyle = {
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: 'var(--sh-subtext)',
  cursor: 'pointer',
  fontSize: 'var(--type-base)',
  fontWeight: 500,
  fontFamily: PAGE_FONT,
  padding: '0.5rem 0',
  transition: 'all 0.2s ease',
}

const tabButtonActiveStyle = {
  color: 'var(--sh-brand)',
  borderColor: 'var(--sh-brand)',
}

export function GroupDetailTabs({
  activeTab,
  setActiveTab,
  group,
  activities,
  activitiesLoading,
  upcomingSessions,
  resources,
  onAddResource,
  onDeleteResource,
  sessions,
  onAddSession,
  onRsvpSession,
  discussions,
  onCreatePost,
  onDeletePost,
  onAddReply,
  onResolve,
  onUpvote,
  members,
  onUpdateMember,
  onRemoveMember,
  onInvite,
  isAdminOrMod,
  isAdmin,
  isMember,
  currentUserId,
}) {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'resources', label: 'Resources' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'discussions', label: 'Discussions' },
    { id: 'members', label: 'Members' },
  ]

  return (
    <div>
      {/* Tab Navigation */}
      <div style={tabNavStyle}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...tabButtonStyle,
              ...(activeTab === tab.id ? tabButtonActiveStyle : {}),
            }}
            aria-selected={activeTab === tab.id}
            role="tab"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <ComponentErrorBoundary name="Group Overview">
          <GroupOverviewTab
            group={group}
            activities={activities}
            activitiesLoading={activitiesLoading}
            upcomingSessions={upcomingSessions}
          />
        </ComponentErrorBoundary>
      )}

      {activeTab === 'resources' && (
        <ComponentErrorBoundary name="Group Resources">
          <GroupResourcesTab
            groupId={group?.id}
            resources={resources}
            onAdd={onAddResource}
            onDelete={onDeleteResource}
            isAdminOrMod={isAdminOrMod}
            isMember={isMember}
          />
        </ComponentErrorBoundary>
      )}

      {activeTab === 'sessions' && (
        <ComponentErrorBoundary name="Group Sessions">
          <GroupSessionsTab
            groupId={group?.id}
            sessions={sessions}
            onAdd={onAddSession}
            onRsvp={onRsvpSession}
            isAdminOrMod={isAdminOrMod}
            isMember={isMember}
          />
        </ComponentErrorBoundary>
      )}

      {activeTab === 'discussions' && (
        <ComponentErrorBoundary name="Group Discussions">
          <GroupDiscussionsTab
            groupId={group?.id}
            discussions={discussions}
            onCreatePost={onCreatePost}
            onDeletePost={onDeletePost}
            onAddReply={onAddReply}
            onResolve={onResolve}
            onUpvote={onUpvote}
            isAdminOrMod={isAdminOrMod}
            isMember={isMember}
            userId={currentUserId}
          />
        </ComponentErrorBoundary>
      )}

      {activeTab === 'members' && (
        <ComponentErrorBoundary name="Group Members">
          <GroupMembersTab
            groupId={group?.id}
            members={members}
            onUpdateMember={onUpdateMember}
            onRemoveMember={onRemoveMember}
            onInvite={onInvite}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
          />
        </ComponentErrorBoundary>
      )}
    </div>
  )
}
