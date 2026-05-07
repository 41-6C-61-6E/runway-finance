# runway — Development Specification v4.0


> Self-hosted personal finance app. Docker-native. Dark by default.
> Base template: https://github.com/zexahq/Next-auth-starter

---

## How to Use This Document

Each phase is a self-contained unit of work. Feed one phase at a time to your coding agent in VS Code. Every phase includes:
- **Goal** — what this phase achieves and why it matters
- **Stack context** — which template tools to use and how they work
- **Implementation steps** — exact file paths, code shapes, and logic
- **Verification steps** — how to confirm the phase is done before moving on

Do not skip phases. Each phase depends on the previous.

---

## Application Feature Overview

| # | Feature | Description |
|---|---|---|
| 1 | Authentication | Single-user email/password login |
| 2 | SimpleFIN Integration | Connect to financial institutions via SimpleFIN Bridge protocol |
| 3 | Transaction Sync | Automated 12-hr + manual sync of accounts and transactions |
| 4 | Transaction Ledger | Filterable, searchable, bulk-editable transaction table |
| 5 | Categorization | Hierarchical category system with color and icon support |
| 6 | Rules Engine | Auto-categorization rules applied on sync and on-demand |
| 7 | Net Worth Tracker | Live net worth from linked accounts + manual assets |
| 8 | Cash Flow Reports | Income vs. expenses by period and category |
| 9 | Spending Reports | Donut chart drill-down by category |
| 10 | FIRE Planning | Financial independence number and projection calculator |
| 11 | Data Export | CSV / JSON / ZIP export of all user data |
| 12 | Dashboard | Single-page overview of all key financial widgets |
| 13 | Settings | Theme, currency, locale, connections, rules, categories, appearance |

---

## Technology Stack

### From the Template (use as-is)

| Tool | Purpose | Notes |
|---|---|---|
| Next.js 16 (App Router) | Framework + API route handlers | Uses Turbopack in dev |
| TypeScript | Type safety throughout | Strict mode |
| Tailwind CSS | Styling | PostCSS configured |
| Next Auth | Authentication, session management, TOTP MFA | Replaces Clerk entirely |
| Drizzle ORM + drizzle-kit | Database schema, migrations, typed queries | Schema in `src/db/schema.ts` |
| PostgreSQL | Primary database | Requires external Postgres in dev |
| shadcn/ui (Radix UI) | Component library | `components.json` pre-configured |
| React Hook Form | All forms | |
| Zod | Validation schemas | |
| Resend | Transactional email (verification, password reset) | |
| ESLint + Prettier | Code quality | `.prettierrc` provided |
| pnpm | Package manager | Use `pnpm` for all install commands, not npm |

### Added on Top of the Template

These packages are NOT in the template and must be installed:

| Tool | Purpose | Install |
|---|---|---|
| @tanstack/react-query | Client-side server state caching | `pnpm add @tanstack/react-query` |
| @tanstack/react-table | Headless table for transaction ledger | `pnpm add @tanstack/react-table` |
| @tremor/react | Finance chart components | `pnpm add @tremor/react` |
| @nivo/core @nivo/line @nivo/bar @nivo/pie | Custom charts | `pnpm add @nivo/core @nivo/line @nivo/bar @nivo/pie` |
| node-cron | Background job scheduling (worker) | `pnpm add node-cron` + `pnpm add -D @types/node-cron` |
| archiver | ZIP creation for data export | `pnpm add archiver` + `pnpm add -D @types/archiver` |
| csv-stringify | Streaming CSV export | `pnpm add csv-stringify` |
| @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities | Drag-to-reorder UI | `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` |
| @fontsource-variable/inter @fontsource-variable/jetbrains-mono | Self-hosted fonts (no Google CDN) | `pnpm add @fontsource-variable/inter @fontsource-variable/jetbrains-mono` |
| vitest @vitejs/plugin-react jsdom @testing-library/react | Unit testing | `pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event` |
| @playwright/test | Integration and E2E testing | `pnpm add -D @playwright/test` |


---

## Template File Structure

The Next-auth-starter has this layout. **Follow it exactly** — do not invent new top-level folders:

```
Next-auth-starter/
├── src/
│   ├── app/
│   │   ├── admin/              # Admin dashboard (template provides this — not used by runway)
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── [...Nextauth]/route.ts   # Next Auth catch-all handler
│   │   ├── auth/               # Sign-in, sign-up pages (template provides this)
│   │   └── dashboard/          # Template placeholder — we replace this
│   ├── components/
│   │   ├── admin/              # Template admin components — not used
│   │   ├── auth/               # Auth form components (template provides)
│   │   ├── landing/            # Landing page (template provides)
│   │   └── ui/                 # shadcn/ui generated components
│   ├── db/
│   │   ├── index.ts            # Drizzle client
│   │   └── schema.ts           # ALL table definitions
│   ├── lib/
│   │   ├── auth.ts             # Next Auth server instance
│   │   └── auth-client.ts      # Next Auth React client
│   └── utils/                  # Helper functions
├── drizzle/                    # Generated migration files
├── drizzle.config.ts
├── next.config.ts
├── components.json             # shadcn/ui config
├── package.json
└── .env.example
```

**runway additions** inside this structure:

```
src/
├── app/
│   ├── (protected)/            # NEW — auth-gated app shell
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── transactions/page.tsx
│   │   ├── net-worth/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── fire/page.tsx
│   │   └── settings/
│   │       ├── connections/page.tsx
│   │       ├── rules/page.tsx
│   │       ├── categories/page.tsx
│   │       ├── data/page.tsx
│   │       └── appearance/page.tsx
│   └── api/
│       ├── health/route.ts     # NEW
│       ├── connections/...     # NEW
│       ├── accounts/...        # NEW
│       ├── transactions/...    # NEW
│       ├── categories/...      # NEW
│       ├── rules/...           # NEW
│       ├── assets/...          # NEW
│       ├── net-worth/...       # NEW
│       ├── reports/...         # NEW
│       ├── fire/...            # NEW
│       ├── export/...          # NEW
│       └── settings/route.ts   # NEW
├── components/
│   ├── layout/                 # NEW — AppShell, Sidebar, Header
│   ├── charts/                 # NEW — Tremor and Nivo wrappers
│   └── features/               # NEW — feature-scoped components
│       ├── connections/
│       ├── transactions/
│       ├── categories/
│       ├── rules/
│       ├── assets/
│       ├── net-worth/
│       ├── reports/
│       ├── fire/
│       └── dashboard/
├── db/
│   └── schema.ts               # EXTENDED — add all runway tables
├── lib/
│   ├── auth.ts                 # EXTENDED — add TOTP plugin
│   ├── auth-client.ts          # EXTENDED — add TOTP client methods
│   ├── crypto.ts               # NEW — AES-256-GCM encrypt/decrypt
│   ├── simplefin.ts            # NEW — SimpleFIN HTTP client
│   └── query-client.tsx        # NEW — TanStack Query provider
├── services/                   # NEW — business logic
│   ├── sync.ts
│   ├── rules-engine.ts
│   ├── net-worth.ts
│   ├── reports.ts
│   └── fire.ts
├── utils/
│   ├── require-auth.ts         # NEW — Next Auth session guard
│   ├── format-currency.ts      # NEW
│   ├── format-date.ts          # NEW
│   ├── apply-accent.ts         # NEW — accent color CSS vars
│   └── sanitize.ts             # NEW — input sanitization
└── validations/                # NEW — Zod schemas
    ├── connection.ts
    ├── transaction.ts
    ├── category.ts
    ├── rule.ts
    ├── asset.ts
    └── fire.ts

worker/                         # NEW — top-level, outside src/
├── index.ts
└── jobs/
    ├── sync-all.ts
    └── net-worth-snapshot.ts

tests/                          # NEW
├── unit/
├── integration/
└── e2e/

vitest.config.ts                # NEW
playwright.config.ts            # NEW

```

---



## Environment Variables

```bash
# .env.local — copy from .env.example

# ─── Next Auth ──────────────────────────────────────────────────────
# Generate: openssl rand -hex 32
Next_AUTH_SECRET=<64-char-hex>
Next_AUTH_URL=http://localhost:3000

# ─── Database ─────────────────────────────────────────────────────────
DATABASE_URL=postgresql://runway:password@localhost:5432/runway

# ─── Email (Resend) ────────────────────────────────────────────────────
# Required for email verification on sign-up
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourdomain.com

# ─── Encryption ───────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<64-char-hex-string>

# ─── Registration Control ─────────────────────────────────────────────
# Set to "false" after the first user registers
ALLOW_REGISTRATION=true

# ─── Worker ───────────────────────────────────────────────────────────
SYNC_CRON_SCHEDULE="0 */12 * * *"
SYNC_HISTORY_DAYS=90
# Worker uses this to connect directly to Postgres (same value as DATABASE_URL in prod)
WORKER_DATABASE_URL=postgresql://runway:password@postgres:5432/runway

# ─── OAuth (optional — remove if not using) ───────────────────────────
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
```

---

