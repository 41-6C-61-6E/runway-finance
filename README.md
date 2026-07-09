<div align="center">

# Personal Finance App

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

## ✨ Features

### 💰 Financial Tracking
- **Accounts** — Connect bank/brokerage accounts via Plaid or SimpleFIN, or manage them manually; track balances and values over time.
- **Transactions** — Full ledger with filtering, searching, bulk editing, detail drawers, tags, and auto-categorization rules.
- **Net Worth** — Real-time net worth dashboard with debt-to-asset ratio, asset allocation charts, and goal progress tracking.
- **Spend / Save** — Detailed cash flow analysis, income vs. expenses, category spending breakdown, cash vs. credit card usage, and category summaries.
- **Flows** — Wealth Flow and Cash Flow visualization via interactive Sankey diagrams.

### 📊 Budgeting & Planning
- **Budgets** — Category-based budgets with period selection, visual budget vs. actual charts, and cash flow forecasting.
- **Real Estate** — Property portfolio tracking with equity-over-time charts, allocation views, and integration with FRED/RentCast APIs for valuations.
- **Investments** — Comprehensive investments tracker for stocks, mutual funds, and crypto holdings, with live stock quotes, cost basis calculations, unrealized gain/loss tracking, and tax breakdowns.
- **Goals** — Track savings goals with progress percentages, reserve calculations, and goal allocation/projections.
- **Plans** — Planning and projections engine (coming soon).

### 🔒 Security, Privacy & Sharing
- **Authentication** — Single-user credentials via NextAuth v5 with bcrypt password hashing (optional Google OAuth).
- **Encryption** — AES-256-GCM encryption for sensitive data (API keys, credentials, SimpleFIN/Plaid access tokens) using native Node.js crypto.
- **Privacy Mode** — Blur sensitive financial data with a single toggle.
- **Registration Control** — PIN-protected registration and one-time enable/disable.
- **Account Sharing** — Sharing dashboard and inviting users to view or edit accounts securely.

### 🔔 Notifications & Payroll
- **Notifications & Alerts** — Configurable custom alert rules (e.g. transaction matches criteria, balance thresholds, savings milestones) with web push notification support.
- **Payroll & Paystubs** — Paystub tracking, automated paystub generation scheduler, and deduction/line item mapping.

### 🛠 Developer Experience
- **Data Explorer** — In-app database logs, table explorer, and SQL runner.
- **Financial Logic** — Detailed, interactive trace engine tree explaining how every single financial metric is calculated.
- **Data Export** — CSV, JSON, and ZIP export of all user data.
- **PWA Support** — Installable progressive web app with service worker caching.
- **Dark by Default** — Sleek dark theme with accent color customization.
- **Background Sync** — Configurable automated transaction sync via Plaid or SimpleFIN using native Next.js-instrumentation startup schedulers.
- **Docker-Native** — Full stack (PostgreSQL + Next.js) in a single `docker compose` command.

---

## 🧱 Tech Stack

| Category | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9 |
| **Styling** | Tailwind CSS 4, shadcn/ui (Radix UI primitives) |
| **Authentication** | NextAuth v5 (beta.30), bcryptjs |
| **Database** | PostgreSQL, Drizzle ORM, drizzle-kit |
| **State & Data** | TanStack Query, TanStack Table |
| **Forms & Validation** | React Hook Form, Zod 4 |
| **Charts & Visualization** | Recharts 3 |
| **Push Notifications** | Web Push (web-push) |
| **Encryption** | AES-256-GCM (Node.js `crypto` module) |
| **Testing** | Vitest, Testing Library, Playwright |
| **Package Manager** | pnpm |
| **Deployment** | Docker, Docker Compose |

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
git clone https://github.com/<your-username>/personal-finance.git
cd personal-finance

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

# Generate VAPID keys for push notifications
pnpm run generate-vapid-keys
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

