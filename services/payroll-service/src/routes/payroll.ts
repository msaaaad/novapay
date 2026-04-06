import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { payrollService } from '../services/payrollService';

export const payrollRouter = Router();

const PayrollItemSchema = z.object({
  employeeUserId: z.string().uuid(),
  recipientWalletId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().length(3).optional(),
});

const CreateJobSchema = z.object({
  employerId: z.string().uuid(),
  sourceWalletId: z.string().uuid(),
  sourceUserId: z.string().uuid(),
  jobName: z.string().min(1),
  items: z.array(PayrollItemSchema).min(1),
});

payrollRouter.post('/jobs', async (req: Request, res: Response) => {
  const result = CreateJobSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }
  try {
    const job = await payrollService.createJob(result.data);
    res.status(201).json({
      jobId: job.id,
      status: job.status,
      totalItems: job.totalItems,
      message: 'Payroll job queued successfully',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

payrollRouter.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const job = await payrollService.getJob(req.params['jobId']!);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({
      jobId: job.id,
      status: job.status,
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      failedItems: job.failedItems,
      checkpoint: job.checkpoint,
      progress: `${job.processedItems}/${job.totalItems}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

payrollRouter.get('/jobs/:jobId/items', async (req: Request, res: Response) => {
  try {
    const items = await payrollService.getJobItems(req.params['jobId']!);
    res.json(items);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

payrollRouter.get('/employers/:employerId/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await payrollService.getEmployerJobs(req.params['employerId']!);
    res.json(jobs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});