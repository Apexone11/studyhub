// Re-export the Prisma client from the original shared location.
// This keeps all module imports consistent: require('../core/db/prisma')
module.exports = require('../../lib/prisma')
