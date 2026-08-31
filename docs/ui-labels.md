# UI Labels — Sub-nav & CTA Conventions

Source of truth for secondary-navigation labeling and primary-action wording.
Kept in `docs/` (not `scratch/`) so it ships with the app.

## Sub-nav density rule

Each page gets **one floating capsule sub-nav** (rendered from
`components/ui/mobile-view-switcher.tsx` via `MobileTabSwipeContainer`).

1. **2–4 tabs per page, and only the page's primary viewpoints** are tabs.
   A tab is "one of the 2–4 distinct questions this page answers".
2. **Filters, periods, and breakdowns are in-page controls, not tabs.**
   Time-window selectors (e.g. Budget period, `DateWindowNav`), category
   breakdowns, sort/ordering, and chart toggles live *inside* the active tab.
3. When a page truly needs more than 3 tabs, the overflow goes to a
   dedicated section below the capsule or a drill-in (detail) screen —
  never a 5th pill. If a row does exceed the width, it scrolls (never
  wraps or truncates) and the shared edge-fade affordance
  (`components/ui/scroll-fade.tsx`) marks both clipped ends — the fade
  is contained in the capsule's rounded outline and carries a slim
  contrasting glow at the clipped edge. Every pill row and sub-nav
  capsule uses the same component, so the look changes in one place.

**Single-word label rule:** Menu and submenu tab labels are **one word**
(e.g. `Plan Details` → `Details`, `Assumptions & Strategy` → `Assumptions`).
This keeps the glass capsules from wrapping mid-phrase on mobile and from
competing with the page header. When a concept is genuinely two words, prefer
the shortest distinguishing word (`Cash vs Credit` → `Coverage`,
`Import / Export` → `Data`, `Social Security` → `SS`) and keep the tab
`id` stable.

### Current tab inventory (verified 2026-08-31)

| Page             | Tabs                                                    | Count |
| ---------------- | ------------------------------------------------------- | :---: |
| /transactions    | Transactions, Recurring, Calendar                       | 3     |
| /accounts        | List, History                                           | 2     |
| /spending        | Breakdown, Coverage, Subscriptions                      | 3     |
| /investments     | Overview, Holdings, Activity                            | 3     |
| /plans           | Projection, Scenarios, Settings                         | 3     |
| /real-estate     | Equity, Properties (conditional)                        | 2     |
| /flows           | Wealth, Cash, Income (conditional)                      | ≤3    |
| /budgets         | Monthly, Quarterly, Yearly                              | 3     |

Historical note: the 2026-08-30 audit counted 5 pills on /spending and 5 on
/budgets. Both were resolved: /spending's category/amount breakdowns became
in-tab sections, and /budgets' "Table"/"Overview" became the in-page
`MobileViewSwitcher` toggle (see `MobileViewSwitcher` with
`mainLabel`/`summaryLabel`).

## Glossary

One-sentence definitions used across sub-nav labels, page blurbs, and
onboarding copy. Labels must match one of these concepts:

- **Flows** — inflows and outflows of money over a chosen time window.
- **Net Worth** — the current position: what you own minus what you owe,
  as of today.
- **Investments** — asset allocation across holdings (what the portfolio
  is made of) and their income activity.
- **Spending** — where money goes by category, split by funding method.
- **Budgets** — planned vs actual by category over monthly, quarterly, or
  yearly periods.
- **FIRE plans** — projection of retirement readiness ("Financial
  Independence, Retire Early"); scenarios explore different contributions
  and spending rates.
- **Real Estate** — owned properties and their equity trajectory.
- **Goals** — dated savings targets with progress tracking.
- **Accounts** — the bank/brokerage connections and the balances/history
  they report.
- **Transactions** — the ledger of individual money movements.
- **Data Explorer** — raw query tool over all synced records (dev-mode gated).
- **Financial Logic** — human-readable trace of how derived numbers are
  computed (dev-mode gated).
- **Offline mode (preview)** — manual demo of the offline status surface;
  the real offline behavior is the automatic banner
  (`components/offline-banner.tsx`). Labeled with "(preview)" so connected
  users never mistake it for an actual network state.

## CTA verb pairing

- **Creation sheets/modals**: the primary CTA is always `Create <Thing>`
  (e.g. "Create Budget", "Create Goal", "Create Plan"). Secondary/alt
  action: `Cancel`.
- **Page-level buttons that open a creation sheet** may use the shorter
  `Add <Thing>` — the pairing `Add …` → sheet → `Create …` is the
  established convention and must stay consistent across screens.
- **Retry paths** (failed loads, offline recovery): `Try Again` /
  `Retry` — never `OK` or `Dismiss` on an error that can be retried.
- Verbs are always sentence case, present tense, no trailing period.
