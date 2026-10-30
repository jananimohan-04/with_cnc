import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Languages, Pause, Play, SkipBack, SkipForward, FastForward, Square, Volume2, VolumeX } from 'lucide-react';
import { pageTitles } from '@/config/navigation';
import { useVisibleNavSections } from '@/lib/useVisibleNavSections';
import { say, stopSpeaking } from '@/components/HelpAssistant';
import { topDialog, dialogTitle } from '@/lib/guides/engine';
import { closeDialog, collectTourItems, describeItem, firstParagraph, type TourItem, type TourLang } from '@/lib/guides/tour';
import { explainOptions } from '@/lib/guides/tourExplain';
import { PAGE_TEACHINGS } from '@/lib/guides/pageTeachings';

// Teaching mode. Two kinds:
//   "This page"  explains the screen you are on: every option on it, one by one, pointing at each and speaking about it.
//   "Whole ERP"  does the same for every screen of the menu in turn, opening each Add / New form to explain its fields too.
// The options are read from the live screen (so nothing is skipped and nothing is out of date); the sentences come from ChatGPT
// (through the help-assistant function) and from built-in notes when the AI is not reachable.

type Kind = 'page' | 'erp';
interface Rect { x: number; y: number; w: number; h: number }
interface View {
  kind: Kind;
  pageLabel: string; pageNo: number; pageCount: number;
  itemNo: number; itemCount: number;
  heading: string; text: string; inForm: string;
  note: string;
}
const STOP = Symbol('stop');

