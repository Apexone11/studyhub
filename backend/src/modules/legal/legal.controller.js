const { captureError } = require('../../monitoring/sentry')
const {
  acceptCurrentLegalDocuments,
  getCurrentLegalDocument,
  getCurrentLegalDocuments,
  getUserLegalStatus,
} = require('./legal.service')

async function getCurrentDocuments(req, res) {
  try {
    const documents = await getCurrentLegalDocuments()
    res.json({ documents })
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not load legal documents.' })
  }
}

async function getCurrentDocumentBySlug(req, res) {
  try {
    const document = await getCurrentLegalDocument(req.params.slug)
    if (!document) {
      return res.status(404).json({ error: 'Legal document not found.' })
    }

    res.json(document)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method, slug: req.params.slug })
    res.status(500).json({ error: 'Could not load the legal document.' })
  }
}

async function getMyLegalStatus(req, res) {
  try {
    const status = await getUserLegalStatus(req.user.userId)
    if (!status) return res.status(404).json({ error: 'User not found.' })
    res.json(status)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not load legal acceptance status.' })
  }
}

async function acceptMyCurrentLegalDocuments(req, res) {
  try {
    const status = await acceptCurrentLegalDocuments(req.user.userId)
    res.json(status)
  } catch (error) {
    captureError(error, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Could not save your legal acceptance.' })
  }
}

module.exports = {
  acceptMyCurrentLegalDocuments,
  getCurrentDocumentBySlug,
  getCurrentDocuments,
  getMyLegalStatus,
}
