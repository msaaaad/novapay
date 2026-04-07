// src/middleware/metrics.ts
import { Request, Response, NextFunction } from 'express';
import * as client from 'prom-client';

// Collect default Node.js metrics (memory, CPU, event loop lag)
client.collectDefaultMetrics({ prefix: 'account_service_' });

// Count of HTTP requests by method, route, and status code
export const httpRequestCounter = new client.Counter({
  name: 'account_service_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Latency histogram — used to compute p95/p99 in Grafana
export const httpRequestDuration = new client.Histogram({
  name: 'account_service_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// Middleware: records metrics for every request
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

// Route handler: GET /metrics — Prometheus scrapes this
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}