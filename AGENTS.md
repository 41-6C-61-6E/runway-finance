# Runway Finance — Agent Guidelines

## Agent Instructions
# Dev Deployment Information
- In the current dev enviornment the app loads in a remote docker context at 10.1.1.10:3001, you can interact with it there
- Every time a dev phase is complete or when a feature or function is added, update the README.md file and AGENTS.md file if the change includes things relevant to those files (i.e new features, functions, or processes)


# Progress Narration
- Before EVERY tool invocation, emit a short plain-English line describing what you are about to do and why.
  Example: "Reading package.json to check the current dependencies..."
- After receiving a tool result, emit a one-line summary of what you found before proceeding.
  Example: "Found 3 outdated packages. Now checking for breaking changes..."
- If a step will take time (file search, multi-file edit), say so upfront.
  Example: "Scanning all TypeScript files in src/ — this may take a moment."
- Never silently chain tool calls. Always narrate between them.
- During multi-step tool use, emit a short status line before each tool invocation (e.g. "Searching for X…" or "Reading file Y…").
- Do not chain multiple tool_use blocks without interleaved text.

# TOOL EXECUTION PROTOCOL
- NEVER output raw JSON function calls or "type: function" strings directly to the user.
- All function calls must be handled via the system tool-use interface, not as text output.
- Only provide a natural language summary after a tool has successfully executed.
- If a tool call is required, identify the parameters internally and trigger the action without displaying the background logic.
- If a file path or URI is invalid or inaccessible, inform the user in plain text. Do not output raw error JSON.
- Use Markdown code blocks only when providing specific code examples or when explicitly asked to show JSON structure.

## Project Overview

Runway Finance is a self-hosted personal finance application built with Next.js 16, TypeScript, and PostgreSQL. It connects to financial institutions via the SimpleFIN protocol and provides transaction management, categorization, net worth tracking, and FIRE planning.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with Turbopack
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui (Radix UI)
- **Auth**: Next Auth v5 (single-user email/password)
- **Database**: PostgreSQL 16 + Drizzle ORM
- **Package Manager**: pnpm
- **Testing**: Vitest (unit) + Playwright (E2E)
- **Deployment**: Docker Compose (PostgreSQL + Next.js app)

## Project Structure

```
runway-finance/
├── app/                    # Next.js App Router
│   ├── api/                # API route handlers
│   │   ├── connections/    # SimpleFIN connection management
│   │   ├── accounts/       # Account CRUD
│   │   └── transactions/   # Transaction CRUD + bulk operations
│   └── signin/             # Sign-in page
├── components/             # React components
├── lib/                    # Core libraries
│   ├── auth.ts             # Next Auth configuration
│   ├── crypto.ts           # AES-256-GCM encryption
│   ├── db.ts               # Database connection (getDb() function)
│   ├── simplefin.ts        # SimpleFIN HTTP client
│   └── users.ts            # User management
├── drizzle/                # Database migrations
├── tests/                  # Unit and integration tests
├── compose.yml             # Docker Compose configuration
├── Dockerfile              # Multi-stage production build
└── runway-spec-v4.md       # Full development specification
```

## Key Implementation Patterns

### Database Access

The database is accessed via `getDb()` function, NOT a direct `db` export:

```typescript
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// Correct
const result = await getDb()
  .select()
  .from(accounts)
  .where(eq(accounts.userId, userId));

// WRONG — db is not exported
import { db } from '@/lib/db'; // ❌
```

### Authentication

Use `auth()` directly in API routes (Next Auth v5 pattern):

```typescript
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth(); // No headers needed in API routes
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  // ... handler logic
}
```

**Important**: Do NOT use `auth.api.getSession()` — this is Next Auth v4 pattern. In v5, `auth()` automatically gets the session from the request context.

### SimpleFIN Integration

Resources:
- SimpleFIN Dev Guide: https://beta-bridge.simplefin.org/info/developers
- SimpleFIN Protocol: https://www.simplefin.org/protocol.html

The SimpleFIN claim flow requires:
1. `Content-Length: 0` header on POST request
2. Response is plain text (access URL), NOT JSON

```typescript
// Correct claim pattern
const res = await fetch(claimUrl, {
  method: 'POST',
  headers: { 'Content-Length': '0' } // Required!
});
const accessUrl = await res.text(); // Plain text, not JSON
```

