import { Sequelize } from 'sequelize-typescript';
import { AuditLog } from './models/AuditLog';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  models: [AuditLog],
  logging: false,
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
});

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
}