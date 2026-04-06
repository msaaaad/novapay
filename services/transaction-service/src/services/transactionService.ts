import { Transaction as TxModel } from '../models/Transaction';
import { sequelize } from '../database';
import { idempotencyService } from './idempotencyService';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const ACCOUNT_SERVICE_URL = process.env['ACCOUNT_SERVICE_URL'] ?? 'http://account-service:3001';
const LEDGER_SERVICE_URL = process.env['LEDGER_SERVICE_URL'] ?? 'http://ledger-service:3003';
const FX_SERVICE_URL = process.env['FX_SERVICE_URL'] ?? 'http://fx-service:3004';

export interface TransferInput {
  idempotencyKey: string;
  senderWalletId: string;
  recipientWalletId: string;
  senderUserId: string;
  recipientUserId: string;
  amount: string;
  currency: string;
  description?: string;
  fxQuoteId?: string;
}

export const transactionService = {

  async transfer(input: TransferInput): Promise<object> {
    const payload = {
      senderWalletId: input.senderWalletId,
      recipientWalletId: input.recipientWalletId,
      amount: input.amount,
      currency: input.currency,
    };

    const idempotency = await idempotencyService.checkOrCreate(
      input.idempotencyKey,
      payload
    );

    if (idempotency.isDuplicate && idempotency.cachedResponse) {
      return idempotency.cachedResponse.body;
    }

    if (idempotency.isProcessing) {
      return { status: 'PROCESSING', message: 'Transaction is already being processed' };
    }

    let fxRate: string | null = null;
    if (input.fxQuoteId) {
      const consumeRes = await axios.post(
        `${FX_SERVICE_URL}/quote/${input.fxQuoteId}/consume`,
        { transactionId: uuidv4() }
      );
      fxRate = consumeRes.data.rate;
    }

    const txId = uuidv4();
    let tx: TxModel | null = null;

    try {
      tx = await TxModel.create({
        id: txId,
        senderWalletId: input.senderWalletId,
        recipientWalletId: input.recipientWalletId,
        senderUserId: input.senderUserId,
        recipientUserId: input.recipientUserId,
        amount: input.amount,
        currency: input.currency,
        type: input.fxQuoteId ? 'INTERNATIONAL_TRANSFER' : 'TRANSFER',
        status: 'PENDING',
        checkpoint: 'INITIATED',
        fxQuoteId: input.fxQuoteId ?? null,
        fxRate,
        description: input.description ?? null,
      });

      await axios.patch(`${ACCOUNT_SERVICE_URL}/wallets/${input.senderWalletId}/balance`, {
        amount: input.amount,
        operation: 'debit',
      });
      await tx.update({ checkpoint: 'DEBIT_DONE' });

      await axios.patch(`${ACCOUNT_SERVICE_URL}/wallets/${input.recipientWalletId}/balance`, {
        amount: input.amount,
        operation: 'credit',
      });
      await tx.update({ checkpoint: 'CREDIT_DONE' });

      await axios.post(`${LEDGER_SERVICE_URL}/transactions`, {
        transactionId: txId,
        entries: [
          {
            walletId: input.senderWalletId,
            userId: input.senderUserId,
            entryType: 'DEBIT',
            amount: input.amount,
            currency: input.currency,
            lockedFxRate: fxRate ?? undefined,
            description: input.description,
          },
          {
            walletId: input.recipientWalletId,
            userId: input.recipientUserId,
            entryType: 'CREDIT',
            amount: input.amount,
            currency: input.currency,
            lockedFxRate: fxRate ?? undefined,
            description: input.description,
          },
        ],
      });
      await tx.update({ checkpoint: 'LEDGER_DONE', status: 'COMPLETED' });

      const response = {
        transactionId: txId,
        status: 'COMPLETED',
        amount: input.amount,
        currency: input.currency,
        fxRate,
      };

      await idempotencyService.markCompleted(
        input.idempotencyKey,
        txId,
        201,
        response
      );

      return response;

    } catch (err) {
      if (tx) {
        await tx.update({
          status: 'FAILED',
          failureReason: err instanceof Error ? err.message : 'Unknown error',
        }).catch(() => null);
      }
      await idempotencyService.markFailed(input.idempotencyKey);
      throw err;
    }
  },

  async getTransaction(transactionId: string): Promise<TxModel | null> {
    return TxModel.findByPk(transactionId);
  },
};