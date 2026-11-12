import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, History, Info, Lightbulb, Loader2, RefreshCw, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getOpenAIApiKey } from '@/lib/copilot/openai';
import { serverChat, ServerAiError } from '@/lib/adviser/serverAi';
import { buildReport, improvementIdeas, reportToFacts, reportToSpeech, type AdviserReport as Report, type Idea, type Insight, type Severity } from '@/lib/adviser/insights';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;

type Lang = 'ta' | 'en' | 'tanglish';

const SEV: Record<Severity, { label: string; chip: string; bar: string; icon: typeof AlertTriangle }> = {
  high: { label: 'Urgent', chip: 'bg-red-100 text-red-700', bar: 'border-l-red-500', icon: AlertTriangle },
  medium: { label: 'Attention', chip: 'bg-amber-100 text-amber-800', bar: 'border-l-amber-500', icon: Info },
  low: { label: 'Watch', chip: 'bg-sky-100 text-sky-700', bar: 'border-l-sky-400', icon: Info },
  good: { label: 'Good', chip: 'bg-emerald-100 text-emerald-700', bar: 'border-l-emerald-500', icon: CheckCircle2 },
};

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const REVIEW_SYSTEM = (lang: Lang) => `You are the business Adviser of a CNC machining company, reading the figures its Argus Business Intelligence system produced today.
Write a short management report: (1) the 3 most urgent problems, each with the customer / order / invoice names and amounts given, (2) one concrete action for each, (3) 3 ideas to improve cash collection, delivery speed and profit over the next month.
Use only the figures given; never invent customers, amounts or days. About 12 short lines, plain text, no markdown symbols, numbered lines. ${lang === 'ta' ? 'Reply in Tamil script; keep names and amounts in English.' : lang === 'tanglish' ? 'Reply in Tanglish (Tamil in English letters).' : 'Reply in simple English.'}`;

const FOCUS = ['cash collection and unpaid invoices', 'on-time delivery and late orders', 'enquiries and quotations (winning more orders)', 'production, rejections and machine use', 'stock and purchasing', 'customers: who to nurture and who is too big a share', 'profit, costing and pricing'];
const DAILY_SYSTEM = (lang: Lang, avoid: string[]) => {
  const d = new Date();
  const focus = FOCUS[d.getDay() % FOCUS.length];
  return `You are the business Adviser of a CNC machining company, talking to its owner. From the figures given, write exactly 4 numbered improvement points for TODAY (${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}).
Today's main focus: ${focus}. At least 2 of the 4 points must be about that focus; the others come from whatever the figures show is most wrong.
Each point: a short title, a colon, then one sentence on how (at most 28 words in all), concrete and doable this week, using the customer / order / invoice names and amounts in the figures where they help. Never invent figures. Plain text, no markdown symbols.
${avoid.length ? `These were already advised on earlier days, so every point today must be genuinely different (a new angle, not the same advice reworded): ${avoid.slice(0, 40).join('; ')}. ` : ''}${lang === 'ta' ? 'Reply in Tamil script; keep names and amounts in English.' : lang === 'tanglish' ? 'Reply in Tanglish (Tamil in English letters).' : 'Reply in simple English.'}`;
};

// ---- every day's advice is kept, so any date can be read again ----
const HIST_KEY = 'adviser.history.v1';
interface HistoryDay { date: string; lang: string; ideas: { title: string; how: string }[]; ai: boolean; headline: string; at: string }
const readHistory = (): HistoryDay[] => { try { const v = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
function saveHistory(day: HistoryDay) {
  try {
    const list = readHistory();
    const i = list.findIndex((x) => x.date === day.date);
    // an AI set replaces the quick set of the same day; a quick set never replaces an AI one
    if (i >= 0 && list[i].ai && !day.ai) return;
    if (i >= 0) list[i] = day; else list.unshift(day);
    list.sort((a, b) => b.date.localeCompare(a.date));
    localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 400)));
  } catch { /* not saved */ }
}
const recentTitles = (days = 14) => readHistory().slice(0, days).flatMap((d) => d.ideas.map((x) => x.title));

