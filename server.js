import { createServer } from 'http';
import { resolve } from 'path';
import { createLocalRequestHandler } from './lib/server/create-local-handler.js';
import { getMissingEnvironmentVariables, loadEnvironmentFiles } from './lib/server/env.js';

const loadedEnvironmentFile = loadEnvironmentFiles();
if (loadedEnvironmentFile) {
  console.log(`Loaded env from: ${loadedEnvironmentFile}`);
}

const missingEnvironmentVariables = getMissingEnvironmentVariables(['LINKS_REDIS_URL', 'SECRET_KEY']);
if (missingEnvironmentVariables.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingEnvironmentVariables.join(', ')}`);
  console.error('Please create a .env.local file. See .env.example for reference.');
  process.exit(1);
}

const { default: handleRoot } = await import('./api/index.js');

const port = process.env.PORT || 3000;
const adminDirectory = resolve(process.cwd(), 'public', 'admin');
const requestHandler = createLocalRequestHandler({
  adminDirectory,
  handleRoot,
});

createServer(requestHandler).listen(port, () => {
  console.log(`\n✅  Server running at http://localhost:${port}`);
  console.log(`    Press Ctrl+C to stop.\n`);
});
