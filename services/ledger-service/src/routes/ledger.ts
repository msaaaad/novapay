import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ledgerService } from '../services/ledgerService';

export const ledgerRouter = Router();

const EntrySchema = z.object({
  walletId: z.string().uuid(),
  userId: z.string().uuid(),
  entryType: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().length(3),
  lockedFxRate: z.string().optional(),
  description: z.string().optional(),
});

const PostTransactionSchema = z.object({
  transactionId: z.string().uuid(),
  entries: z.array(EntrySchema).min(2),
});

// POST /transactions — write a double-entry pair
ledgerRouter.post('/transactions', async (req: Request, res: Response) => {
  const result = PostTransactionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }
  try {
    const entries = await ledgerService.postTransaction(result.data);
    res.status(201).json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('invariant')) {
      res.status(422).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// GET /transactions/:transactionId — get both sides of a transaction
ledgerRouter.get('/transactions/:transactionId', async (req: Request, res: Response) => {
  try {
    const entries = await ledgerService.getEntriesByTransaction(req.params['transactionId']!);
    res.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /wallets/:walletId/entries — paginated history
ledgerRouter.get('/wallets/:walletId/entries', async (req: Request, res: Response) => {
  const limit = parseInt(req.query['limit'] as string ?? '50');
  const offset = parseInt(req.query['offset'] as string ?? '0');
  try {
    const result = await ledgerService.getEntriesByWallet(req.params['walletId']!, limit, offset);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /transactions/:transactionId/verify — check invariant
ledgerRouter.get('/transactions/:transactionId/verify', async (req: Request, res: Response) => {
  try {
    const balanced = await ledgerService.verifyTransactionInvariant(req.params['transactionId']!);
    res.json({ balanced });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /wallets/:walletId/chain — verify audit hash chain
ledgerRouter.get('/wallets/:walletId/chain', async (req: Request, res: Response) => {
  try {
    const result = await ledgerService.verifyHashChain(req.params['walletId']!);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});