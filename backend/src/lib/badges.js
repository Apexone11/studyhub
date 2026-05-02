/**
 * lib/badges.js — thin shim over the achievements-v2 engine.
 *
 * v1 had a `checkAndAwardBadges(prisma, userId)` entry point called from
 * five trigger sites (sheet create, fork, contribution submit, sheetLab
 * commit, follow). The achievements-v2 plan kept that signature working
 * via this shim so legacy callers keep working unchanged. New code
 * should call `emitAchievementEvent(prisma, userId, kind, metadata)`
 * from `modules/achievements/achievements.engine.js` directly — see
 * CLAUDE.md "Achievements V2" for details.
 *
 * This file is also the require-stack target of ten existing
 * `vi.mock(require.resolve('../src/lib/badges'), …)` calls in the test
 * suite. Without it, those tests fail to load with
 * `Cannot find module '../src/lib/badges'`.
 */
const {
  checkAndAwardBadgesLegacy,
  emitAchievementEvent,
} = require('../modules/achievements/achievements.engine')

module.exports = {
  // Legacy v1 entry point — kept for the five existing trigger sites.
  checkAndAwardBadges: checkAndAwardBadgesLegacy,
  // Re-export so callers can migrate site-by-site without import churn.
  emitAchievementEvent,
}
