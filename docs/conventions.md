# Runway Finance — Engineering Conventions & Standards

## 1. Naming Standards

- **File Naming**: All files in `components/`, `lib/`, `app/`, and `tests/` strictly follow `kebab-case.ts(x)`. No PascalCase filenames.
- **Components**: Export PascalCase React components with matching kebab-case filenames (e.g. `export function ActionButton` in `components/ui/action-button.tsx`).
- **Hooks**: Prefix hook files and functions with `use-` in `lib/hooks/` or feature folders.
- **Queries**: Domain React Query hooks reside in `lib/queries/<domain>.ts` using `use<Domain><Action>Query` or `use<Domain><Action>Mutation`.

## 2. Client Data Layer

- **Canonical Transport**: All client API interactions use `apiFetch` from `@/lib/utils/api-client`. Raw `fetch()` in components is banned.
- **Cache Keys**: All React Query cache keys must be defined in `lib/query-keys.ts`. No inline string literal arrays in `queryKey: ['...']`.
- **State Persistence**: Use `usePersistentState` for client-side state synchronized to localStorage with predefined keys from `lib/constants/storage-keys.ts`.

## 3. Server & Route Conventions

- **Route Wrapper**: All API routes handling user context must use `withAuth` or `withAuthAndDek` from `@/lib/api/with-auth`.
- **Response Format**: Use `apiSuccess(data)` and `apiError(code, message, status)` from `@/lib/api/response` instead of raw `NextResponse.json`.
- **Error Handling**: Centralized error mapping via `handleApiError` with sanitized production error messages.

## 4. UI Primitives & Styling Tokens

- **Overlays**: Use `ModalBackdrop`, `ClickOutsideBackdrop`, `Dialog`, `Sheet`, or `Popover`. Never write raw `fixed inset-0` modals.
- **Loaders**: Use `Spinner` or `ActionButton` loading states. Never import raw `Loader2` directly in feature components.
- **Confirmations**: Never use blocking `window.confirm()`; use `ConfirmDeleteDialog` from `@/components/ui/confirm-delete-dialog`.
- **Charts**: Wrap Recharts instances in `ChartFrame` from `@/components/charts/chart-frame`.
- **Design Tokens**: Use semantic Tailwind classes (e.g. `text-caption`, `text-micro`, `bg-card`, `text-foreground`). Avoid raw arbitrary px fonts or unmapped hex colors.

## 5. Testing Conventions

- **Location**: Test files reside in `tests/unit/`, `tests/characterization/`, or `tests/integration/`.
- **Harness**: Use `renderWithProviders` from `@/tests/support/render` for component tests.
- **Data Factories**: Use typed builders from `@/tests/support/factories` (`createEnginePlan`, `createAccount`, etc.).
- **Mock DB**: Use `createMockDb()` from `@/tests/support/mocks`.

