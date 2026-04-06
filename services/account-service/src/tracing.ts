// src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const exporter = new OTLPTraceExporter({
  // Jaeger receives traces on this URL inside Docker network
  url: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://jaeger:4318/v1/traces',
});

const sdk = new NodeSDK({
  resource: new Resource({
    // This name appears in Jaeger UI to identify which service sent the trace
    [SemanticResourceAttributes.SERVICE_NAME]: 'account-service',
  }),
  traceExporter: exporter,
  // Auto-instruments: HTTP, Express, PostgreSQL, and more — zero manual work
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Gracefully shut down tracing when the process exits
// This flushes any pending spans so nothing is lost
process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});