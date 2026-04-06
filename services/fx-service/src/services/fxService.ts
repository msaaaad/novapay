import { FxQuote } from '../models/FxQuote';
import { sequelize } from '../database';
import { Transaction } from 'sequelize';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

const QUOTE_TTL_SECONDS = 60;

async function fetchRateFromProvider(from: string, to: string): Promise<string> {
  if (process.env['FX_PROVIDER_DOWN'] === 'true') {
    throw new Error('FX provider is currently unavailable. Please try again later.');
  }

  const rates: Record<string, number> = {
    'USD-EUR': 0.92, 'EUR-USD': 1.09,
    'USD-GBP': 0.79, 'GBP-USD': 1.27,
    'USD-BDT': 110.5, 'BDT-USD': 0.0091,
    'EUR-GBP': 0.86, 'GBP-EUR': 1.16,
  };

  const key = `${from}-${to}`;
  const rate = rates[key];

  if (!rate) throw new Error(`No rate available for ${from} to ${to}`);

  return rate.toString();
}

export const fxService = {

  async issueQuote(params: {
    fromCurrency: string;
    toCurrency: string;
    fromAmount: string;
    userId: string;
  }): Promise<FxQuote> {
    const rate = await fetchRateFromProvider(params.fromCurrency, params.toCurrency);

    const toAmount = new Decimal(params.fromAmount).mul(rate).toFixed(8);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + QUOTE_TTL_SECONDS * 1000);

    return FxQuote.create({
      id: uuidv4(),
      fromCurrency: params.fromCurrency,
      toCurrency: params.toCurrency,
      rate,
      fromAmount: params.fromAmount,
      toAmount,
      userId: params.userId,
      expiresAt,
      usedAt: null,
      usedByTransactionId: null,
      status: 'ACTIVE',
    });
  },

  async getQuote(quoteId: string): Promise<FxQuote | null> {
    const quote = await FxQuote.findByPk(quoteId);
    if (!quote) return null;

    // Auto-expire in DB if TTL has passed
    if (quote.status === 'ACTIVE' && quote.isExpired()) {
      await quote.update({ status: 'EXPIRED' });
    }

    return quote;
  },

  async consumeQuote(quoteId: string, transactionId: string): Promise<FxQuote> {
    return sequelize.transaction(async (t: Transaction) => {
      const quote = await FxQuote.findByPk(quoteId, {
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!quote) throw new Error(`Quote ${quoteId} not found`);

      if (quote.status === 'USED') {
        throw new Error(`Quote ${quoteId} has already been used by transaction ${quote.usedByTransactionId}`);
      }

      if (quote.status === 'EXPIRED' || quote.isExpired()) {
        await quote.update({ status: 'EXPIRED' }, { transaction: t });
        throw new Error(`Quote ${quoteId} has expired. Please request a new quote.`);
      }

      await quote.update({
        status: 'USED',
        usedAt: new Date(),
        usedByTransactionId: transactionId,
      }, { transaction: t });

      return quote;
    });
  },
};