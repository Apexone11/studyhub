/* ═══════════════════════════════════════════════════════════════════════════
 * UploadSheetPage.jsx — Thin orchestrator for the upload/edit sheet page
 *
 * All state, effects, and API logic live in useUploadSheet.
 * Form fields and editor panels live in UploadSheetFormFields.
 * Scan and tutorial modals live in HtmlScanModal.
 * Navbar actions live in UploadNavActions.
 * Constants and small helpers live in uploadSheetConstants.
 * ═══════════════════════════════════════════════════════════════════════════ */
import Navbar from '../../../components/navbar/Navbar'
import SafeJoyride from '../../../components/SafeJoyride'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { pageShell } from '../../../lib/ui'
import { FONT } from './uploadSheetConstants'
import {
  InfoFields,
  DescriptionField,
  HtmlImportSection,
  AttachmentSection,
  DraftBanner,
  StatusBanner,
  ErrorBanner,
  EditorPanel,
  UploadHelperCard,
} from './UploadSheetFormFields'
import { TutorialModal, HtmlReviewNoticeModal, HtmlScanModal } from '../lab/HtmlScanModal'
import UploadNavActions from './UploadNavActions'
import DraftsPickerModal from './DraftsPickerModal'
import useUploadSheet from './useUploadSheet'
import { useState } from 'react'

export default function UploadSheetPage() {
  const hook = useUploadSheet()
  const [showDraftsPicker, setShowDraftsPicker] = useState(false)

  const navActions = (
    <UploadNavActions
      saved={hook.saved}
      legacyMarkdownMode={hook.legacyMarkdownMode}
      isHtmlMode={hook.isHtmlMode}
      isEditing={hook.isEditing}
      loading={hook.loading}
      attachUploading={hook.attachUploading}
      canSubmitHtml={hook.canSubmitHtml}
      scanTier={hook.scanState.tier}
      onSaveDraft={hook.saveDraftNow}
      onOpenPreview={hook.openHtmlPreview}
      onSubmit={hook.handleSubmit}
      onOpenDrafts={() => setShowDraftsPicker(true)}
    />
  )

  if (hook.initializing) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}>
        <Navbar
          crumbs={[
            { label: 'Study Sheets', to: '/sheets' },
            { label: hook.isEditing ? 'Edit Sheet' : 'New Sheet', to: null },
          ]}
          hideTabs
          hideSearch
        />
        <div style={{ ...pageShell('editor', 20, 60), color: 'var(--sh-slate-500)', fontSize: 14 }}>
          Loading editor…
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}>
      <Navbar
        crumbs={[
          { label: 'Study Sheets', to: '/sheets' },
          { label: hook.isEditing ? 'Edit Sheet' : 'New Sheet', to: null },
        ]}
        hideTabs
        actions={navActions}
        hideSearch
      />
      <div style={pageShell('editor', 20, 60)}>
        {hook.isEditing ? null : <UploadHelperCard />}
        <InfoFields
          title={hook.title}
          setTitle={hook.setTitle}
          courseId={hook.courseId}
          setCourseId={hook.setCourseId}
          allowDownloads={hook.allowDownloads}
          setAllowDownloads={hook.setAllowDownloads}
          courses={hook.courses}
          error={hook.error}
          setHasUnsavedChanges={hook.setHasUnsavedChanges}
        />

        <DescriptionField
          description={hook.description}
          setDescription={hook.setDescription}
          setHasUnsavedChanges={hook.setHasUnsavedChanges}
        />

        <HtmlImportSection
          isHtmlMode={hook.isHtmlMode}
          htmlImportInputRef={hook.htmlImportInputRef}
          handleHtmlImport={hook.handleHtmlImport}
          scanState={hook.scanState}
          canEditHtml={hook.canEditHtml}
          onOpenScanDetails={hook.openScanModal}
        />

        <AttachmentSection
          attachmentInputRef={hook.attachmentInputRef}
          handleAttachmentSelect={hook.handleAttachmentSelect}
          attachFile={hook.attachFile}
          clearAttachFile={hook.clearAttachFile}
          existingAttachment={hook.existingAttachment}
          removeExistingAttachment={hook.removeExistingAttachment}
          setRemoveExistingAttachment={hook.setRemoveExistingAttachment}
          attachErr={hook.attachErr}
          setHasUnsavedChanges={hook.setHasUnsavedChanges}
        />

        <DraftBanner
          isEditing={hook.isEditing}
          draftId={hook.draftId}
          status={hook.status}
          title={hook.title}
          discarding={hook.discarding}
          setShowDiscardDialog={hook.setShowDiscardDialog}
        />

        <StatusBanner status={hook.status} sheetId={hook.isEditing ? hook.sheetId : hook.draftId} />
        <ErrorBanner error={hook.error} verificationRequired={hook.verificationRequired} />

        <EditorPanel
          content={hook.content}
          setContent={hook.setContent}
          isHtmlMode={hook.isHtmlMode}
          canEditHtml={hook.canEditHtml}
          setHasUnsavedChanges={hook.setHasUnsavedChanges}
        />
      </div>

      <TutorialModal show={hook.showTutorial} onDismiss={hook.dismissTutorial} />

      <HtmlScanModal
        show={hook.showScanModal}
        scanState={hook.scanState}
        scanAckChecked={hook.scanAckChecked}
        setScanAckChecked={hook.setScanAckChecked}
        onClose={() => hook.setShowScanModal(false)}
        onAcknowledge={hook.acknowledgeScanAndDismiss}
        onUnderstood={() => {
          hook.setScanModalDismissed(true)
          hook.setShowScanModal(false)
        }}
      />

      <HtmlReviewNoticeModal
        show={Boolean(hook.postSubmitNotice)}
        notice={hook.postSubmitNotice}
        onClose={hook.dismissPostSubmitNotice}
        onOpenMySheets={hook.openMySheets}
        onOpenPreview={hook.openHtmlPreview}
      />

      <ConfirmDialog
        open={hook.showLeaveDialog}
        title="Discard unsaved changes?"
        message="You have unsaved changes on this sheet. If you leave now, your pending work will be lost. Would you like to stay and finish?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={hook.confirmLeave}
        onCancel={hook.cancelLeave}
      />

      <SafeJoyride {...hook.tutorial.joyrideProps} />

      <ConfirmDialog
        open={hook.showDiscardDialog}
        title="Discard this draft?"
        message="This will permanently delete your current draft and start a fresh sheet. Any saved content, imported HTML, and attachments will be removed."
        confirmLabel={hook.discarding ? 'Discarding…' : 'Discard Draft'}
        cancelLabel="Keep Draft"
        variant="danger"
        onConfirm={hook.discardDraft}
        onCancel={() => hook.setShowDiscardDialog(false)}
      />

      <DraftsPickerModal
        open={showDraftsPicker}
        onClose={() => setShowDraftsPicker(false)}
        currentDraftId={hook.draftId}
        // Flush any pending edits to the current draft before the modal
        // navigates to a different draft. Switching drafts is a query-only
        // route change, so the unsaved-changes blocker doesn't fire — we
        // have to push the in-flight content out ourselves to prevent
        // losing what the user just typed.
        onBeforeNavigate={hook.saveDraftNow}
      />
    </div>
  )
}
