// src/database.ts
import { Sequelize } from 'sequelize-typescript';
import { Wallet } from './models/Wallet';
import path from 'path';

const databaseUrl = process.env['DATABASE_URL'];

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  models: [Wallet],
  logging: false, // SQL queries would pollute structured logs — disable
  pool: {
    max: 10,    // max 10 simultaneous DB connections
    min: 2,     // keep 2 warm at all times
    acquire: 30000, // wait up to 30s to get a connection before erroring
    idle: 10000,    // release a connection after 10s of inactivity
  },
});

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  // sync({ alter: true }) updates table columns if model changes
  // In production you'd use migrations — fine for assessment
  await sequelize.sync({ alter: true });
}