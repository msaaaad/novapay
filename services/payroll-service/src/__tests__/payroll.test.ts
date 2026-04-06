import request from 'supertest';
import express from 'express';
import { payrollRouter } from '../routes/payroll';
import { payrollService } from '../services/payrollService';

jest.mock('../services/payrollService');

const app = express();
app.use(express.json());
app.use('/', payrollRouter);

const validJob = {
  employerId: '123e4567-e89b-12d3-a456-426614174000',
  sourceWalletId: '123e4567-e89b-12d3-a456-426614174001',
  sourceUserId: '123e4567-e89b-12d3-a456-426614174002',
  jobName: 'April 2026 Payroll',
  items: [
    {
      employeeUserId: '123e4567-e89b-12d3-a456-426614174003',
      recipientWalletId: '123e4567-e89b-12d3-a456-426614174004',
      amount: '5000',
      currency: 'USD',
    },
  ],
};

describe('POST /jobs', () => {
  it('creates a payroll job successfully', async () => {
    (payrollService.createJob as jest.Mock).mockResolvedValue({
      id: 'job-123',
      status: 'QUEUED',
      totalItems: 1,
    });
    const res = await request(app).post('/jobs').send(validJob);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('QUEUED');
  });

  it('returns 400 when items array is empty', async () => {
    const res = await request(app).post('/jobs').send({ ...validJob, items: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /jobs/:jobId', () => {
  it('returns 404 for unknown job', async () => {
    (payrollService.getJob as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/jobs/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns job progress', async () => {
    (payrollService.getJob as jest.Mock).mockResolvedValue({
      id: 'job-123',
      status: 'PROCESSING',
      totalItems: 100,
      processedItems: 45,
      failedItems: 2,
      checkpoint: 45,
    });
    const res = await request(app).get('/jobs/job-123');
    expect(res.status).toBe(200);
    expect(res.body.progress).toBe('45/100');
  });
});