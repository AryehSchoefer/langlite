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
    this.events.push(args);
  }

  submitScore(args: ScoreArgs): void {
    this.ensureNotFinished();
    this.scores.push(args);
  }

  finish(): void {
    this.finished = true;
    if (this.langliteInstance) {
      this.langliteInstance._flushTrace(this);
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
  // may want to add timestamps, status, etc.
};

async function postJson(
  url: string,
  data: unknown,
  secretKey: string,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify(data),
  });
}

export class Langlite {
  private config: LangliteConfig;
  private traceQueue: QueuedTrace[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

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
    this.traceQueue.push({ trace });

    return trace;
  }

  getQueuedTraces(): LangliteTrace[] {
    return this.traceQueue.map((qt) => qt.trace);
  }

  getQueuedTracesJSON(): any[] {
    return this.traceQueue.map((qt) => qt.trace.toJSON());
  }

  async flush(): Promise<void> {
    if (this.traceQueue.length === 0) return;
    const traces = this.traceQueue.map((qt) => qt.trace.toJSON());
    this.traceQueue = [];
    try {
      await postJson(
        `${this.config.host}/v1/trace/batch`,
        { traces },
        this.config.secretKey,
      );
    } catch (e) {
      console.error('Error exporting traces:', e);
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  async _flushTrace(trace: LangliteTrace): Promise<void> {
    try {
      await postJson(
        `${this.config.host}/v1/trace`,
        trace.toJSON(),
        this.config.secretKey,
      );
    } catch (e) {
      console.error('Error exporting trace:', e);
    }
    this.traceQueue = this.traceQueue.filter((qt) => qt.trace !== trace);
  }
}
