import request from 'supertest';
import express from 'express';
import { fxRouter } from '../routes/fx';
import { fxService } from '../services/fxService';

jest.mock('../services/fxService');

const app = express();
app.use(express.json());
app.use('/', fxRouter);

const mockQuote = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  rate: '0.92000000',
  fromAmount: '2000.00000000',
  toAmount: '1840.00000000',
  expiresAt: new Date(Date.now() + 60000),
  secondsRemaining: () => 55,
  status: 'ACTIVE',
  usedAt: null,
};

describe('POST /quote', () => {
  it('issues a quote successfully', async () => {
    (fxService.issueQuote as jest.Mock).mockResolvedValue(mockQuote);
    const res = await request(app).post('/quote').send({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      fromAmount: '2000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
    });
    expect(res.status).toBe(201);
    expect(res.body.rate).toBe('0.92000000');
    expect(res.body.secondsRemaining).toBe(55);
  });

  it('returns 503 when FX provider is down', async () => {
    (fxService.issueQuote as jest.Mock).mockRejectedValue(
      new Error('FX provider is currently unavailable. Please try again later.')
    );
    const res = await request(app).post('/quote').send({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      fromAmount: '2000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
    });
    expect(res.status).toBe(503);
  });
});

describe('POST /quote/:id/consume', () => {
  it('returns 409 when quote already used', async () => {
    (fxService.consumeQuote as jest.Mock).mockRejectedValue(
      new Error('already been used')
    );
    const res = await request(app)
      .post(`/quote/${mockQuote.id}/consume`)
      .send({ transactionId: '123e4567-e89b-12d3-a456-426614174002' });
    expect(res.status).toBe(409);
  });

  it('returns 410 when quote expired', async () => {
    (fxService.consumeQuote as jest.Mock).mockRejectedValue(
      new Error('expired. Please request a new quote.')
    );
    const res = await request(app)
      .post(`/quote/${mockQuote.id}/consume`)
      .send({ transactionId: '123e4567-e89b-12d3-a456-426614174002' });
    expect(res.status).toBe(410);
  });
});