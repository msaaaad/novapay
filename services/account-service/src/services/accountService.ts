// src/services/accountService.ts
import { Wallet } from '../models/Wallet';
import { sequelize } from '../database';
import { v4 as uuidv4 } from 'uuid';

export interface CreateWalletInput {
  userId: string;
  currency?: string;
  accountNumber: string;
}

export interface UpdateBalanceInput {
  walletId: string;
  amount: string;      // positive = credit, negative = debit
  operation: 'credit' | 'debit';
}

export const accountService = {

  async createWallet(input: CreateWalletInput): Promise<Wallet> {
    const wallet = await Wallet.create({
      id: uuidv4(),
      userId: input.userId,
      currency: input.currency ?? 'USD',
      balance: '0.00000000',
      isActive: true,
    });
    // Uses the setter — triggers encryption automatically
    wallet.accountNumber = input.accountNumber;
    await wallet.save();
    return wallet;
  },

  async getWalletById(walletId: string): Promise<Wallet | null> {
    return Wallet.findByPk(walletId);
  },

  async getWalletsByUserId(userId: string): Promise<Wallet[]> {
    return Wallet.findAll({ where: { userId, isActive: true } });
  },

  // ──────────────────────────────────────────────
  // CRITICAL: balance update uses a DB transaction
  // with SELECT FOR UPDATE to lock the row.
  // This prevents two concurrent debits from both
  // reading the same balance and both succeeding
  // when only one should (the original NovaPay bug).
  // ──────────────────────────────────────────────
  async updateBalance(input: UpdateBalanceInput): Promise<Wallet> {
    return sequelize.transaction(async (t) => {
      // LOCK the row — no other transaction can read or
      // write this wallet until we commit
      const wallet = await Wallet.findByPk(input.walletId, {
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!wallet) throw new Error(`Wallet ${input.walletId} not found`);
      if (!wallet.isActive) throw new Error(`Wallet ${input.walletId} is inactive`);

      const current = parseFloat(wallet.balance);
      const amount = parseFloat(input.amount);

      if (input.operation === 'debit') {
        if (current < amount) {
          throw new Error(`Insufficient funds. Balance: ${current}, Required: ${amount}`);
        }
        wallet.balance = (current - amount).toFixed(8);
      } else {
        wallet.balance = (current + amount).toFixed(8);
      }

      await wallet.save({ transaction: t });
      return wallet;
    });
  },

  async getBalance(walletId: string): Promise<string> {
    const wallet = await Wallet.findByPk(walletId, {
      attributes: ['balance', 'currency'],
    });
    if (!wallet) throw new Error(`Wallet ${walletId} not found`);
    return wallet.balance;
  },
};