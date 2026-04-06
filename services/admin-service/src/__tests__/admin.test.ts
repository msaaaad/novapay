import request from 'supertest';
import express from 'express';
import { adminRouter } from '../routes/admin';
import { adminService } from '../services/adminService';

jest.mock('../services/adminService');

const app = express();
app.use(express.json());
app.use('/', adminRouter);

const walletId = '123e4567-e89b-12d3-a456-426614174000';
const txId = '123e4567-e89b-12d3-a456-426614174001';

describe('Admin auth', () => {
  it('returns 401 without x-admin-token header', async () => {
    const res = await request(app).get(`/wallets/${walletId}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /wallets/:walletId', () => {
  it('returns wallet data with valid token', async () => {
    (adminService.getWallet as jest.Mock).mockResolvedValue({ id: walletId, balance: '100' });
    const res = await request(app)
      .get(`/wallets/${walletId}`)
      .set('x-admin-token', 'admin-user-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(walletId);
  });
});

describe('GET /ledger/verify/:transactionId', () => {
  it('returns balanced true', async () => {
    (adminService.verifyLedger as jest.Mock).mockResolvedValue({ balanced: true });
    const res = await request(app)
      .get(`/ledger/verify/${txId}`)
      .set('x-admin-token', 'admin-user-1');
    expect(res.status).toBe(200);
    expect(res.body.balanced).toBe(true);
  });
});

describe('GET /audit-logs', () => {
  it('returns paginated logs', async () => {
    (adminService.getAuditLogs as jest.Mock).mockResolvedValue({
      logs: [],
      total: 0,
    });
    const res = await request(app)
      .get('/audit-logs')
      .set('x-admin-token', 'admin-user-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
  });
});