## Docker Compose

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: runway
      POSTGRES_USER: runway
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U runway"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file: .env.local
    environment:
      DATABASE_URL: postgresql://runway:password@postgres:5432/runway
      Next_AUTH_URL: http://localhost:3000
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    env_file: .env.local
    environment:
      WORKER_DATABASE_URL: postgresql://runway:password@postgres:5432/runway
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
```

**Dockerfile** (app): Multi-stage Next.js build. Set `output: 'standalone'` in `next.config.ts`. Stage 1: install and build. Stage 2: copy standalone output.

**Dockerfile.worker**: `node:22-alpine`. Copies `worker/`, `src/db/`, `src/lib/crypto.ts`, `src/lib/simplefin.ts`, `src/services/`. Compiles TypeScript with `tsc`. Runs `node dist/worker/index.js`.

---

## API Design Contract

### Authentication in route handlers
Every route handler (except `/api/health` and `/api/auth/*`) calls `requireAuth(request)` from `src/utils/require-auth.ts`. This returns `{ userId: string, session }` or throws a `NextResponse` 401.

```typescript
// src/utils/require-auth.ts
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function requireAuth(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }
  return { userId: session.user.id, user: session.user, session: session.session };
}
```

Usage in route handlers:
```typescript
export async function GET(request: Request) {
  let userId: string;
  try {
    ({ userId } = await requireAuth(request));
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  // ... handler logic
}
```

### Request validation
All POST/PATCH bodies validated with Zod. Invalid body returns:
```json
{ "error": "validation_error", "message": "Invalid request body", "details": { "field": "error" } }
```

### Response shapes
```
Single resource:  { "id": "...", ... }
Collection:       { "data": [...], "total": 100, "limit": 50, "offset": 0 }
Result:           { "matched": 42 } or { "updated": 12 }
Empty success:    204 No Content
Error:            { "error": "error_code", "message": "Human description" }
```

### Standard status codes
200 · 201 · 204 · 400 validation · 401 unauthenticated · 403 forbidden · 404 not found · 409 conflict · 413 too large · 502 upstream error

---

## Design System

runway uses a CSS variable token system layered on top of Tailwind CSS. Dark only — no light mode.

### Color tokens (add to `src/app/globals.css`)

```css
:root {
  --color-bg-base:        #0a0a0f;
  --color-bg-surface:     #111118;
  --color-bg-elevated:    #1a1a24;
  --color-bg-input:       #15151e;
  --color-bg-hover:       #1e1e2a;
  --color-border-subtle:  #1e1e2a;
  --color-border-default: #2a2a3a;
  --color-border-strong:  #3a3a50;
  --color-text-primary:   #e8e8f0;
  --color-text-secondary: #9090aa;
  --color-text-muted:     #606075;
  --color-accent:         #6366f1;
  --color-accent-hover:   #818cf8;
  --color-accent-muted:   rgba(99,102,241,0.15);
  --color-accent-border:  rgba(99,102,241,0.3);
  --color-income:         #22c55e;
  --color-income-muted:   rgba(34,197,94,0.12);
  --color-expense:        #f43f5e;
  --color-expense-muted:  rgba(244,63,94,0.12);
  --color-warning:        #f59e0b;
  --color-pending:        #94a3b8;
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
}
.theme-darker { --color-bg-base: #000; --color-bg-surface: #080808; }
```

### Amount display rule
All monetary amounts use `font-mono`. Positive = `var(--color-income)`. Negative = `var(--color-expense)`. Always display absolute value — color conveys sign.

---

## Phase Gate — A Phase Is Complete When

1. `pnpm lint` passes with no errors
2. `pnpm run type-check` passes (add `"type-check": "tsc --noEmit"` to package.json scripts)
3. `pnpm test` (Vitest) — all unit tests for this phase pass
4. `pnpm test:e2e` (Playwright) — all E2E tests for this phase pass
5. `docker compose up --build` — app and worker containers are healthy
6. Manual smoke test: a human can complete the primary user story for the phase

---
---

# PHASE 0 — Repository Setup & Foundation

---

## Phase 0.1 — Clone Template and Initial Configuration

### Goal
Have a running local instance of the Next-auth-starter template with demo content removed, runway identity applied, and all tooling working.

### Stack context
The template uses pnpm. It requires a real PostgreSQL database — no embedded SQLite fallback like the ixartz boilerplate. You must have Postgres running before `pnpm dev`. The simplest way during development is `docker compose up postgres -d`.

### Implementation steps

**Step 1: Clone the template**
clone into the current runway project https://github.com/zexahq/Next-auth-starter.git

---


## Phase 0.2 — Install Additional Dependencies

### Goal
All runway-specific packages are installed and importable.

### Implementation steps

**Step 1: Install charting and data libraries**
```bash
pnpm add @tanstack/react-query @tanstack/react-table
pnpm add @tremor/react
pnpm add @nivo/core @nivo/line @nivo/bar @nivo/pie
```

**Step 2: Install utility libraries**
```bash
pnpm add node-cron archiver csv-stringify
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm add -D @types/node-cron @types/archiver
```

**Step 3: Install test dependencies**
```bash
pnpm add -D vitest @vitejs/plugin-react jsdom
pnpm add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
pnpm add -D @playwright/test
npx playwright install chromium
```

**Step 4: Install remaining shadcn/ui components**

The template already has some shadcn components. Add any missing ones needed by runway. Check `src/components/ui/` and add what's not there:
```bash
npx shadcn@latest add badge command drawer popover scroll-area separator sheet skeleton slider switch tabs tooltip
```

**Step 5: Create TanStack Query provider**

Create `src/lib/query-client.tsx`:
```typescript
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
    })
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

Add `<ReactQueryProvider>` to `src/app/layout.tsx` wrapping `{children}`.

### Verification steps
- [ ] `pnpm dev` still starts without errors
- [ ] `import { useQuery } from '@tanstack/react-query'` resolves with no TypeScript error in a test file
- [ ] `import { AreaChart } from '@tremor/react'` resolves
- [ ] `pnpm type-check` passes

---

## Phase 0.3 — Next Auth Configuration (Extended)

### Goal
Next Auth is extended with the TOTP two-factor plugin. Email verification is configured via Resend. Registration lock (single-user) is enforced. The auth middleware protects all app routes.

### Stack context
The template already has a basic Next Auth setup in `src/lib/auth.ts` and `src/lib/auth-client.ts`. We extend it — do not rewrite from scratch, only add to what's there. Next Auth's Drizzle adapter automatically creates/migrates the auth tables (`user`, `session`, `account`, `verification`) when you run `pnpm db:migrate`.

### Implementation steps

**Step 1: Extend `src/lib/auth.ts`**

Open the existing `src/lib/auth.ts`. Add the `twoFactor` plugin and configure email:

```typescript
import { NextAuth } from 'Next-auth';
import { drizzleAdapter } from 'Next-auth/adapters/drizzle';
import { twoFactor } from 'Next-auth/plugins';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = NextAuth({
  baseURL: process.env.Next_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.Next_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,   // Next Auth will use the 'user', 'session', 'account', 'verification' tables from schema
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? 'noreply@example.com',
        to: user.email,
        subject: 'Verify your runway email',
        html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
      });
    },
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? 'noreply@example.com',
        to: user.email,
        subject: 'Reset your runway password',
        html: `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
      });
    },
  },
  plugins: [
    twoFactor({
      issuer: 'runway',
      totpOptions: { period: 30, digits: 6 },
    }),
  ],
  // Prevent registration after first user if ALLOW_REGISTRATION=false
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === '/sign-up/email',
        handler: async (ctx) => {
          if (process.env.ALLOW_REGISTRATION === 'false') {
            throw new Error('Registration is disabled on this instance.');
          }
        },
      },
    ],
  },
});
```

**Step 2: Extend `src/lib/auth-client.ts`**

```typescript
import { createAuthClient } from 'Next-auth/react';
import { twoFactorClient } from 'Next-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  plugins: [twoFactorClient()],
});

// Re-export commonly used methods for convenience
export const { signIn, signUp, signOut, useSession, twoFactor } = authClient;
```

Add to `.env.local`:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Step 3: Update `src/middleware.ts`**

Replace the template's middleware with the runway version:
```typescript
import { NextFetch } from '@Next-fetch/fetch';
import { NextResponse, type NextRequest } from 'next/server';

type SessionResponse = { session: { id: string } | null; user: { id: string } | null };

// Routes that require authentication
const PROTECTED_PATHS = [
  '/dashboard', '/transactions', '/net-worth', '/reports', '/fire', '/settings',
];
// Auth routes that redirect to dashboard if already signed in
const AUTH_PATHS = ['/auth/sign-in', '/auth/sign-up'];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p));
  const isAuth = AUTH_PATHS.some(p => pathname.startsWith(p));

  if (!isProtected && !isAuth) return NextResponse.next();

  const { data: sessionData } = await NextFetch<SessionResponse>(
    '/api/auth/get-session',
    {
      baseURL: request.nextUrl.origin,
      headers: { cookie: request.headers.get('cookie') ?? '' },
    }
  );

  const isSignedIn = !!sessionData?.user;

  if (isProtected && !isSignedIn) {
    return NextResponse.redirect(new URL('/auth/sign-in', request.url));
  }
  if (isAuth && isSignedIn) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
};
```

**Step 4: Extend sign-up page for TOTP enrollment**

In `src/app/auth/sign-up/page.tsx` (template provides this), after successful email sign-up and verification, redirect the user to a new TOTP enrollment page.

Create `src/app/auth/totp-setup/page.tsx` (Client Component):
```typescript
// 1. Call authClient.twoFactor.getTotpUri() to get the TOTP URI
// 2. Display QR code using a QR library (install: pnpm add qrcode.react)
// 3. Show the TOTP secret as text for manual entry
// 4. User enters 6-digit code
// 5. Call authClient.twoFactor.enable({ password, code }) — Next Auth verifies and enables TOTP
// 6. On success: redirect to /dashboard
// 7. "Skip for now" option: redirect to /dashboard without enabling (TOTP is optional in this design)
```

Install QR code package: `pnpm add qrcode.react`

Create `src/app/auth/totp-verify/page.tsx` (Client Component):
```typescript
// Used during sign-in when MFA is required
// Next Auth returns a specific response when MFA is needed after signIn.email()
// 1. User enters 6-digit code
// 2. Call authClient.twoFactor.verifyTotp({ code })
// 3. On success: redirect to /dashboard
```

**Step 5: Update sign-in flow to handle MFA**

In the template's sign-in form component (`src/components/auth/sign-in-form.tsx` or similar):
- After `authClient.signIn.email({ email, password })` call, check the response
- If Next Auth returns a `twoFactorRedirect` or MFA-required state, redirect to `/auth/totp-verify`
- Otherwise redirect to `/dashboard`

Next Auth's `signIn.email()` returns `{ data, error }`. Check `error?.code === 'TWO_FACTOR_REQUIRED'` to detect MFA prompt.

**Step 6: Create `src/utils/require-auth.ts`**
```typescript
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function requireAuth(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }
  return { userId: session.user.id, user: session.user };
}
```

### Verification steps
- [ ] `pnpm db:generate` generates a migration including Next Auth's user/session/account/verification tables
- [ ] `pnpm db:migrate` runs successfully on a fresh Postgres DB
- [ ] Visit `/auth/sign-up` → register a new user → receive verification email (check Resend dashboard in dev)
- [ ] Visit `/dashboard` without signing in → redirects to `/auth/sign-in`
- [ ] Sign in successfully → redirected to `/dashboard`
- [ ] Set `ALLOW_REGISTRATION=false` in `.env.local` → visiting `/auth/sign-up` and submitting returns registration error
- [ ] TOTP setup page shows QR code (may need to verify email first)

---

## Phase 0.4 — Design System & App Shell

### Goal
Global CSS dark design tokens are applied. The app has a sidebar + header shell wrapping all protected pages.

### Implementation steps

**Step 1: Update `src/app/globals.css`**

Append the runway token system after the existing Tailwind imports. The template likely has `@tailwind base; @tailwind components; @tailwind utilities;`. Keep those and add below:

```css
/* runway design tokens */
:root {
  --color-bg-base:        #0a0a0f;
  --color-bg-surface:     #111118;
  --color-bg-elevated:    #1a1a24;
  --color-bg-input:       #15151e;
  --color-bg-hover:       #1e1e2a;
  --color-border-subtle:  #1e1e2a;
  --color-border-default: #2a2a3a;
  --color-border-strong:  #3a3a50;
  --color-text-primary:   #e8e8f0;
  --color-text-secondary: #9090aa;
  --color-text-muted:     #606075;
  --color-accent:         #6366f1;
  --color-accent-hover:   #818cf8;
  --color-accent-muted:   rgba(99,102,241,0.15);
  --color-accent-border:  rgba(99,102,241,0.3);
  --color-income:         #22c55e;
  --color-income-muted:   rgba(34,197,94,0.12);
  --color-expense:        #f43f5e;
  --color-expense-muted:  rgba(244,63,94,0.12);
  --color-warning:        #f59e0b;
  --color-pending:        #94a3b8;
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
}

