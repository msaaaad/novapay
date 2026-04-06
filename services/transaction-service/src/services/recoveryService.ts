import { Transaction } from '../models/Transaction';
import { Op } from 'sequelize';
import axios from 'axios';

const ACCOUNT_SERVICE_URL = process.env['ACCOUNT_SERVICE_URL'] ?? 'http://account-service:3001';
const LEDGER_SERVICE_URL = process.env['LEDGER_SERVICE_URL'] ?? 'http://ledger-service:3003';

const STUCK_THRESHOLD_MINUTES = 5;

export const recoveryService = {
  async recoverIncompleteTransactions(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000);

    const stuckTransactions = await Transaction.findAll({
      where: {
        status: 'PENDING',
        createdAt: { [Op.lt]: cutoff },
      },
    });

    if (stuckTransactions.length > 0) {
      console.log(`Recovery: found ${stuckTransactions.length} stuck transactions`);
    }

    for (const tx of stuckTransactions) {
      try {
        await recoveryService.recoverTransaction(tx);
      } catch (err) {
        console.error(`Recovery failed for transaction ${tx.id}:`, err);
      }
    }
  },

  async recoverTransaction(tx: Transaction): Promise<void> {
    console.log(`Recovering transaction ${tx.id} at checkpoint: ${tx.checkpoint}`);

    switch (tx.checkpoint) {
      case 'INITIATED':
        await tx.update({ status: 'FAILED', failureReason: 'Recovered: never started' });
        break;

      case 'DEBIT_DONE':
        await axios.patch(`${ACCOUNT_SERVICE_URL}/wallets/${tx.senderWalletId}/balance`, {
          amount: tx.amount,
          operation: 'credit', // reverse the debit
        });
        await tx.update({
          status: 'REVERSED',
          failureReason: 'Recovered: debit reversed after incomplete transfer',
        });
        console.log(`Transaction ${tx.id}: debit reversed successfully`);
        break;

      case 'CREDIT_DONE':
        await axios.post(`${LEDGER_SERVICE_URL}/transactions`, {
          transactionId: tx.id,
          entries: [
            {
              walletId: tx.senderWalletId,
              userId: tx.senderUserId,
              entryType: 'DEBIT',
              amount: tx.amount,
              currency: tx.currency,
              description: 'Recovery: completed ledger entry',
            },
            {
              walletId: tx.recipientWalletId,
              userId: tx.recipientUserId,
              entryType: 'CREDIT',
              amount: tx.amount,
              currency: tx.currency,
              description: 'Recovery: completed ledger entry',
            },
          ],
        });
        await tx.update({ status: 'COMPLETED' });
        console.log(`Transaction ${tx.id}: ledger entries written on recovery`);
        break;

      default:
        await tx.update({ status: 'FAILED', failureReason: 'Recovered: unknown checkpoint' });
    }
  },
};