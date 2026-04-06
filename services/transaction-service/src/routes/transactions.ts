import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { transactionService } from '../services/transactionService';

export const transactionsRouter = Router();

const TransferSchema = z.object({
  senderWalletId: z.string().uuid(),
  recipientWalletId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().length(3),
  description: z.string().optional(),
  fxQuoteId: z.string().uuid().optional(),
});

transactionsRouter.post('/transfers', async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) {
    res.status(400).json({ error: 'Idempotency-Key header is required' });
    return;
  }

  const result = TransferSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }

  try {
    const response = await transactionService.transfer({
      idempotencyKey,
      ...result.data,
    });
    res.status(201).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Idempotency key conflict')) {
      res.status(409).json({ error: message });
      return;
    }
    if (message.includes('Insufficient funds')) {
      res.status(422).json({ error: message });
      return;
    }
    if (message.includes('expired')) {
      res.status(410).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

transactionsRouter.get('/transfers/:transactionId', async (req: Request, res: Response) => {
  try {
    const tx = await transactionService.getTransaction(req.params['transactionId']!);
    if (!tx) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json(tx);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});