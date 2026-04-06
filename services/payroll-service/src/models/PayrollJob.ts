import { Table, Column, Model, DataType, CreatedAt, UpdatedAt, Index } from 'sequelize-typescript';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

@Table({ tableName: 'payroll_jobs', timestamps: true })
export class PayrollJob extends Model {

  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare employerId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare sourceWalletId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare jobName: string;

  @Column({
    type: DataType.ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL'),
    defaultValue: 'QUEUED',
  })
  declare status: JobStatus;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare totalItems: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare processedItems: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare failedItems: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare checkpoint: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare failureReason: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}