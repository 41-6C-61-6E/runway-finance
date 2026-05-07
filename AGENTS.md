# Runway Finance — Agent Guidelines

## Agent Instructions
# Dev Deployment Information
- In the current dev enviornment the app loads in a remote docker context at 10.1.1.10:3001, you can interact with it there
- Every time a dev phase is complete or when a feature or function is added, update the README.md file and AGENTS.md file if the change includes things relevant to those files (i.e new features, functions, or processes)
- Check the spec file runway-spec-v4.md if you need additional technical information about the project. 
- After each significant change, build, run and check container logs for clean startup, and automatically debug if needed

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


## SimpleFIN Integration

Resources:
- SimpleFIN Dev Guide: https://beta-bridge.simplefin.org/info/developers
- SimpleFIN Protocol: https://www.simplefin.org/protocol.html

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

The app runs at `http://10.1.1.10:3001` (configured in `compose.yml`).

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


## Design System

- Dark theme and light theme as set up in the initial template
- CSS variable tokens for colors, spacing, radii
- Monetary amounts use `font-mono`, color conveys sign (green = positive, red = negative)
- Accent colors via CSS custom properties

## Security

- All sensitive data encrypted at rest
- Delete operations require confirmation header
- Input sanitization on all free-text fields
- Single-user authentication with registration lock
- Rate limiting on high-cost endpoints
