# Architecture & Design Decisions

## Architecture Choice: Microservices

Each service owns its data, has its own PostgreSQL database, and communicates
over HTTP through the nginx API gateway. No shared databases. This enforces
clear boundaries and means one service failing does not corrupt another's data.

---

## Problem 1: Idempotency — All 5 Scenarios

### How it works
Every disbursement request must include an `Idempotency-Key` header.
The key is stored in the `idempotency_keys` table with:
- A SHA256 hash of the request payload
- A status: `PROCESSING`, `COMPLETED`, or `FAILED`
- An expiry timestamp (24 hours from creation)
- The cached response body once completed

We use `SELECT FOR UPDATE` inside a transaction when checking or creating a key.
This means only one request wins at the database level — all others either
see the existing record or wait.

### Scenario A — Same key arrives twice, second is discarded
The second request finds an existing record with status `COMPLETED`.
It returns the cached response immediately. No second debit occurs.
The sender's account is charged exactly once.

### Scenario B — Three identical requests arrive within 100ms
All three hit the database simultaneously. Only one INSERT succeeds due to
the UNIQUE constraint on the `key` column. The winning request sets status
to `PROCESSING`. The two losing requests find the record with status
`PROCESSING` and receive a 202-style response:
`{ "status": "PROCESSING", "message": "Transaction is already being processed" }`.
At the database level, the two losers' INSERT attempts fail silently on conflict
and they read the existing row instead.

### Scenario C — Sender debited, server crashes before recipient credited
Every transaction record has a `checkpoint` column that tracks progress:
- `INITIATED` — nothing done yet
- `DEBIT_DONE` — sender debited, recipient not yet credited
- `CREDIT_DONE` — both wallets updated, ledger not yet written
- `LEDGER_DONE` — fully complete

On every service startup, `recoveryService.recoverIncompleteTransactions()`
runs and finds all `PENDING` transactions older than 5 minutes.

- If checkpoint is `INITIATED` → mark `FAILED`, nothing to reverse
- If checkpoint is `DEBIT_DONE` → reverse the debit by re-crediting the sender,
  mark `REVERSED`
- If checkpoint is `CREDIT_DONE` → write the missing ledger entries,
  mark `COMPLETED`

This guarantees the ledger is never left unbalanced after a crash.

### Scenario D — Key expires after 24 hours, client retries with same key
The `expiresAt` column is checked on every lookup. If the key is older than
24 hours, the old record is deleted and the request is treated as a completely
new transaction. The client's bug causes a legitimate second disbursement —
which is the correct behaviour since the original was so long ago it cannot
be considered a duplicate.

### Scenario E — Client sends key-abc for $500, then key-abc for $800
When a key already exists, we compare the SHA256 hash of the current request
payload against the stored `payloadHash`. If they differ, we return:
HTTP 409 Conflict
{
"error": "Idempotency key conflict: key 'key-abc' was previously used
with a different payload. Original amount differs from current request."
}

No money moves. The client must either use a new key or retry with the
original payload.

---

## Problem 2: Bulk Payroll Queue

### Why concurrency: 1 per employer queue beats locking

**Option 1 — DB row lock (SELECT FOR UPDATE per item):**
With 14,000 credits, each item acquires and releases a row lock on the source
account. Under load this creates lock contention, connection pool exhaustion,
and timeouts. The database becomes the bottleneck.

**Option 2 — Single global worker (concurrency: 1):**
Serialises all employers. Employer B's 14,000-item job waits for Employer A
to finish before starting. At year-end with 200 concurrent employers this is
completely unacceptable.

**Our approach — one BullMQ queue per employer, concurrency: 1:**
Each employer gets a queue named `payroll:{employerId}`. Within that queue
exactly one job runs at a time, so there is never a race condition on the
source account. Different employers run fully in parallel. The source account
is only ever debited sequentially for a given employer.

Each payroll item also uses a stable idempotency key
(`payroll-{jobId}-{itemId}`) when calling the transaction service, so if the
worker crashes and retries, the transaction service deduplicates and no
employee is paid twice.

### Resumability checkpoint pattern
The `PayrollJob` model has a `checkpoint` integer storing the `itemIndex`
of the last successfully processed item. On each iteration:
1. Process item
2. Update `checkpoint` to this item's index
3. Move to next item

If the service crashes at item 5,000 of 14,000, on restart the worker
queries for `PENDING` items with `itemIndex > checkpoint`. It skips items
1–5,000 and resumes from 5,001. No employee is paid twice.

---

## Problem 3: FX Rate Locking

### Quote lifecycle
1. Client calls `POST /fx/quote` with currencies and amount
2. FX service fetches live rate from provider
3. A `FxQuote` record is created with:
   - The locked rate
   - `expiresAt = now + 60 seconds`
   - `status = ACTIVE`
   - `usedAt = null`
