import './tracing';
import express from 'express';
import { connectDatabase } from './database';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { transactionsRouter } from './routes/transactions';
import { recoveryService } from './services/recoveryService';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3002', 10);

app.use(express.json());
app.use(requestLogger);
app.use(metricsMiddleware);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'transaction-service' }));
app.get('/metrics', metricsHandler);
app.use('/', transactionsRouter);

async function start(): Promise<void> {
  try {
    await connectDatabase();
    console.log('Database connected and synced');

    await recoveryService.recoverIncompleteTransactions();
    console.log('Recovery check complete');

    app.listen(PORT, () => console.log(`transaction-service running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start transaction-service:', err);
    process.exit(1);
  }
}

start();