# Goals Engine Bug Fixes

## Bug 2 — PATCH handler drops `linkedAccountId`
**File:** `app/api/financial-goals/route.ts`
**Line:** ~148

Add after the sortOrder line:
```ts
if (updates.linkedAccountId !== undefined) updateData.linkedAccountId = updates.linkedAccountId || null;
```

---

## Bug 1 — Completed goal fund release is dead code
**File:** `lib/services/goal-allocation.ts`

**Problem:** `goalAllocations` only contains active goals, but the release loop at line 188 searches for completed goals in it. Always returns 0.

**Fix:** Before the release loop, fetch the persisted `allocatedAmount` for each completed goal from the DB. Replace lines 182-205 with:

```ts
// Fetch last known allocations for completed goals from DB
const completedGoalIds = completedForAccount.map(g => g.id);
let completedAllocations: Map<string, number> = new Map();
if (completedGoalIds.length > 0) {
  const persistedGoals = await getDb()
    .select({ id: financialGoals.id, allocatedAmount: financialGoals.allocatedAmount })
    .from(financialGoals)
    .where(and(
      eq(financialGoals.userId, userId),
      inArray(financialGoals.id, completedGoalIds)
    ));
  for (const pg of persistedGoals) {
    const decrypted = await decryptRow('financial_goals', pg, dek);
    completedAllocations.set(pg.id, parseFloat(decrypted.allocatedAmount) || 0);
  }
}
```

Then in the release loop, use `completedAllocations.get(completedGoal.id)` instead of `goalAllocations.find(...)`.

Also need to import `inArray` from `drizzle-orm`.

---

## Bug 3 — Desired allocation display doesn't subtract reserves
**File:** `components/goals/goal-card.tsx`
**Line:** 180

Change:
```tsx
{formatCurrency(parseFloat(goal.percentage || '100') / 100 * (goal.accountBalance ?? 0))}
```
To:
```tsx
{formatCurrency(parseFloat(goal.percentage || '100') / 100 * ((goal.accountBalance ?? 0) - parseFloat(goal.reserve || '0')))}
```

---

## Bug 4 — Non-deterministic ordering for same sortOrder
**File:** `lib/services/goal-allocation.ts`

**Line 72:** Change `.orderBy(asc(financialGoals.sortOrder))` to `.orderBy(asc(financialGoals.sortOrder), asc(financialGoals.id))`

**Line 141:** Change `.sort((a, b) => a.sortOrder - b.sortOrder)` to `.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))`

---

## Bug 5 — `remaining` should start at `availableBalance` not `accountBalance`
**File:** `lib/services/goal-allocation.ts`
**Line:** 143

Change:
```ts
let remaining = accountBalance;
```
To:
```ts
let remaining = Math.max(0, accountBalance - sharedReservesByAccount.get(accountId)!);
```

---

## Bug 6 — Unused encrypted `name` in `findSharedAccounts`
**File:** `lib/services/goal-allocation.ts`
**Line:** 300

Remove `name: financialGoals.name` from the SELECT (it's encrypted and never used in the result).

---

## N+1 — Deduplicate account fetches
**File:** `components/goals/goals-list.tsx`
**Lines:** 74-83

Replace the loop with a single fetch before it:
```tsx
let allAccounts: Array<{ id: string; balance: string }> = [];
const acctRes = await fetch(`/api/accounts`, { credentials: 'include' });
if (acctRes.ok) {
  allAccounts = await acctRes.json();
}
const balances: Record<string, number | null> = {};
for (const accountId of uniqueAccountIds) {
  const acct = allAccounts.find((a) => a.id === accountId);
  if (acct) {
    balances[accountId] = parseFloat(acct.balance);
  }
}
```
