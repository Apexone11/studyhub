/**
 * lib/badges.js — Backward-compat shim for Achievements V2.
 *
 * The original v1 module owned the catalog + the polling award engine.
 * V2 (2026-04-30) moved both into backend/src/modules/achievements/. This
 * file re-exports the new engine's public surface so the 5 existing trigger
 * sites that `require('../../lib/badges')` keep working without code change.
 *
 * New callers should `require('../modules/achievements')` directly and prefer
 * the event-driven `emitAchievementEvent(prisma, userId, kind, metadata)`
 * over the legacy `checkAndAwardBadges(prisma, userId)`.
 */

const {
  BADGE_CATALOG,
  emitAchievementEvent,
  checkAndAwardBadgesLegacy,
  seedBadgeCatalog,
  EVENT_KINDS,
} = require('../modules/achievements')

module.exports = {
  BADGE_CATALOG,
  seedBadgeCatalog,
  // Legacy name kept for back-compat. Internally routes through the new engine.
  checkAndAwardBadges: checkAndAwardBadgesLegacy,
  // New API surface — exported here so older modules can adopt without an extra import.
  emitAchievementEvent,
  EVENT_KINDS,
}
