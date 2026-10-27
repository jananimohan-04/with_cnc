import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bot, CheckCircle2, Languages, Loader2, Mic, MicOff, Send, Volume2, VolumeX, X,
  Key, Sparkles, Search, ChevronDown, ChevronUp, Edit3, Trash2, PlusCircle, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getBreadcrumbs } from '@/config/navigation';
import { say, stopSpeaking, offlineAnswer } from '@/components/HelpAssistant';
import {
  findRecords, previewAction, runAction, fetchPipelineSummary, explainRecordStage,
  type ActionCtx, type Preview, type PipelineItem
} from '@/lib/copilot/actions';
import {
  ACTION_INTENTS, FIELD_QUESTION, missingOf, resolvePage, understandLocal,
  type Intent, type Params, type Pending, type Understood,
} from '@/lib/copilot/understand';
import {
  analyzeWithChatGPT, getOpenAIApiKey, setOpenAIApiKey, type PipelineCardSummary
} from '@/lib/copilot/openai';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;
type Lang = 'ta' | 'tanglish' | 'en';
const ls = {
  get: (k: string, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const readLang = (): Lang => { const v = ls.get('help.vlang', 'ta'); return v === 'en' || v === 'tanglish' ? v : 'ta'; };

// Wake Word regex: English + Tamil variations of "hello/hey/hi cnc"
const WAKE_WORD_REGEX = /(?:^|\b)(?:hello|hey|hi|வணக்கம்|ஹலோ)\s+(?:cnc|c\s*n\s*c|c\s*and\s*c|c&c|erp|சி\s*என்\s*சி|சிஎன்சி)[!.,? ]*(.*)$/i;

/** Plays a pleasant two-tone synth chime when the wake word is detected */
function playWakeChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5 note
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5 note
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.35);
  } catch {
    // AudioContext autoplay restrictions are handled gracefully
  }
}

interface Msg {
  id: number;
  role: 'user' | 'ai';
  text: string;
  rows?: string[];
  go?: { path: string; label: string };
  error?: boolean;
}
interface Awaiting {
  intent: Intent;
  params: Params;
  preview: Preview;
}
let seq = 0;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
    'content-type': 'application/json',
  };
}

/** Fallback to edge function if deployed */
async function understandRemote(
  message: string,
  lang: Lang,
  page: string,
  pending: Pending | null,
  history: Msg[]
): Promise<Understood | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        copilot: {
          message,
          lang,
          page,
          pending,
          today: new Date().toISOString().slice(0, 10),
          history: history.slice(-6).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', text: m.text })),
        },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const intent = String(j.intent ?? 'unknown') as Intent;
    const params = (j.params && typeof j.params === 'object' ? j.params : {}) as Params;
    return { intent, params, missing: missingOf(intent, params), reply: String(j.reply ?? '') };
  } catch {
    return null;
  }
}

async function askHelp(question: string, page: string, pageTitle: string, lang: Lang): Promise<string> {
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ question, page, pageTitle, lang, history: [] }) });
    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const p of parts) {
          const line = p.replace(/^data:\s*/, '');
          try {
            const o = JSON.parse(line);
            if (o.t) text += o.t;
          } catch { /* partial */ }
        }
      }
      if (text.trim()) return text.trim();
    }
  } catch { /* use notes */ }
  return offlineAnswer(question, page, lang);
}

