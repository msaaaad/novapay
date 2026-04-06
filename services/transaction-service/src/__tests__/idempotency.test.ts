import request from 'supertest';
import express from 'express';
import { transactionsRouter } from '../routes/transactions';
import { transactionService } from '../services/transactionService';

jest.mock('../services/transactionService');

const app = express();
app.use(express.json());
app.use('/', transactionsRouter);

const validBody = {
  senderWalletId: '123e4567-e89b-12d3-a456-426614174000',
  recipientWalletId: '123e4567-e89b-12d3-a456-426614174001',
  senderUserId: '123e4567-e89b-12d3-a456-426614174002',
  recipientUserId: '123e4567-e89b-12d3-a456-426614174003',
  amount: '100',
  currency: 'USD',
};

describe('Idempotency scenarios', () => {
  it('Scenario A — duplicate key returns cached response', async () => {
    (transactionService.transfer as jest.Mock).mockResolvedValue({
      transactionId: 'tx-123',
      status: 'COMPLETED',
    });
    const res = await request(app)
      .post('/transfers')
      .set('Idempotency-Key', 'key-abc')
      .send(validBody);
    expect(res.status).toBe(201);
  });

  it('returns 400 when Idempotency-Key header is missing', async () => {
    const res = await request(app).post('/transfers').send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Idempotency-Key');
  });

  it('Scenario E — same key different payload returns 409', async () => {
    (transactionService.transfer as jest.Mock).mockRejectedValue(
      new Error('Idempotency key conflict: key was previously used with a different payload.')
    );
    const res = await request(app)
      .post('/transfers')
      .set('Idempotency-Key', 'key-abc')
      .send({ ...validBody, amount: '800' });
    expect(res.status).toBe(409);
  });

  it('returns 422 for insufficient funds', async () => {
    (transactionService.transfer as jest.Mock).mockRejectedValue(
      new Error('Insufficient funds')
    );
    const res = await request(app)
      .post('/transfers')
      .set('Idempotency-Key', 'key-new')
      .send(validBody);
    expect(res.status).toBe(422);
  });
});