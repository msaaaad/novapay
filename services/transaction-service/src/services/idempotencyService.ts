import { IdempotencyKey } from '../models/IdempotencyKey';
import { sequelize } from '../database';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const KEY_TTL_HOURS = 24;

function hashPayload(payload: object): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

export interface IdempotencyResult {
  isDuplicate: boolean;
  isProcessing: boolean;
  cachedResponse?: { status: number; body: object };
  record?: IdempotencyKey;
}

export const idempotencyService = {
  async checkOrCreate(
    key: string,
    payload: object
  ): Promise<IdempotencyResult> {
    const payloadHash = hashPayload(payload);
    const now = new Date();

    return sequelize.transaction(async (t) => {
      const existing = await IdempotencyKey.findOne({
        where: { key },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (existing && existing.expiresAt < now) {
        await existing.destroy({ transaction: t });
      } else if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new Error(
            `Idempotency key conflict: key '${key}' was previously used with a different payload. ` +
            `Original amount differs from current request.`
          );
        }

        if (existing.status === 'PROCESSING') {
          return { isDuplicate: false, isProcessing: true, record: existing };
        }

        return {
          isDuplicate: true,
          isProcessing: false,
          cachedResponse: {
            status: existing.responseStatus ?? 200,
            body: existing.responseBody ?? {},
          },
          record: existing,
        };
      }

      const expiresAt = new Date(now.getTime() + KEY_TTL_HOURS * 60 * 60 * 1000);
      const record = await IdempotencyKey.create({
        id: uuidv4(),
        key,
        payloadHash,
        status: 'PROCESSING',
        expiresAt,
        responseBody: null,
        responseStatus: null,
        transactionId: null,
      }, { transaction: t });

      return { isDuplicate: false, isProcessing: false, record };
    });
  },

  async markCompleted(
    key: string,
    transactionId: string,
    responseStatus: number,
    responseBody: object
  ): Promise<void> {
    await IdempotencyKey.update(
      { status: 'COMPLETED', transactionId, responseStatus, responseBody },
      { where: { key } }
    );
  },

  async markFailed(key: string): Promise<void> {
    await IdempotencyKey.update(
      { status: 'FAILED' },
      { where: { key } }
    );
  },
};