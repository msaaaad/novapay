import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { fxService } from '../services/fxService';

export const fxRouter = Router();

const IssueQuoteSchema = z.object({
  fromCurrency: z.string().length(3),
  toCurrency: z.string().length(3),
  fromAmount: z.string().regex(/^\d+(\.\d+)?$/),
  userId: z.string().uuid(),
});

const ConsumeQuoteSchema = z.object({
  transactionId: z.string().uuid(),
});

// POST /quote — issue a new locked rate quote
fxRouter.post('/quote', async (req: Request, res: Response) => {
  const result = IssueQuoteSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }
  try {
    const quote = await fxService.issueQuote(result.data);
    res.status(201).json({
      id: quote.id,
      fromCurrency: quote.fromCurrency,
      toCurrency: quote.toCurrency,
      rate: quote.rate,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      expiresAt: quote.expiresAt,
      secondsRemaining: quote.secondsRemaining(),
      status: quote.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('unavailable')) {
      res.status(503).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

// GET /quote/:id — check quote validity and time remaining
fxRouter.get('/quote/:id', async (req: Request, res: Response) => {
  try {
    const quote = await fxService.getQuote(req.params['id']!);
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    res.json({
      id: quote.id,
      fromCurrency: quote.fromCurrency,
      toCurrency: quote.toCurrency,
      rate: quote.rate,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      expiresAt: quote.expiresAt,
      secondsRemaining: quote.secondsRemaining(),
      status: quote.status,
      usedAt: quote.usedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /quote/:id/consume — mark quote as used (called by transaction-service)
fxRouter.post('/quote/:id/consume', async (req: Request, res: Response) => {
  const result = ConsumeQuoteSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    return;
  }
  try {
    const quote = await fxService.consumeQuote(req.params['id']!, result.data.transactionId);
    res.json({
      id: quote.id,
      rate: quote.rate,
      toAmount: quote.toAmount,
      usedAt: quote.usedAt,
      usedByTransactionId: quote.usedByTransactionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('already been used')) {
      res.status(409).json({ error: message });
      return;
    }
    if (message.includes('expired')) {
      res.status(410).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});