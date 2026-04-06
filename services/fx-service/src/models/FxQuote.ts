import { Table, Column, Model, DataType, CreatedAt, Index } from 'sequelize-typescript';

export type QuoteStatus = 'ACTIVE' | 'USED' | 'EXPIRED';

@Table({ tableName: 'fx_quotes', timestamps: false })
export class FxQuote extends Model {

  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(3), allowNull: false })
  declare fromCurrency: string;

  @Column({ type: DataType.STRING(3), allowNull: false })
  declare toCurrency: string;

  @Column({ type: DataType.DECIMAL(20, 8), allowNull: false })
  declare rate: string;

  @Column({ type: DataType.DECIMAL(20, 8), allowNull: false })
  declare fromAmount: string;

  @Column({ type: DataType.DECIMAL(20, 8), allowNull: false })
  declare toAmount: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare usedAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true })
  declare usedByTransactionId: string | null;

  @Index
  @Column({
    type: DataType.ENUM('ACTIVE', 'USED', 'EXPIRED'),
    defaultValue: 'ACTIVE',
  })
  declare status: QuoteStatus;

  @CreatedAt
  declare createdAt: Date;

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  secondsRemaining(): number {
    const diff = this.expiresAt.getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  }
}