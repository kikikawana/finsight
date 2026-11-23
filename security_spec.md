# FinSight Security Specification

## 1. Data Invariants
1. **User Profile Ownership & PII Isolation**: A `/users/{userId}` document may only be read, created, or updated by the verified authenticated user whose `request.auth.uid == userId`. No user can list `/users`.
2. **Scenario Ownership & Immutability**: A `/scenarios/{scenarioId}` document must belong to `request.auth.uid` (`userId == request.auth.uid`), with `userId` and `createdAt` immutable after creation, and numeric inputs bounded within realistic financial ranges.
3. **Savings Log Relational Integrity**: A `/savingsLogs/{logId}` document cannot exist without a valid `scenarioId` pointing to an existing `/scenarios/{scenarioId}` document owned by `request.auth.uid`.
4. **Verified Identity & Temporal Integrity**: All writes require `request.auth != null && request.auth.token.email_verified == true` and strict `request.time` server timestamp checks (`createdAt == request.time`, `updatedAt == request.time`).

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. **Unauthenticated Profile Read**: Unauthenticated `get(/users/userA)`.
2. **Cross-User PII Read**: Authenticated `userB` reads `get(/users/userA)`.
3. **Blanket User List Scraping**: Authenticated `userB` queries `list(/users)`.
4. **Identity Spoofing on User Create**: `userB` creates `/users/userB` with `uid: "userA"`.
5. **Shadow Ghost Field on Profile**: `userA` creates `/users/userA` with extra field `isAdmin: true`.
6. **Unverified Email Write**: Authenticated user with `email_verified: false` creates `/scenarios/scen1`.
7. **Cross-Owner Scenario Spoof**: `userB` creates `/scenarios/scen1` with `userId: "userA"`.
8. **Invalid Benchmark Enum**: `userA` creates `/scenarios/scen1` with `benchmarkId: "crypto_100x"`.
9. **Out-of-Bounds / Negative Savings Poisoning**: `userA` creates `/scenarios/scen1` with `weeklySavings: -5000`.
10. **Immutable Owner Tampering on Update**: `userA` updates `/scenarios/scen1` changing `userId` to `"userB"` or modifying `createdAt`.
11. **Orphaned / Cross-User Savings Log**: `userB` creates `/savingsLogs/log1` referencing `scenarioId` owned by `userA` (or a non-existent scenario).
12. **Client-Forged Timestamp / Oversized ID**: `userA` creates `/savingsLogs/log1` with a backdated `createdAt` or a 500-char document ID.
