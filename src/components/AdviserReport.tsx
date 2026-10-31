import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Info, Loader2, RefreshCw, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getOpenAIApiKey } from '@/lib/copilot/openai';
import { buildReport, reportToFacts, reportToSpeech, type AdviserReport as Report, type Insight, type Severity } from '@/lib/adviser/insights';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;

type Lang = 'ta' | 'en' | 'tanglish';

const SEV: Record<Severity, { label: string; chip: string; bar: string; icon: typeof AlertTriangle }> = {
  high: { label: 'Urgent', chip: 'bg-red-100 text-red-700', bar: 'border-l-red-500', icon: AlertTriangle },
  medium: { label: 'Attention', chip: 'bg-amber-100 text-amber-800', bar: 'border-l-amber-500', icon: Info },
  low: { label: 'Watch', chip: 'bg-sky-100 text-sky-700', bar: 'border-l-sky-400', icon: Info },
  good: { label: 'Good', chip: 'bg-emerald-100 text-emerald-700', bar: 'border-l-emerald-500', icon: CheckCircle2 },
};

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const REVIEW_SYSTEM = (lang: Lang) => `You are the business Adviser of a CNC machining company, reading the figures its Business Intelligence system produced today.
Write a short management report: (1) the 3 most urgent problems, each with the customer / order / invoice names and amounts given, (2) one concrete action for each, (3) 3 ideas to improve cash collection, delivery speed and profit over the next month.
Use only the figures given; never invent customers, amounts or days. About 12 short lines, plain text, no markdown symbols, numbered lines. ${lang === 'ta' ? 'Reply in Tamil script; keep names and amounts in English.' : lang === 'tanglish' ? 'Reply in Tanglish (Tamil in English letters).' : 'Reply in simple English.'}`;

/** Streams the improvement ideas: the help function first, then the OpenAI key saved in this browser. */
async function* reviewStream(facts: string, lang: Lang): AsyncGenerator<string> {
  let unreachable = false;
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''), 'content-type': 'application/json' },
      body: JSON.stringify({ review: { facts, lang } }),
    });
    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let got = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          let j: { t?: string; error?: string };
          try { j = JSON.parse(line.slice(5)); } catch { continue; }
          if (j.error) throw new Error(j.error);
          if (j.t) { got = true; yield j.t; }
        }
      }
      if (got) return;
      unreachable = true;
    } else {
      // an old deployment answers this request as a question and refuses it; a missing function is a 404
      unreachable = res.status === 404 || res.status >= 400;
    }
  } catch (e) {
    if (e instanceof Error && !/failed to fetch|networkerror|load failed/i.test(e.message)) throw e;
    unreachable = true;
  }
  if (!unreachable) return;
  const key = getOpenAIApiKey();
  if (!key) throw new Error('AI ideas need the help function to be deployed (supabase functions deploy help-assistant) or an OpenAI key saved in this browser. The report above does not need AI.');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, temperature: 0.3, max_tokens: 700, messages: [{ role: 'system', content: REVIEW_SYSTEM(lang) }, { role: 'user', content: facts }] }),
  });
  if (!res.ok || !res.body) throw new Error(res.status === 401 ? 'The OpenAI key saved in this browser was rejected.' : `ChatGPT is not available right now (HTTP ${res.status}).`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      try { const t = JSON.parse(d)?.choices?.[0]?.delta?.content; if (t) yield t as string; } catch { /* partial line */ }
    }
  }
}

