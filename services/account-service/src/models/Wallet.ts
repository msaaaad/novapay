// src/models/Wallet.ts
import {
  Table, Column, Model, DataType,
  CreatedAt, UpdatedAt, Default, Unique, Index
} from 'sequelize-typescript';
import { encryptField, decryptField } from '../services/encryptionService';

@Table({
  tableName: 'wallets',
  timestamps: true,
  // version enables optimistic locking:
  // Sequelize adds WHERE version = N to every UPDATE
  // If another request updated it first, version changed → update fails → retry
  version: true,
})
export class Wallet extends Model {

  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  // The user this wallet belongs to
  @Index
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare userId: string;

  // ISO 4217 currency code: USD, EUR, GBP, BDT...
  @Column({
    type: DataType.STRING(3),
    allowNull: false,
    defaultValue: 'USD',
  })
  declare currency: string;

  // DECIMAL(20,8) — never FLOAT for money
  // Stored as string in JS to avoid precision loss
  @Column({
    type: DataType.DECIMAL(20, 8),
    allowNull: false,
    defaultValue: '0.00000000',
  })
  declare balance: string;

  // ──────────────────────────────────────────────
  // ENCRYPTED FIELDS
  // accountNumber is sensitive — stored as ciphertext
  // We store two columns per encrypted field:
  //   accountNumberEncrypted — the ciphertext
  //   accountNumberDataKey   — the encrypted data key
  // ──────────────────────────────────────────────
  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare accountNumberEncrypted: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare accountNumberDataKey: string;

  // Virtual field — not stored in DB
  // Reading wallet.accountNumber auto-decrypts
  // Setting wallet.accountNumber auto-encrypts
  get accountNumber(): string | null {
    if (!this.accountNumberEncrypted || !this.accountNumberDataKey) return null;
    return decryptField({
      encryptedData: this.accountNumberEncrypted,
      encryptedDataKey: this.accountNumberDataKey,
    });
  }

  set accountNumber(value: string) {
    const envelope = encryptField(value);
    this.accountNumberEncrypted = envelope.encryptedData;
    this.accountNumberDataKey = envelope.encryptedDataKey;
  }

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare isActive: boolean;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  // Safe representation for API responses
  // Never exposes encrypted columns or data keys
  toSafeJSON() {
    return {
      id: this.id,
      userId: this.userId,
      currency: this.currency,
      balance: this.balance,
      accountNumber: this.accountNumber,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}