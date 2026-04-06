import './tracing';
import express from 'express';
import { connectDatabase } from './database';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { ledgerRouter } from './routes/ledger';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3003', 10);

app.use(express.json());
app.use(requestLogger);
app.use(metricsMiddleware);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ledger-service' }));
app.get('/metrics', metricsHandler);
app.use('/', ledgerRouter);

async function start(): Promise<void> {
  try {
    await connectDatabase();
    console.log('Database connected and synced');
    app.listen(PORT, () => console.log(`ledger-service running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start ledger-service:', err);
    process.exit(1);
  }
}

start();