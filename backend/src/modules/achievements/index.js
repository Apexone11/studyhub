/**
 * Achievements module barrel.
 *
 * Default export = Express router mounted at /api/achievements.
 * Named exports = engine functions consumed by trigger sites + bootstrap.
 */
const router = require('./achievements.routes')
const engine = require('./achievements.engine')
const constants = require('./achievements.constants')

module.exports = router
module.exports.emitAchievementEvent = engine.emitAchievementEvent
module.exports.checkAndAwardBadgesLegacy = engine.checkAndAwardBadgesLegacy
module.exports.recomputeUserAchievementStats = engine.recomputeUserAchievementStats
module.exports.seedBadgeCatalog = engine.seedBadgeCatalog
module.exports.EVENT_KINDS = engine.EVENT_KINDS
module.exports.BADGE_CATALOG = constants.BADGE_CATALOG
module.exports.TIERS = constants.TIERS
module.exports.CATEGORIES = constants.CATEGORIES
module.exports.levelForXp = constants.levelForXp
module.exports.levelProgressForXp = constants.levelProgressForXp
