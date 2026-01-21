import { Axiom } from '@axiomhq/js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  shopDomain?: string;
  shopId?: string;
  jobId?: string;
  productId?: string;
  templateId?: string;
  route?: string;
  duration?: number;
  [key: string]: unknown;
}

// Initialize Axiom client if configured
const axiom = process.env.AXIOM_TOKEN
  ? new Axiom({ token: process.env.AXIOM_TOKEN })
  : null;

const dataset = process.env.AXIOM_DATASET || 'product-video-generator';

function formatLog(level: LogLevel, message: string, context?: LogContext) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'product-video-generator',
    environment: process.env.NODE_ENV || 'development',
    ...context,
  };
}

async function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = formatLog(level, message, context);

  // Always log to console (Vercel captures this)
  const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleMethod(JSON.stringify(entry));

  // Send to Axiom if configured
  if (axiom) {
    axiom.ingest(dataset, [entry]);
    // Don't await - fire and forget for performance
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),

  // Flush pending logs (call before process exits)
  flush: async () => {
    if (axiom) {
      await axiom.flush();
    }
  },
};

// Request logger middleware helper
export function logRequest(route: string, shopDomain?: string) {
  const start = Date.now();
  return {
    end: (status: 'success' | 'error', extra?: LogContext) => {
      const duration = Date.now() - start;
      logger.info(`${route} ${status}`, { route, shopDomain, duration, status, ...extra });
    },
  };
}
