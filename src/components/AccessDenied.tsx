import { ShieldAlert } from 'lucide-react';
import { useAuth, type AuthStatus } from '@/contexts/AuthContext';

const MESSAGES: Partial<Record<AuthStatus, { title: string; body: string }>> = {
  not_registered: {
    title: 'Access Not Granted',
    body: 'is not registered for this ERP. Please contact your company administrator.',
  },
  inactive: {
    title: 'Account Inactive',
    body: 'Your ERP account is inactive. Please contact your administrator.',
  },
  company_inactive: {
    title: 'Company Inactive',
    body: 'Your company is currently deactivated in this ERP. Please contact your administrator.',
  },
  not_google: {
    title: 'Google Sign-in Required',
    body: 'This ERP only accepts Google sign-in. Please sign in again with Continue with Google.',
  },
  account_conflict: {
    title: 'Account Mismatch',
    body: 'This email is already linked to a different Google login. Please contact your administrator.',
  },
  error: {
    title: 'Could Not Verify Access',
    body: 'Something went wrong while checking your ERP access. Please try again or contact your administrator.',
  },
};

export function AccessDenied() {
  const { status, email, errorMessage, signOut } = useAuth();
  const msg = MESSAGES[status] ?? MESSAGES.error!;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
        <img src="/arguscnc-logo.jpg" alt="ARGUSCNC Logo" className="h-16 w-auto object-contain mx-auto mb-6 rounded-md" />
        <div className="w-12 h-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="text-red-500" size={22} />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-3">{msg.title}</h2>
        {status === 'not_registered' ? (
          <p className="text-sm text-slate-600 leading-relaxed">
            Your Google account
            <span className="block font-mono font-semibold text-slate-800 my-2 break-all">{email}</span>
            {msg.body}
          </p>
        ) : (
          <p className="text-sm text-slate-600 leading-relaxed">{msg.body}</p>
        )}
        {status === 'error' && errorMessage && (
          <p className="mt-3 text-xs text-slate-400 break-words">{errorMessage}</p>
        )}
        <button
          onClick={signOut}
          className="mt-8 w-full px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-lg shadow-brand-600/20 transition-all active:scale-[0.98]"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}
