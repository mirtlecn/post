![Logo](logo.webp)

[Go version API server](https://github.com/mirtlecn/post-go) | [CLI client](https://github.com/mirtlecn/post-cli) | [Skills for AI Agents](https://github.com/mirtlecn/post-cli/tree/master/skills)

# Post — Lightweight File, Text & URL Sharing API & Web UI

## Web UI

Available at <http://localhost:3000/admin>.

![Web UI Screenshot](gui.webp)

## HTTP API

Suggested shell variables:

```bash
export POST_BASE_URL="https://example.com"
export POST_TOKEN="your-secret-key"
```

For details, see [API documentation](https://github.com/mirtlecn/post-go/blob/master/API.md)

## CLI client

[CLI client](https://github.com/mirtlecn/post-cli)

## Deploy

### Vercel 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mirtlecn/post&project-name=post&repository-name=post&build-command=npm%20run%20build&env=LINKS_REDIS_URL,SECRET_KEY,ADMIN_KEY,S3_ENDPOINT,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_BUCKET_NAME,S3_REGION)

Required:
- `LINKS_REDIS_URL` : 'redis://...' or 'rediss://...' URL for Redis connection
- `SECRET_KEY` : API token
- `ADMIN_KEY` : Password for admin GUI login

### Run

Prerequisites:
- Node.js 24+
- Redis (a valid Redis URL. Get a free one at <https://redis.com/>)
- S3-compatible storage (Required for file uploads)

```bash
npm install
cp .env.example .env.local
npm start
```

## Testing

- `npm test`: default local regression chain. Runs `test:quick`, `test:smoke:web:local`, and `test:smoke:api:local`.
- `npm run test:all`: compatibility alias for `npm test`.
- `npm run test:quick`: runs only the unit test suite.
- `npm run test:smoke:local`: runs the local admin/web smoke suite and the local API smoke suite.
- `npm run test:smoke:web:local`: starts the local app with a dedicated Redis DB and exercises `/admin`, `/api/admin`, and the main JSON API with shell assertions.
- `npm run test:smoke:api:local`: starts the local app with a dedicated Redis DB and runs the API-focused smoke suite in [test/functional/smoke-api.sh](test/functional/smoke-api.sh).
- `npm run test:smoke:web:vercel`: reserved for environments where `vercel dev` is available. It is not part of the default test chain.

## Credits

MIT Licence
