import { useState } from 'react';
import { ExternalLink, Monitor } from 'lucide-react';

export function CNCVaultPage() {
  const vaultUrl = import.meta.env.VITE_VAULT_URL || 'http://localhost:8081';
  const [iframeError, setIframeError] = useState(false);

  // Check if we're on localhost (development)
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // If on production and no VITE_VAULT_URL is set (or it's still localhost), show a message
  const showFallback = !isDev && (vaultUrl.includes('localhost') || iframeError);

  if (showFallback) {
    return (
      <div className="w-full h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-brand-100 rounded-2xl flex items-center justify-center">
            <Monitor size={32} className="text-brand-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Part & Drawings Vault</h2>
          <p className="text-sm text-slate-500 mb-6">
            The Document Vault requires a separate deployment. It is currently available on your local development environment.
          </p>
          <p className="text-xs text-slate-400">
            To enable on production, deploy the <code className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-600">pixel-perfect-app</code> folder 
            as a separate Vercel project and set <code className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-600">VITE_VAULT_URL</code> in your main project's environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-4rem)]">
      <iframe 
        src={vaultUrl} 
        className="w-full h-full border-0" 
        onError={() => setIframeError(true)}
      />
    </div>
  );
}
