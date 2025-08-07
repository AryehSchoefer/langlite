# langlite-node

Node.js-specific implementation of the Langlite observability SDK.

## Installation

```sh
npm install langlite-node
# or
yarn add langlite-node
```

## Usage

```typescript
import { Langlite } from 'langlite-node';

const client = new Langlite({
  secretKey: 'your-secret-key',
  host: 'https://api.langlite.com', // optional
});

const trace = client.startTrace({ name: 'api-request' });
// ... add generations, spans, events
trace.finish();

await client.shutdown(); // Ensures all data is sent before exit
```

## Features

- **Node.js optimized**: Uses Node.js-specific APIs and patterns
- **Batched exports**: Efficient background flushing with retry logic
- **Graceful shutdown**: Automatic cleanup on process exit
- **TypeScript support**: Full type safety with IntelliSense

## API

Same API as the main `langlite` package. See the [main documentation](../../README.md) for complete usage examples.
