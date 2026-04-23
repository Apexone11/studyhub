/* ═══════════════════════════════════════════════════════════════════════════
 * features/settings — barrel re-exports for the Settings feature
 *
 * Convention (Cycle 35+): new hooks, helpers, and constants go here.
 * Pages stay in pages/settings/ and import from this barrel.
 * ═══════════════════════════════════════════════════════════════════════════ */

// State hook
export { FONT, usePreferences } from '../../pages/settings/settingsState'

// Shared UI components
export {
  Input,
  Button,
  Message,
  FormField,
  SectionCard,
  MsgList,
  Select,
  ToggleRow,
} from '../../pages/settings/settingsShared'