const DAILY_KEY = 'adviser.daily.v1';
interface DailyCache { date: string; lang: string; ideas: { title: string; how: string }[]; prev: string[] }
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const readDaily = (): DailyCache | null => { try { const v = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null'); return v && Array.isArray(v.ideas) ? v : null; } catch { return null; } };
const writeDaily = (c: DailyCache) => { try { localStorage.setItem(DAILY_KEY, JSON.stringify(c)); } catch { /* not saved */ } };
/** "1. Title: how" lines -> points. */
function parsePoints(text: string): { title: string; how: string }[] {
  return text.split(/\n+/).map((l) => /^\s*\d+[.)]\s*(.+)$/.exec(l)?.[1]?.trim() ?? '').filter(Boolean).map((l) => {
    const m = /^(.{3,80}?)\s*[:–—-]\s+(.+)$/.exec(l);
    return m ? { title: m[1].replace(/^[*_\s]+|[*_\s]+$/g, ''), how: m[2].trim() } : { title: l.slice(0, 60), how: l };
  }).slice(0, 4);
}

/** Streams the improvement ideas: the help function first, then the OpenAI key saved in this browser. */
async function* reviewStream(facts: string, lang: Lang, daily?: { avoid: string[] }): AsyncGenerator<string> {
  let unreachable = false;
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''), 'content-type': 'application/json' },
      body: JSON.stringify({ review: { facts, lang, ...(daily ? { mode: 'daily', avoid: daily.avoid } : {}) } }),
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
  try {
    let got = false;
    for await (const piece of serverChat(daily ? DAILY_SYSTEM(lang, daily.avoid) : REVIEW_SYSTEM(lang), [{ role: 'user', text: facts }], { maxTokens: 700, temperature: daily ? 0.7 : 0.3 })) { got = true; yield piece; }
    if (got) return;
  } catch (e) {
    if (!(e instanceof ServerAiError && e.unreachable)) throw e;
  }
  const key = getOpenAIApiKey();
  if (!key) throw new Error('AI is not set up yet: add OPENAI_API_KEY in the server settings (Vercel > Environment Variables) and redeploy. The report above does not need AI.');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, temperature: 0.3, max_tokens: 700, messages: [{ role: 'system', content: daily ? DAILY_SYSTEM(lang, daily.avoid) : REVIEW_SYSTEM(lang) }, { role: 'user', content: facts }] }),
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
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryDay[]>([]);
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

  // Today's improvement points: shown at once from the records; the AI writes today's set once a day (kept for the day, never repeating yesterday's).
  const [daily, setDaily] = useState<{ ideas: { title: string; how: string; area?: string }[]; ai: boolean } | null>(null);
  const [dailyBusy, setDailyBusy] = useState(false);
  useEffect(() => {
    if (!report || loading) return;
    const base: Idea[] = improvementIdeas(report);
    const cache = readDaily();
    const today = todayKey();
    const head = (r: Report) => (r.snapshot.overdue > 0 ? `${money(r.snapshot.overdue)} overdue` : 'Nothing overdue') + ` · ${r.snapshot.lateOrders} late orders`;
    if (cache && cache.date === today && cache.lang === lang && cache.ideas.length >= 3) { setDaily({ ideas: cache.ideas, ai: true }); saveHistory({ date: today, lang, ideas: cache.ideas, ai: true, headline: head(report), at: new Date().toISOString() }); return; }
    setDaily({ ideas: base, ai: false });
    saveHistory({ date: today, lang, ideas: base, ai: false, headline: head(report), at: new Date().toISOString() });
    // Only the totals and names go to the AI. If the assistant is not reachable the points above stay.
    let stop = false;
    setDailyBusy(true);
    (async () => {
      let text = '';
      try {
        const avoid = Array.from(new Set([...recentTitles(14).filter(() => true), ...(cache && cache.date !== today ? cache.ideas.map((x) => x.title) : (cache?.prev ?? []))]));
        for await (const piece of reviewStream(reportToFacts(report), lang, { avoid })) { if (stop) return; text += piece; }
        const pts = parsePoints(text);
        if (!stop && pts.length >= 3) {
          writeDaily({ date: today, lang, ideas: pts, prev: cache && cache.date !== today ? cache.ideas.map((x) => x.title) : (cache?.prev ?? []) });
          setDaily({ ideas: pts, ai: true });
          saveHistory({ date: today, lang, ideas: pts, ai: true, headline: head(report), at: new Date().toISOString() });
        }
      } catch { /* the points from the records stay */ }
      finally { if (!stop) setDailyBusy(false); }
    })();
    return () => { stop = true; };
  }, [report, loading, lang]);

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
        <button type="button" onClick={() => { setHistoryList(readHistory()); setShowHistory((v) => !v); }} title="Every day's advice, date wise" aria-label="History"
          className={`ml-auto flex h-6 items-center gap-1 rounded border px-1.5 text-[10px] font-semibold ${showHistory ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}><History size={11} />History</button>
        <button type="button" onClick={() => void load()} disabled={loading} title="Read the records again" aria-label="Refresh the report"
          className="flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><RefreshCw size={11} className={loading ? 'animate-spin' : ''} />Refresh</button>
        <button type="button" onClick={readAloud} disabled={!report || loading} title={reading ? 'Stop reading' : 'Read the main points aloud'} aria-label="Read the report aloud"
          className="flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">{reading ? <VolumeX size={11} /> : <Volume2 size={11} />}{reading ? 'Stop' : 'Read'}</button>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={13} /></button>}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {showHistory && (
          <div className="space-y-2" data-testid="adviser-history">
            <button type="button" onClick={() => setShowHistory(false)} className="text-[11px] font-bold text-violet-700 hover:text-violet-900">← Back to today</button>
            {historyList.length === 0 && <p className="py-6 text-center text-[12px] text-slate-400">No advice saved yet. Each day's advice is kept here from now on.</p>}
            {historyList.map((d) => (
              <div key={d.date} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-[11px] font-extrabold text-slate-800">{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  <span className={`ml-auto rounded-full px-1.5 py-px text-[9px] font-bold uppercase ${d.ai ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{d.ai ? 'AI' : 'Tips'}</span>
                </div>
                {d.headline && <p className="mb-1 text-[10px] text-slate-400">{d.headline}</p>}
                <ol className="space-y-1">
                  {d.ideas.map((x, n) => <li key={n} className="text-[12px] leading-snug text-slate-700"><b className="text-slate-900">{n + 1}. {x.title}.</b> {x.how}</li>)}
                </ol>
              </div>
            ))}
          </div>
        )}
        {!showHistory && loading && <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" />Checking payments, enquiries, orders, deliveries and stock…</div>}

        {!showHistory && !loading && report && s && (
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

            {daily && daily.ideas.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-2.5" data-testid="daily-ideas">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Lightbulb size={14} className="text-emerald-600" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">{lang === 'ta' ? 'இன்றைய மேம்பாட்டு யோசனைகள்' : "Today's improvements"}</span>
                  <span className="text-[10px] text-emerald-700">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                  <span className={`ml-auto rounded-full px-1.5 py-px text-[9px] font-bold uppercase ${daily.ai ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{dailyBusy ? 'AI writing…' : daily.ai ? 'AI' : 'Daily tips'}</span>
                </div>
                <ol className="space-y-1.5">
                  {daily.ideas.map((x, n) => (
                    <li key={`${n}-${x.title}`} className="flex gap-2 text-[12px] leading-snug text-slate-700">
                      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">{n + 1}</span>
                      <span><b className="text-slate-900">{x.title}.</b> {x.how}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-1.5 text-[10px] text-emerald-700">{lang === 'ta' ? 'ஒவ்வொரு நாளும் மாறும்.' : 'A new set every day.'}</p>
              </div>
            )}

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