.theme-darker {
  --color-bg-base: #000000;
  --color-bg-surface: #080808;
}

html, body { background-color: var(--color-bg-base); color: var(--color-text-primary); }

/* Utility classes */
.amount-income { color: var(--color-income); font-family: 'JetBrains Mono Variable', monospace; }
.amount-expense { color: var(--color-expense); font-family: 'JetBrains Mono Variable', monospace; }
.bc-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  transition: border-color 150ms ease;
}
.bc-card:hover { border-color: var(--color-border-default); }
@keyframes bc-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
.bc-skeleton { background: var(--color-bg-elevated); border-radius: var(--radius-md); animation: bc-pulse 1.5s ease-in-out infinite; }
```

**Step 2: Update `tailwind.config.ts`** (or `tailwind.config.js` if the template uses that)

Extend theme colors to map CSS variables, and add font families:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--color-bg-base)',
        'bg-surface': 'var(--color-bg-surface)',
        'bg-elevated': 'var(--color-bg-elevated)',
        'bg-input': 'var(--color-bg-input)',
        'bg-hover': 'var(--color-bg-hover)',
        'border-subtle': 'var(--color-border-subtle)',
        'border-default': 'var(--color-border-default)',
        'border-strong': 'var(--color-border-strong)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'accent': {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          muted: 'var(--color-accent-muted)',
        },
        'income': 'var(--color-income)',
        'expense': 'var(--color-expense)',
      },
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
```

**Step 3: Create utility functions**

`src/utils/format-currency.ts`:
```typescript
export function formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}
```

`src/utils/format-date.ts`:
```typescript
export function formatDate(date: Date | string, format = 'MM/DD/YYYY'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return format.replace('MM', mm).replace('DD', dd).replace('YYYY', yyyy);
}
```

`src/utils/apply-accent.ts`:
```typescript
const ACCENTS: Record<string, { accent: string; hover: string; muted: string; border: string }> = {
  indigo: { accent: '#6366f1', hover: '#818cf8', muted: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)' },
  violet: { accent: '#8b5cf6', hover: '#a78bfa', muted: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.3)' },
  teal:   { accent: '#14b8a6', hover: '#2dd4bf', muted: 'rgba(20,184,166,0.15)',  border: 'rgba(20,184,166,0.3)' },
  amber:  { accent: '#f59e0b', hover: '#fbbf24', muted: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)' },
  rose:   { accent: '#f43f5e', hover: '#fb7185', muted: 'rgba(244,63,94,0.15)',   border: 'rgba(244,63,94,0.3)' },
  slate:  { accent: '#64748b', hover: '#94a3b8', muted: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.3)' },
};

export function applyAccent(name: string) {
  const a = ACCENTS[name] ?? ACCENTS['indigo']!;
  const r = document.documentElement;
  r.style.setProperty('--color-accent', a.accent);
  r.style.setProperty('--color-accent-hover', a.hover);
  r.style.setProperty('--color-accent-muted', a.muted);
  r.style.setProperty('--color-accent-border', a.border);
}
```

`src/utils/sanitize.ts`:
```typescript
export function sanitizeText(value: string, maxLength = 1000): string {
  return value.replace(/\0/g, '').trim().slice(0, maxLength);
}
```

**Step 4: Create the protected layout**

Create `src/app/(protected)/layout.tsx` (Server Component):
```typescript
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/auth/sign-in');
  return <AppShell userEmail={session.user.email}>{children}</AppShell>;
}
```

**Step 5: Create `src/components/layout/Sidebar.tsx`** (Client Component)
```
240px fixed sidebar on desktop
Sheet drawer on mobile (shadcn Sheet)
Logo / "runway" text at top
Nav items with Lucide icons:
  Dashboard (/dashboard) → LayoutDashboard
  Transactions (/transactions) → ArrowLeftRight
  Net Worth (/net-worth) → TrendingUp
  Reports (/reports) → BarChart3
  FIRE (/fire) → Flame
  <Separator />
  Settings (/settings/connections) → Settings
Active state: className "border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
Active icon: text-[var(--color-accent)]
Inactive icon: text-[var(--color-text-secondary)]
Bottom: user email text + sign out button
Sign out: calls authClient.signOut() then router.push('/auth/sign-in')
```

**Step 6: Create `src/components/layout/Header.tsx`** (Client Component)
```
Mobile hamburger toggle (controls sidebar Sheet)
Page title derived from usePathname()
Right side: sync status indicator (implemented in Phase 1)
```

**Step 7: Create `src/components/layout/AppShell.tsx`** (Client Component)
```
Props: { children, userEmail }
flex row: Sidebar (240px) + flex-1 main area with Header above content
Mobile: sidebar hidden, toggle via hamburger
Passes userEmail to Sidebar for display
```

**Step 8: Create stub pages**

Create these files — each exports a default function returning `<div>Coming soon</div>`:
- `src/app/(protected)/dashboard/page.tsx`
- `src/app/(protected)/transactions/page.tsx`
- `src/app/(protected)/net-worth/page.tsx`
- `src/app/(protected)/reports/page.tsx`
- `src/app/(protected)/fire/page.tsx`
- `src/app/(protected)/settings/connections/page.tsx`
- `src/app/(protected)/settings/rules/page.tsx`
- `src/app/(protected)/settings/categories/page.tsx`
- `src/app/(protected)/settings/data/page.tsx`
- `src/app/(protected)/settings/appearance/page.tsx`

**Step 9: Health route**

`src/app/api/health/route.ts`:
```typescript
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ status: 'ok', version: '4.0.0', timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: 'error', message: 'Database unreachable' }, { status: 503 });
  }
}
```

### Verification steps
- [ ] Navigating to `/dashboard` (signed out) → redirects to `/auth/sign-in`
- [ ] Navigating to `/dashboard` (signed in) → shows sidebar with all nav items and "Coming soon"
- [ ] Page background is `#0a0a0f` — dark
- [ ] All sidebar nav links work without full page reload
- [ ] Sign Out button works — session cleared, redirected to sign-in
- [ ] `curl http://localhost:3000/api/health` returns `{ "status": "ok" }`
- [ ] `pnpm type-check` passes
- [ ] No `fonts.googleapis.com` requests

---
---

# PHASE 1 — Database Schema & Encryption

---

## Phase 1.1 — Extend Database Schema

### Goal
All runway tables are defined in `src/db/schema.ts` alongside the existing Next Auth tables, migrated, and indexed.

### Stack context
The template's `src/db/schema.ts` already contains Next Auth's tables (`user`, `session`, `account`, `verification`). Add runway tables to the **same file**. The Drizzle client at `src/db/index.ts` already connects to Postgres using `DATABASE_URL`. All runway `userId` columns reference `user.id` (a text UUID generated by Next Auth).

### Implementation steps

**Step 1: Open `src/db/schema.ts` and append all runway tables**

Add after the existing Next Auth table definitions. Import any missing pg-core functions at the top. The full list of tables to add:

