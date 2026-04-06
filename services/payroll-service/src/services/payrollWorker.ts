import { Worker, Job } from 'bullmq';
import { redis } from '../redis';
import { PayrollJob } from '../models/PayrollJob';
import { PayrollItem } from '../models/PayrollItem';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const TRANSACTION_SERVICE_URL = process.env['TRANSACTION_SERVICE_URL'] ?? 'http://transaction-service:3002';

export interface PayrollJobData {
  jobId: string;
  employerId: string;
  sourceWalletId: string;
  sourceUserId: string;
}

export function createPayrollWorker(employerId: string): Worker {
  const queueName = `payroll:${employerId}`;

  return new Worker<PayrollJobData>(
    queueName,
    async (job: Job<PayrollJobData>) => {
      const { jobId, sourceWalletId, sourceUserId } = job.data;

      const payrollJob = await PayrollJob.findByPk(jobId);
      if (!payrollJob) throw new Error(`PayrollJob ${jobId} not found`);

      await payrollJob.update({ status: 'PROCESSING' });

      const items = await PayrollItem.findAll({
        where: { jobId, status: 'PENDING' },
        order: [['itemIndex', 'ASC']],
      });

      const pendingItems = items.filter(item => item.itemIndex > payrollJob.checkpoint);

      for (const item of pendingItems) {
        try {
          const idempotencyKey = `payroll-${jobId}-${item.id}`;

          const response = await axios.post(
            `${TRANSACTION_SERVICE_URL}/transfers`,
            {
              senderWalletId: sourceWalletId,
              recipientWalletId: item.recipientWalletId,
              senderUserId: sourceUserId,
              recipientUserId: item.employeeUserId,
              amount: item.amount,
              currency: item.currency,
              description: `Payroll: ${payrollJob.jobName}`,
            },
            {
              headers: {
                'Idempotency-Key': idempotencyKey,
              },
            }
          );

          await item.update({
            status: 'COMPLETED',
            transactionId: response.data.transactionId,
          });

          await payrollJob.update({
            checkpoint: item.itemIndex,
            processedItems: payrollJob.processedItems + 1,
          });

        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Unknown error';
          await item.update({ status: 'FAILED', failureReason: reason });
          await payrollJob.update({ failedItems: payrollJob.failedItems + 1 });
        }
      }

      const finalStatus = payrollJob.failedItems > 0 ? 'PARTIAL' : 'COMPLETED';
      await payrollJob.update({ status: finalStatus });
    },
    {
      connection: redis,
      concurrency: 1,
    }
  );
}