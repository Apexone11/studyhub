/* ═══════════════════════════════════════════════════════════════════════════
 * UploadSheetPage.jsx — Thin orchestrator for the upload/edit sheet page
 *
 * All state, effects, and API logic live in useUploadSheet.
 * Form fields and editor panels live in UploadSheetFormFields.
 * Scan and tutorial modals live in HtmlScanModal.
 * Constants and small helpers live in uploadSheetConstants.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import SafeJoyride from '../../components/SafeJoyride'
import ConfirmDialog from '../../components/ConfirmDialog'
import { IconCheck, IconEye, IconUpload } from '../../components/Icons'
import { pageShell } from '../../lib/ui'
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
} from './UploadSheetFormFields'
import { TutorialModal, HtmlScanModal } from './HtmlScanModal'
import useUploadSheet from './useUploadSheet'

export default function UploadSheetPage() {
  const hook = useUploadSheet()

  const navActions = useMemo(() => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {hook.saved ? (
        <span style={{ fontSize: 11, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconCheck size={12} /> Saved
        </span>
      ) : (
        <span style={{ fontSize: 11, color: '#64748b' }}>{hook.legacyMarkdownMode ? 'Draft autosave…' : 'Working draft sync…'}</span>
      )}
      <button
        type="button"
        onClick={hook.saveDraftNow}
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#059669',
          padding: '6px 12px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: 8,
          cursor: 'pointer',
          fontFamily: FONT,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <IconCheck size={13} /> Save Draft
      </button>
      {hook.isHtmlMode ? (
        <button
          type="button"
          onClick={hook.openHtmlPreview}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#b45309',
            padding: '6px 12px',
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: FONT,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <IconEye size={13} /> Preview
        </button>
      ) : null}
      <Link
        to="/sheets"
        style={{
          fontSize: 12,
          color: '#64748b',
          textDecoration: 'none',
          padding: '6px 10px',
          border: '1px solid #cbd5e1',
          borderRadius: 8,
        }}
      >
        Cancel
      </Link>
      <button
        type="button"
        onClick={hook.handleSubmit}
        disabled={hook.loading || hook.attachUploading || (hook.isHtmlMode && !hook.canSubmitHtml)}
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#fff',
          padding: '6px 14px',
          background: (hook.loading || hook.attachUploading || (hook.isHtmlMode && !hook.canSubmitHtml)) ? '#93c5fd' : '#2563eb',
          border: 'none',
          borderRadius: 8,
          cursor: (hook.loading || hook.attachUploading || (hook.isHtmlMode && !hook.canSubmitHtml)) ? 'not-allowed' : 'pointer',
          fontFamily: FONT,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <IconUpload size={13} />
        {hook.loading ? 'Saving…' : hook.legacyMarkdownMode ? (hook.isEditing ? 'Save Changes' : 'Publish Sheet') : hook.scanState.tier === 3 ? 'Quarantined' : hook.scanState.tier === 2 ? 'Submit for Review' : hook.scanState.tier === 1 ? 'Publish with Warnings' : 'Publish'}
      </button>
    </div>
  ), [hook.attachUploading, hook.canSubmitHtml, hook.handleSubmit, hook.isEditing, hook.isHtmlMode, hook.legacyMarkdownMode, hook.loading, hook.openHtmlPreview, hook.saved, hook.saveDraftNow, hook.scanState.tier])

  if (hook.initializing) {
    return (
      <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
        <Navbar crumbs={[{ label: 'Study Sheets', to: '/sheets' }, { label: hook.isEditing ? 'Edit Sheet' : 'New Sheet', to: null }]} hideTabs hideSearch />
        <div style={{ ...pageShell('editor', 20, 60), color: '#64748b', fontSize: 14 }}>Loading editor…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Study Sheets', to: '/sheets' }, { label: hook.isEditing ? 'Edit Sheet' : 'New Sheet', to: null }]} hideTabs actions={navActions} hideSearch />
      <div style={pageShell('editor', 20, 60)}>
        <InfoFields
          title={hook.title} setTitle={hook.setTitle}
          courseId={hook.courseId} setCourseId={hook.setCourseId}
          allowDownloads={hook.allowDownloads} setAllowDownloads={hook.setAllowDownloads}
          courses={hook.courses} error={hook.error}
          setHasUnsavedChanges={hook.setHasUnsavedChanges}
        />

        <DescriptionField
          description={hook.description} setDescription={hook.setDescription}
          setHasUnsavedChanges={hook.setHasUnsavedChanges}
        />

        <HtmlImportSection
          isHtmlMode={hook.isHtmlMode}
          htmlImportInputRef={hook.htmlImportInputRef}
          handleHtmlImport={hook.handleHtmlImport}
          scanState={hook.scanState}
          canEditHtml={hook.canEditHtml}
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
          isEditing={hook.isEditing} draftId={hook.draftId}
          status={hook.status} title={hook.title}
          discarding={hook.discarding}
          setShowDiscardDialog={hook.setShowDiscardDialog}
        />

        <StatusBanner status={hook.status} />
        <ErrorBanner error={hook.error} />

        <EditorPanel
          content={hook.content} setContent={hook.setContent}
          isHtmlMode={hook.isHtmlMode} canEditHtml={hook.canEditHtml}
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
        onUnderstood={() => { hook.setScanModalDismissed(true); hook.setShowScanModal(false) }}
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
    </div>
  )
}
