import type { GenerationArgs, ScoreArgs } from './types';
import { generateId } from './utils';

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
    this.id = generateId();
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
    this.ensureNotFinished();
    this.finished = true;
  }

  getScores(): ScoreArgs[] {
    return [...this.scores];
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
