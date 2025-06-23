import type {
  LangliteConfig,
  TraceArgs,
  GenerationArgs,
  SpanArgs,
  EventArgs,
  ScoreArgs,
} from './types';

function uuid() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class LangliteTrace {
  public readonly id: string;
  public readonly createdAt: number;
  private name: string;
  private metadata?: Record<string, unknown>;
  private generations: LangliteGeneration[] = [];
  private spans: LangliteSpan[] = [];
  private events: EventArgs[] = [];
  private scores: ScoreArgs[] = [];
  private finished: boolean = false;
  private langliteInstance?: Langlite;

  constructor(args: TraceArgs, langliteInstance?: Langlite) {
    this.id = uuid();
    this.createdAt = Date.now();
    this.name = args.name;
    this.metadata = args.metadata;
    this.langliteInstance = langliteInstance;
  }

  private ensureNotFinished() {
    if (this.finished) {
      throw new Error('Cannot modify a finished trace.');
    }
  }

  addGeneration(args: GenerationArgs): LangliteGeneration {
    this.ensureNotFinished();
    const generation = new LangliteGeneration({
      ...args,
      parentTraceId: this.id,
    });
    this.generations.push(generation);
    return generation;
  }

  addSpan(args: SpanArgs): LangliteSpan {
    this.ensureNotFinished();
    const span = new LangliteSpan({
      ...args,
      parentTraceId: this.id,
    });
    this.spans.push(span);
    return span;
  }

  logEvent(args: EventArgs): void {
    this.ensureNotFinished();
    this.events.push({
      ...args,
      timestamp:
        typeof args.timestamp === 'number' ? args.timestamp : Date.now(),
    });
  }

  submitScore(args: ScoreArgs): void {
    this.ensureNotFinished();
    this.scores.push(args);
  }

  async finish(): Promise<void> {
    this.finished = true;
    if (this.langliteInstance) {
      await this.langliteInstance.flushTraceInternal(this);
    }
  }

  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      name: this.name,
      metadata: this.metadata,
      generations: this.generations.map((g) => g.toJSON()),
      spans: this.spans.map((s) => s.toJSON()),
      events: this.events,
      scores: this.scores,
      finished: this.finished,
    };
  }
}

export class LangliteGeneration {
  public readonly id: string;
  public readonly createdAt: number;
  public readonly parentTraceId?: string;
  private name: string;
  private input: string;
  private output: string;
  private model: string;
  private usage?: {
    promptTokens?: number;
    completionTokens?: number;
    [key: string]: number | undefined;
  };
  private metadata?: Record<string, unknown>;
  private scores: ScoreArgs[] = [];
  private finished: boolean = false;

  constructor(args: GenerationArgs & { parentTraceId?: string }) {
    this.id = uuid();
    this.createdAt = Date.now();
    this.parentTraceId = args.parentTraceId;
    this.name = args.name;
    this.input = args.input;
    this.output = args.output;
    this.model = args.model;
    this.usage = args.usage;
    this.metadata = args.metadata;
  }

  private ensureNotFinished() {
    if (this.finished) {
      throw new Error('Cannot modify a finished generation.');
    }
  }

  submitScore(args: ScoreArgs): void {
    this.ensureNotFinished();
    this.scores.push(args);
  }

  finish(): void {
    this.finished = true;
  }

  getScores(): ScoreArgs[] {
    return this.scores;
  }

  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      parentTraceId: this.parentTraceId,
      name: this.name,
      input: this.input,
      output: this.output,
      model: this.model,
      usage: this.usage,
      metadata: this.metadata,
      scores: this.scores,
      finished: this.finished,
    };
  }
}

export class LangliteSpan {
  public readonly id: string;
  public readonly createdAt: number;
  public readonly parentTraceId?: string;
  private name: string;
  private startTime: number;
  private endTime?: number;
  private metadata?: Record<string, unknown>;
  private finished: boolean = false;

  constructor(args: SpanArgs & { parentTraceId?: string }) {
    this.id = uuid();
    this.createdAt = Date.now();
    this.parentTraceId = args.parentTraceId;
    this.name = args.name;
    this.startTime =
      typeof args.startTime === 'number' ? args.startTime : Date.now();
    this.endTime = args.endTime;
    this.metadata = args.metadata;
    if (args.endTime !== undefined) this.finished = true;
  }

  private ensureNotFinished() {
    if (this.finished) {
      throw new Error('Cannot modify a finished span.');
    }
  }

  finish(endTime?: number): void {
    this.ensureNotFinished();
    this.endTime = typeof endTime === 'number' ? endTime : Date.now();
    this.finished = true;
  }

  getDuration(): number | undefined {
    if (this.endTime === undefined) return undefined;
    return this.endTime - this.startTime;
  }

  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      parentTraceId: this.parentTraceId,
      name: this.name,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.getDuration(),
      metadata: this.metadata,
      finished: this.finished,
    };
  }
}

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

const MAX_EXPORT_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const BATCH_RETRY_ATTEMPTS = 1;
const BATCH_RETRY_DELAY_MS = 2000;

export class Langlite {
  private config: LangliteConfig;
  private traceQueue: QueuedTrace[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimeouts: ReturnType<typeof setTimeout>[] = [];
  private retryingTraceIds: Set<string> = new Set();

  constructor(config: LangliteConfig) {
    if (!config.secretKey) {
      throw new Error('A secretKey is required to instantiate Langlite.');
    }

    this.config = {
      host: 'https://api.langlite.io',
      flushInterval: 10000, // default: 10 seconds
      ...config,
    };

    if (this.config.flushInterval && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(
        () => this.flush(),
        this.config.flushInterval,
      );
    }
  }

  startTrace(args: TraceArgs): LangliteTrace {
    const trace = new LangliteTrace(args, this);
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
      for (let i = 0; i < BATCH_RETRY_ATTEMPTS; i++) {
        await new Promise((res) => setTimeout(res, BATCH_RETRY_DELAY_MS));
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
      if (qt.retries < MAX_EXPORT_RETRIES) {
        qt.retries++;
        const backoff = Math.min(
          BASE_BACKOFF_MS * Math.pow(2, qt.retries - 1),
          MAX_BACKOFF_MS,
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
            `[Langlite] Trace (id=${qt.trace.id}) dropped after ${MAX_EXPORT_RETRIES} retries.`,
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
