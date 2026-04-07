# NovaPay — Architecture & Data Models

## System Architecture

```
                        ┌─────────────────────────────────┐
                        │         Client / Postman         │
                        └────────────────┬────────────────┘
                                         │ HTTP :80
                        ┌────────────────▼────────────────┐
                        │           nginx gateway          │
                        │     single entry point for       │
                        │         all HTTP traffic         │
                        └──┬──────┬──────┬──────┬──────┬──┘
                           │      │      │      │      │
               /accounts/  │      │      │      │      │  /admin/
               /transactions/     │      │      │  /payroll/
                        /ledger/  │      │  /fx/
                                  │
          ┌────────────┬──────────┼──────────┬────────────┬────────────┐
          │            │          │          │            │            │
    ┌─────▼──────┐ ┌───▼────┐ ┌──▼─────┐ ┌──▼─────┐ ┌───▼────┐ ┌────▼───┐
    │  account   │ │  txn   │ │ ledger │ │   fx   │ │payroll │ │ admin  │
    │  service   │ │service │ │service │ │service │ │service │ │service │
    │   :3001    │ │ :3002  │ │ :3003  │ │ :3004  │ │ :3005  │ │ :3006  │
    └─────┬──────┘ └───┬────┘ └──┬─────┘ └──┬─────┘ └───┬────┘ └────┬───┘
          │            │         │           │            │           │
    ┌─────▼──┐   ┌─────▼──┐ ┌───▼────┐ ┌────▼───┐ ┌─────▼──┐ ┌─────▼──┐
    │acct-db │   │ txn-db │ │ldgr-db │ │ fx-db  │ │pyrl-db │ │adm-db  │
    └────────┘   └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
                      │                                │
                 ┌────▼────────────────────────────────▼────┐
                 │                  Redis                    │
                 │   idempotency keys    BullMQ job queue   │
                 └───────────────────────────────────────────┘
```

### Key design rules

- No shared databases between services — enforced at infrastructure level
- All external traffic enters through nginx — services are not exposed directly
- Redis is shared infrastructure only — no business data, no cross-service coupling
- Services communicate over HTTP using Docker internal DNS names

---

## Service Responsibilities

| Service | Port | Primary responsibility |
|---|---|---|
| account-service | 3001 | User wallets, balance management, field-level encryption |
| transaction-service | 3002 | Transfer orchestration, idempotency, crash recovery |
| ledger-service | 3003 | Double-entry bookkeeping, invariant enforcement, hash chain |
| fx-service | 3004 | FX rate quotes with 60s TTL, single-use enforcement |
| payroll-service | 3005 | Bulk disbursement jobs, BullMQ queue, checkpoint resumability |
| admin-service | 3006 | Internal ops panel, compliance views, audit logging |

---

## Data Models

### account-service — `wallets`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | Auto-generated |
| userId | UUID | NOT NULL, INDEX | Owner of the wallet |
| currency | VARCHAR(3) | NOT NULL, DEFAULT 'USD' | ISO 4217 code |
| balance | DECIMAL(20,8) | NOT NULL, DEFAULT 0 | Never float — exact decimal |
| accountNumberEncrypted | TEXT | nullable | AES-256-GCM ciphertext |
| accountNumberDataKey | TEXT | nullable | Envelope-encrypted data key |
| isActive | BOOLEAN | DEFAULT true | Soft delete flag |
| version | INTEGER | NOT NULL | Optimistic locking — prevents concurrent balance overwrites |
| createdAt | TIMESTAMP | NOT NULL | Auto |
| updatedAt | TIMESTAMP | NOT NULL | Auto |

**Indexes:** `userId`, `version` (optimistic lock)

**Notes:**
- `balance` uses `DECIMAL(20,8)` — 20 total digits, 8 decimal places. Supports crypto amounts.
- `accountNumber` is stored using envelope encryption. Two columns per field: the ciphertext and the encrypted data key. Plaintext never touches the database.
- `version` column enables optimistic locking via Sequelize. Every `UPDATE` includes `WHERE version = N`. Concurrent updates fail and retry rather than silently overwriting.

---

