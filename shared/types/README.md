# shared/types

Single source of truth for API request and response shapes shared between
`backend/` and `frontend/studyhub-app/`. This directory exists to anchor the
incremental TypeScript migration described in CLAUDE.md §13.

## Why this exists

Backend and frontend currently duplicate every domain shape (Sheet, User,
Conversation, Message, etc.) by reading code on each side. Drift is the source
of several bugs called out in CLAUDE.md "Common Bugs and Pitfalls":

- #2 Search response shape mismatch (`data.results.users` vs `data.users`)
- #4 Socket.io event name mismatches
- #7 `createdAt` vs `timestamp` field naming

Putting the shapes here once, importing from both ends, kills that class of bug.

## How to consume (when populated)

Backend:

```ts
import type { Sheet, SheetCreateRequest } from '../../shared/types/sheet'
```

Frontend:

```ts
import type { Sheet, SheetCreateRequest } from '../../../shared/types/sheet'
```

Both projects reach this folder via relative paths; no package install needed.

## What goes in here

- Pure type declarations only — no runtime code, no `import` of `@prisma/client`,
  no `import` of React or Express types.
- One file per domain area: `sheet.ts`, `user.ts`, `messaging.ts`, etc.
- Branded ID types where useful (`type SheetId = number & { __sheet: never }`)
  to make accidental swaps a compile error.

## What does NOT go in here

- Prisma model types (those live next to `schema.prisma`).
- Component props or hook return types (those live next to the component).
- Validation schemas (those go in `backend/src/schemas/` and stay backend-only).
