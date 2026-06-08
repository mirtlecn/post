import { handleEdgeOneRequest } from './post-handler.js';

export function onRequest(context) {
  return handleEdgeOneRequest(context);
}
