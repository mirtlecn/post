# Post Repository Guide for Coding Agents

## Overview

- This repo contains a Node.js API server and a React admin UI.
- Main server entry: `server.js`
- Admin UI source: `web/src`
- API handlers and storage logic: `lib/handlers`, `lib/services`, `lib/utils`
- Functional smoke tests: `test/functional`

## Quick Start

### Install

```bash
npm install
```

### Local development

```bash
# Full local dev: API server + Vite dev server
npm run dev

# Production-like local server
npm start
```

Default admin URL:

```text
http://localhost:3000/admin
```

## Code Map

### Backend

- `api/`: serverless-style route entrypoints
- `lib/handlers/create.js`: create / update request handling
- `lib/handlers/list.js`: authenticated list response
- `lib/handlers/authenticated-lookup.js`: authenticated item lookup
- `lib/services/topic-store.js`: topic storage and index rebuild logic
- `lib/utils/storage.js`: stored value shape, `created` normalization, compatibility helpers

### Frontend

- `web/src/components/CreatePanel.jsx`: composer UI
- `web/src/components/ListPanel.jsx`: list table
- `web/src/components/ResultPanel.jsx`: result card after create
- `web/src/hooks/useComposer.js`: composer state and submit flow
- `web/src/lib/composer-mode.js`: composer request shaping and UI state helpers
- `web/src/styles.css`: shared admin UI styling

## Test Matrix

### Default test entry

```bash
npm test
```

Runs:

- `node --test`
- `bash test/functional/run-local.sh`
- `bash test/functional/run-api-local.sh`

### Other useful test commands

```bash
# Unit tests
npm run test:unit

# Local smoke suites
npm run test:smoke

# Vercel smoke suite
npm run test:vercel
```

Notes:

- `test:unit` runs only `node --test`.
- `test:smoke` runs both local smoke suites without re-running unit tests.
- `test:vercel` is optional and must stay outside the default local chain unless the environment is known to have `vercel dev`.
- Run `npm run test:vercel` outside the sandbox / with escalated permissions by default. If `vercel dev` shows no progress for 10 seconds, stop that run and restart it instead of waiting indefinitely.
- To run only one local smoke suite, call `bash test/functional/run-local.sh` or `bash test/functional/run-api-local.sh` directly.

## Testing Conventions

- If you change request shaping, storage normalization, or UI helper logic, add or update unit tests in `test/*.test.js`.
- If you change externally visible HTTP behavior, add or update shell smoke coverage in `test/functional`.
- Prefer extending existing smoke scripts over creating another overlapping smoke entrypoint.
- Keep smoke assertions deterministic. Use fixed input timestamps when testing `created`.

## Editing Guidance

- Use English for code, comments, filenames, and documentation updates.
- Keep functions and files single-purpose where practical.
- When frontend behavior changes, update:
  - the relevant component or hook
  - helper tests
  - any smoke coverage that validates the same external behavior
  - README if developer-facing commands or workflows changed

## Release Process

- Create a release commit and annotated `vX.Y.Z` tag by using:

```bash
npm run version:bump -- patch
```

- To set an explicit release version, use:

```bash
npm run version:bump -- 1.4.0
```

- The version bump script requires a clean working tree and will:
  - update `package.json` and `package-lock.json`
  - create a `chore(release): bump version to X.Y.Z` commit
  - create an annotated `vX.Y.Z` git tag

- For a normal release:
  - finish and test the functional change
  - commit the functional change first
  - run the version bump script
