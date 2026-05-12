# Runway Finance

Self-hosted personal finance app for tracking net worth, managing transactions, analyzing cash flow, and planning for financial independence (FIRE). Docker-native, dark by default, single-user.

## Features

- **Authentication** — Single-user credentials login via NextAuth v5 (optional OAuth support)
- **SimpleFIN Integration** — Connect to banks and brokerages via SimpleFIN Bridge protocol with automated transaction sync
- **Transaction Management** — Filterable, searchable ledger with bulk actions, detail drawer editing, and auto-categorization rules
- **Net Worth Dashboard** — Live net worth tracking, debt-to-asset ratio, asset allocation charts, account values over time, and financial goals progress
- **Cash Flow Reports** — Income vs. expense analysis, Sankey diagrams, category spending breakdowns, budget vs. actual, and savings rate tracking
- **Budget Management** — Category-based budgets with period selection, budget vs. actual charts, and cash flow forecasting
- **FIRE Planning** — Financial independence number calculator, safe withdrawal rate analysis, multi-scenario comparison, and year-by-year retirement projections
- **Real Estate Portfolio** — Property tracking with equity over time charts and portfolio allocation
- **Settings** — User preferences, category management, rules configuration, theme/accent customization, privacy mode, and manual account setup
- **Data Export** — CSV / JSON / ZIP export of all user data
- **PWA Support** — Progressive web app with service worker and install capability

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui (Radix UI), Tremor |
| Authentication | NextAuth v5, bcryptjs |
| Database | PostgreSQL 16, Drizzle ORM, drizzle-kit |
| State & Data | TanStack Query, TanStack Table |
| Forms & Validation | React Hook Form, Zod 4 |
| Charts | Nivo (bar, line, pie, Sankey), Recharts 3 |
| Drag & Drop | dnd-kit |
| Background Jobs | node-cron |
| Encryption | AES-256-GCM (Native Node.js crypto) |
| Testing | Vitest, Testing Library, Playwright |
| Package Manager | pnpm

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose (for PostgreSQL and production builds)

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy and configure environment variables
cp .env.example .env.local

# Start PostgreSQL
docker compose up postgres -d

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

