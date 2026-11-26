import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Eye, EyeOff, Key, Loader2, Plus, Plug, Server, Star, Trash2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  AI_PROVIDERS,
  AI_PROVIDERS_EVENT,
  SERVER_DEFAULT_ID,
  addLinkedProvider,
  getAiConfig,
  maskKey,
  presetFor,
  removeLinkedProvider,
  setDefaultProvider,
  testProviderConnection,
  type AiProviderConfig,
  type ProviderKind,
} from '@/lib/ai/providers';

export function AiApiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<AiProviderConfig>(() => getAiConfig());
  const [provider, setProvider] = useState<ProviderKind>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [makeDefault, setMakeDefault] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const sync = () => setCfg(getAiConfig());
    window.addEventListener(AI_PROVIDERS_EVENT, sync);
    return () => window.removeEventListener(AI_PROVIDERS_EVENT, sync);
  }, []);

  useEffect(() => {
    if (open) {
      setCfg(getAiConfig());
      setStatus(null);
    }
  }, [open]);

  const preset = presetFor(provider);

  const onProviderChange = (next: ProviderKind) => {
    const p = presetFor(next);
    setProvider(next);
    setBaseUrl(p.id === 'custom' ? '' : p.baseUrl);
    setStatus(null);
  };

  const handleLink = async () => {
    setStatus(null);
    const trimmedKey = apiKey.trim();
    if (!trimmedKey && provider !== 'custom') {
      setStatus({ kind: 'err', text: `Enter your ${preset.shortName} API key first.` });
      return;
    }
    if (provider === 'custom' && !baseUrl.trim()) {
      setStatus({ kind: 'err', text: 'Enter the Custom API endpoint URL (e.g. https://.../v1/chat/completions).' });
      return;
    }
    // the same key linked twice: just make the existing one Default instead of adding a copy
    const dup = cfg.providers.find((p) => p.provider === provider && p.apiKey === trimmedKey && (provider !== 'custom' || (p.baseUrl || '') === baseUrl.trim()));
    if (dup) {
      if (makeDefault) setCfg(setDefaultProvider(dup.id));
      setApiKey('');
      setStatus({ kind: 'ok', text: `${preset.shortName} is already linked${makeDefault ? ' and is now the Default AI.' : '.'}` });
      return;
    }
    // check the key works before saving it, so a wrong key never becomes the Default
    setLinking(true);
    const check = await testProviderConnection({
      provider,
      apiKey: trimmedKey,
      model: preset.defaultModel,
      ...(provider === 'custom' ? { baseUrl: baseUrl.trim() } : {}),
    });
    setLinking(false);
    if (!check.ok) {
      setStatus({ kind: 'err', text: `Not linked: ${check.error || 'the connection test failed.'}` });
      return;
    }
    const nextCfg = addLinkedProvider(
      {
        provider,
        label: preset.name,
        apiKey: trimmedKey,
        model: preset.defaultModel,
        ...(provider === 'custom' ? { baseUrl: baseUrl.trim() } : {}),
      },
      makeDefault,
    );
    setCfg(nextCfg);
    setApiKey('');
    setStatus({
      kind: 'ok',
      text: `${preset.shortName} linked${makeDefault ? ' and set as active Default AI.' : '.'}`,
    });
  };

  const handleTestDraft = async () => {
    setStatus(null);
    if (!apiKey.trim() && provider !== 'custom') {
      setStatus({ kind: 'err', text: `Enter your ${preset.shortName} API key to test.` });
      return;
    }
    setTesting(true);
    const res = await testProviderConnection({
      provider,
      apiKey: apiKey.trim(),
      model: preset.defaultModel,
      ...(provider === 'custom' ? { baseUrl: baseUrl.trim() } : {}),
    });
    setTesting(false);
    setStatus(res.ok ? { kind: 'ok', text: `${preset.shortName} connected successfully!` } : { kind: 'err', text: res.error || 'Connection failed.' });
  };

  const handleTestSaved = async (id: string) => {
    const item = cfg.providers.find((p) => p.id === id);
    if (!item) return;
    setStatus(null);
    setTestingId(id);
    const res = await testProviderConnection(item);
    setTestingId(null);
    setStatus(res.ok ? { kind: 'ok', text: `${item.label} (${item.model}) is working!` } : { kind: 'err', text: res.error || 'Test failed.' });
  };

  const activeProvider = cfg.defaultId === SERVER_DEFAULT_ID ? null : cfg.providers.find((p) => p.id === cfg.defaultId) ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link AI APIs"
      subtitle={`Active Default: ${activeProvider ? `${activeProvider.label} (${activeProvider.model})` : 'Built-in Server (ChatGPT)'}`}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">All AI features (Adviser, Teaching, Co-worker, Reports) use the selected Default API.</span>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {status && (
          <div
            role="status"
            data-testid="ai-api-status"
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
              status.kind === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {status.kind === 'ok' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
            <span>{status.text}</span>
          </div>
        )}

        {/* Add / Link new API */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Plug size={14} className="text-orange-600" />
              Connect a New AI API
            </h3>
            <span className="text-[11px] text-slate-400">{preset.docsHint}</span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              AI API Provider
              <select
                aria-label="AI Provider"
                data-testid="ai-provider-select"
                value={provider}
                onChange={(e) => onProviderChange(e.target.value as ProviderKind)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold normal-case text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              API Key
              <div className="relative mt-1">
                <input
                  aria-label="API Key"
                  data-testid="ai-key-input"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={preset.keyPlaceholder}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-2.5 pr-8 text-xs font-mono normal-case text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>

            {provider === 'custom' && (
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">
                Custom API Endpoint URL
                <input
                  aria-label="Custom Endpoint URL"
                  data-testid="ai-url-input"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1/chat/completions"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-mono normal-case text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={(e) => setMakeDefault(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              Set as default immediately
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={testing}
                onClick={() => void handleTestDraft()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {testing && <Loader2 size={13} className="animate-spin" />}
                Test
              </button>
              <button
                type="button"
                data-testid="link-api-submit"
                disabled={linking || testing}
                onClick={() => void handleLink()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-b from-orange-500 to-orange-600 px-3.5 text-xs font-bold text-white shadow-sm hover:to-orange-700 disabled:opacity-60"
              >
                {linking ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {linking ? 'Checking…' : 'Link API'}
              </button>
            </div>
          </div>
        </section>

        {/* Linked APIs list + single Default selector */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Linked APIs ({cfg.providers.length + 1})
            </h3>
            <span className="text-[11px] text-slate-400">Select one Default API to use now</span>
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
            {/* Built-in server ChatGPT option */}
            <div
              data-testid="ai-provider-row-server"
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition ${
                cfg.defaultId === SERVER_DEFAULT_ID
                  ? 'border-emerald-300 bg-emerald-50/70'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Server size={15} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-bold text-slate-800">Built-in Server (ChatGPT)</span>
                    {cfg.defaultId === SERVER_DEFAULT_ID && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        <Check size={10} /> Default (In Use)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">Always available. Also answers whenever a linked API fails.</p>
                </div>
              </div>
              {cfg.defaultId !== SERVER_DEFAULT_ID && (
                <button
                  type="button"
                  data-testid="set-default-server"
                  onClick={() => setCfg(setDefaultProvider(SERVER_DEFAULT_ID))}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
                >
                  Set Default
                </button>
              )}
            </div>

            {cfg.providers.map((item) => {
              const p = presetFor(item.provider);
              const isDef = cfg.defaultId === item.id;
              return (
                <div
                  key={item.id}
                  data-testid={`ai-provider-row-${item.id}`}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition ${
                    isDef ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <Key size={14} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-slate-800">{item.label}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{p.shortName}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{item.model}</span>
                        {isDef && (
                          <span data-testid="active-default-badge" className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            <Star size={9} /> Default (In Use)
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[11px] text-slate-500">
                        Key: {maskKey(item.apiKey)}{item.baseUrl ? ` · ${item.baseUrl}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!isDef && (
                      <button
                        type="button"
                        data-testid={`set-default-${item.id}`}
                        onClick={() => setCfg(setDefaultProvider(item.id))}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={testingId === item.id}
                      onClick={() => void handleTestSaved(item.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {testingId === item.id ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.label}`}
                      onClick={() => setCfg(removeLinkedProvider(item.id))}
                      className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                      title="Remove linked API"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}
