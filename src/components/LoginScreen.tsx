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

const LOGIN_FONT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap');

.login-editorial {
  font-family: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

.login-editorial-heading {
  font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 1.625rem;
  line-height: 1.15;
  letter-spacing: -0.025em;
  font-weight: 700;
}

@media (min-width: 1024px) {
  .login-editorial-heading {
    font-size: 1.875rem;
  }
}

.login-editorial-desc {
  font-size: 0.875rem;
  line-height: 1.5;
}

.login-editorial-btn {
  font-size: 0.875rem;
  line-height: 1.25;
}

.login-editorial-meta {
  font-size: 0.75rem;
  line-height: 1.4;
}

.login-editorial-note {
  font-size: 0.75rem;
  line-height: 1.45;
}
`;

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
    <div className="login-editorial min-h-screen w-full flex flex-col md:flex-row bg-[#F7F5F2] text-[#18181B] selection:bg-[#FE6102] selection:text-white">
      <style>{LOGIN_FONT_STYLES}</style>

      {/* Left Industrial Panel — 55% desktop / 48% tablet / compact header on mobile */}
      <div className="relative w-full h-[240px] sm:h-[270px] md:h-auto md:w-[48%] lg:w-[55%] md:min-h-screen overflow-hidden flex flex-col justify-between bg-[#141619] select-none shrink-0">
        {/* Original CNC Machining Photograph — Primary visual feature */}
        <img
          src="/cnc-machining-bg.jpg"
          alt="CNC Machining"
          className="absolute inset-0 w-full h-full object-cover object-[53%_42%] md:object-[54%_44%]"
        />

        {/* Subtle edge shading for balance over the CNC photograph */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[36%] md:h-[28%] bg-gradient-to-b from-[#0B0E14]/35 via-[#0B0E14]/15 to-transparent pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[20%] md:h-[16%] pointer-events-none"
          style={{
            background:
              'linear-gradient(to top, rgba(13, 16, 20, 0.55) 0%, rgba(13, 16, 20, 0.18) 55%, rgba(13, 16, 20, 0) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="hidden md:block absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#111316]/25 to-transparent pointer-events-none"
        />

        {/* Bottom-left: the company mark, small and quiet (the product logo above is the main brand; on phones the
            "Powered by" under the sign-in button shows it instead) */}
        <div className="hidden md:flex absolute bottom-6 left-6 lg:left-8 xl:left-10 z-10 items-center gap-2 rounded-lg bg-white/90 backdrop-blur-sm px-2.5 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.35)] pointer-events-none">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B6760]">A product of</span>
          <img src="/argus-logo.png" alt="ARGUS CNC" className="h-[18px] lg:h-5 w-auto object-contain" />
        </div>

        {/* Top-Left: Original ARGUS Business Intelligence Logo */}
        <div className="relative z-10 px-5 sm:px-7 md:px-6 lg:px-8 xl:px-10 pt-[max(1.125rem,var(--safe-area-inset-top,0px))] md:pt-7 lg:pt-8 xl:pt-9">
          <div className="inline-flex items-center rounded-xl bg-white border border-white px-3 py-1.5 sm:px-3.5 sm:py-2 lg:px-4 lg:py-2 shadow-[0_10px_28px_rgba(0,0,0,0.42)]">
            <img
              src="/argus-bi-logo.png"
              alt="Argus Business Intelligence"
              className="h-[52px] sm:h-[60px] md:h-[72px] lg:h-[90px] xl:h-[104px] w-auto max-w-full object-contain"
            />
          </div>
        </div>
      </div>

      {/* Right Authentication Panel — 45% desktop / 52% tablet / compact centered warm off-white surface */}
      <div className="flex-1 md:w-[52%] lg:w-[45%] flex flex-col justify-start md:justify-center items-center bg-[#F7F5F2] border-t md:border-t-0 md:border-l border-[#E2DDD4] px-6 sm:px-10 md:px-9 lg:px-12 pt-9 pb-[max(2rem,var(--safe-area-inset-bottom,0px))] md:py-10">
        <div className="w-full max-w-[384px] mx-auto">
          <div className="text-center">
            <h2 className="login-editorial-heading text-[#18181B]">
              Welcome Back
            </h2>
            <p className="login-editorial-desc mt-1.5 text-[#5C5954] font-normal">
              Sign in to your Argus Business Intelligence account
            </p>
          </div>

          <div className="mt-6">
            {!isLocalDev && (
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="login-editorial-btn w-full h-11 flex items-center justify-center gap-2.5 bg-white hover:bg-[#FCFBF9] border border-[#DBD7CE] hover:border-[#B9B3A8] rounded-[9px] px-4 font-semibold text-[#1F2328] shadow-[0_1px_2px_rgba(24,24,27,0.04)] hover:shadow-[0_4px_12px_rgba(24,24,27,0.06)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6600]/35 focus-visible:border-[#FF6600] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-[#D6D2CA] border-t-[#FF6600] rounded-full animate-spin" />
                ) : (
                  <svg className="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                className="rounded-[9px] border border-dashed border-amber-300 bg-amber-50/60 p-3.5"
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
                  className="mt-2.5 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="password"
                  value={devPassword}
                  onChange={(e) => setDevPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Password"
                  className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !devPassword}
                  className="mt-2.5 w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-700 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                >
                  Sign in with password
                </button>
              </form>
            )}

            {errorMessage && (
              <p className="mt-3.5 text-xs text-red-700 bg-red-50 border border-red-200/80 rounded-[9px] px-3 py-2 text-center">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Footer Attribution & Access Notice */}
          <div className="mt-6 pt-4 border-t border-[#E2DDD4] flex flex-col items-center text-center gap-2 select-none">
            <div className="login-editorial-meta inline-flex items-center justify-center gap-2 text-[#6B6760]">
              <span className="font-normal">Powered by</span>
              <img
                src="/argus-logo.png"
                alt="ARGUS CNC"
                className="inline-block object-contain opacity-90 hover:opacity-100 transition-opacity"
                style={{ height: '18px', maxHeight: '18px', width: 'auto' }}
              />
            </div>
            <p className="login-editorial-note text-[#78746C] text-center">
              <Shield size={12} className="inline-block align-middle mr-1.5 -mt-[2px] text-[#8A857C]" />
              <span>Access is limited to accounts registered by your administrator</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
