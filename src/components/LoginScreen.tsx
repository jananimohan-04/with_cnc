import { useState } from 'react';
import { Shield } from 'lucide-react';
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
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8FAFC] font-sans selection:bg-brand-500 selection:text-white">
      {/* Left — Cinematic CNC Machining Showcase with Refined Industrial Brand Identity */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-10 lg:p-12 xl:p-14 select-none">
        {/* Real CNC Machining Background Photo */}
        <img
          src="/cnc-machining-bg.jpg"
          alt="CNC Machining"
          className="absolute inset-0 w-full h-full object-cover object-center scale-[1.02] transition-transform duration-1000 ease-out"
        />

        {/* Sophisticated dark overlays for depth, contrast, and industrial mood */}
        <div className="absolute inset-0 bg-slate-950/85" />
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-950/70 to-slate-900/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/75" />

        {/* Warm industrial amber ambient backglow behind the hallmark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[340px] bg-gradient-to-r from-orange-600/15 via-amber-500/15 to-orange-500/10 rounded-full blur-[130px] pointer-events-none" />

        {/* Upper-Left: Integrated ARGUS Business Intelligence Brand */}
        <div className="relative z-10">
          <img
            src="/argus-bi-logo.svg"
            alt="Argus Business Intelligence"
            className="h-12 sm:h-14 w-auto max-w-full object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)] transition-transform duration-300 hover:scale-[1.01]"
          />
        </div>

        {/* Center: Primary Brand Focus — ARGUS CNC on Refined Glass Surface */}
        <div className="relative z-10 my-auto self-center">
          <div className="relative group">
            {/* Ambient luminous glow behind the glass surface */}
            <div className="absolute -inset-1.5 bg-gradient-to-r from-orange-500/20 via-amber-400/25 to-brand-500/20 rounded-3xl blur-2xl opacity-60 group-hover:opacity-90 transition duration-500" />

            {/* Subtle, premium glass-style surface with soft lighting */}
            <div className="relative bg-gradient-to-b from-white/95 via-white/90 to-white/85 backdrop-blur-2xl px-12 py-6 sm:px-16 sm:py-7 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7),0_0_35px_rgba(254,97,2,0.08)] border border-white/60 flex items-center justify-center transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_30px_70px_-12px_rgba(0,0,0,0.75),0_0_45px_rgba(254,97,2,0.15)]">
              <img
                src="/argus-logo.png"
                alt="ARGUS CNC"
                className="h-14 sm:h-16 lg:h-18 w-auto max-w-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* Bottom anchor matching upper-left height for optical vertical centering */}
        <div className="relative z-10 h-14 invisible" />
      </div>

      {/* Right — Clean Enterprise Sign-in Form */}
      <div className="flex-1 flex items-center justify-center bg-[#F8FAFC] border-l border-slate-200/60 px-6 py-12 lg:px-14 xl:px-16">
        <div className="w-full max-w-sm sm:max-w-md bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-10 shadow-[0_10px_35px_-10px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.04)]">
          {/* Mobile Only: Top Logo and Second Logo */}
          <div className="lg:hidden mb-8 flex flex-col items-center gap-3">
            <img
              src="/argus-bi-logo.svg"
              alt="Argus Business Intelligence"
              className="h-12 w-auto max-w-full object-contain drop-shadow-sm"
            />
            <div className="bg-slate-50 px-6 py-2.5 rounded-xl border border-slate-200/80 shadow-xs">
              <img
                src="/argus-logo.png"
                alt="ARGUS CNC"
                className="h-7 w-auto object-contain"
              />
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Welcome Back</h2>
            <p className="text-sm text-slate-500 mt-2 font-normal leading-relaxed">Sign in to your Argus Business Intelligence account</p>
          </div>

          {!isLocalDev && (
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full h-12 flex items-center justify-center gap-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-5 text-sm font-semibold text-slate-700 shadow-xs hover:shadow-md transition-all duration-200 active:scale-[0.99] disabled:opacity-70 cursor-pointer group"
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
              <span>Continue with Google</span>
            </button>
          )}

          {isLocalDev && (
            <form
              className="mt-6 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void signInWithPassword(devEmail.trim(), devPassword);
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Local dev only — temporary
              </p>
              <p className="mt-1 text-[11px] text-amber-700/80">
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
                className="mt-3 w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-700 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
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

          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-2 select-none text-center">
            <div className="inline-flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <span className="font-normal text-slate-400">Powered by</span>
              <img
                src="/argus-logo.png"
                alt="ARGUS CNC"
                className="inline-block object-contain opacity-75 hover:opacity-100 transition-opacity"
                style={{ height: '20px', maxHeight: '20px', width: 'auto' }}
              />
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400/80">
              <Shield size={11} className="text-slate-400/80 flex-shrink-0" />
              <span>Access is limited to accounts registered by your administrator</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