The app is available at [http://localhost:3000](http://localhost:3000) in development.

## Environment Variables

Copy `.env.example` to `.env.local` and configure the following:

| Variable | Required | Description |
|---|---|---|
| `NEXTAUTH_SECRET` | Yes | 64-character hex string. Generate with `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Yes | Your app URL (e.g. `http://localhost:3000`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Yes | 64-character hex string for AES-256-GCM encryption. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ALLOW_REGISTRATION` | Yes | Set to `false` after the first user registers |
| `REGISTRATION_PIN` | No | Require a PIN for new account creation (leave empty to disable) |
| `SYNC_CRON_SCHEDULE` | No | Cron expression for SimpleFIN sync (default: `0 */6 * * *`, every 6 hours). Set to empty string to disable. |
| `DEBUG` | No | Set to `true` for debug logging |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret (optional) |

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start development server on port 3000 |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm ci` | Run lint, typecheck, and build |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:integration` | Run integration tests (requires PostgreSQL) |
| `pnpm test:docker` | Run tests in Docker environment |
| `pnpm db:generate` | Generate migration SQL from schema |
| `pnpm db:migrate` | Apply pending database migrations |
| `pnpm db:studio` | Open Drizzle Studio (web-based DB explorer) |
| `pnpm db:indexes` | Create database indexes |

## Docker Deployment

Build and run the full stack (PostgreSQL + Next.js):

```bash
docker compose up --build
```

The app will be available on port 3001. The Docker entrypoint automatically waits for PostgreSQL, runs migrations, and starts the server.

### Manual Docker Build

```bash
docker build -t runway-finance .
docker run -p 3001:3000 runway-finance
```

## Project Structure

```
runway-finance/
├── app/                          # Next.js App Router
│   ├── api/                      # API route handlers (all require auth)
│   │   ├── auth/[...nextauth]/   # NextAuth handlers
│   │   ├── register/            # User registration
│   │   ├── connections/         # SimpleFIN connections + sync
│   │   ├── accounts/            # Account CRUD
│   │   ├── transactions/        # Transaction CRUD + bulk ops
│   │   ├── categories/          # Category management
│   │   ├── category-rules/      # Auto-categorization rules
│   │   ├── net-worth/           # Net worth snapshots
│   │   ├── cash-flow/           # Cash flow summaries
│   │   ├── fire/               # FIRE scenarios
│   │   ├── budgets/             # Budget CRUD
│   │   ├── financial-goals/     # Savings goals
│   │   ├── real-estate/         # Real estate properties
│   │   ├── manual-accounts/     # Manual account types
│   │   ├── llm/                 # LLM/AI integration
│   │   └── user-settings/       # User preferences
│   ├── page.tsx                  # Home: Net Worth dashboard
│   ├── signin/page.tsx           # Login / registration
│   ├── transactions/page.tsx     # Transaction ledger
│   ├── cash-flow/page.tsx        # Cash flow reports
│   ├── fire/page.tsx             # FIRE planning
│   ├── budgets/page.tsx          # Budget management
│   ├── real-estate/page.tsx      # Real estate portfolio
│   └── settings/page.tsx         # Settings
├── components/                   # React components
│   ├── ui/                       # shadcn/ui base primitives
│   ├── features/                 # Feature-scoped components
│   ├── net-worth/               # Net worth dashboard widgets
│   ├── cash-flow/               # Cash flow charts and tables
│   ├── fire/                     # FIRE calculator and scenarios
│   ├── budgets/                  # Budget management components
│   ├── real-estate/              # Real estate portfolio components
│   ├── charts/                   # Shared chart utilities
│   ├── sidebar.tsx               # App navigation sidebar
│   └── theme-provider.tsx        # Dark/light theme provider
├── lib/                          # Core libraries
│   ├── auth.ts                   # NextAuth configuration
│   ├── crypto.ts                 # AES-256-GCM encryption
│   ├── db.ts                     # Database connection
│   ├── db/                       # Database layer
│   │   ├── schema.ts             # Drizzle schema (20+ tables)
│   │   ├── seed-categories.ts    # Default category seeding
│   │   ├── seed-default-rules.ts # Default rule seeding
│   │   └── seed-indexes.ts       # Database index creation
│   ├── simplefin.ts              # SimpleFIN HTTP client
│   ├── services/                 # Business logic
│   │   ├── sync.ts               # SimpleFIN sync service
│   │   ├── rules-engine.ts       # Auto-categorization
│   │   ├── account-history.ts    # Balance history
│   │   ├── manual-accounts.ts    # Manual account management
│   │   └── retirement.ts         # FIRE/retirement calculations
│   ├── hooks/                    # Custom React hooks
│   ├── utils/                    # Shared utilities
│   └── validations/              # Zod validation schemas
├── drizzle/                      # Database migrations
├── tests/                        # Unit and integration tests
├── scripts/                      # Build and utility scripts
├── styles/                       # Global CSS
├── public/                       # Static assets and PWA files
├── compose.yml                   # Docker Compose config
├── Dockerfile                    # Multi-stage Docker build
├── drizzle.config.ts             # Drizzle ORM config
└── vitest.config.ts              # Vitest test config
```

## API Endpoints

All API routes require authentication via NextAuth session.

### Connections

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/connections` | Create a SimpleFIN connection (requires `setupToken`) |
| `GET` | `/api/connections` | List all connections |
| `DELETE` | `/api/connections/:id` | Delete a connection (requires `X-Confirm-Delete: true` header) |
| `POST` | `/api/connections/:id/sync` | Trigger manual sync |
| `GET` | `/api/connections/:id/sync-logs` | View sync history |

### Accounts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/accounts` | List accounts (supports `includeHidden` and `type` query params) |
| `GET` | `/api/accounts/:id` | Get account details |
| `PATCH` | `/api/accounts/:id` | Update account |

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/transactions` | List transactions with filtering, pagination, sorting |
| `GET` | `/api/transactions/:id` | Get transaction details |
| `PATCH` | `/api/transactions/:id` | Update single transaction |
| `PATCH` | `/api/transactions` | Bulk update transactions |

Additional endpoints are available for categories, category rules, net worth, cash flow, FIRE scenarios, budgets, financial goals, real estate, manual accounts, LLM integration, and user settings.

## Database

The app uses PostgreSQL with Drizzle ORM. Key tables include:

| Table | Purpose |
|---|---|
| `user`, `session`, `account`, `verification` | NextAuth core tables |
| `user_settings` | User preferences (currency, locale, theme, privacy mode, chart settings) |
| `simplefin_connections` | SimpleFIN Bridge connections (encrypted access URLs) |
| `accounts` | Financial accounts (checking, savings, investment, loan, etc.) |
| `transactions` | Transaction records with categorization |
| `categories` | Transaction categories with color and icon support |
| `category_rules` | Auto-categorization rules |
| `sync_logs` | Sync operation history |
| `net_worth_snapshots` | Daily net worth history |
| `account_snapshots` | Per-account balance history over time |
| `monthly_cash_flow` | Pre-aggregated monthly income/expense summaries |
| `category_spending_summary` | Monthly spending by category |
| `budgets` | Category-based budgets |
| `financial_goals` | Savings goals with targets and progress |
| `fire_scenarios` | FIRE planning scenario configurations |
| `retirement_projections` | Year-by-year retirement projections |

## Security

- Sensitive data (SimpleFIN access URLs) encrypted with AES-256-GCM at rest
- Delete operations require `X-Confirm-Delete: true` header
- Single-user authentication with registration lock after first user
- Input sanitization on all free-text fields

## Contributing

Issues, pull requests, and suggestions are welcome. Feel free to fork and adapt this project for your own needs.

## License

MIT License. See [LICENCE](LICENCE) for details.
