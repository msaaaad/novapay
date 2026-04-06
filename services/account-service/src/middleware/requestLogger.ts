// src/middleware/requestLogger.ts
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

export const requestLogger = pinoHttp({
  // Generate a unique requestId for every incoming request
  // This lets you trace a single request across all log lines
  genReqId: (req) => {
    return (req.headers['x-request-id'] as string) ?? uuidv4();
  },
  // Structured log fields on every request
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Never log these — assessment requirement
  redact: ['req.headers.authorization', 'req.body.password', 'req.body.token'],
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        requestId: req.id,
      };
    },
  },
});