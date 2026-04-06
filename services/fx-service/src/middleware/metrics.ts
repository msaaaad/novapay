import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'fx_service_' });

const httpRequestCounter = new client.Counter({
  name: 'fx_service_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new client.Histogram({
  name: 'fx_service_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const fxQuotesIssued = new client.Counter({
  name: 'fx_quotes_issued_total',
  help: 'Total FX quotes issued',
});

export const fxQuotesExpired = new client.Counter({
  name: 'fx_quotes_expired_total',
  help: 'Total FX quotes that expired unused',
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path ?? req.path;
    httpRequestCounter.inc({ method: req.method, route, status_code: res.statusCode });
    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, duration);
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}