import './tracing';
import express from 'express';
import { connectDatabase } from './database';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { payrollRouter } from './routes/payroll';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3005', 10);

app.use(express.json());
app.use(requestLogger);
app.use(metricsMiddleware);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'payroll-service' }));
app.get('/metrics', metricsHandler);
app.use('/', payrollRouter);

async function start(): Promise<void> {
  try {
    await connectDatabase();
    console.log('Database connected and synced');
    app.listen(PORT, () => console.log(`payroll-service running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start payroll-service:', err);
    process.exit(1);
  }
}

start();