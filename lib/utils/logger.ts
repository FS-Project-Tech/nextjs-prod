/**
 * Centralized Logging Utility
 * Replaces console.log/warn/error with structured logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: string;
  error?: Error;
}

/**
 * Logger class for structured logging
 */
class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isProduction = process.env.NODE_ENV === 'production';

  private formatMessage(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
    ];

    if (entry.context) {
      parts.push(`[${entry.context}]`);
    }

    parts.push(entry.message);

    if (entry.data && Object.keys(entry.data).length > 0) {
      parts.push(JSON.stringify(entry.data, null, this.isDevelopment ? 2 : 0));
    }

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, context?: string, data?: Record<string, unknown>, error?: Error): void {
    // Skip debug logs in production
    if (level === 'debug' && !this.isDevelopment) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      context,
      data,
      timestamp: new Date().toISOString(),
      error,
    };

    const formatted = this.formatMessage(entry);

    switch (level) {
      case 'debug':
        if (this.isDevelopment) {
          console.debug(formatted);
        }
        break;
      case 'info':
        if (this.isDevelopment) {
          console.info(formatted);
        }
        break;
      case 'warn':
        console.warn(formatted);
        if (error && this.isDevelopment) {
          console.warn(error);
        }
        break;
      case 'error':
        console.error(formatted);
        if (error) {
          console.error(error);
        }
        // In production, you might want to send to error tracking service
        if (this.isProduction && typeof window !== 'undefined') {
          // Example: Send to error tracking service
          // errorTrackingService.captureException(error, { extra: data });
        }
        break;
    }
  }

  debug(message: string, context?: string, data?: Record<string, unknown>): void {
    this.log('debug', message, context, data);
  }

  info(message: string, context?: string, data?: Record<string, unknown>): void {
    this.log('info', message, context, data);
  }

  warn(message: string, context?: string, data?: Record<string, unknown>, error?: Error): void {
    this.log('warn', message, context, data, error);
  }

  error(message: string, context?: string, data?: Record<string, unknown>, error?: Error): void {
    this.log('error', message, context, data, error);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for use in other files
export type { LogLevel, LogEntry };

