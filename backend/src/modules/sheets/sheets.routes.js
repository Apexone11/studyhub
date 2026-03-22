const express = require('express')
const listController = require('./sheets.list.controller')
const crudController = require('./sheets.crud.controller')
const draftsController = require('./sheets.drafts.controller')
const htmlController = require('./sheets.html.controller')
const downloadsController = require('./sheets.downloads.controller')
const socialController = require('./sheets.social.controller')
const contributionsController = require('./sheets.contributions.controller')
const forkController = require('./sheets.fork.controller')

const router = express.Router()

// Static / prefix routes must come before parameterised /:id routes so Express
// does not treat "leaderboard", "drafts", or "contributions" as an :id value.
router.use(listController)           // GET /leaderboard, GET /
router.use(contributionsController)  // PATCH /contributions/:cid, GET /contributions/:cid/diff, POST /:id/contributions
router.use(draftsController)         // GET/POST /drafts/*, PATCH /drafts/:id/working-html, etc.
router.use(crudController)           // GET /:id, POST /, PATCH /:id, DELETE /:id
router.use(htmlController)           // POST /:id/submit-review, GET /:id/html-preview, GET /:id/html-runtime
router.use(downloadsController)      // GET /:id/download, GET /:id/attachment(/*), POST /:id/download
router.use(socialController)         // POST /:id/star, GET/POST /:id/comments, POST /:id/react, DELETE /:id/comments/:commentId
router.use(forkController)           // POST /:id/fork

module.exports = router
