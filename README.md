# NovaPay — Transaction Backend

A production-grade fintech backend rebuilt after catastrophic failures.
Handles idempotent disbursements, atomic transfers, FX rate locking,
double-entry bookkeeping, and bulk payroll.

---

## Quick Start
```bash
git clone 
cd novapay
docker compose -f infra/docker-compose.yml up --build
```

All services start automatically. First run takes ~5 minutes.

---

## Services

| Service | Port (internal) | Responsibility |
|---|---|---|
| account-service | 3001 | Wallets, balances, field-level encryption |
| transaction-service | 3002 | Transfers, idempotency, crash recovery |
| ledger-service | 3003 | Double-entry bookkeeping, hash chain |
| fx-service | 3004 | Rate quotes, 60s TTL, single-use |
| payroll-service | 3005 | Bulk disbursement, BullMQ queue |
| admin-service | 3006 | Ops panel, audit logs, compliance |

All traffic enters through nginx on port 80.

---

## URLs

| URL | Purpose |
|---|---|
| http://localhost | API gateway (nginx) |
| http://localhost:8080 | Adminer — inspect any database |
| http://localhost:3000 | Grafana — dashboards (admin/admin) |
| http://localhost:9090 | Prometheus — raw metrics |
| http://localhost:16686 | Jaeger — distributed traces |

---

## API Endpoints

### Account Service

**POST /accounts/wallets**
Create a wallet for a user.
```json
// Request
{
  "userId": "uuid",
  "currency": "USD",
  "accountNumber": "ACC-001"
}
// Response 201
{
  "id": "uuid",
  "userId": "uuid",
  "currency": "USD",
  "balance": "0.00000000",
  "accountNumber": "ACC-001",
  "isActive": true
}
```

**PATCH /accounts/wallets/:walletId/balance**
Credit or debit a wallet.
```json
// Request
{ "amount": "100", "operation": "credit" }
// Response 200 — updated wallet
// Response 422 — insufficient funds
```

**GET /accounts/wallets/:walletId/balance**
```json
{ "balance": "900.00000000" }
```

---

### FX Service

**POST /fx/quote**
Issue a locked rate quote valid for 60 seconds.
```json
// Request
{
  "fromCurrency": "USD",
  "toCurrency": "EUR",
  "fromAmount": "2000",
  "userId": "uuid"
}
// Response 201
{
  "id": "uuid",
  "rate": "0.92000000",
  "fromAmount": "2000.00000000",
  "toAmount": "1840.00000000",
  "expiresAt": "2026-04-07T10:01:00Z",
  "secondsRemaining": 59,
  "status": "ACTIVE"
}
```

**GET /fx/quote/:id**
Check quote validity and time remaining.

**POST /fx/quote/:id/consume**
Mark quote as used. Called internally by transaction-service.
Returns 409 if already used, 410 if expired.

---

### Transaction Service

**POST /transactions/transfers**
Initiate a domestic or international transfer.
Requires `Idempotency-Key` header.
```json
// Request
{
  "senderWalletId": "uuid",
  "recipientWalletId": "uuid",
  "senderUserId": "uuid",
  "recipientUserId": "uuid",
  "amount": "100",
  "currency": "USD",
  "fxQuoteId": "uuid"  // optional, for international transfers
}
// Response 201
{
  "transactionId": "uuid",
  "status": "COMPLETED",
  "amount": "100",
  "currency": "USD",
  "fxRate": null
}
// Response 409 — idempotency key payload mismatch
// Response 410 — FX quote expired
// Response 422 — insufficient funds
```

---

### Ledger Service

**POST /ledger/transactions**
Write a double-entry pair. Called internally by transaction-service.

**GET /ledger/transactions/:transactionId**
Get both ledger entries for a transaction.

**GET /ledger/transactions/:transactionId/verify**
Verify the double-entry invariant is balanced.
```json
{ "balanced": true }
```