const ls = {
  get: (k: string, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const readLang = (): TourLang => { const v = ls.get('help.vlang', 'ta'); return v === 'en' || v === 'tanglish' ? v : 'ta'; };
const rectOf = (el: Element | null): Rect | null => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width || r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; };
const sameRect = (a: Rect | null, b: Rect | null) => (!a && !b) || (!!a && !!b && Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6 && Math.abs(a.w - b.w) < 0.6 && Math.abs(a.h - b.h) < 0.6);


const CSS = `
@keyframes tourPulse{0%{box-shadow:0 0 0 0 rgba(249,115,22,.75)}70%{box-shadow:0 0 0 14px rgba(249,115,22,0)}100%{box-shadow:0 0 0 0 rgba(249,115,22,0)}}
@keyframes tourBob{0%,100%{transform:translateY(0)}50%{transform:translateY(7px)}}
@keyframes tourBobUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes tourIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
`;

export function TeachingTour() {
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<View | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [paused, setPaused] = useState(false);
  const [lang, setLang] = useState<TourLang>(readLang);
  const [voice, setVoice] = useState(() => ls.get('argus.guide.voice', '1') === '1');

  const token = useRef(0);
  const running = useRef(false);
  const pausedRef = useRef(false);
  const langRef = useRef(lang); langRef.current = lang;
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const pathRef = useRef(location.pathname); pathRef.current = location.pathname;
  const expectedPath = useRef('');
  const targetEl = useRef<HTMLElement | null>(null);
  const idxRef = useRef(0);
  const jumpRef = useRef<number | null>(null);
  const skipPageRef = useRef(false);
  const cancelSpeak = useRef<((why: 'skip' | 'pause') => void) | null>(null);
  const openedDialog = useRef<HTMLElement | null>(null);
  // The menu as this user sees it (a module that is off for them, or fully off for the company, is not toured).
  const visibleSections = useVisibleNavSections();
  const sectionsRef = useRef(visibleSections); sectionsRef.current = visibleSections;
  /** The screens of the menu, in menu order. The online store is a different app, so the tour does not go there. */
  const tourPages = () => sectionsRef.current.flatMap((s) => s.items.filter((i) => !i.page.startsWith('store/')).map((i) => ({ page: i.page, label: i.label, section: s.label })));
  const baseRef = useRef<{ kind: Kind; pageLabel: string; pageNo: number; pageCount: number }>({ kind: 'page', pageLabel: '', pageNo: 0, pageCount: 0 });

  const alive = (t: number) => { if (token.current !== t) throw STOP; };
  const sleep = (ms: number, t: number) => new Promise<void>((res, rej) => window.setTimeout(() => (token.current === t ? res() : rej(STOP)), ms));

  /** Speaks one text and tells how it ended: finished, or cut short by Next / Back / Skip page, or by Pause. */
  const speak = (text: string, t: number): Promise<'done' | 'skip' | 'pause'> => new Promise((resolve) => {
    let settled = false;
    const end = (r: 'done' | 'skip' | 'pause') => { if (settled) return; settled = true; cancelSpeak.current = null; window.clearTimeout(timer); resolve(r); };
    // muted: leave the text on screen for about as long as it takes to read
    const timer = window.setTimeout(() => end('done'), voiceRef.current ? 120000 : Math.min(9000, 1800 + text.length * 55));
    cancelSpeak.current = (why) => { stopSpeaking(); end(why); };
    if (voiceRef.current) say(text, () => end('done'), undefined);
    else { /* the timer above ends it */ }
    if (token.current !== t) end('skip');
  });

  const waitIfPaused = async (t: number) => { while (pausedRef.current) { alive(t); await sleep(200, t); } alive(t); };

  /** Says a text; a Pause holds the tour until Resume, then the same text is said again. Returns false when Next / Back moved on. */
  const say1 = async (text: string, t: number): Promise<boolean> => {
    for (;;) {
      await waitIfPaused(t);   // Pause pressed between two options still holds the tour
      alive(t);
      const r = await speak(text, t);
      alive(t);
      if (r === 'pause') { await waitIfPaused(t); continue; }
      return r === 'done';
    }
  };

  const stop = useCallback(() => {
    token.current += 1;
    running.current = false;
    pausedRef.current = false;
    cancelSpeak.current = null;
    stopSpeaking();
    if (openedDialog.current && openedDialog.current.isConnected) closeDialog(openedDialog.current);
    openedDialog.current = null;
    targetEl.current = null;
    setPaused(false); setRect(null); setView(null);
    window.dispatchEvent(new CustomEvent('argus:mode', { detail: { mode: 'teaching', on: false } }));
  }, []);

  /** Wait for the route to change, then until the screen stops changing (data may still be arriving); false when access is denied. */
  const settle = async (t: number): Promise<boolean> => {
    for (let i = 0; i < 14 && expectedPath.current && pathRef.current !== expectedPath.current; i++) { alive(t); await sleep(250, t); }
    let last = -1; let calm = 0;
    for (let i = 0; i < 24 && calm < 2; i++) {
      alive(t);
      await sleep(300, t);
      const main = document.querySelector('main');
      const count = main ? main.querySelectorAll('*').length : 0;
      calm = count > 20 && count === last ? calm + 1 : 0;
      last = count;
    }
    await sleep(400, t);
    const text = (document.querySelector('main')?.textContent ?? '').slice(0, 400);
    return !/Access Not Granted|Could Not Verify Access|Account Inactive|Page Not Found/i.test(text);
  };

  const L = (en: string, ta: string) => (langRef.current === 'ta' ? ta : en);

  /** Points at each option in turn and explains it. `scopeLabel` is the form's name when this is a form opened by the tour. */
  const explainAll = async (items: TourItem[], t: number, ctx: { page: string; title: string; view: Omit<View, 'itemNo' | 'itemCount' | 'heading' | 'text' | 'inForm' | 'note'>; form: string; canOpen: boolean }) => {
    const explained = await explainOptions(ctx.page + (ctx.form ? `#${ctx.form}` : ''), ctx.title, langRef.current, items);
    alive(t);
    let opened = 0;
    let i = 0;
    while (i < items.length) {
      await waitIfPaused(t);
      alive(t);
      idxRef.current = i;
      jumpRef.current = null;
      const item = items[i];
      targetEl.current = item.el.isConnected ? item.el : null;
      try { item.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* not scrollable */ }
      const text = explained[item.id] ?? describeItem(item, langRef.current);
      setView({ ...ctx.view, itemNo: i + 1, itemCount: items.length, heading: item.label, text, inForm: ctx.form, note: '' });
      await sleep(350, t);
      const finished = await say1(text, t);
      alive(t);
      if (skipPageRef.current) return;
      // A button that opens a form: open it and explain every field in it too (only on Add / New / Create buttons).
      if (finished && item.opens && ctx.canOpen && opened < 3 && item.el.isConnected) {
        opened += 1;
        await explainForm(item, t, ctx.page, ctx.title);
        alive(t);
        if (skipPageRef.current) return;
      }
      if (jumpRef.current != null) { i = Math.max(0, Math.min(items.length - 1, jumpRef.current)); continue; }
      await sleep(250, t);
      i += 1;
    }
  };

  const explainForm = async (button: TourItem, t: number, page: string, title: string) => {
    const before = topDialog();
    button.el.click();
    await sleep(800, t);
    const dlg = topDialog();
    if (!dlg || dlg === before) return;   // nothing opened: it was an inline action, leave it
    openedDialog.current = dlg;
    const name = dialogTitle(dlg) || button.label;
    const items = collectTourItems(document, { roots: [dlg], inDialog: true, max: 25 });
    const intro = L(`This is the ${name} form. I will explain each field.`, `இது ${name} படிவம். ஒவ்வொரு புலத்தையும் விளக்குகிறேன்.`);
    setView((v) => (v ? { ...v, heading: name, text: intro, inForm: name, itemNo: 0, itemCount: items.length } : v));
    targetEl.current = dlg;
    await say1(intro, t);
    if (!skipPageRef.current && items.length) {
      await explainAll(items, t, { page, title, view: baseRef.current, form: name, canOpen: false });
    }
    // closed again without saving anything
    if (dlg.isConnected) closeDialog(dlg);
    openedDialog.current = null;
    await sleep(600, t);
    targetEl.current = null;
  };

  const teachPage = async (t: number, pg: { page: string; label: string }, pageNo: number, pageCount: number, kind: Kind) => {
    skipPageRef.current = false;
    const path = `/${pg.page}`;
    const title = pageTitles[pg.page] || pg.label;
    const base = { kind, pageLabel: title, pageNo, pageCount };
    baseRef.current = base;
    setView({ ...base, itemNo: 0, itemCount: 0, heading: title, text: '', inForm: '', note: L('Loading the screen…', 'திரை ஏற்றப்படுகிறது…') });
    const ok = await settle(t);
    if (!ok) {
      const msg = L(`You do not have access to ${title}, so I will skip it.`, `${title}-க்கு உங்களுக்கு அனுமதி இல்லை, அதனால் தவிர்க்கிறேன்.`);
      setView({ ...base, itemNo: 0, itemCount: 0, heading: title, text: msg, inForm: '', note: '' });
      await say1(msg, t);
      return;
    }
    const items = collectTourItems(document);
    const hand = PAGE_TEACHINGS[path];
    const intro = hand
      ? firstParagraph(langRef.current === 'ta' ? hand.ta : hand.en)
      : L(`This is the ${title} page.`, `இது ${title} பக்கம்.`);
    const lead = `${intro} ${L(`I will explain each of its ${items.length} options, one by one.`, `இதிலுள்ள ${items.length} தேர்வுகளையும் ஒவ்வொன்றாக விளக்குகிறேன்.`)}`;
    setView({ ...base, itemNo: 0, itemCount: items.length, heading: title, text: lead, inForm: '', note: '' });
    targetEl.current = document.querySelector('main h1, main h2') as HTMLElement | null;
    const pending = items.length ? explainOptions(path, title, langRef.current, items) : Promise.resolve({});   // warm the cache while the intro is spoken
    await say1(lead, t);
    void pending;
    if (skipPageRef.current || !items.length) return;
    await explainAll(items, t, { page: path, title, view: base, form: '', canOpen: true });
  };

  const run = useCallback(async (kind: Kind) => {
    if (running.current) stop();
    const t = ++token.current;
    running.current = true;
    pausedRef.current = false; setPaused(false);
    window.dispatchEvent(new Event('argus:voice-pause'));
    window.dispatchEvent(new CustomEvent('argus:mode', { detail: { mode: 'teaching', on: true } }));
    ls.set('argus.teach.kind', kind);
    stopSpeaking();
    try {
      const here = pathRef.current.replace(/^\//, '');
      if (kind === 'page') {
        expectedPath.current = pathRef.current;
        const label = pageTitles[here] || tourPages().find((p) => p.page === here)?.label || here || 'this page';
        await teachPage(t, { page: here, label }, 1, 1, 'page');
      } else {
        const all = tourPages();
        const secs = sectionsRef.current;
        const start = Math.max(0, all.findIndex((p) => p.page === here));
        const order = [...all.slice(start), ...all.slice(0, start)];
        // the menu first: the sections and what is in each
        const menuText = L(
          `Welcome to the Business Intelligence tour. The menu on the left has ${secs.length} sections: ${secs.map((s) => `${s.label} with ${s.items.filter((i) => !i.page.startsWith('store/')).length} screens`).join(', ')}. I will now visit every screen in turn and explain each option on it.`,
          `Business Intelligence சுற்றுப்பயணத்திற்கு வரவேற்கிறோம். இடதுபுற மெனுவில் ${secs.length} பிரிவுகள் உள்ளன: ${secs.map((s) => `${s.label} - ${s.items.filter((i) => !i.page.startsWith('store/')).length} திரைகள்`).join(', ')}. இப்போது ஒவ்வொரு திரைக்கும் சென்று, அதிலுள்ள ஒவ்வொரு தேர்வையும் விளக்குகிறேன்.`,
        );
        targetEl.current = document.querySelector('aside') as HTMLElement | null;
        setView({ kind, pageLabel: L('Menu', 'மெனு'), pageNo: 0, pageCount: order.length, itemNo: 0, itemCount: 0, heading: L('Menu', 'மெனு'), text: menuText, inForm: '', note: '' });
        await say1(menuText, t);
        for (let n = 0; n < order.length; n++) {
          alive(t);
          const pg = order[n];
          if (`/${pg.page}` !== pathRef.current) {
            const go = L(`Next, ${pg.label}.`, `அடுத்து, ${pg.label}.`);
            setView({ kind, pageLabel: pg.label, pageNo: n + 1, pageCount: order.length, itemNo: 0, itemCount: 0, heading: pg.label, text: go, inForm: '', note: '' });
            targetEl.current = null;
            expectedPath.current = `/${pg.page}`;
            navigate(`/${pg.page}`);
            await sleep(400, t);
          } else expectedPath.current = pathRef.current;
          await teachPage(t, pg, n + 1, order.length, 'erp');
        }
      }
      const done = L('The tour is finished. Thank you!', 'சுற்றுப்பயணம் முடிந்தது. நன்றி!');
      setView((v) => (v ? { ...v, heading: L('Finished', 'முடிந்தது'), text: done, note: '' } : v));
      targetEl.current = null;
      await say1(done, t);
    } catch (e) {
      if (e !== STOP) console.warn('Teaching tour stopped:', e);
    }
    if (token.current === t) stop();
  }, [navigate, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Help area / shortcut asks for the tour: { on, fullErp }.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ on?: boolean; fullErp?: boolean }>).detail ?? {};
      const turnOn = typeof d.on === 'boolean' ? d.on : !running.current;
      if (!turnOn) { stop(); return; }
      const kind: Kind = typeof d.fullErp === 'boolean' ? (d.fullErp ? 'erp' : 'page') : (ls.get('argus.teach.kind', 'page') === 'erp' ? 'erp' : 'page');
      void run(kind);
    };
    window.addEventListener('argus:teach', on);
    return () => window.removeEventListener('argus:teach', on);
  }, [run, stop]);

  // Leaving the screen by yourself (not by the tour) ends the tour.
  useEffect(() => {
    if (!running.current || !expectedPath.current) return;
    if (location.pathname !== expectedPath.current) stop();
  }, [location.pathname, stop]);

  // The spotlight follows the option while the page scrolls or moves.
  useEffect(() => {
    if (!view) return;
    let raf = 0;
    const tick = () => {
      if (targetEl.current && !targetEl.current.isConnected) targetEl.current = null;
      const r = rectOf(targetEl.current);
      setRect((prev) => (sameRect(prev, r) ? prev : r));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [!!view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape ends it.
  useEffect(() => {
    if (!view) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !topDialog()) { e.stopImmediatePropagation(); stop(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [!!view, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { token.current += 1; stopSpeaking(); }, []);

  const next = () => { jumpRef.current = idxRef.current + 1; cancelSpeak.current?.('skip'); };
  const back = () => { jumpRef.current = Math.max(0, idxRef.current - 1); cancelSpeak.current?.('skip'); };
  const skipPage = () => { skipPageRef.current = true; cancelSpeak.current?.('skip'); };
  const togglePause = () => {
    const p = !pausedRef.current;
    pausedRef.current = p; setPaused(p);
    if (p) cancelSpeak.current?.('pause');
  };
  const toggleLang = () => { const n: TourLang = langRef.current === 'ta' ? 'en' : 'ta'; setLang(n); ls.set('help.vlang', n); };
  const toggleVoice = () => { const n = !voiceRef.current; setVoice(n); ls.set('argus.guide.voice', n ? '1' : '0'); if (!n) { stopSpeaking(); cancelSpeak.current?.('skip'); } };

  if (!view || typeof document === 'undefined') return null;
  const ta = lang === 'ta';
  const vh = window.innerHeight;
  const arrowAbove = !!rect && rect.y > 150;
  const cardTop = rect ? rect.y + rect.h / 2 > vh * 0.5 : false;

  return createPortal(
    <div data-tour-ignore>
      <style>{CSS}</style>
      {rect && (
        <div aria-hidden className="pointer-events-none fixed z-[90]" style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12, borderRadius: 12, boxShadow: '0 0 0 9999px rgba(15,23,42,.45)', transition: 'all .25s ease' }}>
          <div className="absolute inset-0" style={{ borderRadius: 12, outline: '3px solid #f97316', animation: 'tourPulse 1.6s infinite' }} />
        </div>
      )}
      {rect && (
        <div aria-hidden className="pointer-events-none fixed z-[91]" style={{ left: rect.x + rect.w / 2 - 14, top: arrowAbove ? rect.y - 46 : rect.y + rect.h + 10, animation: `${arrowAbove ? 'tourBob' : 'tourBobUp'} .9s ease-in-out infinite` }}>
          <svg width="28" height="34" viewBox="0 0 28 34" fill="#f97316" style={{ transform: arrowAbove ? 'none' : 'rotate(180deg)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' }}><path d="M14 34 2 16h8V0h8v16h8z" /></svg>
        </div>
      )}

      <div role="region" aria-label="Teaching" className={`fixed right-5 z-[95] w-[24rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-orange-200 bg-white shadow-2xl ${cardTop ? 'top-20' : 'bottom-24'}`} style={{ animation: 'tourIn .3s ease-out' }}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600"><GraduationCap size={17} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">{view.kind === 'erp' ? (ta ? 'முழு ERP கற்பித்தல்' : 'Teaching · Whole ERP') : (ta ? 'இந்தப் பக்கம் கற்பித்தல்' : 'Teaching · This page')}</p>
            <p className="truncate text-[10px] text-slate-400">
              {view.kind === 'erp' && view.pageNo > 0 ? `${ta ? 'பக்கம்' : 'Page'} ${view.pageNo}/${view.pageCount} · ` : ''}{view.pageLabel}
              {view.itemCount > 0 && view.itemNo > 0 ? ` · ${view.inForm ? `${view.inForm} · ` : ''}${ta ? 'தேர்வு' : 'Option'} ${view.itemNo}/${view.itemCount}` : ''}
            </p>
          </div>
          <button type="button" aria-label={voice ? 'Mute' : 'Read aloud'} title={voice ? 'Mute' : 'Read aloud'} onClick={toggleVoice} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">{voice ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
          <button type="button" aria-label="Language" title="தமிழ் / English" onClick={toggleLang} className="flex items-center gap-1 rounded p-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100"><Languages size={14} />{ta ? 'EN' : 'தமிழ்'}</button>
        </div>
        <div className="max-h-[40vh] space-y-1.5 overflow-y-auto px-3.5 py-3">
          <p className="text-[15px] font-bold leading-snug text-slate-900">{view.heading}</p>
          {view.note && <p className="text-xs text-slate-400">{view.note}</p>}
          {view.text && <p className="text-[13px] leading-relaxed text-slate-700">{view.text}</p>}
        </div>
        {view.itemCount > 0 && (
          <div className="px-3.5"><div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${(view.itemNo / view.itemCount) * 100}%` }} /></div></div>
        )}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button type="button" onClick={back} title={ta ? 'முந்தையது' : 'Previous option'} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><SkipBack size={14} /></button>
            <button type="button" onClick={togglePause} title={paused ? (ta ? 'தொடர்' : 'Resume') : (ta ? 'இடைநிறுத்து' : 'Pause')} className="inline-flex h-8 items-center gap-1 rounded-lg bg-orange-600 px-3 text-xs font-bold text-white hover:bg-orange-700">{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? (ta ? 'தொடர்' : 'Resume') : (ta ? 'நிறுத்து' : 'Pause')}</button>
            <button type="button" onClick={next} title={ta ? 'அடுத்தது' : 'Next option'} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><SkipForward size={14} /></button>
            {view.kind === 'erp' && <button type="button" onClick={skipPage} title={ta ? 'இந்தப் பக்கத்தைத் தவிர்' : 'Skip this page'} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><FastForward size={13} />{ta ? 'பக்கம்' : 'Page'}</button>}
          </div>
          <button type="button" onClick={stop} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50"><Square size={12} />{ta ? 'முடி' : 'Stop'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