4. Client receives the quote ID and `secondsRemaining`
5. Client must call `POST /transactions/transfers` with the `fxQuoteId`
   within 60 seconds
6. Transaction service calls `POST /fx/quote/{id}/consume`
7. FX service checks — not expired, not already used — then marks `USED`
8. The locked rate is recorded on every ledger entry for full auditability

### Expiry enforcement
Checked at consumption time using `expiresAt < now()`. If expired:
- Quote status updated to `EXPIRED`
- HTTP 410 Gone returned
- Client must request a new quote

### Single-use enforcement
`SELECT FOR UPDATE` on the quote row before marking used. If two requests
try to consume the same quote simultaneously, only one gets the lock. The
second sees `status = USED` and is rejected with HTTP 409.

### Provider failure
If the FX provider is unavailable, `fetchRateFromProvider` throws immediately.
We never silently apply a cached or stale rate. The client receives:
HTTP 503 Service Unavailable
{ "error": "FX provider is currently unavailable. Please try again later." }
International transfers are blocked until the provider recovers.

---

## Problem 4: Field-Level Encryption

### Envelope encryption (two-key hierarchy)
We use AES-256-GCM authenticated encryption with a two-key hierarchy:

**Master Key** — stored in the `ENCRYPTION_MASTER_KEY` environment variable.
Never stored in the database. Rotated at the infrastructure level.

**Data Key** — a unique random 256-bit key generated per field value.
Encrypts the actual sensitive value. The data key itself is encrypted with
the master key and stored alongside the ciphertext.

**Storage format per encrypted field (two DB columns):**
- `accountNumberEncrypted` — AES-256-GCM ciphertext of the value
- `accountNumberDataKey` — AES-256-GCM ciphertext of the data key

**Why two keys?**
Key rotation only requires re-encrypting the small data key per record,
not re-encrypting all the data. This makes rotation feasible at scale.

**GCM mode** provides authenticated encryption — any tampering with the
ciphertext is detected when decrypting.

---

## Double-Entry Invariant

Every money movement writes exactly two ledger entries sharing a `transactionId`:
- One `DEBIT` from the source wallet
- One `CREDIT` to the destination wallet
- Both for the same amount

Before writing, we verify: `sum(DEBIT amounts) === sum(CREDIT amounts)`.
If they don't match, we increment the `ledger_invariant_violations_total`
Prometheus counter and throw an error. Grafana fires an immediate alert if
this counter ever exceeds zero.

The `GET /transactions/:id/verify` endpoint re-checks the invariant on demand.

---

## Audit Hash Chain

Each `LedgerEntry` contains:
- `hash` — SHA256 of its own fields plus the previous entry's hash
- `previousHash` — the hash of the chronologically previous entry for
  the same wallet (null for the first entry — the genesis)

This forms a tamper-evident chain. To verify: walk all entries for a wallet
in order, recompute each hash, compare against stored hash. If any mismatch
is found, that entry was tampered with and we return the `id` of the
corrupted record.

---

## Tradeoffs Made Under Time Pressure

1. **No real FX provider** — rates are hardcoded. In production this would
   call Open Exchange Rates or similar with fallback providers.

2. **Simple admin auth** — `x-admin-token` header with no expiry. In
   production this would be JWT with role-based access control.

3. **`sequelize.sync({ alter: true })`** — used instead of proper migrations.
   Safe for development, not for production where you need versioned,
   reversible migration files.

4. **Recovery runs on startup** — the recovery service scans for stuck
   transactions every time the service starts. In production this would
   be a separate scheduled job running continuously.

5. **In-memory worker registry** — payroll workers are stored in a `Map`
   in memory. If the service restarts, the map is empty and workers are
   recreated on the next job. This is fine for this scale but in production
   you would persist worker state.

---

## What I Would Add Before Production

1. **Database migrations** using `sequelize-cli` or `db-migrate` — versioned,
   reversible, safe for production deploys
2. **JWT authentication** with refresh tokens and role-based access control
3. **Rate limiting** on all public endpoints via nginx or a dedicated middleware
4. **Dead letter queues** in BullMQ for failed payroll jobs with alerting
5. **Real FX provider integration** with multiple fallback providers
6. **Secrets management** via HashiCorp Vault or AWS Secrets Manager instead
   of environment variables
7. **Integration test suite** running against real Docker containers
8. **Database read replicas** for ledger history queries to keep writes fast
9. **Distributed locking** via Redis Redlock for the recovery service to
   prevent multiple instances running recovery simultaneously
10. **gRPC** between services instead of HTTP for lower latency on the
    critical transfer path
