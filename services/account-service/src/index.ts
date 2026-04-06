// IMPORTANT: tracing must be the very first import
// It patches Node internals before anything else loads
import './tracing';

import express from 'express';
import { connectDatabase } from './database';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { accountsRouter } from './routes/accounts';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// Parse JSON bodies
app.use(express.json());

// Structured request logging — every request gets a requestId
app.use(requestLogger);

// Prometheus metrics tracking
app.use(metricsMiddleware);

// Health check — used by Docker healthcheck and load balancer
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'account-service' });
});

// Prometheus metrics endpoint — scraped every 15s
app.get('/metrics', metricsHandler);

// All account routes
app.use('/', accountsRouter);

// Start server after DB is ready
async function start(): Promise<void> {
  try {
    await connectDatabase();
    console.log('Database connected and synced');
    app.listen(PORT, () => {
      console.log(`account-service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start account-service:', err);
    process.exit(1);
  }
}

start();