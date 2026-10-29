import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

// https://vitejs.dev/config/
function retailSyncPlugin() {
  return {
    name: 'retail-sync-middleware',
    configureServer(server: any) {
      server.middlewares.use('/api/retail-sync', async (req: any, res: any, next: any) => {
        try {
          const modPath = nodeRequire.resolve('./server/retailSyncHandler.cjs');
          delete nodeRequire.cache[modPath];
          const { handleRetailSyncRequest } = nodeRequire('./server/retailSyncHandler.cjs');
          req.url = '/api/retail-sync' + (req.url.startsWith('/') ? req.url : '/' + req.url);
          await handleRetailSyncRequest(req, res);
        } catch (e) {
          next(e);
        }
      });
    }
  };
}

function retailBackendPlugin() {
  return {
    name: 'retail-backend-middleware',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || '';
        if ((url.startsWith('/api/') || url === '/api') && !url.startsWith('/api/retail-sync')) {
          try {
            const { app } = nodeRequire('./server/retail_backend/server.cjs');
            return app(req, res, (err: any) => {
              if (err) {
                console.error('[retail-backend error]', err);
                if (!res.headersSent) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: err.message || 'Retail backend error' }));
                }
              }
              next();
            });
          } catch (e: any) {
            console.error('[retail-backend error]', e);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: e.message || 'Retail backend error' }));
            }
            return;
          }
        }
        if (url.startsWith('/uploads/') || url === '/uploads') {
          try {
            const { app } = nodeRequire('./server/retail_backend/server.cjs');
            return app(req, res, next);
          } catch (e: any) {
            console.error('[retail-backend uploads error]', e);
            if (!res.headersSent) {
              res.statusCode = 404;
              return res.end('File not found');
            }
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // The retail sync handler reads its settings (RETAIL_STORE_API_KEY ...) from process.env; make .env.local reach it in dev.
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ''))) if (process.env[k] === undefined) process.env[k] = v;
  return {
  plugins: [react(), retailSyncPlugin(), retailBackendPlugin()],
  server: {
    hmr: {
      overlay: false,
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
};
});