```typescript
import {
  boolean, date, integer, jsonb, numeric, pgTable,
  text, timestamp, unique, uuid
} from 'drizzle-orm/pg-core';

// ── User Settings ──────────────────────────────────────────────────────
export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(), // Next Auth user ID (text UUID)
  currency: text('currency').notNull().default('USD'),
  locale: text('locale').notNull().default('en-US'),
  timezone: text('timezone').notNull().default('America/New_York'),
  theme: text('theme').notNull().default('dark'),         // 'dark' | 'darker'
  accentColor: text('accent_color').notNull().default('indigo'),
  compactMode: boolean('compact_mode').notNull().default(false),
  dateFormat: text('date_format').notNull().default('MM/DD/YYYY'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── SimpleFIN Connections ──────────────────────────────────────────────
export const simplifinConnections = pgTable('simplefin_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  accessUrlEncrypted: text('access_url_encrypted').notNull(),
  accessUrlIv: text('access_url_iv').notNull(),
  accessUrlTag: text('access_url_tag').notNull(),
  label: text('label').notNull().default('Primary'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncStatus: text('last_sync_status').notNull().default('pending'),
  lastSyncError: text('last_sync_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Accounts ───────────────────────────────────────────────────────────
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  connectionId: uuid('connection_id').notNull()
    .references(() => simplifinConnections.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('USD'),
  balance: numeric('balance', { precision: 20, scale: 4 }).notNull().default('0'),
  balanceDate: timestamp('balance_date', { withTimezone: true }),
  type: text('type').notNull(), // 'checking'|'savings'|'credit'|'investment'|'loan'|'other'
  institution: text('institution'),
  isHidden: boolean('is_hidden').notNull().default(false),
  isExcludedFromNetWorth: boolean('is_excluded_from_net_worth').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.connectionId, t.externalId)]);

// ── Categories ─────────────────────────────────────────────────────────
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  parentId: uuid('parent_id'), // FK to categories(id) — added via SQL after table creation
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  icon: text('icon'),
  isIncome: boolean('is_income').notNull().default(false),
  isSystem: boolean('is_system').notNull().default(false),
  excludeFromReports: boolean('exclude_from_reports').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Transactions ───────────────────────────────────────────────────────
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  accountId: uuid('account_id').notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  date: date('date').notNull(),
  postedDate: date('posted_date'),
  amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
  description: text('description').notNull(),
  payee: text('payee'),
  memo: text('memo'),
  pending: boolean('pending').notNull().default(false),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  notes: text('notes'),
  reviewed: boolean('reviewed').notNull().default(false),
  ignored: boolean('ignored').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.accountId, t.externalId)]);

// ── Sync Logs ──────────────────────────────────────────────────────────
export const syncLogs = pgTable('sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  connectionId: uuid('connection_id')
    .references(() => simplifinConnections.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: text('status').notNull(), // 'running'|'success'|'partial'|'error'
  accountsSynced: integer('accounts_synced').notNull().default(0),
  transactionsFetched: integer('transactions_fetched').notNull().default(0),
  transactionsNew: integer('transactions_new').notNull().default(0),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
});

// ── Category Rules ─────────────────────────────────────────────────────
export const categoryRules = pgTable('category_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  conditionField: text('condition_field').notNull(),
  conditionOperator: text('condition_operator').notNull(),
  conditionValue: text('condition_value').notNull(),
  conditionCaseSensitive: boolean('condition_case_sensitive').notNull().default(false),
  setCategoryId: uuid('set_category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  setPayee: text('set_payee'),
  setReviewed: boolean('set_reviewed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Manual Assets ──────────────────────────────────────────────────────
export const manualAssets = pgTable('manual_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  assetType: text('asset_type').notNull(),
  isLiability: boolean('is_liability').notNull().default(false),
  value: numeric('value', { precision: 20, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  institution: text('institution'),
  notes: text('notes'),
  isExcludedFromNetWorth: boolean('is_excluded_from_net_worth').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const manualAssetValueHistory = pgTable('manual_asset_value_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id').notNull()
    .references(() => manualAssets.id, { onDelete: 'cascade' }),
  value: numeric('value', { precision: 20, scale: 4 }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note'),
});

// ── Net Worth Snapshots ────────────────────────────────────────────────
export const netWorthSnapshots = pgTable('net_worth_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  snapshotDate: date('snapshot_date').notNull(),
  totalAssets: numeric('total_assets', { precision: 20, scale: 4 }).notNull(),
  totalLiabilities: numeric('total_liabilities', { precision: 20, scale: 4 }).notNull(),
  netWorth: numeric('net_worth', { precision: 20, scale: 4 }).notNull(),
  breakdown: jsonb('breakdown').notNull(),
}, (t) => [unique().on(t.userId, t.snapshotDate)]);

// ── FIRE Scenarios ─────────────────────────────────────────────────────
export const fireScenarios = pgTable('fire_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull().default('Primary Scenario'),
  isDefault: boolean('is_default').notNull().default(false),
  currentAge: integer('current_age'),
  targetAge: integer('target_age'),
  targetAnnualExpenses: numeric('target_annual_expenses', { precision: 20, scale: 4 }),
  currentInvestableAssets: numeric('current_investable_assets', { precision: 20, scale: 4 }),
  annualContributions: numeric('annual_contributions', { precision: 20, scale: 4 }),
  expectedReturnRate: numeric('expected_return_rate', { precision: 6, scale: 4 }).default('0.07'),
  inflationRate: numeric('inflation_rate', { precision: 6, scale: 4 }).default('0.03'),
  safeWithdrawalRate: numeric('safe_withdrawal_rate', { precision: 6, scale: 4 }).default('0.04'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 2: Generate and run migration**
```bash
pnpm db:generate
pnpm db:migrate
```

**Step 3: Add performance indexes**

Create `src/db/seed-indexes.ts` (run once after migration):
```typescript
import { db } from './index';
import { sql } from 'drizzle-orm';

async function addIndexes() {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON transactions(user_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_user_hidden ON accounts(user_id, is_hidden);
    CREATE INDEX IF NOT EXISTS idx_transactions_fts ON transactions
      USING GIN(to_tsvector('english',
        description || ' ' || COALESCE(payee,'') || ' ' || COALESCE(notes,'')
      ));
  `);
  console.log('Indexes created.');
  process.exit(0);
}
addIndexes().catch(console.error);
```

Add script to `package.json`: `"db:indexes": "npx tsx src/db/seed-indexes.ts"`

Run: `pnpm db:indexes`

### Verification steps
- [ ] `pnpm db:generate` produces migration file(s) in `drizzle/`
- [ ] `pnpm db:migrate` completes with no errors
- [ ] `pnpm db:studio` shows all new tables in Drizzle Studio
- [ ] Insert two rows with same `(connection_id, external_id)` into `transactions` — second fails with unique violation
- [ ] `pnpm type-check` passes

---

## Phase 1.2 — Encryption Service

### Goal
AES-256-GCM encrypt/decrypt utility is implemented and unit-tested. The encryption key is validated at module load — fatal error if missing.

### Implementation steps

**Step 1: Create `src/lib/crypto.ts`**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-f]+$/i.test(key)) {
    console.error(
      '[runway] FATAL: ENCRYPTION_KEY is missing or invalid. ' +
      'Must be a 64-character hex string. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
    process.exit(1);
  }
  return Buffer.from(key, 'hex');
}

// Key loaded once at module init. Process exits if invalid.
const ENCRYPTION_KEY = getEncryptionKey();

export function encrypt(plaintext: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt({ ciphertext, iv, tag }: EncryptedPayload): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Decryption failed: invalid ciphertext or tampered data');
  }
}
```

**Step 2: Create `tests/unit/crypto.test.ts`**
```typescript
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '@/lib/crypto';

describe('Crypto', () => {
  it('encrypts and decrypts back to original plaintext', () => {
    const plaintext = 'https://user:pass@simplefin.example.com/abc123';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produces unique ciphertext on each call (random IV)', () => {
    const a = encrypt('test-value');
    const b = encrypt('test-value');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('throws on tampered ciphertext', () => {
    const payload = encrypt('secret');
    payload.ciphertext = payload.ciphertext.slice(0, -4) + 'XXXX';
    expect(() => decrypt(payload)).toThrow('Decryption failed');
  });

  it('throws on tampered auth tag', () => {
    const payload = encrypt('secret');
    payload.tag = 'a'.repeat(32);
    expect(() => decrypt(payload)).toThrow('Decryption failed');
  });
});
```

Note: For tests to run, `ENCRYPTION_KEY` must be set in the test environment. Add to `vitest.config.ts`:
```typescript
test: {
  env: {
    ENCRYPTION_KEY: 'a'.repeat(64), // 64-char hex for tests only
  },
  // ...
}
```

### Verification steps
- [ ] `pnpm test -- crypto` — all 4 tests pass
- [ ] `ENCRYPTION_KEY` value is never logged — check that no `console.log(key)` calls exist in the file

---

## Phase 1.3 — SimpleFIN HTTP Client

### Goal
A typed HTTP client handles the SimpleFIN token claiming and account data fetching.

### Implementation steps

**Step 1: Create `src/lib/simplefin.ts`**
```typescript
export class SimpleFINError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SimpleFINError';
  }
}

export type SimpleFINTransaction = {
  id: string;
  posted: number;
  amount: string;
  description: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
};

export type SimpleFINAccount = {
  id: string;
  name: string;
  currency: string;
  balance: string;
  'balance-date': number;
  org: { name: string };
  transactions?: SimpleFINTransaction[];
};

export type SimpleFINResponse = { accounts: SimpleFINAccount[] };

const TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function claimAccessUrl(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken, 'base64').toString('utf8');
    new URL(claimUrl); // validate
  } catch {
    throw new SimpleFINError('Invalid setup token: cannot decode to a valid URL', 'invalid_token');
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(claimUrl, { method: 'POST' });
  } catch (err) {
    throw new SimpleFINError(`Network error during claim: ${String(err)}`, 'claim_failed');
  }
  if (!res.ok) {
    throw new SimpleFINError(`Claim failed with status ${res.status}`, 'claim_failed');
  }
  const body = await res.json() as { access_url?: string };
  if (!body.access_url) {
    throw new SimpleFINError('Claim response missing access_url field', 'claim_failed');
  }
  return body.access_url;
}

export async function fetchAccounts(
  accessUrl: string,
  startDate: Date,
  endDate: Date,
): Promise<SimpleFINResponse> {
  const url = new URL(`${accessUrl}/accounts`);
  url.searchParams.set('start-date', String(Math.floor(startDate.getTime() / 1000)));
  url.searchParams.set('end-date', String(Math.floor(endDate.getTime() / 1000)));
  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString());
  } catch (err) {
    throw new SimpleFINError(`Network error fetching accounts: ${String(err)}`, 'fetch_failed');
  }
  if (!res.ok) {
    throw new SimpleFINError(`Accounts fetch failed with status ${res.status}`, 'fetch_failed');
  }
  return res.json() as Promise<SimpleFINResponse>;
}
```

**Step 2: Create `tests/unit/simplefin.test.ts`**

Use `vi.stubGlobal('fetch', mockFn)` to test:
- Valid base64 setup token → POST to claim URL → returns access URL string
- Non-2xx response from claim URL → throws `SimpleFINError` with code `'claim_failed'`
- Invalid base64 token → throws `SimpleFINError` with code `'invalid_token'`
- Fetch abort (timeout simulation) → throws

### Verification steps
- [ ] `pnpm test -- simplefin` — all tests pass
- [ ] No real HTTP calls during tests
- [ ] `SimpleFINError` always has both `message` and `code` properties

---
---

# PHASE 2 — Connection & Transaction API

---

## Phase 2.1 — Connection API Routes

### Goal
Users can create, list, and delete SimpleFIN connections through typed API route handlers.

### Implementation steps

**Step 1: Create `src/validations/connection.ts`**
```typescript
import { z } from 'zod';
export const CreateConnectionSchema = z.object({
  setupToken: z.string().min(1),
  label: z.string().max(100).default('Primary'),
});
```

**Step 2: Create `src/app/api/connections/route.ts`**

**GET**: List connections for userId. Return `{ id, label, lastSyncAt, lastSyncStatus, lastSyncError, createdAt }[]`. NEVER return any `accessUrl*` fields.

**POST**:
1. `requireAuth(request)` → userId
2. Parse body with `CreateConnectionSchema` → 400 on fail
3. Check `ALLOW_REGISTRATION` — if the user count > 0 and registration is locked, this isn't the right check; the connection creation is always allowed for authenticated users. But do check: does a connection already exist for this user? → 409 if yes (runway is single-connection per phase 1 design)
4. `claimAccessUrl(setupToken)` → catch `SimpleFINError`: `'invalid_token'` → 400, `'claim_failed'` → 502
5. `encrypt(accessUrl)` → `{ ciphertext, iv, tag }`
6. INSERT into `simplefin_connections` → return 201

**Step 3: Create `src/app/api/connections/[id]/route.ts`**

**DELETE**:
1. `requireAuth(request)` → userId
2. Check `X-Confirm-Delete: true` header → 400 if missing
3. SELECT connection WHERE id AND userId → 404 if not found
4. DELETE → 204 (cascades to accounts/transactions)

**Step 4: Create `src/app/api/connections/[id]/sync/route.ts`**

**POST**: `requireAuth` → verify ownership → call `syncConnection(id, userId)` from `src/services/sync.ts` → return 200 with result

**Step 5: Create `src/app/api/connections/[id]/sync-logs/route.ts`**

**GET**: `requireAuth` → SELECT sync_logs WHERE connectionId AND userId ORDER BY startedAt DESC → return `{ data, total }` with limit/offset

**Step 6: Add `requireDeleteConfirmation` helper**

In `src/utils/require-auth.ts`, add:
```typescript
export function requireDeleteConfirmation(request: Request): void {
  if (request.headers.get('X-Confirm-Delete') !== 'true') {
    throw NextResponse.json(
      { error: 'confirmation_required', message: 'Include X-Confirm-Delete: true header' },
      { status: 400 }
    );
  }
}
```

All DELETE handlers call this. All client-side DELETE fetches include `{ headers: { 'X-Confirm-Delete': 'true' } }`.

### Verification steps
- [ ] `POST /api/connections` with invalid token → 400
- [ ] `POST /api/connections` with valid mocked token → 201, encrypted URL in DB
- [ ] `GET /api/connections` response has zero `accessUrl` fields at any depth
- [ ] `DELETE /api/connections/:id` without `X-Confirm-Delete` header → 400
- [ ] `DELETE /api/connections/:id` with header → 204, row gone from DB
- [ ] All routes return 401 without valid session

---

## Phase 2.2 — Accounts & Transactions API Routes

### Goal
Full CRUD API for accounts and transactions with filtering, pagination, sorting, and full-text search.

### Implementation steps

**Step 1: Create `src/validations/transaction.ts`**
```typescript
import { z } from 'zod';

