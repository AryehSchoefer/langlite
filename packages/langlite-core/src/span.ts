import type { SpanArgs } from './types';
import { generateId } from './utils';

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
    this.id = generateId();
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