const YES = /^(yes|y|ok|okay|confirm|sure|go ahead|do it|aamam|aama|seri|sari|சரி|ஆம்|ஆமாம்)\b/i;
const NO = /^(no|n|cancel|stop|don'?t|venam|vendam|illa|இல்லை|வேண்டாம்)\b/i;

export function Copilot() {
  const navigate = useNavigate();
  const location = useLocation();
  const { company, canDo } = useAuth();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>(readLang);
  const [speak, setSpeak] = useState(() => ls.get('argus.copilot.speak', '1') === '1');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null);

  // Microphone Always-ON state (defaults to true; can be muted if needed)
  const [micMuted, setMicMuted] = useState(() => ls.get('argus.coworker.micMuted', '0') === '1');
  const micMutedRef = useRef(micMuted);
  micMutedRef.current = micMuted;

  // Track assistant speaking state to prevent acoustic loopback
  const isSpeakingRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  const autoSubmitTimerRef = useRef<any>(null);
  const restartTimerRef = useRef<any>(null);
  const otherModeActiveRef = useRef(false);
  const lastTranscriptRef = useRef('');

  // OpenAI settings state
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getOpenAIApiKey());
  const [hasApiKey, setHasApiKey] = useState(() => !!getOpenAIApiKey());

  // Pipeline summary list
  const [pipelineCards, setPipelineCards] = useState<PipelineItem[]>([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [showCardsDrawer, setShowCardsDrawer] = useState(false);
  const [cardFilter, setCardFilter] = useState<string>('all');
  const [cardSearch, setCardSearch] = useState('');

  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const ta = lang === 'ta';
  const L = useCallback((en: string, tm: string) => (ta ? tm : en), [ta]);

  const page = location.pathname;
  const pageTitle = useMemo(() => {
    try {
      const b = getBreadcrumbs(page.replace(/^\//, ''));
      return b[b.length - 1]?.label ?? '';
    } catch {
      return '';
    }
  }, [page]);

  const ctx: ActionCtx = useMemo(() => ({
    companyId: company?.id ?? null,
    canDo: canDo as ActionCtx['canDo'],
  }), [company?.id, canDo]);

  // Load pipeline cards
  const loadPipeline = useCallback(async () => {
    setLoadingPipeline(true);
    try {
      const cards = await fetchPipelineSummary(company?.id ?? null);
      setPipelineCards(cards);
    } catch (e) {
      console.warn('Failed to load pipeline cards:', e);
    } finally {
      setLoadingPipeline(false);
    }
  }, [company?.id]);

  useEffect(() => {
    if (open) {
      void loadPipeline();
    }
  }, [open, loadPipeline]);

  // Listen to open events
  useEffect(() => {
    const on = (e: Event) => {
      const want = (e as CustomEvent<{ on?: boolean }>).detail?.on;
      setOpen((o) => (typeof want === 'boolean' ? want : !o));
    };
    window.addEventListener('argus:copilot', on);
    return () => window.removeEventListener('argus:copilot', on);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('argus:mode', { detail: { mode: 'coworker', on: open } }));
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, awaiting, busy]);

  // Handle other assistant modes (teaching, adviser) so mics don't clash
  useEffect(() => {
    const handleMode = (e: Event) => {
      const d = (e as CustomEvent<{ mode: string; on: boolean }>).detail;
      if (d) {
        if (d.mode !== 'coworker' && d.on) {
          otherModeActiveRef.current = true;
          try { recRef.current?.abort?.(); } catch { /* ignore */ }
          setListening(false);
        } else if (d.mode !== 'coworker' && !d.on) {
          otherModeActiveRef.current = false;
          if (!micMutedRef.current) {
            startRecognitionRef.current();
          }
        }
      }
    };
    window.addEventListener('argus:mode', handleMode);
    return () => window.removeEventListener('argus:mode', handleMode);
  }, []);

  // Forward refs for closures
  const submitRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const startRecognitionRef = useRef<() => void>(() => {});
  const handleWakeActivationRef = useRef<(trailing?: string) => void>(() => {});

  // Safe voice output with echo cancellation (mic pauses during TTS)
  const speakText = useCallback((text: string, onDone?: () => void) => {
    if (!speak || !text) {
      onDone?.();
      return;
    }
    isSpeakingRef.current = true;
    try {
      recRef.current?.abort?.();
    } catch { /* ignore */ }
    setListening(false);

    say(
      text,
      () => {
        // Debounce before resuming mic to let speaker sound dissipate completely
        setTimeout(() => {
          isSpeakingRef.current = false;
          if (!micMutedRef.current && !otherModeActiveRef.current) {
            startRecognitionRef.current();
          }
          onDone?.();
        }, 350);
      },
      undefined
    );
  }, [speak]);

  const add = useCallback((m: Omit<Msg, 'id'>, speakIt = true, onDoneSpeaking?: () => void) => {
    setMsgs((x) => [...x, { ...m, id: ++seq }]);
    if (speakIt && speak && m.role === 'ai' && m.text) {
      speakText(m.text, onDoneSpeaking);
    } else {
      onDoneSpeaking?.();
    }
  }, [speak, speakText]);

  // Continuous speech recognition loop
  const startRecognition = useCallback(() => {
    if (!SR || micMutedRef.current || isSpeakingRef.current || otherModeActiveRef.current) {
      return;
    }

    try {
      recRef.current?.abort?.();
    } catch { /* ignore */ }

    const r = new SR();
    r.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      setListening(true);
    };

    r.onresult = (e: any) => {
      if (isSpeakingRef.current || otherModeActiveRef.current) return;

      let interim = '';
      let finalChunk = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const item = e.results[i];
        const t = item[0]?.transcript || '';
        if (item.isFinal) finalChunk += t;
        else interim += t;
      }

      const combined = (finalChunk || interim).trim();
      if (!combined) return;

      // 1. Check for Wake Word ("Hello CNC!" etc.)
      const wakeMatch = WAKE_WORD_REGEX.exec(combined);
      if (wakeMatch) {
        lastTranscriptRef.current = '';
        setInput('');
        handleWakeActivationRef.current(wakeMatch[1] || '');
        return;
      }

      // 2. If Co-worker is NOT open, only the Wake Word triggers activation
      if (!openRef.current) {
        return;
      }

      // 3. When Co-worker IS open, show speech in real time in the input bar
      setInput(combined);
      lastTranscriptRef.current = combined;

      // Auto-submit after natural pause of 850ms without new speech
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = setTimeout(() => {
        const toSubmit = lastTranscriptRef.current.trim();
        if (toSubmit && toSubmit.length >= 2 && !isSpeakingRef.current) {
          lastTranscriptRef.current = '';
          void submitRef.current(toSubmit);
        }
      }, 850);
    };

    r.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        // User explicitly denied mic access in browser settings
        setMicMuted(true);
        micMutedRef.current = true;
        ls.set('argus.coworker.micMuted', '1');
      }
      setListening(false);
    };

    r.onend = () => {
      setListening(false);
      // Restart loop automatically whenever speech ends or pauses
      if (!micMutedRef.current && !isSpeakingRef.current && !otherModeActiveRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          startRecognitionRef.current();
        }, 180);
      }
    };

    recRef.current = r;
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, [SR, lang]);

  startRecognitionRef.current = startRecognition;

  // Toggle mic mute/unmute
  const toggleMicMute = useCallback(() => {
    if (micMuted) {
      setMicMuted(false);
      micMutedRef.current = false;
      ls.set('argus.coworker.micMuted', '0');
      playWakeChime();
      startRecognition();
    } else {
      setMicMuted(true);
      micMutedRef.current = true;
      ls.set('argus.coworker.micMuted', '1');
      clearTimeout(restartTimerRef.current);
      clearTimeout(autoSubmitTimerRef.current);
      try {
        recRef.current?.abort?.();
      } catch { /* ignore */ }
      setListening(false);
    }
  }, [micMuted, startRecognition]);

  // Initial always-on microphone startup
  useEffect(() => {
    if (!SR) return;
    if (!micMutedRef.current) {
      startRecognition();
    }

    // In case browser requires a gesture to initialize audio capture
    const onUserGesture = () => {
      if (!listening && !micMutedRef.current && !isSpeakingRef.current && !otherModeActiveRef.current) {
        startRecognition();
      }
    };
    window.addEventListener('pointerdown', onUserGesture, { once: true });
    window.addEventListener('keydown', onUserGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onUserGesture);
      window.removeEventListener('keydown', onUserGesture);
    };
  }, [SR, listening, startRecognition]);

  // Cleanup on unmount
  useEffect(() => () => {
    stopSpeaking();
    clearTimeout(restartTimerRef.current);
    clearTimeout(autoSubmitTimerRef.current);
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
  }, []);

  const askFor = (u: Understood) => {
    const field = u.missing[0];
    const q = FIELD_QUESTION[field];
    return u.reply || (q ? L(q[0], q[1]) : L('Tell me a little more.', 'இன்னும் கொஞ்சம் சொல்லுங்கள்.'));
  };

  const confirm = useCallback(async () => {
    if (!awaiting) return;
    const a = awaiting;
    setAwaiting(null);
    setBusy(true);
    const r = await runAction(a.intent, a.params, ctx);
    setBusy(false);
    add({
      role: 'ai',
      text: r.ok ? `✓ ${r.message}` : `${L('Not saved: ', 'சேமிக்கவில்லை: ')}${r.message}`,
      go: r.ok ? r.where : undefined,
      error: !r.ok,
    });
    // Trigger board refresh across the entire app
    window.dispatchEvent(new CustomEvent('argus:data-changed'));
    void loadPipeline();
  }, [awaiting, ctx, add, L, loadPipeline]);

  const cancel = useCallback(() => {
    setAwaiting(null);
    setPending(null);
    add({ role: 'ai', text: L('Cancelled. Nothing was saved.', 'ரத்து செய்யப்பட்டது. எதுவும் சேமிக்கப்படவில்லை.') });
  }, [add, L]);

  const submit = useCallback(async (raw: string) => {
    clearTimeout(autoSubmitTimerRef.current);
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');

    // Check for Wake word triggers typed or spoken
    const wakeM = WAKE_WORD_REGEX.exec(text);
    if (wakeM) {
      playWakeChime();
      const trailing = (wakeM[1] || '').trim();
      const welcomeMsg = L(
        'Welcome to ERP! What data would you like to add, edit, or delete?',
        'Welcome to ERP! என்ன தரவைச் சேர்க்க, மாற்ற அல்லது நீக்க வேண்டும்?'
      );
      if (!trailing) {
        add({ role: 'ai', text: welcomeMsg }, true);
        return;
      } else {
        add({ role: 'ai', text: L('Welcome to ERP!', 'Welcome to ERP!') }, true, () => {
          void submitRef.current(trailing);
        });
        return;
      }
    }

    add({ role: 'user', text }, false);

    if (awaiting && YES.test(text)) {
      await confirm();
      return;
    }
    if (awaiting && NO.test(text)) {
      cancel();
      return;
    }
    if (awaiting) setAwaiting(null);

    setBusy(true);
    try {
      let u: Understood | null = null;

      // Check if user is typing or sending an OpenAI API key (sk-...)
      const keyM = /\b(sk-[A-Za-z0-9_-]{20,})\b/i.exec(text);
      if (keyM) {
        setOpenAIApiKey(keyM[1]);
        setApiKeyInput(keyM[1]);
        setHasApiKey(true);
        add({
          role: 'ai',
          text: L(
            '✓ OpenAI API Key saved! ChatGPT voice intelligence is now active.',
            '✓ OpenAI API Key சேமிக்கப்பட்டது! இனி குரல் கட்டளைகள் ChatGPT மூலம் ஆராயப்படும்.'
          ),
        });
        return;
      }

      // 1. If OpenAI API key is configured, analyze via ChatGPT API
      if (hasApiKey) {
        const summaries: PipelineCardSummary[] = pipelineCards.map((c) => ({
          refNo: c.refNo,
          customer: c.customer,
          part: c.part,
          qty: c.qty,
          stage: c.stage,
        }));
        const chatRes = await analyzeWithChatGPT(
          text,
          lang,
          summaries,
          msgs.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', text: m.text }))
        );
        if (chatRes) {
          u = {
            intent: chatRes.intent,
            params: chatRes.params,
            missing: missingOf(chatRes.intent, chatRes.params),
            reply: chatRes.reply,
          };
        }
      }

      // 2. Try remote Supabase Edge Function if ChatGPT was not used or failed
      if (!u) {
        u = await understandRemote(text, lang, page, pending, msgs);
      }

      // 3. Fallback to smart local understanding rules with pipeline cards context
      if (!u) {
        u = understandLocal(text, pending, new Date(), pipelineCards);
      }

      u.missing = missingOf(u.intent, u.params);

      if (u.intent === 'guide') {
        setPending(null);
        window.dispatchEvent(new CustomEvent('argus:guide'));
        add({ role: 'ai', text: L('Starting the walkthrough for this screen.', 'இந்தத் திரைக்கான வழிகாட்டியைத் தொடங்குகிறேன்.') });
        return;
      }

      if (u.intent === 'help') {
        setPending(null);
        if (u.params.identifier) {
          const ans = await explainRecordStage(String(u.params.identifier), ctx.companyId);
          window.dispatchEvent(new CustomEvent('argus:data-changed'));
          void loadPipeline();
          add({ role: 'ai', text: ans });
          return;
        }
        add({ role: 'ai', text: await askHelp(String(u.params.question ?? text), page, pageTitle, lang) });
        return;
      }

      if (u.intent === 'list_pipeline') {
        setPending(null);
        setShowCardsDrawer(true);
        void loadPipeline();
        add({
          role: 'ai',
          text: L(
            `Here is the active Sales Pipeline (${pipelineCards.length} records). You can click ✏️ to edit or 🗑️ to delete any record.`,
            `இதோ Sales Pipeline பட்டியல் (${pipelineCards.length} பதிவுகள்). மாற்ற ✏️ அல்லது நீக்க 🗑️ அழுத்தவும்.`
          ),
        });
        return;
      }

      if (u.intent === 'unknown') {
        setPending(null);
        add({
          role: 'ai',
          text: u.reply || L(
            'I can add, edit, or delete enquiries and sales orders, move stages, find records, or list pipeline cards. Try saying: “change quantity of enquiry 1025 to 20” or “delete enquiry 1025”.',
            'நான் enquiry, sales order சேர்க்க, மாற்ற, நீக்க முடியும். எ.கா: “change quantity of enquiry 1025 to 20” அல்லது “delete enquiry 1025”.'
          ),
        });
        return;
      }

      if (u.intent === 'open_page') {
        const hit = resolvePage(String(u.params.page || u.params.label || ''));
        if (!hit) {
          add({ role: 'ai', text: L('Which page? For example: pipeline, invoices, inventory, bank entry.', 'எந்தப் பக்கம்? எ.கா: pipeline, invoices, inventory, bank entry.') });
          setPending({ intent: 'open_page', params: {} });
          return;
        }
        setPending(null);
        navigate(`/${hit.page}`);
        add({ role: 'ai', text: L(`Opening ${hit.label}.`, `${hit.label} பக்கத்தைத் திறக்கிறேன்.`) });
        return;
      }

      if (u.intent === 'find_records') {
        if (u.missing.length) {
          setPending({ intent: u.intent, params: u.params });
          add({ role: 'ai', text: askFor(u) });
          return;
        }
        setPending(null);
        const r = await findRecords(String(u.params.kind), String(u.params.query ?? ''), ctx);
        add({ role: 'ai', text: r.title, rows: r.rows });
        return;
      }

      if (ACTION_INTENTS.includes(u.intent)) {
        if (u.missing.length) {
          setPending({ intent: u.intent, params: u.params });
          add({ role: 'ai', text: askFor(u) });
          return;
        }
        setPending(null);
        const pv = await previewAction(u.intent, u.params, ctx);
        if (pv.blocked) {
          add({ role: 'ai', text: pv.blocked, error: true });
          return;
        }
        setAwaiting({ intent: u.intent, params: u.params, preview: pv });
        add({
          role: 'ai',
          text: u.reply || L('Please review and confirm this action.', 'இதைச் சரிபார்த்து உறுதிப்படுத்துங்கள்.'),
        });
      }
    } catch (e) {
      add({ role: 'ai', text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }, [busy, awaiting, pending, msgs, lang, page, pageTitle, ctx, hasApiKey, pipelineCards, add, confirm, cancel, navigate, L, loadPipeline]);

  submitRef.current = submit;

  // Wake Word Handler: Activates, chimes, welcomes user and processes trailing command
  const handleWakeActivation = useCallback((trailingCmd = '') => {
    playWakeChime();
    setOpen(true);
    const welcome = L(
      'Welcome to ERP! What data would you like to add, edit, or delete?',
      'Welcome to ERP! என்ன தரவைச் சேர்க்க, மாற்ற அல்லது நீக்க வேண்டும்?'
    );
    const clean = trailingCmd.trim();
    if (!clean) {
      add({ role: 'ai', text: welcome }, true);
    } else {
      add({ role: 'ai', text: L('Welcome to ERP!', 'Welcome to ERP!') }, true, () => {
        void submitRef.current(clean);
      });
    }
  }, [add, L]);

  handleWakeActivationRef.current = handleWakeActivation;

  // Proactive greeting on open
  useEffect(() => {
    if (open && msgs.length === 0) {
      const welcome = L(
        'Welcome to ERP! What data would you like to add, edit, or delete?',
        'Welcome to ERP! என்ன தரவைச் சேர்க்க, மாற்ற அல்லது நீக்க வேண்டும்?'
      );
      add({ role: 'ai', text: welcome }, true);
    }
  }, [open, msgs.length, add, L]);

  const toggleLang = () => {
    const n: Lang = lang === 'ta' ? 'en' : 'ta';
    setLang(n);
    ls.set('help.vlang', n);
  };

  const toggleSpeak = () => {
    const n = !speak;
    setSpeak(n);
    ls.set('argus.copilot.speak', n ? '1' : '0');
    if (!n) stopSpeaking();
  };

  const saveApiKey = () => {
    const cleanKey = apiKeyInput.trim();
    setOpenAIApiKey(cleanKey);
    setHasApiKey(!!cleanKey);
    setShowKeyModal(false);
    add({
      role: 'ai',
      text: cleanKey
        ? L('✓ ChatGPT API Key saved! Voice commands will now be analyzed by ChatGPT.', '✓ ChatGPT API Key சேமிக்கப்பட்டது! இனி குரல் கட்டளைகள் ChatGPT மூலம் ஆராயப்படும்.')
        : L('ChatGPT API Key removed. Using built-in local NLP.', 'ChatGPT API Key நீக்கப்பட்டது. உள்ளமைக்கப்பட்ட முறை பயன்படுத்தப்படும்.'),
    });
  };

  // Filtered pipeline cards for drawer
  const filteredCards = useMemo(() => {
    return pipelineCards.filter((c) => {
      if (cardFilter !== 'all') {
        if (cardFilter === 'enquiry' && c.type !== 'enquiry') return false;
        if (cardFilter === 'order' && c.type !== 'sales_order') return false;
        if (cardFilter === 'dc' && c.type !== 'dc') return false;
        if (cardFilter === 'quotation' && c.type !== 'quotation') return false;
      }
      if (cardSearch.trim()) {
        const q = cardSearch.toLowerCase();
        return (
          c.refNo.toLowerCase().includes(q) ||
          c.customer.toLowerCase().includes(q) ||
          c.part.toLowerCase().includes(q) ||
          c.stage.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [pipelineCards, cardFilter, cardSearch]);

  // Standby pill when Co-worker is closed: Shows active always-on listening status
  if (!open) {
    return (
      <div
        className="fixed bottom-4 left-[5.5rem] z-[60] flex items-center gap-2 rounded-full border border-violet-200 bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-xs transition-all hover:shadow-xl hover:scale-105 cursor-pointer select-none max-lg:bottom-20 max-lg:left-2"
        onClick={() => {
          setOpen(true);
          playWakeChime();
        }}
        title={
          micMuted
            ? 'Co-worker mic is muted. Click to open.'
            : 'Co-worker is listening! Say "Hello CNC!" or click to open.'
        }
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white shadow-xs">
          <Sparkles size={13} />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-bold text-slate-800">Co-worker</span>
          {!micMuted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              Say "Hello CNC !"
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              Mic Muted
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Co-worker"
      data-voice-ignore
      className="fixed bottom-[4.5rem] left-[5.5rem] z-[75] flex h-[35rem] max-h-[calc(100vh-5.5rem)] w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-slate-200 bg-white font-sans shadow-2xl max-lg:bottom-[8.5rem] max-lg:left-2 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-700 px-3.5 py-2.5 text-white shadow-sm shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-amber-300">
          <Sparkles size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold leading-tight">Co-worker</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[9px] font-semibold ${
                hasApiKey ? 'bg-emerald-500/30 text-emerald-100' : 'bg-blue-400/20 text-blue-100'
              }`}
              title={hasApiKey ? 'ChatGPT API Connected' : 'Built-in Local NLP Engine'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${hasApiKey ? 'bg-emerald-300 animate-pulse' : 'bg-blue-200'}`} />
              {hasApiKey ? 'ChatGPT' : 'Local'}
            </span>

            {/* Continuous Microphone status badge */}
            <button
              type="button"
              onClick={toggleMicMute}
              title={micMuted ? 'Mic is Muted. Click to enable continuous listening.' : 'Mic is Always ON. Click to mute.'}
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[9px] font-bold transition-all ${
                micMuted
                  ? 'bg-rose-500/30 text-rose-200 border border-rose-400/40 hover:bg-rose-500/50'
                  : 'bg-emerald-400/30 text-emerald-100 border border-emerald-300/40 hover:bg-emerald-400/40'
              }`}
            >
              <span className="relative flex h-1.5 w-1.5">
                {!micMuted && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${micMuted ? 'bg-rose-400' : 'bg-emerald-300'}`}></span>
              </span>
              <span>{micMuted ? 'Mic Muted' : 'Mic: Always ON'}</span>
            </button>
          </div>
          <p className="truncate text-[10px] text-white/70">
            {L('🎙️ Say "Hello CNC!" anytime · Ask what to add, edit or delete', '🎙️ "Hello CNC!" என்று எப்போது வேண்டுமானாலும் சொல்லலாம்')}
          </p>
        </div>

        {/* API Key settings toggle */}
        <button
          type="button"
          aria-label="OpenAI Settings"
          title="Configure OpenAI ChatGPT API Key"
          onClick={() => setShowKeyModal((v) => !v)}
          className={`rounded p-1.5 transition-colors ${showKeyModal ? 'bg-white/30 text-amber-300' : 'hover:bg-white/15 text-white/90'}`}
        >
          <Key size={15} />
        </button>

        <button
          type="button"
          aria-label={speak ? 'Mute replies' : 'Speak replies'}
          title={speak ? 'Mute replies' : 'Speak replies'}
          onClick={toggleSpeak}
          className="rounded p-1.5 hover:bg-white/15 text-white/90"
        >
          {speak ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>

        <button
          type="button"
          aria-label="Language"
          title="தமிழ் / English"
          onClick={toggleLang}
          className="flex items-center gap-1 rounded p-1.5 text-[11px] font-bold hover:bg-white/15 text-white/90"
        >
          <Languages size={14} />
          {ta ? 'EN' : 'தமிழ்'}
        </button>

        <button
          type="button"
          aria-label="Close Co-worker"
          onClick={() => setOpen(false)}
          className="rounded p-1.5 hover:bg-white/15 text-white/90"
        >
          <X size={16} />
        </button>
      </div>

      {/* OpenAI API Key Popover */}
      {showKeyModal && (
        <div className="border-b border-violet-100 bg-violet-50/90 p-3 text-xs shrink-0 transition-all">
          <div className="flex items-center justify-between font-bold text-violet-900 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Key size={13} className="text-violet-600" />
              OpenAI ChatGPT API Key
            </span>
            <button
              type="button"
              onClick={() => setShowKeyModal(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-slate-600 mb-2">
            Paste your OpenAI API key below (e.g. <code>sk-...</code>). Voice commands will be sent to ChatGPT for real-time analysis before saving to the database.
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-proj-..."
              className="h-8 flex-1 rounded border border-violet-200 bg-white px-2.5 text-xs font-mono text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
            <button
              type="button"
              onClick={saveApiKey}
              className="h-8 rounded bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700"
            >
              Save
            </button>
            {hasApiKey && (
              <button
                type="button"
                onClick={() => {
                  setApiKeyInput('');
                  setOpenAIApiKey('');
                  setHasApiKey(false);
                  setShowKeyModal(false);
                }}
                className="h-8 rounded border border-rose-300 bg-white px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pipeline Quick Bar & Drawer Toggle */}
      <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-1.5 text-xs shrink-0">
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setShowCardsDrawer((v) => !v)}
            className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-violet-700"
          >
            <span>📋 Pipeline:</span>
            <span className="rounded-full bg-violet-100 px-1.5 py-0.2 text-[10px] font-bold text-violet-800">
              {loadingPipeline ? '...' : `${pipelineCards.length} Cards`}
            </span>
            {showCardsDrawer ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => void loadPipeline()}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200/60"
              title="Refresh Pipeline Cards"
            >
              <RefreshCw size={11} className={loadingPipeline ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Collapsible Pipeline Cards List */}
        {showCardsDrawer && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs">
            {/* Search and filters */}
            <div className="mb-2 flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter cards..."
                  value={cardSearch}
                  onChange={(e) => setCardSearch(e.target.value)}
                  className="h-7 w-full rounded-md border border-slate-200 bg-slate-50 pl-6 pr-2 text-[11px] focus:border-violet-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-0.5">
                {(['all', 'enquiry', 'order', 'dc'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCardFilter(k)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ${
                      cardFilter === k ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards scroll area */}
            <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5 text-[11px]">
              {filteredCards.length === 0 ? (
                <p className="text-center py-2 text-[11px] text-slate-400 italic">No pipeline records match</p>
              ) : (
                filteredCards.map((c) => {
                  const stageBg =
                    c.type === 'enquiry'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : c.type === 'sales_order'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : c.type === 'dc'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-purple-50 text-purple-700 border-purple-200';

                  return (
                    <div
                      key={`${c.type}-${c.id}`}
                      className="flex items-center justify-between gap-1.5 rounded-lg border border-slate-100 bg-slate-50/50 p-1.5 hover:bg-slate-100/70 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded border px-1 py-0.2 text-[9px] font-bold ${stageBg}`}>
                            {c.stage}
                          </span>
                          <span className="font-bold text-slate-800 truncate">{c.refNo}</span>
                          <span className="text-slate-500 truncate text-[10px]">({c.customer})</span>
                        </div>
                        <p className="truncate text-[10px] text-slate-600">
                          {c.part} {c.qty > 0 ? `· Qty ${c.qty}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Quick edit */}
                        <button
                          type="button"
                          title={`Edit ${c.refNo}`}
                          onClick={() => {
                            const cmd = c.type === 'sales_order'
                              ? `edit sales order ${c.refNo} qty `
                              : `edit enquiry ${c.refNo} qty `;
                            setInput(cmd);
                          }}
                          className="rounded p-1 text-slate-500 hover:bg-violet-100 hover:text-violet-700"
                        >
                          <Edit3 size={12} />
                        </button>

                        {/* Quick delete */}
                        <button
                          type="button"
                          title={`Delete ${c.refNo}`}
                          onClick={() => {
                            const cmd = c.type === 'sales_order'
                              ? `delete sales order ${c.refNo}`
                              : `delete enquiry ${c.refNo}`;
                            void submit(cmd);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-[13px]">
        {/* Suggestion pills if few messages */}
        {msgs.length <= 1 && (
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 to-indigo-50/40 p-2.5 text-slate-700">
            <p className="text-[11px] font-bold uppercase tracking-wider text-violet-800 mb-1.5">
              {L('Quick Voice / Text Actions:', 'விரைவு கட்டளைகள்:')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setInput('add enquiry for ')}
                className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 shadow-2xs"
              >
                <PlusCircle size={11} /> {L('Add Enquiry', 'Enquiry சேர்க்க')}
              </button>
              <button
                type="button"
                onClick={() => setInput('change quantity of enquiry ')}
                className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 shadow-2xs"
              >
                <Edit3 size={11} /> {L('Edit Quantity', 'அளவை மாற்ற')}
              </button>
              <button
                type="button"
                onClick={() => setInput('delete enquiry ')}
                className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 shadow-2xs"
              >
                <Trash2 size={11} /> {L('Delete Record', 'பதிவை நீக்க')}
              </button>
              <button
                type="button"
                onClick={() => void submit('கொட்டேஷன் ஆட் பண்ணனும்')}
                className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-white px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 shadow-2xs"
              >
                📜 {L('Make Quotation', 'Quotation போட')}
              </button>
              <button
                type="button"
                onClick={() => void submit('list pipeline')}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 shadow-2xs"
              >
                📋 {L('Show Pipeline List', 'முழு பட்டியல்')}
              </button>
              {!hasApiKey && (
                <button
                  type="button"
                  onClick={() => setShowKeyModal(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 shadow-2xs"
                >
                  <Key size={11} /> {L('Connect ChatGPT API', 'ChatGPT Key இணைக்க')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Message bubble stream */}
        {msgs.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
            <div
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${
                m.role === 'user'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : m.error
                  ? 'border border-red-200 bg-red-50 text-red-800'
                  : 'border border-slate-100 bg-slate-100 text-slate-800'
              }`}
            >
              {m.text}
              {m.rows && m.rows.length > 0 && (
                <ul className="mt-1.5 space-y-1 border-t border-slate-200 pt-1.5 text-xs">
                  {m.rows.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              {m.go && (
                <button
                  type="button"
                  onClick={() => navigate(m.go!.path)}
                  className="mt-2 block rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-violet-700 shadow-xs hover:bg-violet-50"
                >
                  {L('Show me', 'காட்டு')}: {m.go.label}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Action Confirmation Card */}
        {awaiting && (
          <div className="rounded-2xl border-2 border-violet-300 bg-gradient-to-br from-violet-50/90 to-purple-50/90 p-3 shadow-md">
            <div className="flex items-center gap-1.5 text-violet-800 font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles size={14} className="text-violet-600" />
              <span>{awaiting.preview.title}</span>
            </div>
            <ul className="mt-1.5 space-y-1 text-[13px] text-slate-800 font-medium">
              {awaiting.preview.lines.map((l, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span>{l}</span>
                </li>
              ))}
            </ul>
            {awaiting.preview.warnings.map((w, i) => (
              <p key={i} className="mt-1.5 text-xs text-amber-700 font-medium">
                ⚠ {w}
              </p>
            ))}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-violet-700 disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                {L('Confirm & Save', 'உறுதி செய்')}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {L('Cancel', 'ரத்து')}
              </button>
            </div>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
            <Loader2 size={14} className="animate-spin text-violet-600" />
            <span>{hasApiKey ? L('Analyzing with ChatGPT…', 'ChatGPT மூலம் ஆராய்கிறேன்…') : L('Working…', 'செய்கிறேன்…')}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input & Continuous Microphone form */}
      <form
        className="flex items-center gap-1.5 border-t border-slate-200 bg-slate-50/50 p-2.5 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
      >
        <button
          type="button"
          onClick={toggleMicMute}
          aria-label={micMuted ? 'Enable continuous microphone' : 'Mute microphone'}
          title={micMuted ? 'Microphone Muted. Click to listen.' : 'Microphone Always Listening. Click to mute.'}
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all ${
            micMuted
              ? 'bg-slate-400 hover:bg-slate-500 text-slate-100'
              : listening
              ? 'bg-emerald-600 hover:bg-emerald-700 ring-4 ring-emerald-300 animate-pulse'
              : 'bg-violet-600 hover:bg-violet-700'
          }`}
        >
          {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <input
          aria-label="Message to Co-worker"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            micMuted
              ? L('Mic is muted. Type command or click mic...', 'மைக் அணைக்கப்பட்டுள்ளது. தட்டச்சு செய்யுங்கள்...')
              : listening
              ? L('🎙️ Listening continuously… Say command or "Hello CNC!"', '🎙️ தொடர்ந்து கேட்கிறேன்… கட்டளை சொல்லுங்கள்')
              : L('Speak or type command…', 'கட்டளை சொல்லுங்கள்…')
          }
          className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        />

        <button
          type="submit"
          aria-label="Send"
          disabled={busy || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition-all hover:bg-black disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

// Alias export for backward compatibility
export const Coworker = Copilot;