export const TransactionFilterSchema = z.object({
  accountId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  categoryId: z.union([z.string().uuid(), z.literal('uncategorized')]).optional(),
  search: z.string().max(200).optional(),
  pending: z.coerce.boolean().optional(),
  reviewed: z.coerce.boolean().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
  sort: z.enum(['date', 'amount', 'description']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const PatchTransactionSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  payee: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  reviewed: z.boolean().optional(),
  ignored: z.boolean().optional(),
});

export const BulkPatchTransactionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  patch: z.object({
    categoryId: z.string().uuid().nullable().optional(),
    reviewed: z.boolean().optional(),
    ignored: z.boolean().optional(),
  }),
});
```

**Step 2: Create `src/app/api/accounts/route.ts`** (GET: list by userId with includeHidden/type filters)

**Step 3: Create `src/app/api/accounts/[id]/route.ts`** (GET single, PATCH: name/isHidden/isExcludedFromNetWorth/displayOrder/type)

**Step 4: Create `src/app/api/transactions/route.ts`**

**GET**: Build dynamic Drizzle query. All filters from `TransactionFilterSchema`. Join accounts for `accountName`, join categories for `{ id, name, color }`. Full-text search via `to_tsvector/plainto_tsquery` using the GIN index. Return `{ data: Transaction[], total, limit, offset }`.

**PATCH (bulk)**: Body = `BulkPatchTransactionSchema`. UPDATE WHERE id = ANY(ids) AND userId = userId. Return `{ updated: number }`.

**Step 5: Create `src/app/api/transactions/[id]/route.ts`** (GET with joins, PATCH with partial update + apply `sanitizeText` to payee/notes)

### Verification steps
- [ ] `GET /api/transactions` returns `{ data: [], total: 0, limit: 50, offset: 0 }` on empty DB
- [ ] After seeding 100 transactions: GET returns 50 with correct `total: 100`
- [ ] `GET /api/transactions?categoryId=uncategorized` returns only null-category rows
- [ ] `GET /api/transactions?search=coffee` uses FTS and returns matching rows
- [ ] `PATCH /api/transactions/:id` with `{ notes: "hi" }` — only `notes` and `updatedAt` change
- [ ] Bulk PATCH with 3 IDs — exactly 3 rows updated, verified with SELECT

---
---

# PHASE 3 — Sync Service & Background Worker

---

## Phase 3.1 — Sync Service

### Goal
The sync service ingests SimpleFIN data into the DB with idempotent upserts, preserving all user-modified fields.

### Implementation steps

**Create `src/services/sync.ts`**:

```typescript
// syncConnection(connectionId: string, userId: string): Promise<SyncResult>
//
// Algorithm:
// 1. INSERT sync_log row: status='running', startedAt=now()
//
// 2. SELECT connection WHERE id=connectionId AND userId=userId — throw if not found
//
// 3. decrypt({ ciphertext: accessUrlEncrypted, iv: accessUrlIv, tag: accessUrlTag })
//
// 4. Compute startDate:
//    lastSyncAt === null → now() minus SYNC_HISTORY_DAYS days (from process.env.SYNC_HISTORY_DAYS ?? 90)
//    otherwise → lastSyncAt minus 24 hours
//
// 5. fetchAccounts(accessUrl, startDate, now()) → SimpleFINResponse
//
// 6. For each account in response:
//    Drizzle INSERT ... ON CONFLICT (connection_id, external_id) DO UPDATE SET
//      balance=EXCLUDED.balance, balance_date=EXCLUDED.balance_date,
//      name=EXCLUDED.name, institution=EXCLUDED.institution, updated_at=now()
//
// 7. For each account's transactions:
//    Drizzle INSERT ... ON CONFLICT (account_id, external_id) DO UPDATE SET
//      amount=EXCLUDED.amount, pending=EXCLUDED.pending,
//      description=EXCLUDED.description, posted_date=EXCLUDED.posted_date,
//      updated_at=now()
//    NEVER overwrite on conflict: category_id, notes, reviewed
//    Payee: only set if existing row's payee IS NULL (preserve user-set payee)
//    Use Drizzle's .returning() to count new vs updated rows
//
// 8. Call applyRulesToAll(userId) from rulesEngine service
//
// 9. Call saveNetWorthSnapshot(userId) from netWorth service
//
// 10. UPDATE simplefin_connections SET lastSyncAt=now(), lastSyncStatus='ok', lastSyncError=null
//
// 11. UPDATE sync_log: status='success', completedAt=now(), counts, durationMs
//
// 12. Invalidate report cache by setting a timestamp in DB:
//     UPDATE user_settings SET updatedAt=now() — this triggers Next.js revalidateTag
//     (Note: revalidateTag only works from Next.js context. In worker, just let 5-min TTL expire.)
//
// ON ANY ERROR:
//   UPDATE sync_log: status='error', errorMessage, completedAt
//   UPDATE connection: lastSyncStatus='error', lastSyncError
//   console.error(full error)
//   re-throw

// syncAllConnections(): Promise<void>
// SELECT all rows from simplefin_connections (no userId filter — worker has full DB access)
// For each: call syncConnection(id, userId) sequentially
// Catch per-connection errors — never stop on first failure
```

### Verification steps
- [ ] Unit test (mock `fetchAccounts`): correct rows upserted in test DB
- [ ] Run sync twice with same data: no duplicate rows
- [ ] Set `categoryId` on a transaction → run sync → `categoryId` NOT overwritten
- [ ] Set `payee` on a transaction → run sync → `payee` NOT overwritten
- [ ] Mocked `fetchAccounts` error → sync_log status='error', connection lastSyncStatus='error'

---

## Phase 3.2 — Background Worker

### Goal
A separate Docker service runs sync and net-worth snapshot jobs on schedule via node-cron.

### Implementation steps

**Step 1: Create `worker/index.ts`**
```typescript
import cron from 'node-cron';

const syncSchedule = process.env.SYNC_CRON_SCHEDULE ?? '0 */12 * * *';

console.log('[worker] Starting. Sync schedule:', syncSchedule);

// Dynamic imports to avoid loading Next.js modules
async function runSync() {
  const { syncAllConnections } = await import('./jobs/sync-all');
  await syncAllConnections();
}

async function runSnapshot() {
  const { takeNetWorthSnapshot } = await import('./jobs/net-worth-snapshot');
  await takeNetWorthSnapshot();
}

cron.schedule(syncSchedule, async () => {
  console.log('[worker] Running scheduled sync', new Date().toISOString());
  try { await runSync(); }
  catch (err) { console.error('[worker] Sync failed:', err); }
});

cron.schedule('0 2 * * *', async () => {
  console.log('[worker] Running net worth snapshot', new Date().toISOString());
  try { await runSnapshot(); }
  catch (err) { console.error('[worker] Snapshot failed:', err); }
});
```

**Step 2: Create `worker/jobs/sync-all.ts`**
```typescript
// Import syncAllConnections from src/services/sync.ts
// The worker connects directly to Postgres via WORKER_DATABASE_URL
// Create a separate Drizzle client for the worker using WORKER_DATABASE_URL
// Note: The worker cannot use PGlite — it must use real Postgres
```

**Step 3: Create `worker/jobs/net-worth-snapshot.ts`**
```typescript
// Import saveNetWorthSnapshot from src/services/net-worth.ts
// SELECT DISTINCT user_id FROM user_settings
// Call saveNetWorthSnapshot for each userId
```

**Step 4: Create `Dockerfile.worker`**
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src/db ./src/db
COPY src/lib/crypto.ts ./src/lib/crypto.ts
COPY src/lib/simplefin.ts ./src/lib/simplefin.ts
COPY src/services ./src/services
COPY worker ./worker
RUN npx tsc --outDir dist --skipLibCheck --module commonjs --moduleResolution node

FROM node:22-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/worker/index.js"]
```

### Verification steps
- [ ] `docker compose up worker` — starts, logs `[worker] Starting.`
- [ ] Set `SYNC_CRON_SCHEDULE="* * * * *"` → wait 1 min → worker logs show sync attempt
- [ ] Connection failure during sync → logged as error, worker continues running

---
---

# PHASE 4 — Categories & Rules Engine

---

## Phase 4.1 — Category System

### Goal
Hierarchical categories with system defaults, seeded per user on first login. Full CRUD API.

### Implementation steps

**Step 1: Create `src/validations/category.ts`**
```typescript
import { z } from 'zod';
export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  icon: z.string().max(50).optional(),
  parentId: z.string().uuid().optional(),
  isIncome: z.boolean().default(false),
});
```

