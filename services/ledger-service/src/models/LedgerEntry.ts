import {
  Table, Column, Model, DataType,
  CreatedAt, Index
} from 'sequelize-typescript';

export type EntryType = 'DEBIT' | 'CREDIT';
export type EntryStatus = 'PENDING' | 'POSTED' | 'REVERSED';

@Table({ tableName: 'ledger_entries', timestamps: false, updatedAt: false })
export class LedgerEntry extends Model {

  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  // Links the two sides of one transaction together
  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare transactionId: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare walletId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.ENUM('DEBIT', 'CREDIT'), allowNull: false })
  declare entryType: EntryType;

  @Column({ type: DataType.DECIMAL(20, 8), allowNull: false })
  declare amount: string;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'USD' })
  declare currency: string;

  // For FX transfers — records the exact locked rate used
  @Column({ type: DataType.DECIMAL(20, 8), allowNull: true })
  declare lockedFxRate: string | null;

  @Column({ type: DataType.ENUM('PENDING', 'POSTED', 'REVERSED'), defaultValue: 'POSTED' })
  declare status: EntryStatus;

  @Column({ type: DataType.STRING, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare hash: string;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare previousHash: string | null;

  @Index
  @CreatedAt
  declare createdAt: Date;
}