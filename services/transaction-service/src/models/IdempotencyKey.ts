import { Table, Column, Model, DataType, CreatedAt, Index } from 'sequelize-typescript';

export type IdempotencyStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

@Table({ tableName: 'idempotency_keys', timestamps: false })
export class IdempotencyKey extends Model {

  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Index({ unique: true })
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  declare key: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare payloadHash: string;

  @Column({
    type: DataType.ENUM('PROCESSING', 'COMPLETED', 'FAILED'),
    defaultValue: 'PROCESSING',
  })
  declare status: IdempotencyStatus;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare responseBody: object | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare responseStatus: number | null;

  @Column({ type: DataType.UUID, allowNull: true })
  declare transactionId: string | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;

  @CreatedAt
  declare createdAt: Date;
}