**Step 2: Create `src/services/seed-categories.ts`**

Function `seedCategoriesForUser(userId: string): Promise<void>`:
- Check if user already has categories → return early if count > 0
- INSERT all system categories in a single batch:

```
Income (isIncome=true): Salary, Freelance, Investment Returns
Housing: Rent/Mortgage, Utilities, Internet, Maintenance
Food: Groceries, Dining Out, Coffee
Transportation: Gas, Parking, Public Transit, Car Payment
Health: Medical, Pharmacy, Insurance
Entertainment: Streaming, Hobbies, Events
Shopping: Clothing, Electronics, Home Goods
Financial: Savings Transfer, Investment, Loan Payment
Transfers (excludeFromReports=true): Internal Transfer
```

All system categories have `isSystem=true`.

Call this function in `src/app/(protected)/layout.tsx` on every load (it's idempotent — early-return if already seeded).

**Step 3: Create category API routes**

`src/app/api/categories/route.ts`:
- **GET**: includeSystem (bool), tree (bool). If tree=true: build nested `{ ..., children: [] }` structure
- **POST**: validate with `CreateCategorySchema`, verify parentId belongs to userId

`src/app/api/categories/[id]/route.ts`:
- **PATCH**: update fields (cannot set isSystem via API)
- **DELETE**: check `X-Confirm-Delete`. If `isSystem=true` → 403. Optional `?reassignTo=uuid` to move transactions first. Then DELETE.

### Verification steps
- [ ] After first login, `seedCategoriesForUser` creates all expected categories
- [ ] `GET /api/categories?tree=true` returns nested structure
- [ ] `DELETE /api/categories/:systemCategoryId` returns 403
- [ ] `DELETE /api/categories/:id?reassignTo=:otherId` moves transactions then deletes

---

## Phase 4.2 — Rules Engine

### Goal
Auto-categorization rules stored, evaluated in priority order, applied on sync.

### Implementation steps

**Step 1: Create `src/validations/rule.ts`**
```typescript
import { z } from 'zod';
export const CreateRuleSchema = z.object({
  name: z.string().min(1).max(200),
  priority: z.number().int().default(0),
  conditionField: z.enum(['description', 'payee', 'amount', 'accountId']),
  conditionOperator: z.enum(['contains', 'startsWith', 'endsWith', 'equals', 'gt', 'lt', 'regex']),
  conditionValue: z.string().min(1),
  conditionCaseSensitive: z.boolean().default(false),
  setCategoryId: z.string().uuid().nullable().optional(),
  setPayee: z.string().max(200).optional(),
  setReviewed: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.conditionOperator === 'regex') {
    try { new RegExp(data.conditionValue); }
    catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid regex pattern', path: ['conditionValue'] });
    }
  }
});
```

**Step 2: Create `src/services/rules-engine.ts`**
```typescript
// matchesRule(tx, rule): boolean
//   'contains' → field.toLowerCase().includes(value.toLowerCase()) [or case-sensitive]
//   'startsWith', 'endsWith' → string methods
//   'equals' → strict equality
//   'gt', 'lt' → numeric (amount field only)
//   'regex' → new RegExp(value, caseSensitive ? '' : 'i').test(field) — try/catch returns false

// applyRulesToTransaction(tx, rules): Partial<{categoryId, payee, reviewed}>
//   Rules pre-sorted by priority ASC
//   First matching rule wins — return its patch
//   Return {} if no match

// applyRulesToAll(userId): Promise<{ matched: number }>
//   SELECT active rules ORDER BY priority ASC
//   SELECT transactions WHERE userId=? AND reviewed=false (don't overwrite reviewed)
//   Process in batches of 100
//   For each: compute patch; if non-empty: UPDATE
//   Return { matched: count }
```

**Step 3: Create rules API routes**

`src/app/api/rules/route.ts`: GET (list sorted by priority), POST (create — validate regex on server)
`src/app/api/rules/[id]/route.ts`: PATCH, DELETE (with X-Confirm-Delete)
`src/app/api/rules/apply-all/route.ts`: POST → `applyRulesToAll(userId)` → return `{ matched }`
`src/app/api/rules/test/route.ts`:
- POST body: `{ rule: CreateRuleInput, sampleTransactions?: [] }`
- If no samples: fetch last 30 days for userId
- Run `matchesRule` — NO DB writes
- Return `{ matches: Transaction[], totalTested: number }`

### Verification steps
- [ ] Unit: `matchesRule` contains, case-insensitive → matches correctly
- [ ] Unit: invalid regex → returns false, no throw
- [ ] Unit: lower priority number wins when two rules match
- [ ] `applyRulesToAll` does not overwrite transactions with `reviewed=true`
- [ ] After sync, new transactions have rules applied
- [ ] `POST /api/rules/test` returns matches without any DB row changes

---
---

# PHASE 5 — Net Worth Tracking

---

## Phase 5.1 — Net Worth Service & API

### Goal
Net worth calculated from linked accounts + manual assets. Daily snapshots stored automatically.

### Implementation steps

**Create `src/services/net-worth.ts`**:
```typescript
// calculateNetWorth(userId): Promise<NetWorthSummary>
//   linkedAssets    = SUM(balance) WHERE userId AND !isExcludedFromNetWorth AND balance>0
//   linkedLiabilities = SUM(ABS(balance)) WHERE userId AND !isExcludedFromNetWorth AND balance<0
//   manualAssets    = SUM(value) WHERE userId AND !isLiability AND !isExcludedFromNetWorth
//   manualLiabilities = SUM(value) WHERE userId AND isLiability AND !isExcludedFromNetWorth
//   totalAssets     = linkedAssets + manualAssets
//   totalLiabilities = linkedLiabilities + manualLiabilities
//   netWorth        = totalAssets - totalLiabilities
//   Return: { netWorth, totalAssets, totalLiabilities, asOf, breakdown }

// saveNetWorthSnapshot(userId): Promise<void>
//   calculateNetWorth(userId)
//   INSERT INTO net_worth_snapshots ON CONFLICT (userId, snapshotDate) DO UPDATE SET ...
//   snapshotDate = today in UTC
```

**Create manual asset API routes**:

`src/app/api/assets/route.ts`: GET (sorted by displayOrder), POST
`src/app/api/assets/[id]/route.ts`:
- PATCH: if `value` changes → INSERT value history row FIRST → then UPDATE asset
- DELETE: X-Confirm-Delete check → delete (cascades history)

`src/app/api/assets/[id]/history/route.ts`: GET paginated history

**Create net worth API routes**:

`src/app/api/net-worth/route.ts`: GET → `calculateNetWorth(userId)`
`src/app/api/net-worth/history/route.ts`: GET with `period` param → SELECT snapshots in date range

### Verification steps
- [ ] Checking ($5,000) + credit card (−$2,000) → `GET /api/net-worth` returns `netWorth: 3000`
- [ ] Manual liability $10,000 → included in `totalLiabilities`
- [ ] `isExcludedFromNetWorth=true` account → not in calculation
- [ ] `saveNetWorthSnapshot` twice same UTC day → 1 row only (upsert)
- [ ] PATCH asset with new value → history row exists with prior value

---
---

# PHASE 6 — Reports & FIRE Planning

---

## Phase 6.1 — Reports Service & API

### Goal
Five report endpoints with correct financial logic and Next.js cache.

### Implementation steps

**Create `src/services/reports.ts`**:

All functions take `(userId, startDate, endDate)`:

```typescript
// Business rules for ALL reports:
//   EXCLUDE: transactions.ignored = true
//   EXCLUDE: transactions whose category.excludeFromReports = true
//   Income: amount > 0 AND category.isIncome = true
//   Expenses: amount < 0 AND !category.isIncome AND !category.excludeFromReports

// getCashFlow(userId, startDate, endDate, groupBy: 'month'|'week'|'category')
// getSpendingByCategory(userId, startDate, endDate, parentOnly: boolean)
// getBurnRate(userId, months: number)  — rolling average of last N months expenses
// getSavingsRate(userId, startDate, endDate)
```

**Create API route handlers** with `unstable_cache`:
```typescript
import { unstable_cache } from 'next/cache';

// In each route handler:
const cachedFn = unstable_cache(
  () => getReportFn(userId, ...params),
  [`report-${type}-${userId}-${paramHash}`],
  { revalidate: 300, tags: [`reports-${userId}`] }
);
return Response.json(await cachedFn());
```

In `src/services/sync.ts`, after successful sync add:
```typescript
import { revalidateTag } from 'next/cache';
revalidateTag(`reports-${userId}`);
```

Routes: `cash-flow`, `spending-by-category`, `burn-rate`, `savings-rate`

### Verification steps
- [ ] Ignored transactions absent from all report totals
- [ ] Transfer category (excludeFromReports) absent from income and expense totals
- [ ] Two identical requests within 5 min → second served from cache (verify service function called only once via log)
- [ ] After sync → cache invalidated → fresh data returned

---

## Phase 6.2 — FIRE Planning Service & API

### Goal
FI number and year-by-year projection using live burn rate data.

### Implementation steps

**Create `src/validations/fire.ts`**:
```typescript
import { z } from 'zod';
export const CreateFireScenarioSchema = z.object({
  name: z.string().default('Primary Scenario'),
  currentAge: z.number().int().min(18).max(100).optional(),
  currentInvestableAssets: z.number().min(0).optional(),
  annualContributions: z.number().min(0).optional(),
  targetAnnualExpenses: z.number().positive().optional(),
  expectedReturnRate: z.number().min(0).max(0.3).default(0.07),
  inflationRate: z.number().min(0).max(0.2).default(0.03),
  safeWithdrawalRate: z.number().min(0.01).max(0.1).default(0.04),
});
```

**Create `src/services/fire.ts`**:
```typescript
// calculateProjection(scenario, burnRateAnnual): FireProjection
//   expenses = scenario.targetAnnualExpenses ?? burnRateAnnual
//   fiNumber = expenses / safeWithdrawalRate
//   Iterate n=0..100: FV(n) = PV*(1+r)^n + PMT*((1+r)^n - 1)/r
//     where PV=currentInvestableAssets, PMT=annualContributions, r=expectedReturnRate
//   Find first n where FV(n) >= fiNumber → yearsToFI (null if not found in 100 years)
//   projectionData: array for n=0..min(yearsToFI+5, 50):
//     { year: n, age: currentAge+n, portfolioValue: FV(n), fiNumber, percentOfFINumber }
//   projectedFIDate: today + yearsToFI years, or null
```

**Create API routes**:

`src/app/api/fire/scenarios/route.ts`: GET, POST
`src/app/api/fire/scenarios/[id]/route.ts`: PATCH, DELETE
`src/app/api/fire/scenarios/[id]/projection/route.ts`:
- GET → fetch scenario → `getBurnRate(userId, 6)` → `calculateProjection(scenario, burnRate)` → return

### Verification steps
- [ ] Unit: `$50,000 / 0.04 = $1,250,000` FI number
- [ ] Unit: FV formula matches Excel output for known inputs
- [ ] SWR 3.5% → larger FI number and more years than SWR 4%
- [ ] `projectedFIDate` null when unachievable
- [ ] `burnRate` in projection response comes from live reports data

---
---

# PHASE 7 — User Interface

---

## Phase 7.1 — Transaction Ledger UI

### Goal
Full transaction management page with filtering, inline editing, bulk actions, and detail drawer.

### Stack context
TanStack Table for data grid. TanStack Query for server state with optimistic updates. URL search params (Next.js `useSearchParams` + `useRouter`) for filter persistence. shadcn Sheet for detail drawer. shadcn Command for category picker.

### Implementation steps

**Step 1: Create `src/components/features/transactions/TransactionTable.tsx`** (Client Component)

TanStack Table with server-side data:
```
Columns: Checkbox | Date (sortable) | Payee/Description (sortable) | Account | Category badge | Amount | Status
Amount: right-aligned, font-mono, green if positive, red if negative
Pending rows: italic, text-[var(--color-text-muted)]
Category badge click → Popover with Command search of all categories → PATCH /api/transactions/:id (optimistic update)
Reviewed icon click → PATCH /api/transactions/:id { reviewed: !current } (optimistic)
Row click → opens TransactionDetailDrawer
Checkbox → row selection for bulk ops
```

**Step 2: Create `src/components/features/transactions/FilterSidebar.tsx`** (Client Component)
```
Collapsible left panel
Date presets: This Month, Last Month, Last 3 Months, Last 6 Months, This Year, Custom
Account multi-select (checkboxes from GET /api/accounts?includeHidden=true)
Category tree multi-select (from GET /api/categories?tree=true)
Amount range (min/max number inputs)
Status toggles: Pending, Reviewed, Unreviewed, Ignored
"Clear All Filters" button
All state → URL params (useSearchParams + useRouter)
```

**Step 3: Create `src/components/features/transactions/BulkActionsToolbar.tsx`**
```
Visible when rows selected
Shows "[N] selected"
Assign Category → Command popover → PATCH /api/transactions (bulk)
Mark Reviewed, Mark Ignored → bulk PATCH
On success: clear selection, invalidate query, show toast
```

**Step 4: Create `src/components/features/transactions/TransactionDetailDrawer.tsx`**
```
shadcn Sheet (side="right", ~420px)
Fields: date, description, payee, amount, account, memo, pending badge
Editable: Category (Command selector), Payee (input, save on blur), Notes (textarea, save on blur)
Toggles: Reviewed, Ignored
Close: X button or Escape
```

**Step 5: Update `src/app/(protected)/transactions/page.tsx`**
```
Layout: flex row → FilterSidebar (collapsible, 260px) + main
Main: search bar (debounced 300ms) + BulkActionsToolbar (conditional) + TransactionTable
Read initial params from URL (Server Component pass to Client)
Empty: no transactions → link to /settings/connections
Empty: no results → "Clear filters" CTA
```

### Verification steps
- [ ] Table renders with 100 seeded rows, no layout issues
- [ ] Filter → URL updates → correct rows shown → refresh → same filter state restored
- [ ] Click category badge → popover → select → badge updates immediately (optimistic)
- [ ] Select 3 rows → bulk assign category → all 3 updated
- [ ] Search debounced: typing 3 chars → only 1 API call after 300ms
- [ ] Detail drawer opens on row click, closes on Escape

---

## Phase 7.2 — Net Worth Dashboard UI

### Goal
Net worth page with animated hero, historical chart, and asset management.

### Implementation steps

**Create components**:

`src/components/features/net-worth/NetWorthHero.tsx`:
- Large net worth (font-mono text-5xl), animated count-up via `useEffect` + `requestAnimationFrame`
- Total Assets / Liabilities in text-secondary
- 30-day delta badge (green ↑ / red ↓)

`src/components/features/net-worth/NetWorthChart.tsx`:
- Tremor `AreaChart` — period tabs 1M 3M 6M 1Y 2Y All
- Three series: netWorth (accent), totalAssets (income), totalLiabilities (expense)
- If < 7 data points: info banner "Check back as history builds"

`src/components/features/net-worth/AssetBreakdown.tsx`:
- Two columns: Assets | Liabilities
- Linked accounts (from breakdown), manual assets with quick-edit value popover
- "Add Asset" button → AddAssetDialog

`src/components/features/net-worth/AddAssetDialog.tsx`:
- React Hook Form + CreateAssetSchema
- Fields: name, assetType (select), value, currency, institution, notes, isLiability toggle

**Update `src/app/(protected)/net-worth/page.tsx`** with all components.

### Verification steps
- [ ] Hero number matches API `netWorth` value
- [ ] Period tabs fetch correct history ranges
- [ ] Add $50k asset → hero increases by $50k
- [ ] Quick-edit value → history row created

---

## Phase 7.3 — Reports UI

### Goal
Tabbed reports page with cash flow, spending, and trends charts.

### Implementation steps

**Update `src/app/(protected)/reports/page.tsx`**:
- shadcn Tabs: "Cash Flow" | "Spending" | "Trends"
- Shared period selector (date range presets)

`src/components/features/reports/CashFlowTab.tsx`:
- Three metric cards: Income (income color), Expenses (expense color), Net
- Tremor `BarChart`: grouped income vs expenses per month
- Category breakdown table below

`src/components/features/reports/SpendingTab.tsx`:
- Nivo `Pie` donut chart, slices colored by `category.color`
- Click slice → drill into subcategories
- Side table with amounts and transaction counts

`src/components/features/reports/TrendsTab.tsx`:
- Nivo `Line` chart — Income, Expenses, Savings lines over time
- "3-month moving average" toggle

### Verification steps
- [ ] Cash flow totals match API response
- [ ] Donut slice click drills into subcategories
- [ ] Period change → loading state → new chart data
- [ ] Trends shows 3 distinct lines

---

## Phase 7.4 — FIRE Planning UI

### Goal
Interactive FIRE planning with live-updating projection chart.

### Implementation steps

`src/components/features/fire/FireInputs.tsx`:
- Scenario selector + "New Scenario" button
- React Hook Form fields: age, assets, contributions, target expenses
- "Use Actual Burn Rate" toggle → fetches `/api/reports/burn-rate` → fills expenses field
- Sliders: Return Rate (1–15%), SWR (2–6%), Inflation (0–6%)
- All changes 500ms debounced PATCH

`src/components/features/fire/FireProjection.tsx`:
- FI Number large display
- Projected FI Date + years countdown
- Progress bar (shadcn Progress)
- Tremor AreaChart: portfolio growth + horizontal FI Number line
- "Compare SWR" toggle → 3 lines (3.5%, 4%, 4.5%)
- Collapsible year-by-year table

**Update `src/app/(protected)/fire/page.tsx`**: Two-panel layout, scenario ID in URL params.

### Verification steps
- [ ] FI Number matches API calculation
- [ ] SWR slider change → debounced PATCH → chart updates
- [ ] "Use Actual Burn Rate" fills expenses field with live value
- [ ] "Compare SWR" shows 3 chart lines

---

## Phase 7.5 — Connections Settings UI

### Goal
Complete UI for managing SimpleFIN connections and account display.

### Implementation steps

`src/components/features/connections/ConnectionsList.tsx`:
- List connections with label, relative sync time, status badge (green/red/gray)
- "Sync Now" → POST sync → loading state → refetch
- "View Logs" → expandable drawer with last 20 sync logs
- "Remove" → shadcn AlertDialog warning → DELETE with X-Confirm-Delete header

`src/components/features/connections/AddConnectionDialog.tsx`:
- 3-step shadcn Dialog:
  - Step 1: Paste Setup Token + label input
  - Step 2: Confirm (warn that remove deletes all data)
  - Step 3: Success with account count
- POST /api/connections → trigger initial sync → show step 3

`src/components/features/connections/AccountListWidget.tsx`:
- Grouped by institution
- Hide/show toggle (PATCH isHidden)
- Net worth toggle (PATCH isExcludedFromNetWorth)
- @dnd-kit sortable reordering (PATCH displayOrder)

**Update `/settings/connections/page.tsx`**.

### Verification steps
- [ ] Add connection: 3-step flow → connection in list
- [ ] Remove: AlertDialog → connection gone → accounts gone
- [ ] Account hide toggle persists on refresh

---

## Phase 7.6 — Rules Settings UI

### Implementation steps

`src/components/features/rules/RulesTable.tsx`:
- Columns: Name, Condition (human-readable), Action, Active toggle, Priority
- Active toggle: PATCH inline
- Edit → RuleFormDialog; Delete → confirm
- @dnd-kit sortable reordering (PATCH priority values)

`src/components/features/rules/RuleFormDialog.tsx`:
- Name, Condition Field (select), Operator (adapts to field type), Value
- Case Sensitive checkbox
- Actions: Category picker (Command), Override Payee, Auto-Review toggle
- "Test Rule" button → POST /api/rules/test → show match count popover

"Apply All Rules" button → POST /api/rules/apply-all → toast with matched count.

---

## Phase 7.7 — Dashboard

### Goal
Home page showing all key metrics as independent widgets that fail gracefully.

### Implementation steps

**Widget pattern** (all Client Components):
- Own TanStack Query fetch
- Loading: `<WidgetSkeleton />` (bc-skeleton class)
- Error: red border card + retry button — never re-throw

**Create widgets**:
- `NetWorthWidget`: current net worth + 30-day delta + Tremor Sparkline
- `CashFlowWidget`: current month income/expenses/net
- `RecentTransactionsWidget`: last 10 transactions + "View All" link
- `SpendingChartWidget`: Tremor DonutChart current month
- `AccountsSummaryWidget`: balances grouped by type
- `FireProgressWidget`: % to FI + years remaining, or CTA
- `SyncStatusWidget`: last sync time, errors, retry button

`src/components/features/dashboard/WidgetSkeleton.tsx`: bc-skeleton animated placeholder.

**Update `src/app/(protected)/dashboard/page.tsx`**: CSS Grid layout with all 7 widgets.

### Verification steps
- [ ] All 7 widgets show skeleton then real data
- [ ] Breaking one API endpoint → that widget shows error, others load normally
- [ ] Max ~7 parallel API requests on load
- [ ] Playwright E2E: full dashboard renders with seeded data

---
---

# PHASE 8 — Settings, Export & Security

---

## Phase 8.1 — User Settings API & Appearance UI

### Goal
Currency, locale, theme, and accent color persist and apply globally.

### Implementation steps

`src/app/api/settings/route.ts`:
- GET: SELECT user_settings WHERE userId → if not found: INSERT defaults → return
- PATCH: validate partial settings → UPDATE → return

`src/components/providers/SettingsProvider.tsx` (Client Component):
- `useQuery(['settings'])` → on data: `applyAccent(settings.accentColor)` + apply compact mode class
- Export `useSettings()` hook

Wrap `(protected)/layout.tsx` in `<SettingsProvider>`.

`src/app/(protected)/settings/appearance/page.tsx`:
- Theme: "Dark" | "Darker (OLED)" radio → toggle `theme-darker` class + PATCH
- Accent swatches: 6 colors → `applyAccent()` + PATCH
- Compact mode Switch → PATCH
- Date format Select → PATCH
- Currency Select → PATCH

### Verification steps
- [ ] Change accent → CSS var changes immediately (no reload)
- [ ] Change to Darker → background changes to #000
- [ ] Reload → settings re-applied from DB
- [ ] Change currency → amounts formatted differently throughout

---

## Phase 8.2 — Data Export

### Goal
All user data exportable as streaming CSV, JSON, or ZIP.

### Implementation steps

`src/app/api/export/transactions/route.ts`:
- GET with `format`, `startDate`, `endDate`, `accountId` query params
- Stream response using `ReadableStream` + `csv-stringify` (for CSV) or NDJSON (for JSON)
- Do not `.findMany()` entire table into memory — use Drizzle cursor or chunk queries
- Headers: `Content-Disposition: attachment; filename="runway-transactions-{date}.csv"`
- CSV columns: date, postedDate, description, payee, amount, currency, account, category, notes, reviewed, pending
- Amounts as numbers (no currency symbol)

`src/app/api/export/accounts/route.ts`: Same streaming pattern for accounts

`src/app/api/export/net-worth-history/route.ts`: Same for snapshots

`src/app/api/export/all/route.ts`:
- Uses `archiver` to create ZIP stream
- Appends three CSV files
- Pipes archive to Response body
- `Content-Disposition: attachment; filename="runway-export-{date}.zip"`

`src/app/(protected)/settings/data/page.tsx`:
- Format selector, date range, three individual export buttons + "Export Everything (ZIP)"
- Each button: `window.open(url)` to trigger download

### Verification steps
- [ ] CSV opens correctly in spreadsheet with correct columns
- [ ] JSON is valid NDJSON (one object per line)
- [ ] ZIP contains all 3 CSV files
- [ ] 10,000-row export: memory stays reasonable (streaming)
- [ ] All export routes return 401 without session

---

## Phase 8.3 — Security Hardening

### Goal
Security headers, input limits, and rate limiting all in place.

### Implementation steps

**Security headers in `next.config.ts`**:
```typescript
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "connect-src 'self'",
        ].join('; '),
      },
    ],
  }];
},
```

**Rate limiting**: Next Auth has built-in rate limiting on its auth endpoints. For the runway API, add manual rate limiting on high-cost endpoints using a simple in-memory sliding window counter stored in a module-level Map. Apply to:
- `POST /api/connections`: 5 per hour per userId
- `POST /api/rules/apply-all`: 10 per hour per userId

Simple implementation in `src/utils/rate-limit.ts`:
```typescript
const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  if (entry.count >= limit) return false; // blocked
  entry.count++;
  return true; // allowed
}
```

Note: In-memory rate limiting resets on process restart, which is fine for a single-user self-hosted app. For a stricter implementation, use Postgres to store rate limit state.

**Input sanitization**: Apply `sanitizeText()` from `src/utils/sanitize.ts` to all free-text PATCH inputs (payee, notes, name, label) before DB writes.

**Delete confirmation**: Already enforced via `requireDeleteConfirmation()` in all DELETE handlers.

**Dependency audit**: `pnpm audit` — fix any high/critical vulnerabilities.

### Verification steps
- [ ] `curl -I http://localhost:3000` — all 5 security headers present
- [ ] `DELETE /api/connections/:id` without `X-Confirm-Delete` header → 400
- [ ] `pnpm audit` — zero high/critical vulnerabilities

---
---

# PHASE 9 — Testing & Final Validation

---

## Phase 9.1 — Unit Tests

### Goal
Business logic services have unit test coverage via Vitest.

### Tests to write (one `*.test.ts` per service):

`tests/unit/crypto.test.ts` — written in Phase 1.2

`tests/unit/simplefin.test.ts` — written in Phase 1.3

`tests/unit/rules-engine.test.ts`:
```
matchesRule: contains (case-insensitive) → correct match
matchesRule: regex operator → correct match
matchesRule: invalid regex → returns false, no throw
matchesRule: 'gt' on amount → correct comparison
applyRulesToTransaction: lower priority number wins
applyRulesToTransaction: no match → empty object
```

`tests/unit/fire.test.ts`:
```
FI number: $50k / 0.04 = $1.25M
FV calculation: matches known Excel output
SWR 3.5% → larger FI number than 4%
projectedFIDate null when unachievable (contributions=0, assets<fiNumber)
```

`tests/unit/format-currency.test.ts`:
```
formatCurrency(1234.56, 'USD', 'en-US') → '$1,234.56'
formatCurrency(1234.56, 'EUR', 'de-DE') → '1.234,56 €'
```

### Verification steps
- [ ] `pnpm test` — all unit tests pass
- [ ] No tests make real network or DB calls (all mocked)

---

## Phase 9.2 — Integration Tests

### Goal
API route handlers tested against a real Postgres test database.

### Stack context
Create a `runway_test` database. Set `DATABASE_URL` to test DB when running integration tests. Add `"test:integration": "DATABASE_URL=... playwright test --project=integration"` script.

### Tests to write in `tests/integration/`:

`connections.spec.ts`:
- POST invalid token → 400
- POST valid token → 201, encrypted URL in DB
- GET response has no accessUrl fields
- DELETE without header → 400; with header → 204

`transactions.spec.ts`:
- Seed 100 transactions; GET returns 50 with total=100
- Search param returns FTS matches
- PATCH single: only specified fields change
- Bulk PATCH: exactly N rows updated

`reports.spec.ts`:
- Seed known data; verify cash flow math (income/expense totals)

### Verification steps
- [ ] `pnpm test:integration` — all integration tests pass against test DB
- [ ] Tests clean up their seeded data in `afterEach`

---

## Phase 9.3 — End-to-End Tests

### Goal
Full user journeys tested with Playwright against the running application.

### Tests to write in `tests/e2e/`:

`auth.e2e.ts`:
- Sign up → verify email (intercept Resend) → sign in → see dashboard
- TOTP: enroll → sign out → sign in → TOTP prompt → verify code → dashboard
- ALLOW_REGISTRATION=false → sign up blocked

`connections.e2e.ts`:
- Add connection (3-step dialog) → connection appears with status badge
- Trigger sync → status updates

`transactions.e2e.ts`:
- Filter by date → URL updates → correct rows
- Select rows → bulk categorize → badges update

`net-worth.e2e.ts`:
- Add manual asset → net worth increases

`fire.e2e.ts`:
- Set FIRE inputs → FI date displayed → change SWR → date changes

`export.e2e.ts`:
- Click "Export Transactions" → file download triggered

### Verification steps
- [ ] `pnpm test:e2e` — all E2E tests pass
- [ ] No flaky tests (run twice to confirm)

---

## Phase 9.4 — Final Production Validation

### Checklist
- [ ] `pnpm lint` — clean
- [ ] `pnpm type-check` — clean
- [ ] `pnpm test` — all unit tests pass
- [ ] `pnpm test:e2e` — all integration + E2E tests pass
- [ ] `pnpm audit` — zero high/critical vulnerabilities
- [ ] `docker compose up --build` from scratch — all three services (postgres, app, worker) healthy
- [ ] `curl http://localhost:3000/api/health` → `{ "status": "ok" }`
- [ ] Visit `http://localhost:3000` signed out → redirects to `/auth/sign-in`
- [ ] Register user → set `ALLOW_REGISTRATION=false` → second registration attempt blocked
- [ ] Add SimpleFIN connection → trigger sync → transactions visible → export ZIP downloads
- [ ] Set FIRE scenario → projection chart shows FI date
- [ ] Change accent color → persists across sign out / sign in

---

## Quick Reference: Key Differences from Clerk-Based Spec

| Concern | Previous (Clerk) | This spec (Next Auth) |
|---|---|---|
| Auth package | `@clerk/nextjs` | `Next-auth` |
| Session in server | `auth()` from `@clerk/nextjs/server` | `auth.api.getSession({ headers })` |
| Session in middleware | Clerk `clerkMiddleware()` | `NextFetch('/api/auth/get-session', ...)` |
| Client auth | `useAuth()`, `<SignOutButton />` | `authClient.signOut()`, `authClient.useSession()` |
| TOTP | Clerk built-in MFA dashboard | `twoFactor` plugin + `authClient.twoFactor.*` |
| User ID type | Clerk ID `user_2abc...` (text) | Next Auth UUID (text) — **still text** |
| Email | Clerk handles | Resend via Next Auth `sendVerificationEmail` |
| Auth routes | `/sign-in`, `/sign-up` via Clerk | `/auth/sign-in`, `/auth/sign-up` via Next Auth |
| Auth API route | Clerk handles internally | `src/app/api/auth/[...Nextauth]/route.ts` |
| Package manager | npm | **pnpm** |
| DB schema location | `src/models/Schema.ts` | **`src/db/schema.ts`** |
| Env variable prefix | `NEXT_PUBLIC_CLERK_*` | `Next_AUTH_*` |

---

*runway Development Specification v4.0*
*Base template: zexahq/Next-auth-starter*
*Stack: Next.js 16 · Next Auth · Drizzle ORM · PostgreSQL · shadcn/ui (Radix UI) · Tremor · Nivo · TanStack Query · Resend*
*Phases: 9 · Sub-phases: 24*
