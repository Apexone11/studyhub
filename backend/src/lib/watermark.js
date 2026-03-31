/**
 * Watermark utilities for view-only content.
 * Adds visual watermarks to sheet and note content.
 */

/**
 * Add a repeating diagonal text watermark to HTML content via CSS.
 * Injects a fixed positioned, rotated overlay with low opacity.
 *
 * @param {string} html - The HTML content to watermark
 * @param {string} watermarkText - The text to display (e.g., "View Only - username")
 * @returns {string} HTML with watermark overlay injected
 */
function watermarkHtml(html, watermarkText) {
  if (!html || !watermarkText) return html

  const watermarkStyle = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 1000;
    opacity: 0.15;
    overflow: hidden;
    font-size: 48px;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    transform: rotate(-45deg);
    white-space: nowrap;
    text-align: center;
    font-family: sans-serif;
  `

  const watermarkHtml = `
    <div style="${watermarkStyle}">
      <div style="
        position: absolute;
        width: 200%;
        height: 200%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
      ">
        ${Array(6).fill(`<div style="margin: 50px 0;">${watermarkText}</div>`).join('')}
      </div>
    </div>
  `.trim()

  // Inject before closing body tag if present, else append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${watermarkHtml}</body>`)
  }

  return html + watermarkHtml
}

/**
 * Add watermark to plain text or markdown content.
 * Prepends and appends watermark lines.
 *
 * @param {string} text - The text content to watermark
 * @param {string} watermarkText - The text to display (e.g., "View Only - username")
 * @returns {string} Text with watermark headers and footers
 */
function watermarkText(text, watermarkText) {
  if (!text || !watermarkText) return text

  const watermarkLine = `\n\n--- ${watermarkText} ---\n\n`
  return `${watermarkLine}${text}${watermarkLine}`
}

module.exports = {
  watermarkHtml,
  watermarkText,
}
