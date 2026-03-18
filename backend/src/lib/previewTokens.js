const jwt = require('jsonwebtoken')
const { getJwtSecret } = require('./authTokens')

const HTML_PREVIEW_TOKEN_TTL_SECONDS = Number.parseInt(
  process.env.HTML_PREVIEW_TOKEN_TTL_SECONDS || '300',
  10,
)

function signHtmlPreviewToken({ sheetId, userId, version, allowUnpublished = false }) {
  return jwt.sign(
    {
      type: 'html-preview',
      sheetId,
      userId,
      version,
      allowUnpublished: Boolean(allowUnpublished),
    },
    getJwtSecret(),
    { expiresIn: Math.max(60, HTML_PREVIEW_TOKEN_TTL_SECONDS) },
  )
}

function verifyHtmlPreviewToken(token) {
  return jwt.verify(token, getJwtSecret())
}

module.exports = {
  HTML_PREVIEW_TOKEN_TTL_SECONDS: Math.max(60, HTML_PREVIEW_TOKEN_TTL_SECONDS),
  signHtmlPreviewToken,
  verifyHtmlPreviewToken,
}
