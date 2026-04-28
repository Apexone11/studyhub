/**
 * applyContentUpdate.js
 *
 * Single source of truth for "this sheet is getting new content."
 * Returns the `{ content, previewText }` pair to spread into a Prisma
 * `data` object on `studySheet.create` / `studySheet.update`. Always
 * re-extracts `previewText` from the same content the row will hold
 * after the write so the Sheets Grid card preview never lags the body.
 *
 * Why this helper exists:
 *   sheets.create.controller.js and sheets.update.controller.js were the
 *   first two write paths to call extractPreviewText() inline (Phase 4).
 *   The merge-accept path in sheets.contributions.controller.js, the
 *   sync-upstream + restore paths in sheetLab.operations.controller.js,
 *   and the fork creation in sheets.fork.controller.js also overwrite
 *   StudySheet.content but did NOT re-extract — so after a contribution
 *   merge or a Sheet Lab restore the Grid card showed stale preview text
 *   until the author edited the body. Centralizing this here means new
 *   write sites are correct by default: any `data: { ...withPreviewText
 *   (next) }` is guaranteed in sync.
 *
 * Pass the FULL content the sheet will hold after the write, not a
 * delta. The helper returns null for previewText on empty / non-string
 * input (matches extractPreviewText's NULL-safe contract), so the DB
 * column stays NULL rather than ''.
 */

const { extractPreviewText } = require('./extractPreviewText')

/**
 * Build the `{ content, previewText }` slice of a Prisma data object.
 *
 * @param {string} content — the full sheet content the row will hold.
 * @returns {{ content: string, previewText: string | null }}
 */
function withPreviewText(content) {
  return {
    content,
    previewText: extractPreviewText(content),
  }
}

module.exports = { withPreviewText }
