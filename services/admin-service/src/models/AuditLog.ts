import { Table, Column, Model, DataType, CreatedAt, Index } from 'sequelize-typescript';

@Table({ tableName: 'audit_logs', timestamps: false })
export class AuditLog extends Model {

  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Index
  @Column({ type: DataType.STRING, allowNull: false })
  declare action: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare performedBy: string;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare metadata: object | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare ipAddress: string | null;

  @Index
  @Column({ type: DataType.STRING, allowNull: true })
  declare targetId: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare targetType: string | null;

  @CreatedAt
  declare createdAt: Date;
}