# FinSight Security Specification

## 1. Data Invariants
1. **User Profile Ownership & PII Isolation**: A `/users/{userId}` document may only be read, created, or updated by the verified authenticated user whose `request.auth.uid == userId`. No user can list `/users`.
2. **Folder Ownership & Immutability**: A `/folders/{folderId}` document must belong to `request.auth.uid` (`userId == request.auth.uid`), with `userId` and `createdAt` immutable, `name` constrained to 1–48 characters, and `color` restricted to `['emerald', 'amber', 'sky', 'rose', 'slate']`.
3. **Scenario Ownership, Folder Reference & Immutability**: A `/scenarios/{scenarioId}` document must belong to `request.auth.uid` (`userId == request.auth.uid`), with `userId` and `createdAt` immutable after creation, numeric inputs bounded within valid ranges and percentage sum constraints (`savingsPercent + needsPercent + wantsPercent <= 100`), and any optional `folderId` referencing an existing `/folders/{folderId}` document owned by `request.auth.uid`.
4. **Savings Log Relational Integrity**: A `/savingsLogs/{logId}` document cannot exist without a valid `scenarioId` pointing to an existing `/scenarios/{scenarioId}` document owned by `request.auth.uid`.
5. **Verified Identity & Temporal Integrity**: All writes require `request.auth != null && request.auth.token.email_verified == true` and strict `request.time` server timestamp checks (`createdAt == request.time`, `updatedAt == request.time`).
6. **Public Shared Report Isolation**: A `/sharedReports/{shareId}` document must have an unguessable ID (`shareId.size() >= 16`), contain zero PII (no email/income/notes), enforce `list` restricted strictly to `existing().userId == request.auth.uid`, and allow single-document `get` only by exact ID.
7. **Everyday Budget Entry Ownership & Integrity**: A `/budgetEntries/{entryId}` document must belong to `request.auth.uid`, enforce bounded `title` (1–64 chars), `amount` (1–1,000,000), valid `bucket`/`category`/`status` enums, `YYYY-MM-DD` `entryDate`, immutable `userId`/`createdAt`, and any optional `scenarioId` owned by `request.auth.uid`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. **Unauthenticated Profile Read**: Unauthenticated `get(/users/userA)` or `get(/budgetEntries/e1)`.
2. **Cross-User PII & Budget Read**: Authenticated `userB` reads `get(/users/userA)` or `get(/budgetEntries/e1)` owned by `userA`.
3. **Blanket User/Share/Budget List Scraping**: Authenticated `userB` queries `list(/users)`, `list(/sharedReports)`, or `list(/budgetEntries)` without `userId == request.auth.uid`.
4. **Identity Spoofing on User Create**: `userB` creates `/users/userB` with `uid: "userA"`.
5. **Shadow Ghost Field on Profile, Shared Report, or Budget Entry**: `userA` creates `/users/userA`, `/sharedReports/{id}`, or `/budgetEntries/e1` with extra field `isAdmin: true` or `email: "a@b.com"`.
6. **Unverified Email Write**: Authenticated user with `email_verified: false` creates `/scenarios/scen1`, `/folders/f1`, `/sharedReports/{id}`, or `/budgetEntries/e1`.
7. **Cross-Owner Folder/Scenario/Share/Budget Spoof**: `userB` creates `/folders/f1`, `/scenarios/scen1`, `/sharedReports/{id}`, or `/budgetEntries/e1` with `userId: "userA"`.
8. **Cross-User Folder or Scenario Reference**: `userB` creates `/scenarios/scen1` with `folderId` owned by `userA`, or `/budgetEntries/e1` with `scenarioId` owned by `userA`.
9. **Invalid Category, Folder Color, Currency, Benchmark, or Budget Enum**: `userA` creates `/scenarios/scen1` with `goalCategory: "yacht"`, `/sharedReports/{id}` with `currency: "BTC"`, or `/budgetEntries/e1` with `bucket: "crypto"`.
10. **Out-of-Bounds / Unbounded Array Poisoning**: `userA` creates `/scenarios/scen1` or `/budgetEntries/e1` with negative amount, or `/sharedReports/{id}` with `unlockedMilestoneIds.size() > 8`.
11. **Immutable Owner Tampering or Short Share ID**: `userA` updates `/scenarios/scen1`, `/budgetEntries/e1`, or `/sharedReports/{id}` changing `userId`, or creates `/sharedReports/abc` (`size < 16`).
12. **Orphaned Savings Log or Forged Timestamp**: `userB` creates `/savingsLogs/log1` referencing `scenarioId` owned by `userA`, or `userA` supplies a backdated `createdAt`.
