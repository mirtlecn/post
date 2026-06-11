import { getRequestUrl, tryServeAdminAsset } from './admin-assets.js';
import { wrapNodeResponse } from './response-adapter.js';

export function createLocalRequestHandler({
  adminDirectory,
  handleRoot,
}) {
  return async function handleLocalRequest(req, response) {
    wrapNodeResponse(response);
    const { pathname } = getRequestUrl(req);

    try {
      if (await tryServeAdminAsset(req, response, adminDirectory)) {
        return;
      }
    } catch (error) {
      console.error('Failed to serve admin UI:', error);
      response.statusCode = 500;
      response.end('Internal server error');
      return;
    }

    return handleRoot(req, response);
  };
}
