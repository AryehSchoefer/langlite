export interface LangliteConfig {
  publicKey?: string;
  secretKey: string;
  host?: string;
  flushInterval?: number;
}

export interface TraceArgs {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface GenerationArgs {
  name: string;
  input: string;
  output: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    [key: string]: number | undefined;
  };
  metadata?: Record<string, unknown>;
}

export interface SpanArgs {
  name: string;
  startTime?: number;
  endTime?: number;
  metadata?: Record<string, unknown>;
}

export interface EventArgs {
  message: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface ScoreArgs {
  value: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}
