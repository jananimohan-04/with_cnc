// Mission, Vision and Goals (from Overview > Clarity) always in view: a slim strip under the top bar on every BI
// page, so the key direction is never more than a glance away. Click a part to open it in Clarity.
// Computers show all three side by side; phones show one at a time, changing every few seconds.

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, Flag, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type Part = 'mission' | 'vision' | 'goals';
interface Data { mission: string; vision: string; goals: string[] }

const today = () => new Date().toISOString().slice(0, 10);

export function ClarityStrip() {
  const { profile, canView, permissions } = useAuth();
  const me = (profile as { id?: string } | null)?.id ?? null;
  const location = useLocation();
  const navigate = useNavigate();
  const onClarity = location.pathname.startsWith('/clarity');
  const allowed = permissions !== null && canView('clarity');
  const [data, setData] = useState<Data | null>(null);
  const [shown, setShown] = useState(0);

  const load = useCallback(async () => {
    if (!me) return;
    const [s, g, l] = await Promise.all([
      supabase.from('clarity_statements').select('kind, body').eq('owner_id', me),
      supabase.from('clarity_goals').select('title, end_date').eq('owner_id', me).order('sort_order').order('created_at').limit(50),
      supabase.from('clarity_lines').select('body').eq('owner_id', me).eq('kind', 'year_goal').order('sort_order').limit(20),
    ]);
    if (s.error) { setData(null); return; }   // Clarity not set up
    const st = (s.data ?? []) as { kind: string; body: string }[];
    const active = ((g.data ?? []) as { title: string; end_date: string | null }[])
      .filter((x) => x.title.trim() && (!x.end_date || x.end_date >= today())).map((x) => x.title.trim());
    const yearGoals = ((l.data ?? []) as { body: string }[]).map((x) => x.body.trim()).filter(Boolean);
    setData({
      mission: st.find((x) => x.kind === 'mission')?.body.trim() ?? '',
      vision: st.find((x) => x.kind === 'vision')?.body.trim() ?? '',
      goals: active.length ? active : yearGoals,
    });
  }, [me]);

  // load on start, and again after leaving Clarity (where they are edited)
  useEffect(() => { if (allowed && !onClarity) void load(); }, [allowed, onClarity, load]);

  // phones: one part at a time
  useEffect(() => {
    const t = window.setInterval(() => setShown((n) => n + 1), 6000);
    return () => window.clearInterval(t);
  }, []);

  if (!allowed || onClarity || !data) return null;

  const open = (part: Part) => {
    try { localStorage.setItem('clarity.tab', part); } catch { /* not saved */ }
    navigate('/clarity');
  };

  const parts: { key: Part; label: string; text: string; empty: string; Icon: typeof Target; color: string }[] = [
    { key: 'mission', label: 'Mission', text: data.mission, empty: 'Set your mission', Icon: Target, color: 'text-teal-600' },
    { key: 'vision', label: 'Vision', text: data.vision, empty: 'Set your vision', Icon: Compass, color: 'text-orange-600' },
    {
      key: 'goals', label: data.goals.length ? `Goals (${data.goals.length})` : 'Goals',
      text: data.goals.join('  ·  '), empty: 'Add your goals', Icon: Flag, color: 'text-indigo-600',
    },
  ];
  const mobile = parts[shown % parts.length];

  const Item = ({ p, className = '' }: { p: (typeof parts)[number]; className?: string }) => (
    <button
      type="button"
      onClick={() => open(p.key)}
      title={p.text ? `${p.label}: ${p.text}` : p.empty}
      className={`group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-white/70 transition ${className}`}
    >
      <p.Icon size={13} className={`shrink-0 ${p.color}`} />
      <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide ${p.color}`}>{p.label}</span>
      <span className={`min-w-0 truncate text-[12px] ${p.text ? 'text-slate-700' : 'italic text-slate-400 group-hover:text-slate-600'}`}>
        {p.text || p.empty}
      </span>
    </button>
  );

  return (
    <div className="flex-shrink-0 border-b border-slate-200 bg-gradient-to-r from-teal-50 via-orange-50 to-indigo-50 px-2 print:hidden">
      <div className="hidden md:grid grid-cols-3 gap-1 py-0.5">
        {parts.map((p) => <Item key={p.key} p={p} />)}
      </div>
      <div className="md:hidden py-0.5">
        <Item key={mobile.key} p={mobile} className="w-full" />
      </div>
    </div>
  );
}