### transaction-service — `transactions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| senderWalletId | UUID | NOT NULL, INDEX | |
| recipientWalletId | UUID | NOT NULL, INDEX | |
| senderUserId | UUID | NOT NULL | |
| recipientUserId | UUID | NOT NULL | |
| amount | DECIMAL(20,8) | NOT NULL | |
| currency | VARCHAR(3) | NOT NULL | |
| type | ENUM | NOT NULL | TRANSFER, INTERNATIONAL_TRANSFER, DISBURSEMENT |
| status | ENUM | NOT NULL, INDEX | PENDING, COMPLETED, FAILED, REVERSED |
| checkpoint | ENUM | NOT NULL | INITIATED, DEBIT_DONE, CREDIT_DONE, LEDGER_DONE |
| fxQuoteId | UUID | nullable | Set for international transfers |
| fxRate | DECIMAL(20,8) | nullable | Locked rate at time of transfer |
| description | TEXT | nullable | |
| failureReason | TEXT | nullable | Set on FAILED or REVERSED |
| version | INTEGER | NOT NULL | Optimistic locking |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Indexes:** `senderWalletId`, `recipientWalletId`, `status`

**Notes:**
- `status = PENDING` + old `createdAt` = stuck transaction → picked up by recovery service on startup
- `checkpoint` tells recovery exactly where to resume after a crash:
  - `INITIATED` → nothing happened, safe to mark FAILED
  - `DEBIT_DONE` → sender debited, must reverse
  - `CREDIT_DONE` → both wallets updated, must write ledger
  - `LEDGER_DONE` → fully complete

### transaction-service — `idempotency_keys`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| key | VARCHAR | NOT NULL, UNIQUE | Client-provided idempotency key |
| payloadHash | VARCHAR(64) | NOT NULL | SHA256 of request body — detects Scenario E |
| status | ENUM | NOT NULL | PROCESSING, COMPLETED, FAILED |
| responseBody | JSONB | nullable | Cached response returned on duplicates |
| responseStatus | INTEGER | nullable | Cached HTTP status code |
| transactionId | UUID | nullable | Links to completed transaction |
| expiresAt | TIMESTAMP | NOT NULL | 24h from creation — Scenario D |
| createdAt | TIMESTAMP | NOT NULL | |

**Indexes:** `key` (UNIQUE — DB-level duplicate prevention)

**Notes:**
- UNIQUE constraint on `key` is the core mechanism. Only one INSERT wins when concurrent requests arrive simultaneously. Others see the existing record.
- `payloadHash` enables Scenario E detection. Same key + different hash = 409 Conflict.
- `expiresAt` enables Scenario D. Expired records are deleted and the request is treated as new.

---

### ledger-service — `ledger_entries`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| transactionId | UUID | NOT NULL, INDEX | Links the two sides of one transaction |
| walletId | UUID | NOT NULL, INDEX | Which wallet this entry belongs to |
| userId | UUID | NOT NULL | |
| entryType | ENUM | NOT NULL | DEBIT or CREDIT |
| amount | DECIMAL(20,8) | NOT NULL | Always positive |
| currency | VARCHAR(3) | NOT NULL | |
| lockedFxRate | DECIMAL(20,8) | nullable | Exact rate used for FX transfers |
| status | ENUM | NOT NULL | PENDING, POSTED, REVERSED |
| description | TEXT | nullable | |
| hash | VARCHAR(64) | NOT NULL | SHA256 of this entry + previousHash |
| previousHash | VARCHAR(64) | nullable | Hash of previous entry for this wallet |
| createdAt | TIMESTAMP | NOT NULL, INDEX | Immutable — no updatedAt |

**Indexes:** `transactionId`, `walletId`, `createdAt`

**Notes:**
- No `updatedAt` — ledger entries are immutable once written.
- Every transaction creates exactly two rows sharing `transactionId`. Sum of DEBITs must equal sum of CREDITs.
- `hash` chain: `hash = SHA256(id|transactionId|walletId|entryType|amount|currency|createdAt|previousHash)`. Any tampered record breaks the chain at that point.
- `lockedFxRate` records the exact rate used — full audit trail for international transfers.

---

### fx-service — `fx_quotes`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| fromCurrency | VARCHAR(3) | NOT NULL | |
| toCurrency | VARCHAR(3) | NOT NULL | |
| rate | DECIMAL(20,8) | NOT NULL | Locked at quote creation time |
| fromAmount | DECIMAL(20,8) | NOT NULL | |
| toAmount | DECIMAL(20,8) | NOT NULL | Computed: fromAmount × rate |
| userId | UUID | NOT NULL | Who requested the quote |
| expiresAt | TIMESTAMP | NOT NULL | createdAt + 60 seconds |
| usedAt | TIMESTAMP | nullable | Set when consumed — single-use enforcement |
| usedByTransactionId | UUID | nullable | Which transaction consumed this quote |
| status | ENUM | NOT NULL, INDEX | ACTIVE, USED, EXPIRED |
| createdAt | TIMESTAMP | NOT NULL | |

