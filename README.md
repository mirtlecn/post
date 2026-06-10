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

Management actions use top-level POST endpoints:

```bash
curl -H "Authorization: Bearer $POST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"note","url":"hello","type":"text"}' \
  "$POST_BASE_URL/create"

curl -H "Authorization: Bearer $POST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"note"}' \
  "$POST_BASE_URL/query"

curl -H "Authorization: Bearer $POST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"note","url":"updated","type":"text"}' \
  "$POST_BASE_URL/update"

curl -H "Authorization: Bearer $POST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"note"}' \
  "$POST_BASE_URL/delete"
```

`GET /query`, `GET /create`, `GET /update`, and `GET /delete` remain normal public content paths.

Topic pages keep a flat list by default. When a topic has more than 10 entries across multiple Asia/Shanghai display years, entries are grouped by year. Topic index snapshots are stored as Markdown and rendered to HTML at request time, so deployment-local Markdown footer configuration is not persisted in Redis.

For details, see [API documentation](https://github.com/mirtlecn/post-go/blob/master/API.md)

## CLI client

[CLI client](https://github.com/mirtlecn/post-cli)

## Deploy

### Vercel 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mirtlecn/post&project-name=post&repository-name=post&build-command=npm%20run%20build&env=LINKS_REDIS_URL,SECRET_KEY,ADMIN_KEY,BASE_DOMAIN,FOOTER,S3_ENDPOINT,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY,S3_BUCKET_NAME,S3_REGION)

Required:
- `LINKS_REDIS_URL` : 'redis://...' or 'rediss://...' URL for Redis connection
- `SECRET_KEY` : API token
- `ADMIN_KEY` : Password for admin GUI login
- `BASE_DOMAIN` : Optional public domain for generated links, for example `www.example.com`
- `FOOTER` : Optional base64-encoded HTML footer for rendered Markdown pages. Invalid base64 or blank decoded HTML is ignored.

### EdgeOne Pages

Same as Vercel.

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

- `npm test`: runs the full local regression chain: unit tests, local admin/web smoke, and local API smoke.
- `npm run test:unit`: runs only the Node unit test suite.
- `npm run test:smoke`: runs the two local smoke suites without unit tests.
- `npm run test:vercel`: runs the Vercel smoke suite with `vercel dev`. It is intentionally separate from the local regression chain.

## Credits

MIT Licence
