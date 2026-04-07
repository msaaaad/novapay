## Data Models

### account-service — wallets
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| userId | UUID | NOT NULL, INDEX |
| currency | VARCHAR(3) | NOT NULL, DEFAULT 'USD' |
| balance | DECIMAL(20,8) | NOT NULL, DEFAULT 0 |
| accountNumberEncrypted | TEXT | encrypted |
| accountNumberDataKey | TEXT | envelope key |
| isActive | BOOLEAN | DEFAULT true |
| version | INTEGER | optimistic lock |