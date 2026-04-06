import axios from 'axios';
import { AuditLog } from '../models/AuditLog';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNT_SERVICE_URL = process.env['ACCOUNT_SERVICE_URL'] ?? 'http://account-service:3001';
const TRANSACTION_SERVICE_URL = process.env['TRANSACTION_SERVICE_URL'] ?? 'http://transaction-service:3002';
const LEDGER_SERVICE_URL = process.env['LEDGER_SERVICE_URL'] ?? 'http://ledger-service:3003';

export const adminService = {

  async logAction(params: {
    action: string;
    performedBy: string;
    metadata?: object;
    ipAddress?: string;
    targetId?: string;
    targetType?: string;
  }): Promise<AuditLog> {
    return AuditLog.create({
      id: uuidv4(),
      action: params.action,
      performedBy: params.performedBy,
      metadata: params.metadata ?? null,
      ipAddress: params.ipAddress ?? null,
      targetId: params.targetId ?? null,
      targetType: params.targetType ?? null,
    });
  },

  async getAuditLogs(limit = 50, offset = 0): Promise<{ logs: AuditLog[]; total: number }> {
    const { rows, count } = await AuditLog.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    return { logs: rows, total: count };
  },

  async getWallet(walletId: string, performedBy: string, ipAddress: string): Promise<object> {
    const response = await axios.get(`${ACCOUNT_SERVICE_URL}/wallets/${walletId}`);
    await adminService.logAction({
      action: 'ADMIN_VIEW_WALLET',
      performedBy,
      ipAddress,
      targetId: walletId,
      targetType: 'wallet',
    });
    return response.data;
  },

  async getTransaction(transactionId: string, performedBy: string, ipAddress: string): Promise<object> {
    const response = await axios.get(`${TRANSACTION_SERVICE_URL}/transfers/${transactionId}`);
    await adminService.logAction({
      action: 'ADMIN_VIEW_TRANSACTION',
      performedBy,
      ipAddress,
      targetId: transactionId,
      targetType: 'transaction',
    });
    return response.data;
  },

  async verifyLedger(transactionId: string, performedBy: string, ipAddress: string): Promise<object> {
    const response = await axios.get(`${LEDGER_SERVICE_URL}/transactions/${transactionId}/verify`);
    await adminService.logAction({
      action: 'ADMIN_VERIFY_LEDGER',
      performedBy,
      ipAddress,
      targetId: transactionId,
      targetType: 'transaction',
      metadata: { result: response.data },
    });
    return response.data;
  },

  async verifyHashChain(walletId: string, performedBy: string, ipAddress: string): Promise<object> {
    const response = await axios.get(`${LEDGER_SERVICE_URL}/wallets/${walletId}/chain`);
    await adminService.logAction({
      action: 'ADMIN_VERIFY_HASH_CHAIN',
      performedBy,
      ipAddress,
      targetId: walletId,
      targetType: 'wallet',
      metadata: { result: response.data },
    });
    return response.data;
  },

  async getLedgerEntries(walletId: string, performedBy: string, ipAddress: string): Promise<object> {
    const response = await axios.get(`${LEDGER_SERVICE_URL}/wallets/${walletId}/entries`);
    await adminService.logAction({
      action: 'ADMIN_VIEW_LEDGER_ENTRIES',
      performedBy,
      ipAddress,
      targetId: walletId,
      targetType: 'wallet',
    });
    return response.data;
  },
};