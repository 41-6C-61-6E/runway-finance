# ADR 002: Standardized `withAuth` and `withAuthAndDek` Route Handlers

## Status
Accepted

## Context
API routes individually invoked `await auth()`, manually parsed sessions, duplicated 401 checks, and handled errors with inconsistent JSON response shapes (`{ error }` vs `{ message }` vs raw strings).

## Decision
1. Wrap all authenticated routes with `withAuth(async (req, { user }) => ...)` or `withAuthAndDek(async (req, { user, dek }) => ...)`.
2. Standardize response envelopes using `apiSuccess(data)` and `apiError(code, message, status)`.
3. Centralize try/catch error handling in `handleApiError`, logging detailed errors on the server while sanitizing responses in production.

## Consequences
Eliminates ~120 boilerplate session checks, enforces consistent error envelopes across all client fetch calls, and ensures encrypted data cannot be queried without valid user DEK context.

