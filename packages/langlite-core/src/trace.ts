import type {
  TraceArgs,
  GenerationArgs,
  SpanArgs,
  EventArgs,
  ScoreArgs,
} from './types';
import { generateId } from './utils';
import { LangliteGeneration } from './generation';
import { LangliteSpan } from './span';

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

  constructor(args: TraceArgs) {
    this.id = generateId();
    this.createdAt = Date.now();
    this.name = args.name;
    this.metadata = args.metadata;
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

  finish(): void {
    this.ensureNotFinished();
    this.finished = true;
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
