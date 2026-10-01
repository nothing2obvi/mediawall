## Development

Node.js 22 or later is required. The Jellyfin collection index uses Node's built-in SQLite support.

Install dependencies:

```sh
npm install
```

Run checks:

```sh
npm run typecheck
npm test
npm run build
```

For local development, set `library.directory` in your config to a writable folder, such as `./library`. Then run:

```sh
npm run dev
```

