# langlite-core

Core types, data structures, and logic for the Langlite observability SDK.

## Overview

This package provides the platform-agnostic foundation for Langlite:

- **Types**: All TypeScript interfaces and type definitions
- **Data structures**: `LangliteTrace`, `LangliteGeneration`, `LangliteSpan` classes
- **Utilities**: ID generation, serialization helpers
- **No platform dependencies**: Works in Node.js, browsers, and edge environments

## Usage

This package is typically not installed directly. Use `langlite-node` or `langlite-web` instead.

For library authors or advanced use cases:

```typescript
import { LangliteTrace, type TraceArgs } from 'langlite-core';

const trace = new LangliteTrace({ name: 'custom-trace' });
const generation = trace.addGeneration({
  name: 'llm-call',
  model: 'gpt-4',
  input: 'Hello',
  output: 'Hi there!',
});
```

## Exports

- **Types**: `LangliteConfig`, `TraceArgs`, `GenerationArgs`, `SpanArgs`, `EventArgs`, `ScoreArgs`
- **Classes**: `LangliteTrace`, `LangliteGeneration`, `LangliteSpan`
- **Utils**: `generateId`, serialization helpers

## Dependencies

None - this package is dependency-free for maximum compatibility.
