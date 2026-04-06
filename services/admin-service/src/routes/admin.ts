import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { adminService } from '../services/adminService';

export const adminRouter = Router();

function requireAdminAuth(req: Request, res: Response): string | null {
  const token = req.headers['x-admin-token'] as string;
  if (!token) {
    res.status(401).json({ error: 'x-admin-token header required' });
    return null;
  }
  return token;
}

adminRouter.get('/wallets/:walletId', async (req: Request, res: Response) => {
  const performedBy = requireAdminAuth(req, res);
  if (!performedBy) return;
  try {
    const data = await adminService.getWallet(
      req.params['walletId']!,
      performedBy,
      req.ip ?? 'unknown'
    );
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

adminRouter.get('/transactions/:transactionId', async (req: Request, res: Response) => {
  const performedBy = requireAdminAuth(req, res);
  if (!performedBy) return;
  try {
    const data = await adminService.getTransaction(
      req.params['transactionId']!,
      performedBy,
      req.ip ?? 'unknown'
    );
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

adminRouter.get('/ledger/verify/:transactionId', async (req: Request, res: Response) => {
  const performedBy = requireAdminAuth(req, res);
  if (!performedBy) return;
  try {
    const data = await adminService.verifyLedger(
      req.params['transactionId']!,
      performedBy,
      req.ip ?? 'unknown'
    );
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

adminRouter.get('/ledger/chain/:walletId', async (req: Request, res: Response) => {
  const performedBy = requireAdminAuth(req, res);
  if (!performedBy) return;
  try {
    const data = await adminService.verifyHashChain(
      req.params['walletId']!,
      performedBy,
      req.ip ?? 'unknown'
    );
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

adminRouter.get('/ledger/entries/:walletId', async (req: Request, res: Response) => {
  const performedBy = requireAdminAuth(req, res);
  if (!performedBy) return;
  try {
    const data = await adminService.getLedgerEntries(
      req.params['walletId']!,
      performedBy,
      req.ip ?? 'unknown'
    );
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

adminRouter.get('/audit-logs', async (req: Request, res: Response) => {
  const performedBy = requireAdminAuth(req, res);
  if (!performedBy) return;
  const limit = parseInt(req.query['limit'] as string ?? '50');
  const offset = parseInt(req.query['offset'] as string ?? '0');
  try {
    const result = await adminService.getAuditLogs(limit, offset);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});