// Vercel Serverless Function: the Retail Store backend (every /api/* route except the ERP <-> Retail sync, which has its own function).
// Locally the same Express app runs inside the Vite dev server (see vite.config.ts); on Vercel this file serves it.
// (package.json has "type": "module", so this is an ES module that imports the CommonJS server files.)
import syncModule from '../server/retailSyncHandler.cjs';
import backendModule from '../server/retail_backend/server.cjs';

const { handleRetailSyncRequest } = syncModule;
const { app } = backendModule;

export default function handler(req, res) {
  // /api/retail-sync/<anything> belongs to the sync handler (a catch-all would otherwise take it before the rewrite in vercel.json)
  if (String(req.url || '').startsWith('/api/retail-sync')) return handleRetailSyncRequest(req, res);
  return app(req, res);
}
