import { useState } from 'react';
import { Shield, Cpu, Activity, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// TEMPORARY (local dev only): password sign-in is shown only when running the dev server
// against the LOCAL Supabase, because it has no Google OAuth credentials. Against the hosted
// project (and in every hosted build) the screen is Google-only, exactly like production.
// TODO: remove once local Google OAuth works.
const isLocalDev =
  import.meta.env.DEV &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
  /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(String(import.meta.env.VITE_SUPABASE_URL ?? ''));

export function LoginScreen() {
  const { signInWithGoogle, signInWithPassword, errorMessage } = useAuth();
  const [loading, setLoading] = useState(false);
  const [devEmail, setDevEmail] = useState('jananimohan44@gmail.com');
  const [devPassword, setDevPassword] = useState('');

  // Redirects to Google; on return AuthProvider checks the account against the BI user list.
  const handleGoogle = async () => {
    setLoading(true);
    await signInWithGoogle();
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 font-sans selection:bg-brand-500 selection:text-white">
      {/* Left — High-End Industrial Enterprise Showcase */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#0a0e17] flex-col justify-between p-12 xl:p-16 text-white border-r border-slate-800/60">
        {/* Subtle luminous ambient background lighting */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0c121e] via-[#090d16] to-[#06080f]" />
        
        {/* Ambient brand glow */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand-500/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/2 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-brand-600/10 rounded-full blur-[140px] pointer-events-none" />

        {/* Precision technical grid with vignette */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse at 50% 50%, black 40%, transparent 85%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 40%, transparent 85%)',
          }}
        />

        {/* Top Header: Parent Brand */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/argus-logo-white.png"
              alt="ARGUS CNC"
              className="h-8 w-auto object-contain filter drop-shadow-md"
            />
            <span className="hidden xl:inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-medium bg-brand-500/15 text-brand-300 border border-brand-500/30 tracking-wide">
              Creating Future Factories
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-white/5 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>CNC Cloud Online</span>
          </div>
        </div>

        {/* Center: Enterprise Intelligence Showcase */}
        <div className="relative z-10 max-w-xl my-auto py-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20 mb-5">
            <Cpu size={13} className="text-brand-400" />
            <span>Enterprise Shop Floor Platform</span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-tight">
            Precision Intelligence for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-orange-400 to-amber-300">
              Modern CNC Factories
            </span>
          </h1>

          <p className="text-sm xl:text-base text-slate-400 mt-4 leading-relaxed max-w-lg">
            Manage your entire machining lifecycle with real-time shop floor telemetry, job planning, precision quality metrics, and dispatch intelligence.
          </p>

          {/* Telemetry Feature Cards */}
          <div className="grid grid-cols-3 gap-3.5 mt-8">
            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex flex-col justify-between hover:bg-white/[0.07] transition-all">
              <div className="flex items-center justify-between text-brand-400 mb-2">
                <Activity size={18} />
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Live</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">Telemetry</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Real-time floor data</p>
              </div>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex flex-col justify-between hover:bg-white/[0.07] transition-all">
              <div className="flex items-center justify-between text-brand-400 mb-2">
                <Cpu size={18} />
                <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">OEE</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">Operations</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Enquiry to dispatch</p>
              </div>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex flex-col justify-between hover:bg-white/[0.07] transition-all">
              <div className="flex items-center justify-between text-brand-400 mb-2">
                <CheckCircle2 size={18} />
                <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">ISO</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">Aerospace</p>
                <p className="text-[11px] text-slate-400 mt-0.5">AS9100D compliant</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-5">
          <span>ARGUS CNC Machine Ecosystem</span>
          <span className="font-mono">v3.2 Enterprise</span>
        </div>
      </div>

      {/* Right — Focused Sign-in Portal */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-gradient-to-b from-slate-50 to-slate-100/70">
        <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-8 sm:p-10">
          {/* Main Product Branding — Argus Business Intelligence */}
          <div className="flex flex-col items-center text-center mb-8">
            <img
              src="/argus-bi-logo.svg"
              alt="Argus Business Intelligence"
              className="h-14 sm:h-16 w-auto max-w-full object-contain drop-shadow-sm mb-4"
            />
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome Back</h2>
            <p className="text-sm text-slate-500 mt-1">Sign in with your enterprise credentials</p>
          </div>

          {/* Hosted / Production: Google OAuth */}
          {!isLocalDev && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50/60 hover:shadow-md rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-700 transition-all active:scale-[0.99] disabled:opacity-70 group"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-slate-300 border-t-brand-600 rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                <span className="text-slate-800 group-hover:text-slate-900">Continue with Google</span>
              </button>
            </div>
          )}

          {/* Local Dev Only */}
          {isLocalDev && (
            <form
              className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/70 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void signInWithPassword(devEmail.trim(), devPassword);
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                Local dev only — temporary
              </p>
              <p className="mt-1 text-[11px] text-amber-700/90 leading-normal">
                Google OAuth isn’t configured locally — sign in with the local dev password instead.
              </p>
              <input
                type="email"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                autoComplete="username"
                className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-500 focus:outline-none"
              />
              <input
                type="password"
                value={devPassword}
                onChange={(e) => setDevPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Password"
                className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !devPassword}
                className="mt-3 w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-700 active:scale-[0.98] disabled:opacity-60"
              >
                Sign in with password
              </button>
            </form>
          )}

          {errorMessage && (
            <p className="mt-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">
              {errorMessage}
            </p>
          )}

          {/* Sign-in Card Footer */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <div className="inline-flex items-center justify-center gap-1.5 select-none text-[11.5px] text-slate-400">
              <span className="font-normal text-slate-400">Powered by</span>
              <img
                src="/argus-logo.png"
                alt="ARGUS CNC"
                className="inline-block object-contain opacity-80 hover:opacity-100 transition-opacity"
                style={{ height: '13px', maxHeight: '13px', width: 'auto' }}
              />
            </div>
            <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[10.5px] text-slate-400">
              <Shield size={11} className="text-slate-400 flex-shrink-0" />
              <span>Access is limited to authorized enterprise accounts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
