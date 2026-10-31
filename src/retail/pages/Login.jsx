/* Login — modern split-screen React view with industrial CNC showcase & secure authentication. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { toast } from '../components/ui';
import {
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertCircle
} from 'lucide-react';

const CNC_SLIDES = [
  {
    image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=1400&q=85',
    title: 'Heavy CNC Machining Centers',
    subtitle: '12-Station Servo Turret & High-Torque Precision Turning',
    category: 'CNC Machining Center'
  },
  {
    image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1400&q=85',
    title: 'Precision Metal Turning & Coolant Flow',
    subtitle: 'High-speed alloy cutting with continuous multi-axis feed',
    category: 'CNC Turning & Cutting'
  },
  {
    image: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1400&q=85',
    title: '5-Axis Precision Milling Center',
    subtitle: 'Complex aeronautical profiling with C7 rolled ball screws',
    category: 'Precision Milling'
  },
  {
    image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=1400&q=85',
    title: 'Solid Carbide & Spindle Assemblies',
    subtitle: 'AlCrN-coated end mills engineered for 55 HRC hardened steels',
    category: 'Cutting Tools & Spindles'
  },
  {
    image: 'https://images.unsplash.com/photo-1581091012184-5c1d9ae4a3d2?auto=format&fit=crop&w=1400&q=85',
    title: 'Robotic Automation Cells',
    subtitle: 'Intelligent part handling and automated pallet management',
    category: 'Robotic Automation'
  },
  {
    image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1400&q=85',
    title: 'Modern CNC Factory Ecosystem',
    subtitle: 'Live BI synchronization with real-time inventory balances',
    category: 'Connected Factory Floor'
  }
];

export const rolePath = (role) => {
  switch (role) {
    case 'super_admin': return '/super/dashboard';
    case 'company_admin': return '/admin/dashboard';
    case 'content_writer': return '/content';
    case 'finance': return '/finance';
    case 'pending':
    case 'disabled': return '/pending';
    default: return '/store/home';
  }
};

export default function Login() {
  const { me, googleLogin, loginAsEmail } = useAuth();
  const nav = useNavigate();
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [setupMsg, setSetupMsg] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [localEmail, setLocalEmail] = useState('jananimohan44@gmail.com');

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % CNC_SLIDES.length), 5000);
    return () => clearInterval(t);
  }, [paused]);

  useEffect(() => {
    if (me) nav(rolePath(me.role), { replace: true });
  }, [me, nav]);

  const doGoogle = async () => {
    try {
      setIsLoggingIn(true);
      await googleLogin();
    } catch (e) {
      setSetupMsg(true);
      toast(e.message || 'Google OAuth configuration required (see setup guidance)', '⚠️');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const doEmailLogin = async (targetEmail) => {
    const em = (targetEmail || localEmail || '').trim().toLowerCase();
    if (!em) {
      toast('Please enter an email address', '⚠️');
      return;
    }
    try {
      setIsLoggingIn(true);
      const res = await loginAsEmail(em);
      if (res && res.role) {
        toast(`Signed in as ${res.name} (${res.role === 'super_admin' ? 'Super Admin' : res.role})`, '👋');
        nav(rolePath(res.role), { replace: true });
      } else {
        toast('Account not found or not active in BI', '⚠️');
      }
    } catch (e) {
      toast('Login failed: ' + e.message, '⚠️');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const prevSlide = () => setSlide((s) => (s - 1 + CNC_SLIDES.length) % CNC_SLIDES.length);
  const nextSlide = () => setSlide((s) => (s + 1) % CNC_SLIDES.length);

  return (
    <div className="h-screen w-screen flex flex-col lg:flex-row bg-slate-900 overflow-hidden font-sans select-none">
      {/* ── LEFT SHOWCASE: Industrial CNC Visual Stage ── */}
      <div
        className="relative hidden lg:flex lg:w-[58%] xl:w-[60%] flex-col justify-between p-8 xl:p-12 text-white overflow-hidden bg-slate-950"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Background Image Carousel Slides */}
        <div className="absolute inset-0 z-0">
          {CNC_SLIDES.map((s, i) => (
            <div
              key={i}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                i === slide ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
              } transition-transform duration-[7000ms]`}
            >
              <img
                src={s.image}
                alt={s.title}
                className="w-full h-full object-cover object-center"
                onError={(e) => {
                  e.currentTarget.src = `https://picsum.photos/seed/argus-cnc-${i}/1200/900`;
                }}
              />
            </div>
          ))}
          {/* Deep Industrial Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-900/50 z-10" />
          <div className="absolute inset-0 bg-radial from-transparent via-slate-950/30 to-slate-950/80 z-10" />
        </div>

        {/* Top Header: Logo + Live Sync Badge */}
        <div className="relative z-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/argus-logo.png"
              alt="ARGUSCNC — Creating Future Factories"
              className="h-9 xl:h-10 w-auto object-contain drop-shadow-md brightness-110"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className="hidden xl:inline text-xs font-bold tracking-widest text-slate-300 uppercase pl-2 border-l border-white/20">
              Industrial Store & BI
            </span>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-slate-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Connected Factory Floor</span>
          </div>
        </div>

        {/* Center Showcase Content */}
        <div className="relative z-20 my-auto max-w-xl py-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/40 text-[11px] font-extrabold tracking-wider uppercase mb-4 shadow-xs">
            <Sparkles size={13} className="text-orange-400" />
            <span>Engineering The Future</span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-white leading-tight mb-3">
            Precision manufacturing.<br />
            Intelligent automation.<br />
            Industrial excellence.
          </h1>

          <p className="text-sm xl:text-base text-slate-300 leading-relaxed mb-6 font-normal max-w-lg">
            Your connected enterprise platform for CNC manufacturing, industrial procurement, and BI shop-floor operations.
          </p>

          {/* Feature Badges */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-slate-100 shadow-xs">
              <span className="text-orange-400 font-bold">⚙️</span> Multi-Company BI
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-slate-100 shadow-xs">
              <span className="text-orange-400 font-bold">📦</span> Industrial Inventory
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-slate-100 shadow-xs">
              <span className="text-orange-400 font-bold">⚡</span> Smart Procurement
            </span>
          </div>
        </div>

        {/* Bottom Slide Controls & Title */}
        <div className="relative z-20 flex items-center justify-between pt-4 border-t border-white/10 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {CNC_SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSlide(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    i === slide ? 'w-6 bg-[#FF6500]' : 'w-2 bg-white/30 hover:bg-white/60'
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-400 tracking-wider">
              {String(slide + 1).padStart(2, '0')} / {String(CNC_SLIDES.length).padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-300 font-medium hidden sm:inline mr-2">
              {CNC_SLIDES[slide].category}
            </span>
            <button
              type="button"
              onClick={prevSlide}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors cursor-pointer"
              title="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors cursor-pointer"
              title="Next"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: Compact, Modern Authentication Deck ── */}
      <div className="flex-1 flex flex-col justify-center items-center bg-slate-50 p-4 sm:p-8 lg:p-10 relative overflow-y-auto">
        <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-6 sm:p-8 my-auto">
          {/* Logo Brand Header */}
          <div className="text-center mb-5">
            <img
              src="/assets/argus-logo.png"
              alt="ARGUSCNC Logo"
              className="h-10 w-auto object-contain mx-auto mb-3"
            />
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Welcome Back
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Sign in with your authorized Google account to access your company's industrial workspace.
            </p>
          </div>

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={doGoogle}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50/90 hover:border-slate-400 text-slate-700 font-semibold text-sm shadow-xs transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{isLoggingIn ? 'Connecting…' : 'Continue with Google'}</span>
          </button>

          <div className="my-4 flex items-center gap-3 text-slate-400 text-[11px] font-bold">
            <div className="flex-1 h-px bg-slate-200" />
            <span>OR SIGN IN WITH REGISTERED EMAIL</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              doEmailLogin();
            }}
            className="space-y-2.5"
          >
            <input
              type="email"
              value={localEmail}
              onChange={(e) => setLocalEmail(e.target.value)}
              placeholder="e.g. jananimohan44@gmail.com"
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:border-amber-700"
            />
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 rounded-xl bg-[#2E1508] hover:bg-[#432311] text-white font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              Sign In with Email
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px]">
            <span className="text-slate-400 w-full mb-0.5">Quick switch:</span>
            <button
              type="button"
              onClick={() => { setLocalEmail('jananimohan44@gmail.com'); doEmailLogin('jananimohan44@gmail.com'); }}
              className="px-2 py-1 rounded bg-[#EDE1D3] hover:bg-[#DECDBE] text-[#2E1508] font-semibold border border-[#BAA794] cursor-pointer"
            >
              👑 Janani Mohan (Super Admin)
            </button>
            <button
              type="button"
              onClick={() => { setLocalEmail('technologiesargus@gmail.com'); doEmailLogin('technologiesargus@gmail.com'); }}
              className="px-2 py-1 rounded bg-[#EDE1D3] hover:bg-[#DECDBE] text-[#2E1508] font-semibold border border-[#BAA794] cursor-pointer"
            >
              👑 Technologies Argus (Super Admin)
            </button>
            <button
              type="button"
              onClick={() => { setLocalEmail('argushexadoc2021@gmail.com'); doEmailLogin('argushexadoc2021@gmail.com'); }}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-300 cursor-pointer"
            >
              🏢 Argus (Company Admin)
            </button>
          </div>

          {/* Security badge note */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 mt-3.5">
            <ShieldCheck size={13} className="text-emerald-600 flex-shrink-0" />
            <span>Encrypted Google Workspace OAuth SSO</span>
          </div>

          {/* Setup Alert Message if OAuth not configured yet */}
          {setupMsg && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-left text-xs text-amber-900">
              <div className="font-bold flex items-center gap-1.5 text-amber-800 mb-1">
                <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                <span>Google OAuth Credentials Pending</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Please configure Supabase Google OAuth in backend/.env to sign in with your company account.
              </p>
            </div>
          )}

          {/* Micro Footer */}
          <div className="text-center text-[10.5px] text-slate-400 mt-6 pt-4 border-t border-slate-100">
            <span>ARGUSCNC Enterprise • Industrial Store & BI Platform</span>
          </div>
        </div>
      </div>
    </div>
  );
}
