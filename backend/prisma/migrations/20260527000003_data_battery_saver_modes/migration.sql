-- Wave-12.11 — UserPreferences.dataSaverMode + batterySaverMode
--
-- One combined migration covering both founder-priority modes from
-- docs/internal/plans/data-saver-mode.md and battery-saver-mode.md.
-- Both use the same "on" | "off" | "auto" tri-state. `auto` means
-- honor the platform signal:
--   - data-saver:    Save-Data header + navigator.connection.saveData
--   - battery-saver: prefers-reduced-motion: reduce
--
-- Idempotent guards per CLAUDE.md A5 — safe to re-run if a prior
-- partial deploy already applied one of the columns.

ALTER TABLE "UserPreferences"
  ADD COLUMN IF NOT EXISTS "dataSaverMode" TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "batterySaverMode" TEXT NOT NULL DEFAULT 'auto';