### API Response Shapes

- **Single resource**: `{ "id": "...", ... }`
- **Collection**: `{ "data": [...], "total": 100, "limit": 50, "offset": 0 }`
- **Result**: `{ "matched": 42 }` or `{ "updated": 12 }`
- **Empty success**: 204 No Content
- **Error**: `{ "error": "error_code", "message": "Human description" }`

### Standard Status Codes

- `200` — Success
- `201` — Created
- `204` — No Content (DELETE success)
- `400` — Validation error
- `401` — Unauthenticated
- `403` — Forbidden
- `404` — Not found
- `409` — Conflict
- `502` — Upstream error (e.g., SimpleFIN failure)

### Request Validation

All POST/PATCH bodies validated with Zod. Invalid body returns:

```json
{
  "error": "validation_error",
  "message": "Invalid request body",
  "details": { "field": "error" }
}
```

### Delete Confirmation

All DELETE handlers require `X-Confirm-Delete: true` header:

```typescript
export async function DELETE(request: Request) {
  if (request.headers.get('X-Confirm-Delete') !== 'true') {
    return NextResponse.json(
      { error: 'validation_error', message: 'Missing X-Confirm--delete header' },
      { status: 400 }
    );
  }
  // ... delete logic
}
```

## Database Schema

Key tables (in `lib/db/schema.ts`):

- `user`, `session`, `account`, `verification` — Next Auth tables
- `user_settings` — User preferences (currency, locale, theme, etc.)
- `simplefin_connections` — SimpleFIN bridge connections (encrypted access URLs)
- `accounts` — Financial accounts linked to connections
- `transactions` — Transaction records
- `categories` — Transaction categories (system + user-created)
- `sync_logs` — Sync operation logs
- `category_rules` — Auto-categorization rules
- `manual_assets` — Manual asset tracking
- `net_worth_snapshots` — Net worth history
- `fire_scenarios` — FIRE planning scenarios

## Running the App

```bash
# Start PostgreSQL
docker compose up postgres -d

# Run migrations
pnpm db:migrate

# Start dev server
pnpm dev
```

The app runs on `http://localhost:3001` (configured in `compose.yml`).

## Docker

```bash
# Build and run all services
docker compose up --build

# Build only the app
docker compose build next16-app

# Stop all services
docker compose down
```

## Testing

```bash
pnpm test              # Run Vitest unit tests
pnpm test:docker       # Run tests in Docker environment
```

## Development Phases

The project follows phased development documented in `runway-spec-v4.md`:

- **Phase 0** — Repository setup, dependencies, authentication ✅
- **Phase 1** — Database schema, encryption, SimpleFIN client ✅
- **Phase 2** — Connection, account, transaction APIs ✅
- **Phase 3** — Sync service and background worker (in progress)
- **Phase 4+** — Categories, rules, net worth, reports, UI (planned)

## Common Pitfalls

1. **Never import `db` directly** — Use `getDb()` function
2. **Never use `auth.api.getSession()`** — Use `auth()` in API routes
3. **SimpleFIN claim needs `Content-Length: 0`** — Response is plain text
4. **Database migrations** — Apply via `pnpm db:migrate` or SQL files in `drizzle/`
5. **Docker volumes** — PostgreSQL data persists in `pgdata` volume
6. **Single connection per user** — Phase 1 design limits to one SimpleFIN connection

## Encryption

Sensitive data (SimpleFIN access URLs) encrypted with AES-256-GCM:

```typescript
import { encrypt, decrypt } from '@/lib/crypto';

// Encrypt
const payload = encrypt(plaintext);
// Returns: { ciphertext: string, iv: string, tag: string }

// Decrypt
const plaintext = decrypt(payload);
```

The encryption key is loaded from `ENCRYPTION_KEY` environment variable at module load. Process exits if invalid.

## Design System

- Dark theme only (no light mode)
- CSS variable tokens for colors, spacing, radii
- Monetary amounts use `font-mono`, color conveys sign (green = positive, red = negative)
- Accent colors via CSS custom properties

## Security

- All sensitive data encrypted at rest
- Delete operations require confirmation header
- Input sanitization on all free-text fields
- Single-user authentication with registration lock
- Rate limiting on high-cost endpoints
