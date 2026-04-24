/**
 * Icons — Figma-aligned re-export of the existing hand-built icon set.
 *
 * See `docs/internal/audits/2026-04-24-day2-primitives-plus-phase2-handoff.md`
 * Part C for the canonical spec. This is the "light-touch wrapping"
 * option: the 31 icons in `components/Icons.jsx` already work, so we
 * don't refactor them. We just re-export them under the names Figma
 * uses so a consumer can `import { Star, Close, ArrowRight } from
 * '../../components/ui'` and the names match the design file one-to-one.
 *
 * Every icon accepts a `size` prop and uses `currentColor` for its
 * stroke/fill, inheriting color from the parent.
 */
export {
  // Figma name -> existing Icon function (aliased via `as`).
  IconStar as Star,
  IconStarFilled as StarFilled,
  IconClock as Clock,
  IconSheets as Sheet,
  IconDownload as Download,
  IconArrowRight as ArrowRight,
  IconArrowLeft as ArrowLeft,
  IconCheck as Check,
  IconX as Close,
  IconPlus as Plus,
  // Additional icons commonly referenced by the component kit. Kept
  // aliased so code can pull them from the ui barrel without reaching
  // into ../Icons directly.
  IconSearch as Search,
  IconBell as Bell,
  IconProfile as Profile,
  IconSpark as Spark,
  IconFeed as Feed,
  IconNotes as Notes,
  IconMessages as Messages,
  IconSettings as Settings,
  IconUsers as Users,
  IconFork as Fork,
  IconPen as Pen,
  IconEye as Eye,
  IconShield as Shield,
  IconChevronDown as ChevronDown,
  IconFilter as Filter,
  IconSignOut as SignOut,
  IconComment as Comment,
  IconUpload as Upload,
  IconLink as Link,
  IconInfoCircle as InfoCircle,
  IconSchool as School,
  IconCamera as Camera,
  IconGitPullRequest as GitPullRequest,
  IconSpinner as Spinner,
  IconTests as Tests,
  IconAnnouncements as Announcements,
  IconMoreHorizontal as MoreHorizontal,
  IconShieldCheck as ShieldCheck,
} from '../../Icons'
