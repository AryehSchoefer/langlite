# langlite

**langlite** is a lightweight, type-safe TypeScript SDK for observability and tracing in LLM and AI-powered applications. It helps you batch, export, and analyze traces, generations, spans, events, and scores efficiently from both Node.js and browser environments.

---

## Features

- **Type-safe API** – Designed with strict TypeScript for maximum safety and developer experience.
- **Trace & Span Support** – Instrument your application with end-to-end traces and granular spans.
- **Specialized LLM Generation Tracking** – Capture prompts, completions, model info, token usage, and metadata.
- **Event & Score Logging** – Add point-in-time events and qualitative feedback.
- **Batching & Non-blocking** – Data is queued and sent in efficient batches, never blocking your app.
- **Isomorphic** – Works seamlessly in Node.js and all modern browsers.
- **Graceful Shutdown** – Ensures all queued data is sent before exit.
- **Lightweight** – Minimal dependencies and fast.

---

## Installation

```sh
npm install langlite
# or
yarn add langlite
# or
pnpm add langlite
```

---

## Quick Start

```typescript
import { Langlite } from 'langlite';

const client = new Langlite({
  publicKey: 'your-public-key',
  secretKey: 'your-secret-key',
  host: 'https://your-observability-api.com', // Optional, defaults to official endpoint
});

// Start a trace for an operation
const trace = client.startTrace({ name: 'user-api-request' });

// Add a generation (LLM call) to the trace
const generation = trace.addGeneration({
  name: 'summarize',
  model: 'gpt-4o',
  input: 'Summarize this text...',
  output: 'This is the summary.',
  usage: { promptTokens: 20, completionTokens: 15 },
  metadata: { temperature: 0.7 },
});

// Add a span to the trace
trace.addSpan({ name: 'db-query', metadata: { query: 'SELECT ...' } });

// Log an event
trace.logEvent({ message: 'User authenticated', timestamp: Date.now() });

// Submit a score to the generation
generation.submitScore({ value: 1, reason: 'Accurate summary' });

// Mark the trace as finished (sends to queue)
trace.finish();

// Optional: ensure all data is sent before app exit
await client.shutdown();
```

---

## Example Usage

See the [examples/](./examples/) directory for more use cases:

- `simple-generation.ts` – Basic LLM generation trace
- `chat-with-metadata.ts` – Logging chat data with user/session info
- `trace-with-spans.ts` – Tracing multi-step processes

---

## API Overview

### Langlite Client

| Method         | Description                             |
| -------------- | --------------------------------------- |
| `startTrace()` | Begin a new trace for an operation      |
| `flush()`      | Manually flush the event queue          |
| `shutdown()`   | Flush and shutdown gracefully (on exit) |

### Trace Object

| Method            | Description                                |
| ----------------- | ------------------------------------------ |
| `addGeneration()` | Log an LLM call (prompt, output, model, …) |
| `addSpan()`       | Add a work unit (step) to the trace        |
| `logEvent()`      | Add an event/breadcrumb to the trace       |
| `submitScore()`   | Attach qualitative feedback to the trace   |
| `finish()`        | Finalize the trace and queue for export    |

### Generation Object

| Method          | Description                                   |
| --------------- | --------------------------------------------- |
| `submitScore()` | Attach qualitative feedback to the generation |

---

## TypeScript Types

All public APIs are strictly typed. See [`src/types.ts`](./src/types.ts) for details.

---

## Configuration

| Option          | Type   | Description                                    |
| --------------- | ------ | ---------------------------------------------- |
| `publicKey`     | string | (Optional) Public API key                      |
| `secretKey`     | string | Secret API key (required for write operations) |
| `host`          | string | API endpoint (optional, defaults to official)  |
| `flushInterval` | number | Flush queue every X ms (default: 10,000)       |

---

## Development

- **Formatting:** Uses [Prettier](https://prettier.io/) for code style.
- **Type-checking:** Uses [TypeScript (`tsc`)](https://www.typescriptlang.org/) for type safety.
- **Build:** Uses [tsup](https://tsup.egoist.dev/) for fast, modern bundling and dual ESM/CJS output.
- **Linting:** Plans to migrate to [Biome](https://biomejs.dev/) for unified linting and formatting in the future.
- **Test:** [vitest](https://vitest.dev/) for fast, type-safe unit tests.

```sh
# Format code
npm run format

# Type-check code
npm run type-check

# Build (with tsup)
npm run build

# Test
npm run test
```

---

## License

MIT

---

## Contributing

Contributions and ideas are welcome! Please open an issue or PR.

---

## Links

- [GitHub Repository](https://github.com/AryehSchoefer/langlite)
- [Issues](https://github.com/AryehSchoefer/langlite/issues)
