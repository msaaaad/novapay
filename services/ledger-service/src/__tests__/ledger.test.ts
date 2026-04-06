import request from 'supertest';
import express from 'express';
import { ledgerRouter } from '../routes/ledger';
import { ledgerService } from '../services/ledgerService';

jest.mock('../services/ledgerService');

const app = express();
app.use(express.json());
app.use('/', ledgerRouter);

const txId = '123e4567-e89b-12d3-a456-426614174000';
const walletId = '123e4567-e89b-12d3-a456-426614174001';
const userId = '123e4567-e89b-12d3-a456-426614174002';

const validBody = {
  transactionId: txId,
  entries: [
    { walletId, userId, entryType: 'DEBIT', amount: '100', currency: 'USD' },
    { walletId: '123e4567-e89b-12d3-a456-426614174003', userId, entryType: 'CREDIT', amount: '100', currency: 'USD' },
  ],
};

describe('POST /transactions', () => {
  it('posts a valid double-entry transaction', async () => {
    (ledgerService.postTransaction as jest.Mock).mockResolvedValue([{}, {}]);
    const res = await request(app).post('/transactions').send(validBody);
    expect(res.status).toBe(201);
  });

  it('returns 400 if entries array has less than 2 items', async () => {
    const res = await request(app).post('/transactions').send({
      ...validBody,
      entries: [validBody.entries[0]],
    });
    expect(res.status).toBe(400);
  });

  it('returns 422 if invariant is violated', async () => {
    (ledgerService.postTransaction as jest.Mock).mockRejectedValue(
      new Error('Ledger invariant violated')
    );
    const res = await request(app).post('/transactions').send(validBody);
    expect(res.status).toBe(422);
  });
});

describe('GET /transactions/:transactionId/verify', () => {
  it('returns balanced true for a valid transaction', async () => {
    (ledgerService.verifyTransactionInvariant as jest.Mock).mockResolvedValue(true);
    const res = await request(app).get(`/transactions/${txId}/verify`);
    expect(res.status).toBe(200);
    expect(res.body.balanced).toBe(true);
  });
});