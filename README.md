<div align="center">

# Runway Finance

**Self-hosted personal finance dashboard for tracking net worth, managing transactions, analyzing cash flow, and planning for financial independence.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://www.docker.com/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-8CBEFF?logo=pnpm)](https://pnpm.io/)

</div>

> ⚠️ **Development Beta** — This project is actively under development. Features may change and bugs may exist. Not yet recommended for production use with irreplaceable data.

---

## 📸 Screenshots

*Replace placeholder images with actual screenshots by updating the URLs below.*

| Transactions | Net Worth | Cash Flow |
|:---:|:---:|:---:|
| ![Transactions](https://via.placeholder.com/600x400/1a1a2e/ffffff?text=Transactions+View) | ![Net Worth](https://via.placeholder.com/600x400/1a1a2e/ffffff?text=Net+Worth+Dashboard) | ![Cash Flow](https://via.placeholder.com/600x400/1a1a2e/ffffff?text=Cash+Flow+Reports) |

---

## ✨ Features

### 💰 Financial Tracking
- **Accounts** — Connect bank/brokerage accounts via SimpleFIN or add them manually; track balances and values over time
- **Transactions** — Full ledger with filtering, searching, bulk editing, detail drawers, and auto-categorization rules
- **Net Worth** — Real-time net worth dashboard with debt-to-asset ratio, asset allocation charts, and goal progress tracking
- **Cash Flow** — Income vs. expense analysis, Sankey diagrams, category breakdowns, budget vs. actual, and savings rate

### 📊 Budgeting & Planning
- **Budgets** — Category-based budgets with period selection, visual budget vs. actual charts, and cash flow forecasting
- **FIRE Planning** — Financial independence calculator, safe withdrawal rate analysis, multi-scenario comparison, and year-by-year retirement projections
- **Goals** — Track savings goals with progress percentages and reserve calculations
- **Real Estate** — Property portfolio tracking with equity-over-time charts and allocation views

### 🔒 Security & Privacy
- **Authentication** — Single-user credentials via NextAuth v5 with bcrypt password hashing (optional Google OAuth)
- **Encryption** — AES-256-GCM encryption for sensitive data (API keys, credentials) using native Node.js crypto
- **Privacy Mode** — Blur sensitive financial data with a single toggle
- **Registration Control** — Pin-protected registration and one-time enable/disable

### 🛠 Developer Experience
- **Data Export** — CSV, JSON, and ZIP export of all user data
- **PWA Support** — Installable progressive web app with service worker caching
- **Dark by Default** — Sleek dark theme with accent color customization
- **Background Sync** — Configurable cron-based automated transaction sync via SimpleFIN
- **Docker-Native** — Full stack (PostgreSQL + Next.js) in a single `docker compose` command

---

## 🧱 Tech Stack

| Category | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9 |
| **Styling** | Tailwind CSS 4, shadcn/ui (Radix UI primitives), Tremor |
| **Authentication** | NextAuth v5 (beta), bcryptjs |
| **Database** | PostgreSQL 16, Drizzle ORM, drizzle-kit |
| **State & Data** | TanStack Query, TanStack Table |
| **Forms & Validation** | React Hook Form, Zod 4 |
| **Charts & Visualization** | Nivo, Recharts 3 |
| **Drag & Drop** | dnd-kit |
| **Background Jobs** | node-cron |
| **Encryption** | AES-256-GCM (Node.js `crypto` module) |
| **Testing** | Vitest, Testing Library, Playwright |
| **Package Manager** | pnpm |
| **Deployment** | Docker, Docker Compose |

---

## 📁 Project Structure

```
runway-finance/
├── app/                          # Next.js App Router pages & layouts
│   ├── accounts/                 # Account management pages
│   ├── ai-suggestions/           # AI-powered financial insights
│   ├── api/                      # API route handlers (all require auth)
│   │   ├── auth/[...nextauth]/   # NextAuth handlers
│   │   ├── connections/          # SimpleFIN connections + sync
│   │   ├── accounts/             # Account CRUD
│   │   ├── transactions/         # Transaction CRUD + bulk ops
│   │   ├── categories/           # Category management
│   │   ├── category-rules/       # Auto-categorization rules
│   │   ├── net-worth/            # Net worth snapshots
│   │   ├── cash-flow/            # Cash flow summaries
│   │   ├── fire/                 # FIRE scenarios
│   │   ├── budgets/              # Budget CRUD
│   │   ├── financial-goals/      # Savings goals
│   │   ├── real-estate/          # Real estate properties
│   │   ├── manual-accounts/      # Manual account types
│   │   ├── llm/                  # LLM/AI integration
│   │   └── user-settings/        # User preferences
│   ├── budgets/                  # Budget management pages
│   ├── cash-flow/                # Cash flow reports
│   ├── financial-logic/          # Financial calculation pages
│   ├── fire/                     # FIRE planning pages
│   ├── goals/                    # Goals tracking pages
│   ├── net-worth/                # Net worth dashboard
│   ├── real-estate/              # Real estate portfolio pages
│   ├── settings/                 # User settings pages
│   ├── signin/                   # Authentication pages
│   ├── spending/                 # Spending analysis pages
│   ├── transactions/             # Transaction ledger pages
│   ├── client-layout.tsx         # Client-side root layout
│   ├── layout.tsx                # Server-side root layout
│   └── page.tsx                  # Home/dashboard route
├── components/                   # React components
│   ├── accounts/                 # Account-specific components
│   ├── budgets/                  # Budget components
│   ├── cash-flow/                # Cash flow chart components
│   ├── charts/                   # Shared chart components
│   ├── features/                 # Feature flag components
│   ├── financial-logic/          # Financial calculation components
│   ├── fire/                     # FIRE planning components
│   ├── goals/                    # Goal tracking components
│   ├── net-worth/                # Net worth components
│   ├── real-estate/              # Real estate components
│   ├── settings/                 # Settings components
│   ├── ui/                       # shadcn/ui primitive components
│   ├── sidebar.tsx               # Navigation sidebar
│   ├── authenticated-layout.tsx  # Authenticated layout wrapper
│   └── ...                       # Other shared components
├── config/                       # App configuration & defaults
├── drizzle/                      # Database migration SQL files
├── lib/                          # Core business logic & utilities
│   ├── db/                       # Database schema, queries, seeds
│   │   ├── schema.ts             # Drizzle schema (20+ tables)
│   │   ├── seed-categories.ts    # Default category seeding
│   │   ├── seed-default-rules.ts # Default rule seeding
│   │   └── seed-indexes.ts       # Database index creation
│   ├── hooks/                    # Custom React hooks
│   ├── services/                 # Business logic
│   │   ├── sync.ts               # SimpleFIN sync service
│   │   ├── rules-engine.ts       # Auto-categorization engine
│   │   ├── account-history.ts    # Balance history
│   │   ├── manual-accounts.ts    # Manual account management
│   │   └── retirement.ts         # FIRE/retirement calculations
│   ├── types/                    # TypeScript type definitions
│   ├── validations/              # Zod validation schemas
│   ├── auth.ts                   # NextAuth configuration
│   ├── crypto.ts                 # Encryption utilities
│   ├── simplefin.ts              # SimpleFIN HTTP client
│   └── utils/                    # General helpers
├── public/                       # Static assets and PWA files
├── scripts/                      # Build and utility scripts
├── styles/                       # Global CSS
├── tests/                        # Unit and integration tests
│   └── unit/                     # Unit tests
├── Dockerfile                    # Multi-stage Docker build
├── compose.yml                   # Docker Compose configuration
├── drizzle.config.ts             # Drizzle ORM configuration
├── next.config.js                # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
└── vitest.config.ts              # Vitest configuration
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version |
|---|---|
| [Node.js](https://nodejs.org/) | >= 20 |
| [pnpm](https://pnpm.io/) | >= 9 |
| [Docker](https://www.docker.com/) & Docker Compose | Latest stable |
| [PostgreSQL](https://www.postgresql.org/) | 16 (provided via Docker) |

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/runway-finance.git
cd runway-finance

# Install dependencies
pnpm install

# Copy and configure environment variables
cp .env.example .env.local
```

### Configuration

Edit `.env.local` with your settings. See the [Environment Variables](#-environment-variables) section below for a full reference.

At minimum, generate the required secrets:

```bash
# Generate a secret for authentication
openssl rand -hex 32

# Generate an encryption key for sensitive data
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Running Locally

```bash
# Start PostgreSQL via Docker
docker compose up postgres -d

# Apply database migrations
pnpm db:migrate

# Start the development server (Turbopack)
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### First-Time Setup

1. Open [http://localhost:3000/signin](http://localhost:3000/signin) and create the first admin user
2. Set `ALLOW_REGISTRATION=false` in `.env.local` to lock down registration
3. Optionally set a `REGISTRATION_PIN` for additional protection

---

## 🔑 Environment Variables

All variables are defined in `.env.example`. Copy it to `.env.local` and configure:

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXTAUTH_SECRET` | ✅ | — | 64-char hex signing secret. Generate with `openssl rand -hex 32` |
| `NEXTAUTH_URL` | ✅ | — | Base URL of the app (e.g. `http://localhost:3000`) |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | ✅ | — | Password for the PostgreSQL `postgres` user |
| `ENCRYPTION_KEY` | ✅ | — | 64-char hex key for AES-256-GCM encryption |
| `ALLOW_REGISTRATION` | ✅ | `true` | Set to `false` after creating the first user |
| `REGISTRATION_PIN` | ❌ | — | PIN required for new account creation |
| `SYNC_CRON_SCHEDULE` | ❌ | `0 */6 * * *` | Cron expression for SimpleFIN auto-sync. Empty to disable |
| `DEBUG` | ❌ | `false` | Set to `true` for verbose debug logging |
| `GOOGLE_CLIENT_ID` | ❌ | — | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | ❌ | — | Google OAuth client secret (optional) |

---

## 📜 Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start development server with Turbopack on port 3000 |
| `pnpm build` | Create production build |
| `pnpm start` | Start production server on port 3000 |
| `pnpm preview` | Alias for `start` |
| `pnpm lint` | Run ESLint across the codebase |
| `pnpm format` | Format code with Prettier |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm ci` | Run lint → typecheck → build (CI pipeline) |
| `pnpm test` | Run unit tests with Vitest |
| `pnpm test:integration` | Run integration tests (requires running PostgreSQL) |
| `pnpm test:docker` | Run tests inside a Docker container |
| `pnpm db:generate` | Generate migration SQL from schema changes |
| `pnpm db:migrate` | Apply pending database migrations |
| `pnpm db:studio` | Open Drizzle Studio (web-based database explorer) |
| `pnpm db:indexes` | Create optimized database indexes |
| `pnpm upgrade` | Upgrade Next.js to the latest version |

---

## 🐳 Docker Deployment

### Development

```bash
# Start PostgreSQL only
docker compose up postgres -d

# Then run the app locally
pnpm dev
```

### Production

Build and deploy the full stack with Docker Compose:

```bash
# Build the Docker image
docker build -t runway-finance:latest .

# Or pull from Docker Hub (when published)
# docker pull alanracek/runway-finance:latest

# Start the full stack (PostgreSQL + app)
docker compose up -d
```

The application will be available at [http://localhost:3001](http://localhost:3001) (mapped to port 3001 in `compose.yml`). The Docker entrypoint automatically waits for PostgreSQL, runs migrations, and starts the server.

### Manual Docker Build

```bash
docker build -t runway-finance .
docker run -p 3001:3000 runway-finance
```

### Docker Compose Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `runway-db` | `postgres:16-alpine` | `5432` | PostgreSQL database (persistent volume) |
| `runway-app` | `alanracek/runway-finance:latest` | `3001` | Next.js application |

---

## 🧪 Testing

```bash
# Run unit tests
pnpm test

# Run integration tests (requires PostgreSQL running)
pnpm test:integration

# Run tests inside Docker
pnpm test:docker
```

The project uses:
- **Vitest** — Unit and integration test runner
- **Testing Library** — Component and hook testing utilities
- **Playwright** — End-to-end browser testing

---

## 🗄 Database

### Schema

The database schema is defined in `lib/db/schema.ts` using Drizzle ORM. Migrations live in the `drizzle/` directory as versioned SQL files.

**Key tables:**

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

### Managing Migrations

```bash
# After changing the schema, generate a migration:
pnpm db:generate

# Review the generated SQL in drizzle/, then apply it:
pnpm db:migrate
```

### Database Explorer

```bash
# Open Drizzle Studio in your browser
pnpm db:studio
```

---

## 🔌 API Endpoints

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

---

## 📦 Data Export

Export all your data from the Settings page in three formats:
- **CSV** — Spreadsheet-compatible transaction and account data
- **JSON** — Full structured data dump
- **ZIP** — Bundled export of all data types

---

## 🔒 Security

- Sensitive data (SimpleFIN access URLs) encrypted with AES-256-GCM at rest
- Delete operations require `X-Confirm-Delete: true` header to prevent accidental deletions
- Single-user authentication with registration lock after first user
- Input sanitization on all free-text fields
- Registration PIN protection for new account creation

---

## 🔮 Roadmap

Planned features and improvements:

- [ ] Investments page with holdings and performance metrics
- [ ] Projection lab with screen-grab visualization
- [ ] Multi-currency support
- [ ] Recurring transaction templates
- [ ] Mobile-responsive improvements
- [ ] API key management for programmatic access
- [ ] Automated backup & restore
- [ ] Plugin/extensibility system

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/my-feature`
3. **Commit** your changes: `git commit -am 'Add my feature'`
4. **Push** to the branch: `git push origin feat/my-feature`
5. **Open** a Pull Request

Please ensure:
- Code passes `pnpm ci` (lint + typecheck + build)
- New features include appropriate tests
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

Issues, pull requests, and suggestions are welcome. Feel free to fork and adapt this project for your own needs.

---

## 👥 Authors & Credits

| Contributor | Role |
|---|---|
| **Alan Racek** | Original author, architecture, core development |
| **Ehsan Ghaffar** | Initial contributions |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

```
Copyright (c) 2025–2026 Ehsan Ghaffar & Alan Racek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files, to deal in the Software
without restriction...
```

See the [LICENSE](LICENSE) file for full terms.

---

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) — The React framework for production
- [shadcn/ui](https://ui.shadcn.com/) — Beautifully styled components built with Radix UI and Tailwind CSS
- [Drizzle ORM](https://orm.drizzle.team/) — TypeScript ORM with a native PostgreSQL driver
- [SimpleFIN](https://simplefin.org/) — Open banking bridge protocol
- [Tremor](https://tremor.so/) — Data visualization components
- [Lucide](https://lucide.dev/) — Beautiful & consistent icons

---

<div align="center">

**Made with ❤️ for personal finance transparency**

⭐ Star this repo if you find it useful!

</div>
