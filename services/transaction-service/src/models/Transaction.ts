import { Table, Column, Model, DataType, CreatedAt, UpdatedAt, Index } from 'sequelize-typescript';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
export type TransactionType = 'TRANSFER' | 'INTERNATIONAL_TRANSFER' | 'DISBURSEMENT';

@Table({ tableName: 'transactions', timestamps: true, version: true })
export class Transaction extends Model {

  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare senderWalletId: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare recipientWalletId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare senderUserId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare recipientUserId: string;

  @Column({ type: DataType.DECIMAL(20, 8), allowNull: false })
  declare amount: string;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'USD' })
  declare currency: string;

  @Column({
    type: DataType.ENUM('TRANSFER', 'INTERNATIONAL_TRANSFER', 'DISBURSEMENT'),
    defaultValue: 'TRANSFER',
  })
  declare type: TransactionType;

  @Index
  @Column({
    type: DataType.ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'),
    defaultValue: 'PENDING',
  })
  declare status: TransactionStatus;

  @Column({
    type: DataType.ENUM('INITIATED', 'DEBIT_DONE', 'CREDIT_DONE', 'LEDGER_DONE'),
    defaultValue: 'INITIATED',
  })
  declare checkpoint: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare fxQuoteId: string | null;

  @Column({ type: DataType.DECIMAL(20, 8), allowNull: true })
  declare fxRate: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare failureReason: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}