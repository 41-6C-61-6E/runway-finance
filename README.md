# Runway Finance

Self-hosted personal finance app. Docker-native. Dark by default.

## Overview

Runway Finance is a self-hosted personal finance application that connects to your financial institutions via the SimpleFIN protocol. It provides transaction management, categorization, net worth tracking, cash flow reports, spending analysis, and FIRE (Financial Independence Retire Early) planning.

## Features

- **Authentication** — Single-user email/password login via Next Auth v5
- **SimpleFIN Integration** — Connect to financial institutions via SimpleFIN Bridge protocol
- **Transaction Sync** — Automated sync of accounts and transactions
- **Transaction Ledger** — Filterable, searchable, bulk-editable transaction table
- **Categorization** — Hierarchical category system with color and icon support
- **Rules Engine** — Auto-categorization rules applied on sync and on-demand
- **Net Worth Tracker** — Live net worth from linked accounts + manual assets
- **Cash Flow Reports** — Income vs. expenses by period and category
- **Spending Reports** — Donut chart drill-down by category
- **FIRE Planning** — Financial independence number and projection calculator
- **Data Export** — CSV / JSON / ZIP export of all user data
- **Dashboard** — Single-page overview of all key financial widgets
- **Settings** — Theme, currency, locale, connections, rules, categories, appearance

## Technology Stack

| Tool | Purpose |
|---|---|
| Next.js 16 (App Router) | Framework + API route handlers |
| TypeScript | Type safety throughout (strict mode) |
| Tailwind CSS | Styling |
| Next Auth v5 | Authentication, session management |
| Drizzle ORM + drizzle-kit | Database schema, migrations, typed queries |
| PostgreSQL | Primary database |
| shadcn/ui (Radix UI) | Component library |
| React Hook Form | Form handling |
| Zod | Validation schemas |
| pnpm | Package manager |

## Prerequisites

- **Node.js ≥ 20**
- **PNPM ≥ 9**
- **Docker & Docker Compose** — for PostgreSQL and production builds

## Installation

```bash
pnpm install
```

## Environment Setup

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

Required environment variables:

- `NEXTAUTH_SECRET` — 64-character hex string (generate with `openssl rand -hex 32`)
- `NEXTAUTH_URL` — Your app URL (e.g., `http://localhost:3001`)
- `DATABASE_URL` — PostgreSQL connection string
- `ENCRYPTION_KEY` — 64-character hex string for AES-256-GCM (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `ALLOW_REGISTRATION` — Set to `false` after first user registers

## Development

### Start PostgreSQL

```bash
docker compose up postgres -d
```

### Run Database Migrations

```bash
pnpm db:migrate
```

### Start Development Server

```bash
pnpm dev
```

The app starts at **[http://localhost:3001](http://localhost:3001)**.

## Docker Deployment

### Build and Run

```bash
docker compose up --build
```

This starts both PostgreSQL and the Next.js app on port 3001.

### Production Build

```bash
docker build -t runway-finance .
docker run -p 3001:3000 runway-finance
```

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
│   ├── db.ts               # Database connection
│   ├── simplefin.ts        # SimpleFIN HTTP client
│   └── users.ts            # User management
├── drizzle/                # Database migrations
├── tests/                  # Unit and integration tests
├── compose.yml             # Docker Compose configuration
├── Dockerfile              # Multi-stage production build
└── runway-spec-v4.md       # Development specification
```

## API Endpoints

### Connections

- `POST /api/connections` — Create a SimpleFIN connection (requires `setupToken`)
- `GET /api/connections` — List all connections
- `DELETE /api/connections/:id` — Delete a connection (requires `X-Confirm-Delete: true` header)
- `POST /api/connections/:id/sync` — Trigger manual sync
- `GET /api/connections/:id/sync-logs` — View sync history

### Accounts

- `GET /api/accounts` — List accounts (with `includeHidden` and `type` query params)
- `GET /api/accounts/:id` — Get account details
- `PATCH /api/accounts/:id` — Update account (name, isHidden, etc.)

### Transactions

- `GET /api/transactions` — List transactions with filtering, pagination, sorting
- `GET /api/transactions/:id` — Get transaction details
- `PATCH /api/transactions/:id` — Update transaction
- `PATCH /api/transactions` — Bulk patch multiple transactions

All API routes require authentication via Next Auth session.

## Database

The app uses PostgreSQL with Drizzle ORM. Tables include:

- `user`, `session`, `account`, `verification` — Next Auth tables
- `user_settings` — User preferences
- `simplefin_connections` — SimpleFIN bridge connections (encrypted access URLs)
- `accounts` — Financial accounts
- `transactions` — Transaction records
- `categories` — Transaction categories
- `sync_logs` — Sync operation logs
- `category_rules` — Auto-categorization rules
- `manual_assets` — Manual asset tracking
- `net_worth_snapshots` — Net worth history
- `fire_scenarios` — FIRE planning scenarios

## Testing

```bash
pnpm test              # Run Vitest unit tests
pnpm test:docker       # Run tests in Docker environment
```

## Security

- All sensitive data (SimpleFIN access URLs) encrypted with AES-256-GCM
- Delete operations require `X-Confirm-Delete: true` header
- Single-user authentication with registration lock after first user
- Input sanitization on all free-text fields

## Development Phases

The project is organized into development phases documented in `runway-spec-v4.md`:

- **Phase 0** — Repository setup, dependencies, authentication
- **Phase 1** — Database schema, encryption service, SimpleFIN client
- **Phase 2** — Connection, account, and transaction API routes
- **Phase 3** — Sync service and background worker
- **Phase 4** — Categories and rules engine
- **Phase 5** — Net worth tracking
- **Phase 6** — Reports and FIRE planning
- **Phase 7** — User interface
- **Phase 8** — Settings, export, security hardening
- **Phase 9** — Testing and final validation

## License

See [LICENCE](LICENCE) for details.

---

## 🤝 Contributing

PRs, issues, and suggestions are welcome!
Feel free to fork and adapt this starter for your own needs.

---

## 📄 License

MIT License.