**GET /ledger/wallets/:walletId/entries?limit=50&offset=0**
Paginated transaction history. Never recalculates — reads pre-written entries.

**GET /ledger/wallets/:walletId/chain**
Verify the audit hash chain for tamper detection.
```json
{ "valid": true }
// or
{ "valid": false, "tamperedAt": "entry-uuid" }
```

---

### Payroll Service

**POST /payroll/jobs**
Create and queue a bulk payroll job.
```json
// Request
{
  "employerId": "uuid",
  "sourceWalletId": "uuid",
  "sourceUserId": "uuid",
  "jobName": "April 2026 Payroll",
  "items": [
    {
      "employeeUserId": "uuid",
      "recipientWalletId": "uuid",
      "amount": "5000",
      "currency": "USD"
    }
  ]
}
// Response 201
{
  "jobId": "uuid",
  "status": "QUEUED",
  "totalItems": 1,
  "message": "Payroll job queued successfully"
}
```

**GET /payroll/jobs/:jobId**
```json
{
  "jobId": "uuid",
  "status": "PROCESSING",
  "totalItems": 14000,
  "processedItems": 5432,
  "failedItems": 0,
  "checkpoint": 5432,
  "progress": "5432/14000"
}
```

---

### Admin Service

All endpoints require `x-admin-token` header.

**GET /admin/wallets/:walletId** — view any wallet
**GET /admin/transactions/:transactionId** — view any transaction
**GET /admin/ledger/verify/:transactionId** — verify ledger invariant
**GET /admin/ledger/chain/:walletId** — verify hash chain
**GET /admin/ledger/entries/:walletId** — view ledger history
**GET /admin/audit-logs?limit=50&offset=0** — paginated audit log

---

## Idempotency Scenarios

See `decisions.md` for full explanation. Summary:

| Scenario | Behaviour |
|---|---|
| A — same key twice | Second request returns cached response, no second debit |
| B — three requests within 100ms | One wins the DB insert, two others see PROCESSING |
| C — crash after debit | Recovery reverses debit on restart |
| D — key reused after 24h | Treated as new request |
| E — same key different payload | 409 Conflict with clear error message |

---

## Double-Entry Invariant

Every transfer writes exactly two ledger rows with the same `transactionId`:
DEBIT  sender_wallet   $100
CREDIT recipient_wallet $100

Sum of debits must always equal sum of credits. If this invariant is ever
violated, `ledger_invariant_violations_total` Prometheus counter increments
and Grafana fires an immediate critical alert.

Verify any transaction: `GET /ledger/transactions/:id/verify`

---

## FX Quote Strategy

1. Request a quote — rate is locked for exactly 60 seconds
2. Quote is single-use — consuming it marks it USED atomically
3. Transfer must reference the quote ID
4. If quote expires before transfer — 410 Gone, request a new quote
5. If FX provider is down — 503, never silently applies a cached rate
6. The exact locked rate is recorded on every cross-currency ledger entry

---

## Payroll Resumability

Each payroll item has an `itemIndex`. The job stores a `checkpoint` equal
to the last successfully processed `itemIndex`. On crash and restart, the
worker resumes from `checkpoint + 1`. Each item also uses a stable
idempotency key so transaction-service deduplicates any retries.

---

## Audit Hash Chain

Each ledger entry stores a SHA256 hash of its own fields plus the previous
entry's hash. This forms a tamper-evident chain. Any modification to a
historical record breaks the chain at that point.
Verify: `GET /ledger/wallets/:walletId/chain`

---

## Running Tests
```bash
cd services/account-service && npm test
cd services/transaction-service && npm test
cd services/ledger-service && npm test
cd services/fx-service && npm test
cd services/payroll-service && npm test
cd services/admin-service && npm test
```

---

## Postman Collection

Import `NovaPay.postman_collection.json` into Postman.
Run folders in order: Health Checks → Account → FX → Transactions →
Ledger → Payroll → Admin.

Collection variables are auto-populated by test scripts —
just run requests top to bottom.