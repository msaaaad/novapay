import request from 'supertest';
import express from 'express';
import { accountsRouter } from '../routes/accounts';
import { accountService } from '../services/accountService';

// Mock the service so tests don't need a real DB
jest.mock('../services/accountService');

const app = express();
app.use(express.json());
app.use('/', accountsRouter);

const mockWallet = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: '123e4567-e89b-12d3-a456-426614174001',
  currency: 'USD',
  balance: '100.00000000',
  accountNumber: 'ACC-001',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('POST /wallets', () => {
  it('creates a wallet with valid input', async () => {
    (accountService.createWallet as jest.Mock).mockResolvedValue({
      toSafeJSON: () => mockWallet,
    });
    const res = await request(app).post('/wallets').send({
      userId: '123e4567-e89b-12d3-a456-426614174001',
      currency: 'USD',
      accountNumber: 'ACC-001',
    });
    expect(res.status).toBe(201);
    expect(res.body.currency).toBe('USD');
  });

  it('returns 400 for invalid userId', async () => {
    const res = await request(app).post('/wallets').send({
      userId: 'not-a-uuid',
      accountNumber: 'ACC-001',
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /wallets/:walletId/balance', () => {
  it('returns 422 for insufficient funds', async () => {
    (accountService.updateBalance as jest.Mock).mockRejectedValue(
      new Error('Insufficient funds. Balance: 10, Required: 100')
    );
    const res = await request(app)
      .patch(`/wallets/${mockWallet.id}/balance`)
      .send({ amount: '100', operation: 'debit' });
    expect(res.status).toBe(422);
  });

  it('returns 400 for invalid operation', async () => {
    const res = await request(app)
      .patch(`/wallets/${mockWallet.id}/balance`)
      .send({ amount: '100', operation: 'invalid' });
    expect(res.status).toBe(400);
  });
});