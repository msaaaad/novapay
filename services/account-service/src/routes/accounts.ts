// src/routes/accounts.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { accountService } from '../services/accountService';

export const accountsRouter = Router();

const CreateWalletSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  currency: z.string().length(3).optional(),
  accountNumber: z.string().min(1),
});

const UpdateBalanceSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a positive number string'),
  operation: z.enum(['credit', 'debit']),
});

// POST /wallets — create a new wallet
accountsRouter.post('/wallets', async (req: Request, res: Response) => {
  const result = CreateWalletSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }
  try {
    const wallet = await accountService.createWallet({
      userId: result.data.userId,
      currency: result.data.currency,
      accountNumber: result.data.accountNumber,
    })
    res.status(201).json(wallet.toSafeJSON());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /wallets/:walletId — get wallet by ID
accountsRouter.get('/wallets/:walletId', async (req: Request, res: Response) => {
  try {
    const wallet = await accountService.getWalletById(req.params['walletId']!);
    if (!wallet) {
      res.status(404).json({ error: 'Wallet not found' });
      return;
    }
    res.json(wallet.toSafeJSON());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /wallets/user/:userId — get all wallets for a user
accountsRouter.get('/wallets/user/:userId', async (req: Request, res: Response) => {
  try {
    const wallets = await accountService.getWalletsByUserId(req.params['userId']!);
    res.json(wallets.map(w => w.toSafeJSON()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// PATCH /wallets/:walletId/balance — credit or debit
accountsRouter.patch('/wallets/:walletId/balance', async (req: Request, res: Response) => {
  const result = UpdateBalanceSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }
  try {
    const wallet = await accountService.updateBalance({
      walletId: req.params['walletId']!,
      amount: result.data.amount,
      operation: result.data.operation,
    });
    res.json(wallet.toSafeJSON());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Insufficient funds')) {
      res.status(422).json({ error: message });
      return;
    }
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// GET /wallets/:walletId/balance — get just the balance
accountsRouter.get('/wallets/:walletId/balance', async (req: Request, res: Response) => {
  try {
    const balance = await accountService.getBalance(req.params['walletId']!);
    res.json({ balance });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: message });
  }
});