# langlite-web

Browser-optimized implementation of the Langlite observability SDK.

## Installation

```sh
npm install langlite-web
# or
yarn add langlite-web
```

## Usage

```typescript
import { Langlite } from 'langlite-web';

const client = new Langlite({
  secretKey: 'your-secret-key',
  host: 'https://api.langlite.com', // optional
});

const trace = client.startTrace({ name: 'user-interaction' });
// ... add generations, spans, events
trace.finish();

// Optional: flush before page unload
window.addEventListener('beforeunload', () => {
  client.flush();
});
```

## Features

- **Browser optimized**: Uses fetch API and browser-compatible patterns
- **Small bundle size**: Minimal dependencies for web applications
- **CORS support**: Works with browser security restrictions
- **TypeScript support**: Full type safety with IntelliSense

## API

Same API as the main `langlite` package. See the [main documentation](../../README.md) for complete usage examples.

## Browser Compatibility

- Modern browsers with fetch API support
- ES2017+ (async/await support)
- Works with all major bundlers (webpack, Vite, Rollup, etc.)
