import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';

export const requestLogger = pinoHttp({
  genReqId: (req) => (req.headers['x-request-id'] as string) ?? uuidv4(),
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  redact: ['req.headers.authorization'],
});