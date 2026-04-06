import { Table, Column, Model, DataType, Index } from 'sequelize-typescript';

export type ItemStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

@Table({ tableName: 'payroll_items', timestamps: false })
export class PayrollItem extends Model {

  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare jobId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare employeeUserId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare recipientWalletId: string;

  @Column({ type: DataType.DECIMAL(20, 8), allowNull: false })
  declare amount: string;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'USD' })
  declare currency: string;

  @Column({
    type: DataType.ENUM('PENDING', 'COMPLETED', 'FAILED'),
    defaultValue: 'PENDING',
  })
  declare status: ItemStatus;

  @Column({ type: DataType.UUID, allowNull: true })
  declare transactionId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare failureReason: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare itemIndex: number;
}