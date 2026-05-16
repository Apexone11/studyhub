/* ═══════════════════════════════════════════════════════════════════════════
 * StudyGroupsPage.jsx — Orchestrator for Study Groups pages
 *
 * Routes to either the list view or detail view based on URL params.
 * The main page component is a thin shell that delegates to composed children.
 *
 * Component hierarchy:
 * - StudyGroupsPage (router) — routes /study-groups vs /study-groups/:id
 *   - GroupListView — list/browse view
 *   - GroupDetailView — single group detail view with tabs
 *
 * Extracted components:
 * - GroupListFilters, GroupCard, GroupListEmptyState (list view)
 * - GroupModals (CreateGroupModal, EditGroupModal)
 * - studyGroupsStyles (shared styles)
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useParams } from 'react-router-dom'
import GroupListView from './GroupListView'
import GroupDetailView from './GroupDetailView'
import { usePageTitle } from '../../lib/usePageTitle'

export default function StudyGroupsPage() {
  const { id: groupId } = useParams()
  // Detail view sets its own per-group title; list view gets the
  // generic "Study Groups" label.
  usePageTitle(groupId ? null : 'Study Groups')

  if (groupId) {
    return <GroupDetailView groupId={groupId} />
  }

  return <GroupListView />
}
