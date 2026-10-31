// Vercel Serverless Function entry point for ERP <-> Retail Store API
// (package.json has "type": "module", so this is an ES module that imports the CommonJS handler.)
import syncModule from '../server/retailSyncHandler.cjs';

const { handleRetailSyncRequest } = syncModule;

export default async function handler(req, res) {
  return handleRetailSyncRequest(req, res);
}
