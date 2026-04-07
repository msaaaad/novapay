import '../tracing';
import { sequelize } from '../database';
import { LedgerEntry, EntryType } from '../models/LedgerEntry';
import { Transaction, Op } from 'sequelize';
import Decimal from 'decimal.js';
import * as crypto from 'crypto';
import { metrics } from '../middleware/metrics';

export interface LedgerEntryInput {
  walletId: string;
  userId: string;
  entryType: EntryType;
  amount: string;
  currency: string;
  lockedFxRate?: string;
  description?: string;
}

export interface PostTransactionInput {
  transactionId: string;
  entries: LedgerEntryInput[];
}

function computeHash(entry: Partial<LedgerEntry> & { previousHash: string | null }): string {
  const data = [
    entry.id,
    entry.transactionId,
    entry.walletId,
    entry.entryType,
    entry.amount,
    entry.currency,
    entry.createdAt?.toISOString(),
    entry.previousHash ?? 'GENESIS',
  ].join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function getLastHash(walletId: string): Promise<string | null> {
  const last = await LedgerEntry.findOne({
    where: { walletId },
    order: [['createdAt', 'DESC']],
    attributes: ['hash'],
  });
  return last?.hash ?? null;
}

export const ledgerService = {

  async postTransaction(input: PostTransactionInput): Promise<LedgerEntry[]> {
    const debits = input.entries.filter(e => e.entryType === 'DEBIT');
    const credits = input.entries.filter(e => e.entryType === 'CREDIT');

    if (debits.length === 0 || credits.length === 0) {
      throw new Error('Transaction must have at least one DEBIT and one CREDIT entry');
    }

    // Verify double-entry invariant BEFORE writing
    const totalDebits = debits.reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
    const totalCredits = credits.reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

    if (!totalDebits.equals(totalCredits)) {
      metrics.ledgerInvariantViolations.inc();
      throw new Error(
        `Ledger invariant violated: debits ${totalDebits} !== credits ${totalCredits}`
      );
    }

    return sequelize.transaction(async (t: Transaction) => {
      const now = new Date();
      const saved: LedgerEntry[] = [];

      for (const entry of input.entries) {
        const id = crypto.randomUUID();
        const previousHash = await getLastHash(entry.walletId);

        const partial = {
          id,
          transactionId: input.transactionId,
          walletId: entry.walletId,
          entryType: entry.entryType,
          amount: entry.amount,
          currency: entry.currency,
          createdAt: now,
          previousHash,
        };

        const hash = computeHash(partial);

        const saved_entry = await LedgerEntry.create({
          ...partial,
          userId: entry.userId,
          lockedFxRate: entry.lockedFxRate ?? null,
          description: entry.description ?? null,
          status: 'POSTED',
          hash,
        }, { transaction: t });

        saved.push(saved_entry);
      }

      return saved;
    });
  },

  async getEntriesByTransaction(transactionId: string): Promise<LedgerEntry[]> {
    return LedgerEntry.findAll({ where: { transactionId } });
  },

  async getEntriesByWallet(
    walletId: string,
    limit = 50,
    offset = 0
  ): Promise<{ entries: LedgerEntry[]; total: number }> {
    const { rows, count } = await LedgerEntry.findAndCountAll({
      where: { walletId, status: 'POSTED' },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    return { entries: rows, total: count };
  },

  async verifyTransactionInvariant(transactionId: string): Promise<boolean> {
    const entries = await LedgerEntry.findAll({ where: { transactionId } });

    const totalDebits = entries
      .filter(e => e.entryType === 'DEBIT')
      .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

    const totalCredits = entries
      .filter(e => e.entryType === 'CREDIT')
      .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

    const balanced = totalDebits.equals(totalCredits);

    if (!balanced) metrics.ledgerInvariantViolations.inc();

    return balanced;
  },

  async verifyHashChain(walletId: string): Promise<{ valid: boolean; tamperedAt?: string }> {
    const entries = await LedgerEntry.findAll({
      where: { walletId },
      order: [['createdAt', 'ASC']],
    });

    for (const entry of entries) {
      const expected = computeHash({
        id: entry.id,
        transactionId: entry.transactionId,
        walletId: entry.walletId,
        entryType: entry.entryType,
        amount: entry.amount,
        currency: entry.currency,
        createdAt: entry.createdAt,
        previousHash: entry.previousHash,
      });

      if (expected !== entry.hash) {
        return { valid: false, tamperedAt: entry.id };
      }
    }

    return { valid: true };
  },
};