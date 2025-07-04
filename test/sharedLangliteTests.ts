import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  LangliteTrace,
  LangliteGeneration,
  LangliteSpan,
  type TraceArgs,
  type GenerationArgs,
  type EventArgs,
  type ScoreArgs,
  type SpanArgs,
} from 'langlite-core';

export function sharedLangliteTests(
  Langlite:
    | typeof import('../packages/langlite-node/src/langlite').Langlite
    | typeof import('../packages/langlite-web/src/langlite').Langlite,
) {
  describe('Langlite SDK', () => {
    let client: InstanceType<typeof Langlite>;

    beforeEach(() => {
      client = new Langlite({ secretKey: 'test-secret', flushInterval: 0 }); // disable auto flush for tests
    });

    test('can start a trace and finish', async () => {
      const traceArgs: TraceArgs = { name: 'test-trace' };
      const trace = client.startTrace(traceArgs);

      expect(trace).toBeInstanceOf(LangliteTrace);
      expect(trace['id']).toBeDefined();
      expect(trace['createdAt']).toBeDefined();
      expect(trace['toJSON']()).toMatchObject({ name: 'test-trace' });

      trace.finish();
    });

    test('trace has unique id and timestamp', () => {
      const t1 = client.startTrace({ name: 't1' });
      const t2 = client.startTrace({ name: 't2' });
      expect(t1['id']).not.toEqual(t2['id']);
      expect(typeof t1['createdAt']).toBe('number');
    });

    test('can add a generation to a trace', async () => {
      const trace = client.startTrace({ name: 'generation-trace' });

      const generationArgs: GenerationArgs = {
        name: 'summarize',
        input: 'Test input',
        output: 'Test output',
        model: 'gpt-4o',
        usage: { promptTokens: 10, completionTokens: 5 },
        metadata: { temperature: 0.7 },
      };

      const generation = trace.addGeneration(generationArgs);
      expect(generation).toBeInstanceOf(LangliteGeneration);
      expect(generation['id']).toBeDefined();
      expect(generation['createdAt']).toBeDefined();
      expect(generation['parentTraceId']).toBe(trace['id']);
      expect(generation['toJSON']().input).toBe('Test input');
      trace.finish();
    });

    test('can add a span to a trace', async () => {
      const trace = client.startTrace({ name: 'span-trace' });

      const spanArgs: SpanArgs = {
        name: 'db-query',
        startTime: Date.now(),
        endTime: Date.now() + 50,
        metadata: { query: 'SELECT 1' },
      };

      const span = trace.addSpan(spanArgs);

      expect(span).toBeInstanceOf(LangliteSpan);
      expect(span['id']).toBeDefined();
      expect(span['createdAt']).toBeDefined();
      expect(span['parentTraceId']).toBe(trace['id']);
      expect(span['toJSON']().metadata).toEqual({ query: 'SELECT 1' });
      expect(typeof span.getDuration()).toBe('number');
      trace.finish();
    });

    test('can finish a span and get duration', () => {
      const trace = client.startTrace({ name: 'span-trace2' });
      const span = trace.addSpan({ name: 'work', startTime: Date.now() });
      expect(span['finished']).toBe(false);
      span.finish();
      expect(span['finished']).toBe(true);
      expect(typeof span.getDuration()).toBe('number');
    });

    test('can log an event to a trace', async () => {
      const trace = client.startTrace({ name: 'event-trace' });

      const eventArgs: EventArgs = {
        message: 'User authenticated',
        timestamp: Date.now(),
        metadata: { userId: 123 },
      };

      expect(() => trace.logEvent(eventArgs)).not.toThrow();
      expect(trace['toJSON']().events[0]).toMatchObject({
        message: 'User authenticated',
      });
      trace.finish();
    });

    test('can submit a score to a trace', async () => {
      const trace = client.startTrace({ name: 'score-trace' });

      const scoreArgs: ScoreArgs = {
        value: 1,
        reason: 'Excellent response',
        metadata: { reviewer: 'test-user' },
      };

      expect(() => trace.submitScore(scoreArgs)).not.toThrow();
      expect(trace['toJSON']().scores[0]).toMatchObject({
        value: 1,
        reason: 'Excellent response',
      });
      trace.finish();
    });

    test('can submit a score to a generation', async () => {
      const trace = client.startTrace({ name: 'gen-score-trace' });

      const generation = trace.addGeneration({
        name: 'summarize',
        input: 'Test input',
        output: 'Test output',
        model: 'gpt-4o',
      });

      const scoreArgs: ScoreArgs = {
        value: 0,
        reason: 'Needs improvement',
      };

      expect(() => generation.submitScore(scoreArgs)).not.toThrow();
      expect(generation.getScores()[0]).toMatchObject({
        value: 0,
        reason: 'Needs improvement',
      });
      trace.finish();
    });

    test('cannot modify trace after finish', async () => {
      const trace = client.startTrace({ name: 'immutable-trace' });
      trace.finish();
      expect(() =>
        trace.addGeneration({ name: 'x', input: '', output: '', model: '' }),
      ).toThrow();
      expect(() =>
        trace.addSpan({ name: 'x', startTime: Date.now() }),
      ).toThrow();
      expect(() =>
        trace.logEvent({ message: '', timestamp: Date.now() }),
      ).toThrow();
      expect(() => trace.submitScore({ value: 1, reason: '' })).toThrow();
    });

    test('cannot modify generation after finish', () => {
      const trace = client.startTrace({ name: 'immutable-gen-trace' });
      const gen = trace.addGeneration({
        name: 'g',
        input: '',
        output: '',
        model: '',
      });
      gen.finish();
      expect(() => gen.submitScore({ value: 1, reason: '' })).toThrow();
    });

    test('cannot modify span after finish', () => {
      const trace = client.startTrace({ name: 'immutable-span-trace' });
      const span = trace.addSpan({ name: 's', startTime: Date.now() });
      span.finish();
      expect(() => span.finish()).toThrow();
    });

    test('client flush and shutdown do not throw', async () => {
      await expect(client.flush()).resolves.toBeUndefined();
      await expect(client.shutdown()).resolves.toBeUndefined();
    });

    test('trace/generation/span toJSON outputs correct structure', () => {
      const trace = client.startTrace({ name: 'json-trace' });
      const gen = trace.addGeneration({
        name: 'g',
        input: 'i',
        output: 'o',
        model: 'm',
      });
      gen.submitScore({ value: 2, reason: 'r' });
      const span = trace.addSpan({ name: 's', startTime: 1 });
      span.finish(3);
      trace.logEvent({ message: 'm', timestamp: 1 });
      trace.submitScore({ value: 3, reason: 'r2' });

      const traceJson = trace.toJSON();
      expect(traceJson.generations.length).toBe(1);
      expect(traceJson.spans.length).toBe(1);
      expect(traceJson.events.length).toBe(1);
      expect(traceJson.scores.length).toBe(1);
      expect(traceJson.generations[0]!.scores.length).toBe(1);
      expect(traceJson.spans[0]!.duration).toBe(2);
    });

    test('trace and span record parentTraceId', () => {
      const trace = client.startTrace({ name: 'parent-id-trace' });
      const gen = trace.addGeneration({
        name: 'g',
        input: '',
        output: '',
        model: '',
      });
      const span = trace.addSpan({ name: 's', startTime: Date.now() });
      expect(gen['parentTraceId']).toBe(trace['id']);
      expect(span['parentTraceId']).toBe(trace['id']);
    });

    test('retries/backoff on export error and drops after max retries', async () => {
      // Patch global fetch to fail
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch' as any)
        .mockRejectedValue(new Error('fail'));
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.useFakeTimers();

      // Patch constants for faster retries in this test
      (client as any).constructor.MAX_EXPORT_RETRIES = 2;
      (client as any).constructor.BASE_BACKOFF_MS = 10;
      (client as any).constructor.MAX_BACKOFF_MS = 20;

      const testClient = new Langlite({
        secretKey: 'test-secret',
        flushInterval: 0,
      });
      const trace = testClient.startTrace({ name: 'retry-trace' });

      // There should be a retry sequence and then a drop after max retries
      trace.finish();

      // Fast forward timers for all retries
      for (let i = 0; i < 2; i++) {
        await vi.runOnlyPendingTimersAsync();
      }

      expect(logSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();

      fetchSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
}
