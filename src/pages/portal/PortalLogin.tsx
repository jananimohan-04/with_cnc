import { Cpu } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function PortalLogin() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/portal',
      },
    });
    if (error) {
      console.error('Google login error:', error.message);
      alert('Login failed: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - CNC Visual */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/15 rounded-full blur-[100px]" />
        
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Cpu size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ARGUSCNC</h1>
              <p className="text-xs text-blue-300 tracking-widest uppercase">Customer Portal</p>
            </div>
          </div>
          
          <h2 className="text-4xl font-bold leading-tight mb-6">
            Track your orders.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
              From enquiry to delivery.
            </span>
          </h2>
          
          <p className="text-lg text-slate-300 mb-10 max-w-md leading-relaxed">
            Submit enquiries, view quotations, track manufacturing progress, 
            and monitor deliveries — all in one place.
          </p>

          <div className="flex flex-col gap-4 max-w-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-300 text-sm font-bold">1</div>
              <span className="text-slate-300 text-sm">Submit part enquiries with drawings</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-300 text-sm font-bold">2</div>
              <span className="text-slate-300 text-sm">Receive & approve quotations online</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-300 text-sm font-bold">3</div>
              <span className="text-slate-300 text-sm">Track manufacturing & delivery in real time</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right - Login */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center">
              <Cpu size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">ARGUSCNC</h1>
              <p className="text-[10px] text-blue-600 tracking-widest uppercase">Customer Portal</p>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-slate-800 mb-2">Welcome</h2>
          <p className="text-slate-500 mb-10">Sign in to manage your enquiries and track orders.</p>

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-100 rounded-xl px-6 py-4 text-slate-700 font-semibold transition-all duration-200 group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          <p className="text-center text-xs text-slate-400 mt-8">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
