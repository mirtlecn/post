# Post — Lightweight File, Text & URL Sharing API

## Running

Prerequisites:
- Node.js / Vercel
- Redis
- S3-compatible storage (Required for file uploads)

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Start local server (http://localhost:3000)
npm start
```

Required: `LINKS_REDIS_URL`, `SECRET_KEY`

Optional: `MAX_CONTENT_SIZE_KB` (default 500), `MAX_FILE_SIZE_MB` (default 10), `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION`

---

## API

Write operations require the header `Authorization: Bearer <SECRET_KEY>`.

```bash
# POST /  Create an entry (returns 409 if path already exists)
curl -X POST https://example.com/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://target.com","path":"mylink","ttl":1440}'
  # url:     target URL or text content (required)
  # path:    custom path, auto-generated if omitted
  # type:    url | text | html, auto-detected if omitted
  # ttl:     expiry time in minutes
  # convert: md2html | qrcode | html | url | text

# PUT /  Create or overwrite (201 if new, 200 if overwritten)
curl -X PUT https://example.com/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://new-target.com","path":"mylink"}'

# POST /  Upload a binary file (multipart/form-data, stored in S3)
curl -X POST https://example.com/ \
  -H "Authorization: Bearer <token>" \
  -F "file=@photo.jpg" \
  -F "path=myimg" \
  -F "ttl=1440"
  # path is auto-suffixed with the file extension (e.g. myimg → myimg.jpg)
  # ttl determines the S3 key prefix: 1day / 1week / 1month / 1year / default

# DELETE /  Delete an entry (file type is also removed from S3)
curl -X DELETE https://example.com/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"path":"mylink"}'

# GET /  List all entries (requires auth)
curl https://example.com/ \
  -H "Authorization: Bearer <token>"
  # add -H "X-Export: true" to get full untruncated content

# GET /:path  Access content (no auth required)
curl https://example.com/mylink
  # url  → 302 redirect
  # text → plain text response
  # html → rendered in browser
  # file → streamed proxy download, URL unchanged
  # authenticated requests always return JSON details
```

Response structure:

```json
{
  "surl": "https://example.com/mylink",
  "path": "mylink",
  "type": "url",
  "content": "https://target.com",
  "expires_in": null
}
```

---

## CLI

```bash
export POST_HOST=https://your-domain.com
export POST_TOKEN=your-secret-key

post help # get usage instructions
```

---

## License & Credits

MIT License

© 2026 [Mirtle](https://github.com/mirtle), built with [GitHub Copilot](https://github.com/features/copilot).
