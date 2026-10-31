/* Pending — mirrors legacy vPending: retry re-resolves /api/me, sign out clears session. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { googleToken } from '../api';
import { toast } from '../components/ui';
import { rolePath } from './Login';

export default function Pending() {
  const { me, logout, resolveMe } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    document.body.classList.add('auth-open');
    return () => document.body.classList.remove('auth-open');
  }, []);
  useEffect(() => {
    if (me && me.role !== 'pending' && me.role !== 'disabled') nav(rolePath(me.role), { replace: true });
  }, [me, nav]);

  const retry = async () => {
    setBusy(true);
    try {
      const s = await resolveMe(googleToken());
      toast(`Signed in as ${s.name}`, '👋');
      nav(rolePath(s.role), { replace: true });
    } catch (e) {
      toast('Could not resolve your BI role: ' + (e.message || 'error'), '⚠️');
    }
    setBusy(false);
  };
  const out = async () => {
    await logout();
    nav('/login', { replace: true });
  };

  const email = (me && me.email) || '';
  return (
    <div className="pending-wrap">
      <div className="pending-card">
        <div style={{ marginBottom: 18 }}>
          <img src="/assets/argus-logo.png" alt="ARGUSCNC" style={{ height: 44, objectFit: 'contain' }} />
        </div>
        <div className="pending-icon">⏳</div>
        <h2>Your account is not registered yet.</h2>
        <p>Please contact your company administrator to request access to ARGUSCNC Industrial Store.</p>
        {email ? <div className="pending-email-pill">Signed in as <b>{email}</b></div> : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10 }}>
          <button className="btn btn-ghost" disabled={busy} onClick={retry}>{busy ? 'Verifying…' : 'Retry Verification'}</button>
          <button className="btn btn-dark" onClick={out}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
