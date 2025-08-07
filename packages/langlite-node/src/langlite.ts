import {
  type LangliteConfig,
  type TraceArgs,
  LangliteTrace,
} from 'langlite-core';

type QueuedTrace = {
  trace: LangliteTrace;
  retries: number;
};

async function postJson(
  url: string,
  data: unknown,
  secretKey: string,
): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response;
}

const DEFAULT_MAX_EXPORT_RETRIES = 5;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_BATCH_RETRY_ATTEMPTS = 1;
const DEFAULT_BATCH_RETRY_DELAY_MS = 2000;

export class Langlite {
  private config: LangliteConfig;
  private traceQueue: QueuedTrace[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimeouts: ReturnType<typeof setTimeout>[] = [];
  private retryingTraceIds: Set<string> = new Set();
  private maxExportRetries: number;
  private baseBackoffMs: number;
  private maxBackoffMs: number;
  private batchRetryAttempts: number;
  private batchRetryDelayMs: number;

  constructor(config: LangliteConfig) {
    if (!config.secretKey) {
      throw new Error('A secretKey is required to instantiate Langlite.');
    }

    this.config = {
      host: 'https://api.langlite.com',
      flushInterval: 10000, // default: 10 seconds
      ...config,
    };

    const retryConfig = this.config.retryConfig || {};
    this.maxExportRetries =
      retryConfig.maxRetries ?? DEFAULT_MAX_EXPORT_RETRIES;
    this.baseBackoffMs = retryConfig.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    this.maxBackoffMs = retryConfig.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.batchRetryAttempts =
      retryConfig.batchRetryAttempts ?? DEFAULT_BATCH_RETRY_ATTEMPTS;
    this.batchRetryDelayMs =
      retryConfig.batchRetryDelayMs ?? DEFAULT_BATCH_RETRY_DELAY_MS;

    if (this.config.flushInterval && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(
        () => this.flush(),
        this.config.flushInterval,
      );
    }
  }

  startTrace(args: TraceArgs): LangliteTrace {
    const trace = new LangliteTrace(args);
    this.traceQueue.push({ trace, retries: 0 });
    return trace;
  }

  getQueuedTraces(): LangliteTrace[] {
    return this.traceQueue.map((qt) => qt.trace);
  }

  getQueuedTracesJSON(): any[] {
    return this.traceQueue.map((qt) => qt.trace.toJSON());
  }

  async flush(): Promise<void> {
    const batchToFlush = this.traceQueue.filter(
      (qt) => !this.retryingTraceIds.has(qt.trace.id),
    );

    if (batchToFlush.length === 0) return;

    const tracesJson = batchToFlush.map((qt) => qt.trace.toJSON());
    this.traceQueue = this.traceQueue.filter((qt) =>
      this.retryingTraceIds.has(qt.trace.id),
    );

    try {
      await postJson(
        `${this.config.host}/v1/trace/batch`,
        { traces: tracesJson },
        this.config.secretKey,
      );
    } catch (e) {
      console.error(`[Langlite] Initial batch export failed. Retrying...`, e);
      let batchSucceeded = false;
      for (let i = 0; i < this.batchRetryAttempts; i++) {
        await new Promise((res) => setTimeout(res, this.batchRetryDelayMs));
        try {
          await postJson(
            `${this.config.host}/v1/trace/batch`,
            { traces: tracesJson },
            this.config.secretKey,
          );
          console.log(`[Langlite] Batch retry attempt ${i + 1} succeeded.`);
          batchSucceeded = true;
          break;
        } catch (retryError) {
          console.error(
            `[Langlite] Batch retry attempt ${i + 1} failed.`,
            retryError,
          );
        }
      }

      if (!batchSucceeded) {
        console.error(
          `[Langlite] All batch retries failed. Retrying traces individually.`,
        );
        this.handleExportError('batch', e, tracesJson, batchToFlush);
      }
    }
  }

  /**
   * @internal
   * This method is intended for internal use by LangliteTrace instances only.
   */
  public async flushTraceInternal(trace: LangliteTrace): Promise<void> {
    this.retryingTraceIds.delete(trace.id);
    try {
      await postJson(
        `${this.config.host}/v1/trace`,
        trace.toJSON(),
        this.config.secretKey,
      );
      this.traceQueue = this.traceQueue.filter(
        (qt) => qt.trace.id !== trace.id,
      );
    } catch (e) {
      const queued = this.traceQueue.find((qt) => qt.trace === trace);
      if (queued) {
        this.handleExportError('single', e, trace.toJSON(), [queued]);
      } else {
        this.handleExportError('single', e, trace.toJSON(), [
          { trace, retries: 0 },
        ]);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.retryTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.retryTimeouts = [];
    await this.flush();
  }

  private handleExportError(
    exportType: 'batch' | 'single',
    error: unknown,
    data: any,
    failedQueuedTraces: QueuedTrace[],
  ) {
    if (typeof console !== 'undefined' && console.error) {
      console.error(
        `[Langlite] Error exporting traces (${exportType}):`,
        error,
        '\nData:',
        data,
      );
    }

    for (const qt of failedQueuedTraces) {
      if (!this.traceQueue.find((item) => item.trace.id === qt.trace.id)) {
        this.traceQueue.push(qt);
      }
      if (qt.retries < this.maxExportRetries) {
        qt.retries++;
        const backoff = Math.min(
          this.baseBackoffMs * Math.pow(2, qt.retries - 1),
          this.maxBackoffMs,
        );
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(
            `[Langlite] Retrying trace (id=${qt.trace.id}, attempt=${qt.retries}) in ${backoff}ms`,
          );
        }

        this.retryingTraceIds.add(qt.trace.id);

        const timeout = setTimeout(() => {
          this.flushTraceInternal(qt.trace);
          this.retryTimeouts = this.retryTimeouts.filter((t) => t !== timeout);
        }, backoff);
        this.retryTimeouts.push(timeout);
      } else {
        if (typeof console !== 'undefined' && console.error) {
          console.error(
            `[Langlite] Trace (id=${qt.trace.id}) dropped after ${this.maxExportRetries} retries.`,
          );
        }
        this.traceQueue = this.traceQueue.filter(
          (item) => item.trace.id !== qt.trace.id,
        );
        this.retryingTraceIds.delete(qt.trace.id);
      }
    }
  }
}