export function AdviserReportPanel({ lang, speakOn, can, onOpenPage, say, stopSpeaking, onClose }: {
  lang: Lang;
  speakOn: boolean;
  can: (module: string) => boolean;
  onOpenPage: (page: string) => void;
  say: (text: string, onEnd?: () => void) => void;
  stopSpeaking: () => void;
  onClose?: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [ideas, setIdeas] = useState('');
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasError, setIdeasError] = useState('');
  const [reading, setReading] = useState(false);
  const canRef = useRef(can); canRef.current = can;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stopSpeaking(); }; }, [stopSpeaking]);

  const load = useCallback(async () => {
    setLoading(true); setIdeas(''); setIdeasError('');
    try {
      const r = await buildReport((m) => canRef.current(m));
      if (!alive.current) return;
      setReport(r);
      setOpen(new Set(r.insights.filter((i) => i.severity === 'high').slice(0, 2).map((i) => i.id)));
    } catch (e) {
      if (alive.current) setReport({ generatedAt: new Date().toISOString(), insights: [], snapshot: { outstanding: 0, overdue: 0, openEnquiries: 0, pendingQuotes: 0, lateOrders: 0, unbilledDcs: 0, lowStock: 0 }, skipped: [e instanceof Error ? e.message : 'the records'] });
    } finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const readAloud = () => {
    if (!report) return;
    if (reading) { stopSpeaking(); setReading(false); return; }
    setReading(true);
    say(reportToSpeech(report), () => setReading(false));
  };

  const askIdeas = async () => {
    if (!report || ideasBusy) return;
    setIdeasBusy(true); setIdeas(''); setIdeasError('');
    let text = '';
    try {
      for await (const piece of reviewStream(reportToFacts(report), lang)) { text += piece; if (alive.current) setIdeas(text); }
      if (!text.trim() && alive.current) setIdeasError('No ideas came back. Please try again.');
      else if (speakOn && text.trim() && alive.current) { setReading(true); say(text, () => setReading(false)); }
    } catch (e) {
      if (alive.current) setIdeasError(e instanceof Error ? e.message : String(e));
    } finally { if (alive.current) setIdeasBusy(false); }
  };

  const s = report?.snapshot;
  const counts = report ? { high: report.insights.filter((i) => i.severity === 'high').length, medium: report.insights.filter((i) => i.severity === 'medium').length } : { high: 0, medium: 0 };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="adviser-report">
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-slate-600">{loading ? 'Reading your records…' : report ? `Report · ${new Date(report.generatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}` : ''}</span>
        <button type="button" onClick={() => void load()} disabled={loading} title="Read the records again" aria-label="Refresh the report"
          className="ml-auto flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><RefreshCw size={11} className={loading ? 'animate-spin' : ''} />Refresh</button>
        <button type="button" onClick={readAloud} disabled={!report || loading} title={reading ? 'Stop reading' : 'Read the main points aloud'} aria-label="Read the report aloud"
          className="flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">{reading ? <VolumeX size={11} /> : <Volume2 size={11} />}{reading ? 'Stop' : 'Read'}</button>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={13} /></button>}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {loading && <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" />Checking payments, enquiries, orders, deliveries and stock…</div>}

        {!loading && report && s && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Unpaid invoices', value: money(s.outstanding), bad: s.overdue > 0, sub: s.overdue > 0 ? `${money(s.overdue)} overdue` : 'none overdue' },
                { label: 'Enquiries waiting', value: String(s.openEnquiries), bad: s.openEnquiries > 0, sub: 'no quotation yet' },
                { label: 'Orders late', value: String(s.lateOrders), bad: s.lateOrders > 0, sub: 'past delivery date' },
                { label: 'Delivered, not billed', value: String(s.unbilledDcs), bad: s.unbilledDcs > 0, sub: 'delivery challans' },
              ].map((k) => (
                <div key={k.label} className={`rounded-lg border px-2.5 py-1.5 ${k.bad ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="text-base font-extrabold leading-tight text-slate-800">{k.value}</p>
                  <p className="text-[10px] text-slate-500">{k.sub}</p>
                </div>
              ))}
            </div>
            <p className="px-0.5 text-[11px] text-slate-500">
              {counts.high + counts.medium === 0 ? 'Nothing urgent today.' : `${counts.high ? `${counts.high} urgent` : ''}${counts.high && counts.medium ? ' and ' : ''}${counts.medium ? `${counts.medium} to look at` : ''}. Tap a point to see the records behind it.`}
            </p>

            {report.insights.map((i: Insight) => {
              const v = SEV[i.severity];
              const isOpen = open.has(i.id);
              return (
                <div key={i.id} className={`rounded-lg border border-slate-200 border-l-4 ${v.bar} bg-white`}>
                  <button type="button" onClick={() => toggle(i.id)} aria-expanded={isOpen} className="flex w-full items-start gap-2 px-2.5 py-2 text-left">
                    <v.icon size={14} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-1.5 py-px text-[9px] font-bold uppercase ${v.chip}`}>{v.label}</span><span className="text-[10px] font-semibold uppercase text-slate-400">{i.area}</span></span>
                      <span className="mt-0.5 block text-[13px] font-bold leading-snug text-slate-800">{i.title}</span>
                    </span>
                    {isOpen ? <ChevronDown size={14} className="mt-1 shrink-0 text-slate-400" /> : <ChevronRight size={14} className="mt-1 shrink-0 text-slate-400" />}
                  </button>
                  {isOpen && (
                    <div className="space-y-1.5 border-t border-slate-100 px-2.5 py-2 text-[12px] leading-relaxed text-slate-700">
                      <p>{i.detail}</p>
                      <p className="rounded bg-emerald-50 px-2 py-1 text-emerald-900"><b>What to do: </b>{i.action}</p>
                      {i.items.length > 0 && (
                        <ul className="space-y-0.5">
                          {i.items.map((t, n) => <li key={n} className="flex gap-1.5 text-[11px] text-slate-600"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" /><span>{t}</span></li>)}
                        </ul>
                      )}
                      {i.page && <button type="button" onClick={() => onOpenPage(i.page!)} className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800">Open the screen<ArrowRight size={12} /></button>}
                    </div>
                  )}
                </div>
              );
            })}

            {report.skipped.length > 0 && <p className="text-[10px] text-slate-400">Not included (no access or not available): {report.skipped.join(', ')}.</p>}

            <div className="rounded-lg border border-violet-200 bg-violet-50 p-2.5">
              <button type="button" onClick={() => void askIdeas()} disabled={ideasBusy}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                {ideasBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{ideasBusy ? 'Thinking…' : ideas ? 'Get new ideas' : 'Get improvement ideas (AI)'}
              </button>
              {ideasError && <p className="mt-1.5 text-[11px] text-red-700">{ideasError}</p>}
              {ideas && <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-violet-950">{ideas}</p>}
              {!ideas && !ideasError && !ideasBusy && <p className="mt-1.5 text-[10px] text-violet-700">Sends only the totals and names above (no other data) to the AI, which writes what to do first and how to improve.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