The application will be available at [http://localhost:3001](http://localhost:3001).

### First-Time Setup

1. Open [http://localhost:3001/signin](http://localhost:3001/signin) and create the first admin user.
2. Set `ALLOW_REGISTRATION=false` in `.env.local` to lock down registration.
3. Optionally set a `REGISTRATION_PIN` for additional protection.

---

## 🔑 Environment Variables

All variables are defined in `.env.example`. Copy it to `.env.local` and configure:

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXTAUTH_SECRET` | ✅ | — | 64-char hex signing secret. Generate with `openssl rand -hex 32` |
| `NEXTAUTH_URL` | ✅ | — | Base URL of the app (e.g. `http://localhost:3001` or `http://localhost:3000` for prod) |
| `POSTGRES_DB` | ✅ | `personal_finance` | Database name |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | ✅ | — | Password for the PostgreSQL `postgres` user (used by docker compose) |
| `ENCRYPTION_KEY` | ✅ | — | 64-char hex key for AES-256-GCM encryption |
| `ALLOW_REGISTRATION` | ✅ | `true` | Set to `false` after creating the first user |
| `REGISTRATION_PIN` | ❌ | — | PIN required for new account creation |
| `FRED_API_KEY` | ❌ | — | Federal Reserve Economic Data API key (optional — for historical home price estimation) |
| `RENTCAST_API_KEY` | ❌ | — | RentCast API key (optional — for real estate property valuation) |
| `BUG_REPORTING` | ❌ | `false` | Enable collaborative bug reporting dropdown |
| `GOOGLE_CLIENT_ID` | ❌ | — | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | ❌ | — | Google OAuth client secret (optional) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`| ❌ | — | VAPID public key (optional — for web push notifications) |
| `VAPID_PRIVATE_KEY` | ❌ | — | VAPID private key (optional — for web push notifications) |
| `VAPID_SUBJECT` | ❌ | — | VAPID subject email, e.g. `mailto:admin@example.com` (optional) |
| `AI_PROVIDER_NAME` | ❌ | — | Auto-seed AI provider name (e.g. "OpenAI", "Ollama") |
| `AI_PROVIDER_ENDPOINT` | ❌ | — | Auto-seed AI provider API base endpoint (e.g. "https://api.openai.com/v1") |
| `AI_PROVIDER_MODEL` | ❌ | — | Auto-seed AI provider model ID (e.g. "gpt-4o-mini") |
| `AI_PROVIDER_API_KEY` | ❌ | — | Auto-seed AI provider API key (optional) |

---

## 📜 Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start development server with Turbopack on port 3001 (auto-generates CSS color palettes and PWA service worker) |
| `pnpm build` | Create production build (auto-generates CSS color palettes and PWA service worker) |
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
| `pnpm generate-colors` | Run script to generate custom Tailwind/CSS colors from configured palette |
| `pnpm generate-pwa-icons` | Generate PWA app icon assets |
| `pnpm generate-vapid-keys` | Generate a public/private VAPID keypair for push notifications |

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
docker build -t personal-finance:latest .

# Start the full stack (PostgreSQL + app)
docker compose up -d
```

The application will be available at [http://localhost:3001](http://localhost:3001) (mapped to port 3001 in `compose.yml`). The Docker entrypoint automatically waits for PostgreSQL, runs migrations, and starts the server.

### Manual Docker Build

```bash
docker build -t personal-finance .
docker run -p 3001:3000 personal-finance
```

### Docker Compose Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `finance-db` | `postgres:16-alpine` | `5432` | PostgreSQL database (persistent volume) |
| `finance-app` | `alanracek/personal-finance:latest` | `3001` | Next.js application |

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

The database schema is defined across files in `lib/db/schema/` using Drizzle ORM, and re-exported from `lib/db/schema.ts`. Migrations live in the `drizzle/` directory as versioned SQL files.

**Key tables:**

| Table | Purpose |
|---|---|
| `user`, `session`, `account`, `verification` | NextAuth core tables |
| `user_settings` | User preferences (currency, locale, theme, privacy mode, chart visibility, etc.) |
| `simplefin_connections` | SimpleFIN Bridge connections (encrypted access URLs) |
| `plaid_connections` | Plaid account sync connections |
| `sync_logs` | SimpleFIN/Plaid sync operation history |
| `accounts` | Financial accounts (checking, savings, investment, credit, loan, etc.) |
| `holdings`, `holding_snapshots` | Stock, mutual fund, and crypto holdings and balance history |
| `transactions` | Transaction records with categories, tags, and bank metadata |
| `categories` | Transaction categories with color and icon support |
| `tags` | Custom tags for budgets, goals, and transactions |
| `category_rules` | Auto-categorization rules |
| `net_worth_snapshots` | Daily aggregated net worth history |
| `account_snapshots` | Per-account balance history over time |
| `monthly_cash_flow` | Pre-aggregated monthly income/expense summaries |
| `category_spending_summary` | Monthly spending by category |
| `category_income_summary` | Monthly income by category |
| `budgets` | Category-based budgets |
| `financial_goals` | Savings goals with targets and progress |
| `goal_allocation_history` | Account balance allocation snapshots towards financial goals |
| `paystubs`, `paystub_line_items`, `paystub_field_mappings` | Payroll paystub entries, line items, and template parsers |
| `custom_alert_rules`, `sent_notifications`, `push_subscriptions` | Web push subscriptions and custom conditional alerting engine triggers |
| `ai_proposals` | AI-generated categorization/insight suggestions |
| `ai_providers` | AI/LLM endpoint configurations |

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

### Connections & Plaid

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/connections` | Create a SimpleFIN connection (requires `setupToken`) |
| `GET` | `/api/connections` | List all connections |
| `DELETE` | `/api/connections/:id` | Delete a connection (requires `X-Confirm-Delete: true` header) |
| `POST` | `/api/connections/:id/sync` | Trigger manual sync |
| `GET` | `/api/connections/:id/sync-logs` | View sync history |
| `POST` | `/api/plaid/create-link-token` | Generate a link token for Plaid Link client initialization |
| `POST` | `/api/plaid/exchange-public-token`| Exchange Plaid public token for secure access token |
| `POST` | `/api/plaid/sync` | Sync Plaid connection transactions and balances |

### Accounts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/accounts` | List accounts (supports `includeHidden` and `type` query params) |
| `GET` | `/api/accounts/:id` | Get account details |
| `PATCH` | `/api/accounts/:id` | Update account |

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/transactions` | List transactions with filtering, pagination, sorting, search, and tags |
| `GET` | `/api/transactions/:id` | Get transaction details |
| `PATCH` | `/api/transactions/:id` | Update single transaction |
| `PATCH` | `/api/transactions` | Bulk update transactions |

Additional endpoints are available for categories, tags, category rules, net worth, cash flow, wealth flow, budgets, financial goals, real estate, manual accounts, LLM/AI suggestions, push notifications, paystubs, backup/export, and user settings.

---

## 📦 Data Export

Export all your data from the Settings page in three formats:
- **CSV** — Spreadsheet-compatible transaction and account data
- **JSON** — Full structured data dump
- **ZIP** — Bundled export of all data types

---

## 🔒 Security

- Sensitive data (SimpleFIN and Plaid access credentials) encrypted with AES-256-GCM at rest.
- Delete operations require `X-Confirm-Delete: true` header to prevent accidental deletions.
- Single-user authentication with registration lock after the first user.
- PIN protection option for new user registration.
- Input sanitization on all free-text fields.

---

## 🔮 Roadmap

Planned features and improvements:

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
| **Ehsan Ghaffar** | Next.js Starter Template |

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
- [Plaid](https://plaid.com/) — Financial data transfer network APIs
- [Recharts](https://recharts.org/) — Redesigned charting library built with React
- [Lucide](https://lucide.dev/) — Beautiful & consistent icons

---

<div align="center">

**Made with ❤️ for personal finance transparency**

⭐ Star this repo if you find it useful!

</div>