**Indexes:** `status`

**Notes:**
- `expiresAt` is checked at consumption time, not just at query time.
- `usedAt` being non-null means the quote is consumed. Combined with `SELECT FOR UPDATE` this prevents two concurrent requests using the same quote.
- Once a quote is `USED` or `EXPIRED` it is never reactivated.

---

### payroll-service — `payroll_jobs`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| employerId | UUID | NOT NULL, INDEX | Determines which BullMQ queue to use |
| sourceWalletId | UUID | NOT NULL | Employer's funding wallet |
| jobName | VARCHAR | NOT NULL | Human-readable label |
| status | ENUM | NOT NULL | QUEUED, PROCESSING, COMPLETED, FAILED, PARTIAL |
| totalItems | INTEGER | NOT NULL | Total employees to pay |
| processedItems | INTEGER | DEFAULT 0 | Successfully paid so far |
| failedItems | INTEGER | DEFAULT 0 | Failed disbursements |
| checkpoint | INTEGER | DEFAULT 0 | Last successfully processed itemIndex |
| failureReason | TEXT | nullable | |
| createdAt | TIMESTAMP | NOT NULL | |
| updatedAt | TIMESTAMP | NOT NULL | |

**Indexes:** `employerId`

### payroll-service — `payroll_items`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| jobId | UUID | NOT NULL, INDEX | Parent job |
| employeeUserId | UUID | NOT NULL | |
| recipientWalletId | UUID | NOT NULL | |
| amount | DECIMAL(20,8) | NOT NULL | |
| currency | VARCHAR(3) | NOT NULL | |
| status | ENUM | NOT NULL | PENDING, COMPLETED, FAILED |
| transactionId | UUID | nullable | Set on success |
| failureReason | TEXT | nullable | |
| itemIndex | INTEGER | NOT NULL | Position in job — used with checkpoint |

**Indexes:** `jobId`

**Notes:**
- `checkpoint` on `PayrollJob` stores the `itemIndex` of the last successfully processed item. On crash recovery, worker resumes from `checkpoint + 1`.
- Each item is processed with a stable idempotency key `payroll-{jobId}-{itemId}` so transaction-service deduplicates retries.
- BullMQ queue is named `payroll:{employerId}` with `concurrency: 1` — one job at a time per employer, unlimited parallelism across employers.

---

### admin-service — `audit_logs`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| action | VARCHAR | NOT NULL, INDEX | e.g. ADMIN_VIEW_WALLET |
| performedBy | VARCHAR | NOT NULL | Admin token / user identifier |
| metadata | JSONB | nullable | Context-specific data |
| ipAddress | VARCHAR | nullable | Request origin |
| targetId | VARCHAR | nullable, INDEX | ID of the resource being acted on |
| targetType | VARCHAR | nullable | wallet, transaction, etc. |
| createdAt | TIMESTAMP | NOT NULL | Immutable — no updatedAt |

**Indexes:** `action`, `targetId`

**Notes:**
- Immutable — no `updatedAt`. Audit logs are append-only.
- Every admin endpoint writes an audit log entry before returning data.
- Admin token is redacted from logs via pino `redact` config.

---

## Communication Patterns

```
Client
  └── POST /transactions/transfers (with Idempotency-Key header)
        └── transaction-service
              ├── checks idempotency_keys table (Redis + Postgres)
              ├── POST /fx/quote/:id/consume → fx-service (international only)
              ├── PATCH /wallets/:id/balance → account-service (debit sender)
              ├── updates checkpoint = DEBIT_DONE
              ├── PATCH /wallets/:id/balance → account-service (credit recipient)
              ├── updates checkpoint = CREDIT_DONE
              ├── POST /transactions → ledger-service (write double-entry)
              └── updates checkpoint = LEDGER_DONE, status = COMPLETED
```

---

## Observability Stack

| Tool | Port | Purpose |
|---|---|---|
| Prometheus | 9090 | Scrapes /metrics from all 6 services every 15s |
| Grafana | 3000 | Dashboards — throughput, latency p95/p99, invariant violations |
| Jaeger | 16686 | Distributed traces via OpenTelemetry |
| Adminer | 8080 | Database inspection UI |

### Critical alert

`ledger_invariant_violations_total > 0` fires an immediate Grafana alert.
A non-zero value means money has been created or destroyed inside the system.
This must always be zero in a healthy system.