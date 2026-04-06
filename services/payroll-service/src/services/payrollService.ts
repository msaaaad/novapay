import { Queue } from 'bullmq';
import { redis } from '../redis';
import { PayrollJob } from '../models/PayrollJob';
import { PayrollItem } from '../models/PayrollItem';
import { createPayrollWorker } from './payrollWorker';
import { v4 as uuidv4 } from 'uuid';

const workers = new Map<string, ReturnType<typeof createPayrollWorker>>();

function getOrCreateWorker(employerId: string) {
  if (!workers.has(employerId)) {
    workers.set(employerId, createPayrollWorker(employerId));
  }
  return workers.get(employerId)!;
}

export interface PayrollItemInput {
  employeeUserId: string;
  recipientWalletId: string;
  amount: string;
  currency?: string;
}

export interface CreatePayrollJobInput {
  employerId: string;
  sourceWalletId: string;
  sourceUserId: string;
  jobName: string;
  items: PayrollItemInput[];
}

export const payrollService = {

  async createJob(input: CreatePayrollJobInput): Promise<PayrollJob> {
    const jobId = uuidv4();

    const payrollJob = await PayrollJob.create({
      id: jobId,
      employerId: input.employerId,
      sourceWalletId: input.sourceWalletId,
      jobName: input.jobName,
      status: 'QUEUED',
      totalItems: input.items.length,
      processedItems: 0,
      failedItems: 0,
      checkpoint: 0,
    });

    await PayrollItem.bulkCreate(
      input.items.map((item, index) => ({
        id: uuidv4(),
        jobId,
        employeeUserId: item.employeeUserId,
        recipientWalletId: item.recipientWalletId,
        amount: item.amount,
        currency: item.currency ?? 'USD',
        status: 'PENDING',
        itemIndex: index + 1,
      }))
    );

    getOrCreateWorker(input.employerId);

    // Add job to employer-specific queue
    const queue = new Queue(`payroll:${input.employerId}`, { connection: redis });
    await queue.add('process-payroll', {
      jobId,
      employerId: input.employerId,
      sourceWalletId: input.sourceWalletId,
      sourceUserId: input.sourceUserId,
    });
    await queue.close();

    return payrollJob;
  },

  async getJob(jobId: string): Promise<PayrollJob | null> {
    return PayrollJob.findByPk(jobId);
  },

  async getJobItems(jobId: string): Promise<PayrollItem[]> {
    return PayrollItem.findAll({
      where: { jobId },
      order: [['itemIndex', 'ASC']],
    });
  },

  async getEmployerJobs(employerId: string): Promise<PayrollJob[]> {
    return PayrollJob.findAll({
      where: { employerId },
      order: [['createdAt', 'DESC']],
    });
  },
};