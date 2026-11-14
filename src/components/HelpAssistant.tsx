import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiAccess } from '@/lib/aiAccess';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bot, CheckCircle2, GraduationCap, Lightbulb, Loader2, MessageCircle, Mic, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AdviserReportPanel } from '@/components/AdviserReport';
import { serverChat, serverSpeech, ServerAiError } from '@/lib/adviser/serverAi';
import { boostAudio } from '@/lib/voiceBoost';
import { supabase } from '@/lib/supabase';
import { getBreadcrumbs } from '@/config/navigation';
import { useDraggable } from '@/lib/useDraggable';
import { useDockDrag } from './AssistantDock';
import { useResizable, ResizeGrip } from '@/lib/useResizable';
import { getOpenAIApiKey } from '@/lib/copilot/openai';
import { rankNotes } from '../../supabase/functions/help-assistant/knowledge';

// "உதவி / Help": a VOICE assistant, no chat window. Press Help and it says "yes, tell me", listens, answers out loud, then
// listens again, until you say "stop" (or press the stop button, or stay quiet). It answers from the written BI notes
// (help-assistant edge function) in Tamil, English or Tanglish, and starts speaking as soon as the first sentence is ready.

type Lang = 'ta' | 'tanglish' | 'en';
type Phase = 'idle' | 'greeting' | 'ready' | 'listening' | 'thinking' | 'speaking';

const LANGS: { code: Lang; label: string }[] = [{ code: 'ta', label: 'தமிழ்' }, { code: 'tanglish', label: 'Tanglish' }, { code: 'en', label: 'English' }];
const store = {
  get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const TAMIL = /[஀-௿]/;
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;
// "Guide me": starts the on-screen walkthrough of the current screen (GuideCoach) instead of answering by voice.
const GUIDE_WORDS = /\b(guide me|walk me through|walkthrough|show me how|step by step|guide pannu|guide pannunga|vazhi ?kaattu)\b|வழிகாட்டு|வழி காட்டு|வழிகாட்டுங்கள்/i;
/** The word that ends a turn when "over" mode is on (English, Tamil script and a common spelling of it). */
const OVER_RE = /(?:^|[\s,.!?])(over|ஓவர்|ஓவர|ஓவரு|ஓவா|ஓர்|ovar|ओवर)\s*[.!?]*\s*$/i;

/** English words people say inside Tamil speech, as the mic writes them in Tamil letters -> the English word. */
const TA_TERMS: [RegExp, string][] = [
  [/என்குயர|என்க்வயர|என்குவயர|என்கொயர|என்க்யர|இன்குயர|இன்க்வயர|இன்குவயர|இன்கொயர/, 'enquiry'],
  [/கொட்டேஷன்|கோட்டேஷன்|குவோட்டேஷன்|குவொட்டேஷன்|கொட்டேசன்|கோட்டேசன்|குவோட்|க்வோட்/, 'quotation quote'],
  [/இன்வாய்ஸ்|இன்வாய்ச்|இன்வாய்சு|இன்வாயிஸ்/, 'invoice'],
  [/ஆர்டர்|ஆடர்/, 'order'],
  [/இன்வர்ட்|இன்வார்ட்|இன்வேர்ட்/, 'inward'],
  [/டெலிவரி/, 'delivery'],
  [/சலான்|செலான்|சல்லான்/, 'challan dc'],
  [/புரொடக்ஷன்|ப்ரொடக்ஷன்|புரடக்ஷன்|புரொடக்சன்/, 'production'],
  [/ஷெட்யூல்|ஷெடியூல்|செட்யூல்/, 'schedule scheduling'],
  [/ஸ்டாக்|ஸ்டோக்/, 'stock'],
  [/பெட்டி\s?கேஷ்|பெட்டி\s?கேஸ்/, 'petty cash'],
  [/கஸ்டமர்|கஸ்டமர/, 'customer'],
  [/வெண்டர்|வென்டர்|சப்ளையர்/, 'vendor supplier'],
  [/பேமெண்ட்|பேமென்ட்/, 'payment'],
  [/ரிப்போர்ட்|ரிப்போட்/, 'report'],
  [/டாஷ்போர்ட்|டேஷ்போர்ட்/, 'dashboard'],
  [/பைப்லைன்|பைப்பலைன்/, 'pipeline'],
  [/ரிஜெக்ட்|ரிஜெக்டட்/, 'rejected'],
  [/ஃபினிஷ்ட்|பினிஷ்ட்|ஃபினிஷ்|குட்ஸ்/, 'finished goods'],
  [/பர்சேஸ்|பர்ச்சேஸ்/, 'purchase'],
  [/எக்ஸ்பென்ஸ்|செலவு/, 'expense'],
  [/மெஷின்|மிஷின்/, 'machine'],
  [/லாகின்|லாக்இன்|பாஸ்வேர்ட்/, 'login password'],
  [/யூசர்|ரோல்/, 'user role'],
  [/வொர்க்\s?ஆர்டர்/, 'work order'],
  [/ஜாப்\s?கார்டு|ஜாப்/, 'job card'],
  [/டிராயிங்|ட்ராயிங்/, 'drawing'],
  [/காஸ்டிங்|காஸ்ட்|விலை/, 'costing cost price'],
];
/** Adds the English word for every English word the mic wrote in Tamil letters, so the BI notes can be found. */
function withEnglishTerms(q: string): string {
  const extra = TA_TERMS.filter(([re]) => re.test(q)).map(([, en]) => en);
  return extra.length ? `${q} ${extra.join(' ')}` : q;
}
const STOP_WORDS = /^(stop|bye|goodbye|that'?s all|enough|exit|close|நிறுத்து|போதும்|நிறுத்தவும்|பை|nirutthu|nirutha|podhum|pothum|bye bye)\b/i;

const GREETING: Record<Lang, string> = { ta: 'ஆம், சொல்லுங்கள்.', tanglish: 'Yes, sollunga.', en: 'Yes, tell me.' };

// Proactive suggestions for each page (Adviser mode)
const PAGE_SUGGESTIONS: Record<string, { en: string; ta: string }[]> = {
  '/sales/pipeline': [
    { en: 'Add a new enquiry by clicking "+ New Enquiry"', ta: '"+ New Enquiry" கிளிக் செய்து புதிய விசாரணை சேர்க்கவும்' },
    { en: 'Drag enquiries between columns to change status', ta: 'நிலையை மாற்ற விசாரணைகளை நெடுவரிசைகளுக்கு இடையே இழுக்கவும்' },
    { en: 'Click an enquiry card to view or edit details', ta: 'விவரங்களைப் பார்க்க விசாரணை அட்டையைக் கிளிக் செய்யவும்' },
    { en: 'Create quotation from an enquiry using the "Quote" button', ta: '"Quote" பட்டனைப் பயன்படுத்தி விசாரணையிலிருந்து quote உருவாக்கவும்' },
  ],
  '/production/scheduling': [
    { en: 'Drag jobs to schedule them on machines', ta: 'இயந்திரங்களில் திட்டமிட வேலைகளை இழுக்கவும்' },
    { en: 'Double-click a scheduled block to edit it', ta: 'திட்டமிடப்பட்ட தொகுதியைத் திருத்த இருமுறை கிளிக் செய்யவும்' },
    { en: 'Use filters to show specific machines or date ranges', ta: 'குறிப்பிட்ட இயந்திரங்கள் அல்லது தேதி வரம்புகளைக் காட்ட வடிப்பான்களைப் பயன்படுத்தவும்' },
  ],
  '/production/planning': [
    { en: 'View all production orders and their status', ta: 'அனைத்து உற்பத்தி ஆர்டர்களையும் அவற்றின் நிலையையும் பாருங்கள்' },
    { en: 'Create job cards for each operation', ta: 'ஒவ்வொரு செயல்பாட்டிற்கும் ஜாப் கார்டுகளை உருவாக்கவும்' },
    { en: 'Track work order progress in real-time', ta: 'வேலை ஆர்டர் முன்னேற்றத்தை நிகழ்நேரத்தில் கண்காணிக்கவும்' },
  ],
  '/finance/invoices': [
    { en: 'Create invoice from a delivery challan', ta: 'டெலிவரி சலானிலிருந்து இன்வாய்ஸ் உருவாக்கவும்' },
    { en: 'Record payment by clicking "Record Receipt"', ta: '"Record Receipt" கிளிக் செய்து பணம் செலுத்துதலைப் பதிவு செய்யவும்' },
    { en: 'Print or download invoice as PDF', ta: 'இன்வாய்ஸை PDF ஆக பிரிண்ட் அல்லது டவுன்லோட் செய்யவும்' },
  ],
  '/finance/bank-entry': [
    { en: 'Record bank deposits and withdrawals', ta: 'வங்கி வைப்புகள் மற்றும் பணம் எடுத்தலைப் பதிவு செய்யவும்' },
    { en: 'Import bank statement to reconcile transactions', ta: 'பரிவர்த்தனைகளைச் சரிசெய்ய வங்கி அறிக்கையை இறக்குமதி செய்யவும்' },
  ],
  '/accounts/ledger': [
    { en: 'View account transactions by selecting an account', ta: 'கணக்கைத் தேர்ந்தெடுத்து பரிவர்த்தனைகளைப் பாருங்கள்' },
    { en: 'Export ledger as PDF or Excel', ta: 'லெட்ஜரை PDF அல்லது Excel ஆக ஏற்றுமதி செய்யவும்' },
    { en: 'Filter by date range to see specific periods', ta: 'குறிப்பிட்ட காலங்களைப் பார்க்க தேதி வரம்பு மூலம் வடிகட்டவும்' },
  ],
  '/accounts/trial-balance': [
    { en: 'View debit and credit balances of all accounts', ta: 'அனைத்து கணக்குகளின் டெபிட் மற்றும் கிரெடிட் இருப்புகளைப் பாருங்கள்' },
    { en: 'Export trial balance for auditing', ta: 'தணிக்கைக்கு trial balance ஐ ஏற்றுமதி செய்யவும்' },
  ],
  '/inventory/stock': [
    { en: 'Check low stock alerts in the alerts tab', ta: 'குறைந்த ஸ்டாக் எச்சரிக்கைகளை அலர்ட் டேபில் பாருங்கள்' },
    { en: 'Add stock movement to track inventory changes', ta: 'சரக்கு மாற்றங்களைக் கண்காணிக்க ஸ்டாக் நகர்வைச் சேர்க்கவும்' },
    { en: 'View stock value and quantity at a glance', ta: 'ஸ்டாக் மதிப்பு மற்றும் அளவை ஒரே பார்வையில் பாருங்கள்' },
  ],
  '/purchasing/orders': [
    { en: 'Create purchase orders for suppliers', ta: 'சப்ளையர்களுக்கு purchase orders உருவாக்கவும்' },
    { en: 'Track order status and delivery dates', ta: 'ஆர்டர் நிலை மற்றும் டெலிவரி தேதிகளைக் கண்காணிக்கவும்' },
  ],
  '/dashboard': [
    { en: 'View key performance indicators at a glance', ta: 'முக்கிய செயல்திறன் குறிகாட்டிகளை ஒரே பார்வையில் பாருங்கள்' },
    { en: 'Click on any metric to drill down into details', ta: 'விவரங்களுக்கு எந்த மெட்ரிக் மீதும் கிளிக் செய்யவும்' },
    { en: 'Use date filters to change the reporting period', ta: 'அறிக்கை காலத்தை மாற்ற தேதி வடிப்பான்களைப் பயன்படுத்தவும்' },
  ],
  '/costing/job-costing': [
    { en: 'View project-wise cost breakdown', ta: 'திட்டம் வாரியான செலவு விவரங்களைப் பாருங்கள்' },
    { en: 'Compare estimated vs actual costs', ta: 'மதிப்பிடப்பட்ட vs உண்மையான செலவுகளை ஒப்பிடவும்' },
  ],
  '/engineering/cnc-vault': [
    { en: 'Upload drawings and technical documents', ta: 'வரைபடங்கள் மற்றும் தொழில்நுட்ப ஆவணங்களை பதிவேற்றவும்' },
    { en: 'Link products to their drawings and BOMs', ta: 'தயாரிப்புகளை அவற்றின் வரைபடங்கள் மற்றும் BOM-களுடன் இணைக்கவும்' },
  ],
};

// The first time Help is switched on in a browser session it welcomes the person.
const WELCOME: Record<Lang, string> = {
  ta: 'Argus Business Intelligence-க்கு வரவேற்கிறோம்! சொல்லுங்கள், எப்படி உதவலாம்?',
  tanglish: 'Welcome to Argus Business Intelligence! Sollunga, eppadi help pannalam?',
  en: 'Welcome to Argus Business Intelligence! How can I help you?',
};
const welcomedOnce = () => { try { return sessionStorage.getItem('argus.help.welcomed') === '1'; } catch { return false; } };
const markWelcomed = () => { try { sessionStorage.setItem('argus.help.welcomed', '1'); } catch { /* ignore */ } };
const GOODBYE: Record<Lang, string> = { ta: 'சரி, தேவைப்படும்போது கூப்பிடுங்கள்.', tanglish: 'Sari, venumbodhu koopidunga.', en: 'Okay, call me when you need me.' };
const NOT_HEARD: Record<Lang, string> = { ta: 'எனக்கு கேட்கவில்லை.', tanglish: 'Enakku kekkala.', en: "I didn't hear anything." };

// ---------------------------------------------------------------- speaking
let voices: SpeechSynthesisVoice[] = [];
const loadVoices = () => { try { voices = window.speechSynthesis.getVoices(); } catch { voices = []; } };
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  try {
    window.speechSynthesis.onvoiceschanged = () => { loadVoices(); };
  } catch {}
}

// The clearest voices are the "Natural" / "Neural" / online ones (Microsoft Edge has them; Chrome has Google's), so those are
// preferred; the person can also pick a voice (it is remembered).
const voiceScore = (v: SpeechSynthesisVoice) =>
  (/natural|neural/i.test(v.name) ? 8 : 0) + (/online/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.lang === 'en-IN' || v.lang === 'ta-IN' ? 1 : 0);
function voiceList(kind: 'ta' | 'en'): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang.toLowerCase().startsWith(kind)).sort((x, y) => voiceScore(y) - voiceScore(x) || x.name.localeCompare(y.name));
}
function voiceFor(text: string): SpeechSynthesisVoice | undefined {
  loadVoices();
  const kind = TAMIL.test(text) ? 'ta' : 'en';
  const list = voiceList(kind);
  const saved = store.get(`help.voice.${kind}`, '');
  const match = list.find((v) => v.name === saved) ?? list[0];
  if (match) return match;
  // Tamil words must never be read by an English voice (it sounds like some other language): with no Tamil voice installed
  // the online Tamil voice is used instead (see say()).
  if (kind === 'ta') return undefined;
  if (voices.length > 0) {
    return voices.find((v) => v.default) ?? voices[0];
  }
  return undefined;
}

// Windows and Chrome usually have NO Tamil voice installed, so Tamil text would be silent. When no Tamil voice exists, the
// Tamil sentences are played from an online voice instead (Google's text-to-speech web address, one small piece at a time).
let onlineAudio: HTMLAudioElement | null = null;
let onlineToken = 0;
function chunksOf(text: string, max = 180): string[] {
  const out: string[] = [];
  let cur = '';
  for (const part of text.split(/(?<=[.!?।,;])\s+|\n+/)) {
    if ((cur + ' ' + part).trim().length > max && cur) { out.push(cur.trim()); cur = part; } else cur = `${cur} ${part}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length <= max ? [c] : c.match(new RegExp('.{1,' + max + '}( |$)', 'g')) ?? [c]));
}
let serverVoiceDown = false;   // the server voice failed once: do not keep trying it
let tamilVoiceFailed = false;  // neither online voice worked
async function serverVoice(text: string): Promise<HTMLAudioElement | null> {
  if (serverVoiceDown) return null;
  const ours = await serverSpeech(text, TAMIL.test(text) ? 'ta' : 'en');   // ChatGPT's voice through our own server
  if (ours) return new Audio(URL.createObjectURL(ours));
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''), 'content-type': 'application/json' },
      body: JSON.stringify({ tts: text, lang: TAMIL.test(text) ? 'ta' : 'en' }),
    });
    if (!res.ok) { serverVoiceDown = true; return null; }
    return new Audio(URL.createObjectURL(await res.blob()));
  } catch { serverVoiceDown = true; return null; }
}
function playOnline(text: string, tl: string, onEnd: () => void, notify?: (m: string) => void, googleFirst = false) {
  const parts = chunksOf(text);
  const token = ++onlineToken;
  const play = (a: HTMLAudioElement) => new Promise<boolean>((resolve) => {
    onlineAudio = a;
    if (a.src.startsWith('blob:')) boostAudio(a); else a.volume = 1;   // the server voice is played through a gain stage: clearly louder
    try { a.playbackRate = tl === 'ta' ? 0.92 : 1; } catch { /* default speed */ }   // Tamil a little slower: easier to follow
    a.onended = () => resolve(true);
    a.onerror = () => resolve(false);
    a.play().catch(() => resolve(false));
  });
  const next = async (i: number) => {
    if (token !== onlineToken) return;               // stopped or replaced
    if (i >= parts.length) { onEnd(); return; }
    const piece = parts[i].trim();
    // Google's online voice and the server's voice (needs the help function + OPENAI_API_KEY); which one goes first is the person's choice.
    let ok = false;
    const google = () => play(new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(piece)}`));
    if (googleFirst) ok = await google();
    if (!ok && token === onlineToken) {
      const sv = await serverVoice(piece);
      if (token !== onlineToken) return;
      if (sv) ok = await play(sv);
    }
    if (!ok && !googleFirst && token === onlineToken) ok = await google();
    if (token !== onlineToken) return;
    if (!ok) {
      if (!tamilVoiceFailed) { tamilVoiceFailed = true; notify?.('Tamil voice is not available on this PC. Open Argus BI in Microsoft Edge (it has Tamil voices built in), or install a Tamil voice in Windows, or switch Language to English / Tanglish.'); }
      onEnd();
      return;
    }
    void next(i + 1);
  };
  void next(0);
}
let announcedOnline = false;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let resumeTimer: any = null;
let safetyTtsTimer: any = null;

// ------------------------------------------------------------------------------------------------
// Natural voice: a neural text-to-speech voice (OpenAI) that sounds like a person, not a computer. The text is cut into sentences,
// the next sentence is fetched while the current one plays (so there is no gap), and the first piece is kept short so the voice
// starts quickly. If it cannot be reached (function not deployed, no key, offline) the browser's own voice takes over.
// ------------------------------------------------------------------------------------------------
const NEURAL_KEY = 'help.neural';
export const neuralVoiceOn = () => store.get(NEURAL_KEY, '1') === '1';
let neuralDownUntil = 0;                           // the natural voice failed: use the browser voice for a couple of minutes
const speechCache = new Map<string, string>();     // sentence -> audio (kept for repeated phrases such as greetings)
const VOICE_STYLE = {
  ta: 'Speak natural, conversational Tamil like a friendly colleague talking to a coworker: warm, relaxed pace, natural pauses, never robotic. Say English technical words the way an Indian speaker would.',
  en: 'Speak like a friendly, helpful Indian colleague in a relaxed face-to-face conversation: warm, natural pace and rhythm, small natural pauses, never monotone or robotic.',
};
function sentencesFor(text: string): string[] {
  // one sentence at a time (a person speaks in sentences); very short ones are joined to the next, very long ones are cut
  const out: string[] = [];
  let carry = '';
  for (const raw of text.split(/(?<=[.!?।])\s+|\n+/)) {
    const s = `${carry} ${raw}`.trim();
    if (!s) continue;
    if (s.length < 28) { carry = s; continue; }
    carry = '';
    if (s.length > 230) out.push(...chunksOf(s, 230)); else out.push(s);
  }
  if (carry) out.push(carry);
  return out;
}
async function neuralSpeech(piece: string): Promise<string | null> {
  const hit = speechCache.get(piece);
  if (hit) return hit;
  const lang = TAMIL.test(piece) ? 'ta' : 'en';
  let blob: Blob | null = await serverSpeech(piece, lang);   // ChatGPT's voice through our own server
  if (!blob) try {
    // 1) the help function (uses the server's OpenAI key)
    const { data } = await supabase.auth.getSession();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''), 'content-type': 'application/json' },
      body: JSON.stringify({ tts: piece, lang }),
    });
    if (res.ok) blob = await res.blob();
  } catch { /* try the browser's key */ }
  if (!blob) {
    // 2) the OpenAI key saved in this browser (before the function is deployed)
    const key = getOpenAIApiKey();
    if (key) {
      try {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'coral', input: piece, instructions: VOICE_STYLE[lang], response_format: 'mp3' }),
        });
        if (res.ok) blob = await res.blob();
      } catch { /* no voice */ }
    }
  }
  if (!blob || blob.size < 200) return null;
  const url = URL.createObjectURL(blob);
  speechCache.set(piece, url);
  if (speechCache.size > 40) { const old = speechCache.keys().next().value as string; URL.revokeObjectURL(speechCache.get(old)!); speechCache.delete(old); }
  return url;
}
function neuralSay(text: string, onEnd: () => void, fallback: (rest: string) => void) {
  const parts = sentencesFor(text);
  const token = ++onlineToken;
  const ahead = new Map<number, Promise<string | null>>();
  const get = (k: number) => { if (k < parts.length && !ahead.has(k)) ahead.set(k, neuralSpeech(parts[k])); return ahead.get(k); };
  const play = (url: string) => new Promise<boolean>((resolve) => {
    const a = new Audio(url);
    onlineAudio = a;
    a.onended = () => resolve(true);
    a.onerror = () => resolve(false);
    a.play().catch(() => resolve(false));
  });
  void (async () => {
    for (let k = 0; k < parts.length; k++) {
      if (token !== onlineToken) return;
      const url = await get(k);
      get(k + 1);                                  // fetch the next sentence while this one is spoken
      if (token !== onlineToken) return;
      if (!url) { if (k === 0) neuralDownUntil = Date.now() + 120_000; fallback(parts.slice(k).join(' ')); return; }
      const ok = await play(url);
      if (token !== onlineToken) return;
      if (!ok) { fallback(parts.slice(k).join(' ')); return; }
    }
    onEnd();
  })();
}

// Tamil is the hardest language to speak clearly. Three ways, the person can choose (and it is remembered):
//   clear   - Google's online Tamil voice (the default: the words are easy to follow), a little slower
//   natural - the OpenAI voice (more human, but Tamil words are less clear)
//   browser - an installed Tamil voice of the browser (Microsoft Edge has natural ones built in)
export type TamilEngine = 'clear' | 'natural' | 'browser';
const TAMIL_ENGINE_KEY = 'help.tamilEngine';
export const tamilEngine = (): TamilEngine => { const v = store.get(TAMIL_ENGINE_KEY, 'clear'); return v === 'natural' || v === 'browser' ? v : 'clear'; };
export const setTamilEngine = (v: TamilEngine) => store.set(TAMIL_ENGINE_KEY, v);
/** A natural-sounding Tamil voice installed in the browser (Edge: "Microsoft Pallavi / Valluvar Online (Natural)"). */
const installedTamilVoice = (): SpeechSynthesisVoice | undefined => { loadVoices(); return voiceList('ta').find((v) => /natural|neural|online/i.test(v.name)); };

// While the assistant is talking (and for a moment after), a microphone only hears the assistant's own voice coming back through
// the speakers. Anything that listens (Co-worker) asks voiceBusy() and ignores what it hears in that time.
let voiceActive = false;
let quietUntil = 0;
export const voiceBusy = () => voiceActive || Date.now() < quietUntil;

// ---- ONE AI AT A TIME ---------------------------------------------------------------------------------------------
// Adviser, Teaching, Guide and Co-worker share the speakers and the microphone. When one starts, every other one stops
// talking and working, and none of them may speak while another holds the floor.
export type AiMode = 'adviser' | 'teaching' | 'coworker' | 'guide';
let floor: AiMode | '' = '';     // the AI that is working now
let speaker: AiMode | '' = '';   // the AI whose voice is playing now
export const aiFloor = () => floor;
/** `mode` starts: the voice of any other AI stops at once and the others switch themselves off. Call it BEFORE speaking. */
export function takeFloor(mode: AiMode) {
  if (speaker && speaker !== mode) stopSpeaking();
  const changed = floor !== mode;
  floor = mode;
  if (changed) window.dispatchEvent(new CustomEvent('argus:mode', { detail: { mode, on: true } }));
}
/** `mode` has finished: the floor is free again. */
export function releaseFloor(mode: AiMode) {
  if (floor !== mode) return;
  floor = '';
  window.dispatchEvent(new CustomEvent('argus:mode', { detail: { mode, on: false } }));
}

// ---- VOICE ON / OFF PER AI ----------------------------------------------------------------------------------------
// Every AI is silent until its voice is switched on (AI menu, or the speaker button inside it). The Guide uses Teaching's switch.
// (New storage names, so everyone starts with the voice off.)
const voiceGroup = (m: AiMode): AiMode => (m === 'guide' ? 'teaching' : m);
const voiceKey = (m: AiMode) => `argus.voice.${voiceGroup(m)}`;
export const aiVoiceOn = (m: AiMode) => store.get(voiceKey(m), '0') === '1';
export function setAiVoice(m: AiMode, on: boolean) {
  store.set(voiceKey(m), on ? '1' : '0');
  if (!on) { stopSpeaking(voiceGroup(m)); if (voiceGroup(m) === 'teaching') stopSpeaking('guide'); }
  window.dispatchEvent(new CustomEvent('argus:ai-voice', { detail: { mode: voiceGroup(m), on } }));
}
/** [voice on?, switch it] for one AI, kept in step everywhere it is shown. */
export function useAiVoice(m: AiMode): [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const [on, setOn] = useState(() => aiVoiceOn(m));
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ mode: AiMode; on: boolean }>).detail; if (d && d.mode === voiceGroup(m)) setOn(d.on); };
    window.addEventListener('argus:ai-voice', h);
    return () => window.removeEventListener('argus:ai-voice', h);
  }, [m]);
  const set = useCallback((v: boolean | ((prev: boolean) => boolean)) => setAiVoice(m, typeof v === 'function' ? v(aiVoiceOn(m)) : v), [m]);
  return [on, set];
}

/** The small "Voice on / Voice off" switch shown for each AI in the AI menu. */
function VoiceSwitch({ mode, label }: { mode: AiMode; label: string }) {
  const [on, set] = useAiVoice(mode);
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={`${label} voice`}
      title={on ? `${label} talks. Click to make it silent.` : `${label} is silent (text only). Click to let it talk.`}
      onClick={(e) => { e.stopPropagation(); set(!on); }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${on ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
      {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
    </button>
  );
}

/** Speaks one piece of text; `onEnd` runs when it has finished (or could not be spoken). `from` = the AI speaking. */
export function say(text: string, onEnd: () => void, notify?: (m: string) => void, from?: AiMode) {
  if (from && floor && floor !== from) { onEnd(); return; }   // another AI is working: this one stays quiet
  if (from && !aiVoiceOn(from)) { onEnd(); return; }          // this AI's voice is switched off: text only
  const sanitized = text
    .replace(/\bERP\b/gi, 'Argus Business Intelligence')
    .replace(/இ\.?ஆர்\.?பி/gi, 'Argus Business Intelligence');
  const t = sanitized.replace(/[*#_`]/g, '').trim();
  if (!t) { onEnd(); return; }
  stopSpeaking();   // cancel any prior speech
  speaker = from || floor;
  voiceActive = true;
  const done = () => { voiceActive = false; quietUntil = Date.now() + 900; onEnd(); };
  if (TAMIL.test(t)) {
    const engine = tamilEngine();
    // a natural Tamil voice that is installed beats everything else; otherwise the person's choice
    if (installedTamilVoice() || (engine === 'browser' && voiceList('ta').length)) { browserSay(t, done, notify); return; }
    if (engine === 'natural' && neuralVoiceOn() && Date.now() >= neuralDownUntil) {
      neuralSay(t, done, (rest) => playOnline(rest || t, 'ta', done, notify, true));
      return;
    }
    playOnline(t, 'ta', done, notify, engine !== 'natural');
    return;
  }
  if (neuralVoiceOn() && Date.now() >= neuralDownUntil) {
    neuralSay(t, done, (rest) => browserSay(rest || t, done, notify));
    return;
  }
  browserSay(t, done, notify);
}

/** The browser's own voice (and, for Tamil without an installed voice, the online Tamil voice). */
function browserSay(t: string, onEnd: () => void, notify?: (m: string) => void) {
  const who = speaker;
  stopSpeaking();
  speaker = who;
  voiceActive = true;   // (stopSpeaking just cleared it)

  loadVoices();
  const tamil = TAMIL.test(t);
  const v = voiceFor(t);
  if (tamil && !v) {
    if (!announcedOnline) { announcedOnline = true; notify?.('No Tamil voice is installed on this PC, so an online Tamil voice is used.'); }
    playOnline(t, 'ta', onEnd, notify);
    return;
  }
  if (!('speechSynthesis' in window)) { onEnd(); return; }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (safetyTtsTimer) { clearTimeout(safetyTtsTimer); safetyTtsTimer = null; }
    if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
    activeUtterance = null;
    try { (window as any).__activeUtterance = null; } catch {}
    onEnd();
  };

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const u = new SpeechSynthesisUtterance(t);
    activeUtterance = u;
    try { (window as any).__activeUtterance = u; } catch {} // Retain reference to prevent Chrome GC bug

    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      u.lang = tamil ? 'ta-IN' : 'en-IN';
    }
    u.rate = tamil ? 0.92 : 1.0;
    u.pitch = 1;
    u.volume = 1;

    u.onend = finish;
    u.onerror = (e) => {
      console.warn('SpeechSynthesis utterance error:', e);
      finish();
    };

    // Heartbeat to keep Chrome SpeechSynthesis awake
    resumeTimer = setInterval(() => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 3500);

    // Guaranteed safety timeout in case browser never fires onend
    const safetyMs = Math.min(20000, Math.max(3000, t.length * 80));
    safetyTtsTimer = setTimeout(finish, safetyMs);

    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn('SpeechSynthesis error:', err);
    finish();
  }
}
const REFUSAL: Record<Lang, string> = {
  ta: 'இந்த Argus BI-ஐ எப்படி பயன்படுத்துவது பற்றியும் CNC machining பற்றியும் மட்டுமே என்னால் உதவ முடியும். அவற்றைப் பற்றி கேளுங்கள்.',
  tanglish: 'Indha Argus BI-ah eppadi use panradhu pathiyum CNC machining pathiyum mattum dhaan help panna mudiyum. Adhai pathi kelunga.',
  en: 'I can only help with using Argus BI and with CNC machining questions. Please ask about one of those.',
};
/**
 * Used when the help service cannot be reached (not deployed yet / no connection): the best matching written note is read out
 * as it is. It only ever answers from the notes, and refuses anything that matches none of them.
 */
export function offlineAnswer(question: string, page: string, lang: Lang): string {
  const generic = /\b(page|screen)\b|இந்த|indha|intha|ithu/i.test(question);
  const ranked = rankNotes(question, page).filter((r) => r.n.id !== 'overview' || r.kw > 0);
  const best = ranked.find((r) => r.kw > 0) ?? (generic ? ranked.find((r) => r.total > 0) : undefined);
  if (!best) return REFUSAL[lang];
  const [en, ta] = best.n.body.split(/\nTA:/);
  const english = en.replace(/^EN:\s*/, '').trim();
  const text = lang === 'ta' && ta ? ta.trim() : english;
  // Only the lines that answer THIS question are read out, not the whole note: lines are scored by the question's words.
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const qWords = question.toLowerCase().replace(/[^\p{L}\p{N}+\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !OFFLINE_STOP.has(w));
  const scored = lines.map((l, i) => ({ l, i, s: qWords.reduce((n, w) => n + (l.toLowerCase().includes(w) ? 1 : 0), 0) }));
  const hit = scored.filter((x) => x.s > 0).sort((a, c) => c.s - a.s || a.i - c.i).slice(0, 3).sort((a, c) => a.i - c.i);
  const pick = hit.length ? hit.map((x) => x.l) : lines.slice(0, 2);   // nothing specific: the start of the note
  const out = pick.join(' ');
  return out.length > 700 ? `${out.slice(0, 700).replace(/\s+\S*$/, '')}.` : out;
}
const OFFLINE_STOP = new Set(['how', 'what', 'where', 'when', 'why', 'the', 'and', 'for', 'this', 'that', 'with', 'eppadi', 'enna', 'podanum', 'pannanum', 'indha', 'page', 'screen', 'tell', 'about', 'explain', 'can', 'you', 'are', 'does', 'make', 'use']);
/**
 * Stops the voice. `from` = the AI asking: it can only stop its OWN voice, so an AI that is being switched off never cuts off
 * the AI that has just taken over. Without `from` any voice is stopped.
 */
export const stopSpeaking = (from?: AiMode) => {
  if (from && speaker && speaker !== from) return;
  speaker = '';
  if (voiceActive) quietUntil = Date.now() + 400;
  voiceActive = false;
  if (safetyTtsTimer) { clearTimeout(safetyTtsTimer); safetyTtsTimer = null; }
  if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
  activeUtterance = null;
  try { (window as any).__activeUtterance = null; } catch {}
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  onlineToken += 1;
  try { onlineAudio?.pause(); } catch { /* ignore */ }
  onlineAudio = null;
};

// ------------------------------------------------------------------------------------------------
// Adviser: a chat (typed or spoken) for questions about this BI and about CNC machining / manufacturing.
// Answers come from ChatGPT through the help-assistant function (streamed, and spoken sentence by sentence); if that is not
// reachable the key saved in this browser is used, and as a last resort the built-in BI notes.
// ------------------------------------------------------------------------------------------------
interface ChatMsg { id: number; role: 'user' | 'assistant'; text: string; pending?: boolean; error?: boolean }
let chatSeq = 0;

const GREETING_CHAT: Record<Lang, string> = {
  ta: 'வணக்கம்! Argus BI, CNC machining அல்லது வேறு எந்த கேள்வியையும் கேளுங்கள். தட்டச்சு செய்யலாம் அல்லது மைக்கில் பேசலாம்.',
  tanglish: 'Vanakkam! Argus BI, CNC machining, illa vera endha kelviyum kelunga. Type pannalam illa mic-la pesalam.',
  en: 'Hello! Ask me anything at all: Argus BI, CNC machining, or any other question. You can type, or talk using the mic.',
};
const NO_NET_CNC: Record<Lang, string> = {
  ta: 'இந்தக் கேள்விக்கு பதிலளிக்க இணைய இணைப்பு தேவை. இணைப்பைச் சரிபார்த்து மீண்டும் கேளுங்கள்.',
  tanglish: 'Indha kelvikku answer panna internet venum. Connection check pannittu marubadi kelunga.',
  en: 'I need the internet connection to answer this question. Please check it and ask again.',
};
const STARTERS: { en: string; ta: string }[] = [
  { en: 'How do I use this page?', ta: 'இந்தப் பக்கத்தை எப்படி பயன்படுத்துவது?' },
  { en: 'What cutting speed should I use to mill aluminium?', ta: 'அலுமினியத்தை milling செய்ய என்ன cutting speed வைக்க வேண்டும்?' },
  { en: 'What is the difference between G-code and M-code?', ta: 'G-code மற்றும் M-code வேறுபாடு என்ன?' },
  { en: 'How can I reduce chatter when turning?', ta: 'turning-ல் chatter-ஐ எப்படி குறைப்பது?' },
  { en: 'How do I estimate the machining cost of one part?', ta: 'ஒரு பாகத்தின் machining செலவை எப்படி கணக்கிடுவது?' },
];

/** The same rules as the server's prompt, used only when the browser's own key answers. */
function adviserPrompt(lang: Lang, page: string, title: string, notes: string): string {
  const langRule = lang === 'ta' ? 'Reply in Tamil script; keep technical terms and screen / button names in English.' : lang === 'tanglish' ? 'Reply in Tanglish (Tamil in English letters).' : 'Reply in simple English.';
  return `You are the Adviser of Argus Business Intelligence, used by a CNC machining company. Answer ANY question on ANY topic the person asks (general knowledge, maths, science, coding, writing, business, health basics, language, ideas, anything) with a genuinely helpful answer. You are also an expert who (1) teaches staff how to use Argus BI and (2) answers CNC machining and manufacturing questions like an experienced production engineer: milling, turning, drilling, grinding, EDM, sheet metal, G-code / M-code, CAD/CAM, tooling, speeds and feeds, materials, workholding, tolerances / GD&T, inspection and quality, machine maintenance and troubleshooting, safety, production planning, OEE and machining cost estimating.
HOW PEOPLE ASK: staff talk in a mix of Tamil and English, often by voice. The speech-to-text writes English words in Tamil letters and makes mistakes, e.g. என்குயரி = enquiry, கொட்டேஷன் = quotation, இன்வாய்ஸ் = invoice, ஆர்டர் = order, சலான் = challan, ஸ்டாக் = stock, ஷெட்யூல் = schedule. A stray word at the end like ஓர் / ஓவர் / over is just the person saying "over" to finish; ignore it. Always work out what they mean by sound before deciding anything; if it is still unclear, ask one short question back instead of refusing.
Business and factory words (enquiry, quotation, order, inward, production, scheduling, stock, finished goods, rejection, delivery challan, invoice, payment, customer, vendor, purchase, expense, petty cash, costing, reports) are ALWAYS in scope: explain what the word means in a machining company and how it is done in Argus BI.
Never refuse a question because it is not about Argus BI or machining: answer it well. For medical, legal or money decisions give useful general information and suggest checking with a professional when it really matters.
For how-to steps in Argus BI use the NOTES; if they do not cover the exact steps, still explain the idea in general and say where in Argus BI to look (for example the Sales Pipeline tiles), without inventing button names. For machining questions answer from engineering knowledge with typical numbers and units, say they are starting values to check against the tool maker's catalogue, and add a short safety caution where relevant.
Talk like a friendly colleague in a real conversation: short natural sentences, plain words, no lists or markdown symbols, because it is read aloud. Keep it to about 8 short lines. ${langRule}
PAGE: ${page}${title ? ` (${title})` : ''}
NOTES (about Argus BI)
${notes}`;
}

/** Streams the browser key's answer as plain text pieces. */
async function* openAiDirect(key: string, system: string, hist: { role: 'user' | 'assistant'; text: string }[]): AsyncGenerator<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, temperature: 0.2, max_tokens: 700, messages: [{ role: 'system', content: system }, ...hist.map((m) => ({ role: m.role, content: m.text }))] }),
  });
  if (!res.ok || !res.body) throw new Error(res.status === 401 ? 'The AI key saved in this browser was rejected.' : `The AI is not available right now (code ${res.status}).`);
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
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try { const t = JSON.parse(data)?.choices?.[0]?.delta?.content; if (t) yield t as string; } catch { /* partial line */ }
    }
  }
}

export function HelpAssistant({ allowed = { teaching: true, guide: true, coworker: true, adviser: true } }: { allowed?: AiAccess } = {}) {
  const location = useLocation();
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [note, setNote] = useState('');
  const [, setVoiceTick] = useState(0);
  const [lang, setLang] = useState<Lang>(() => (store.get('help.vlang', 'ta') as Lang));
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useDraggable('argus.help.pos', rootRef);
  const dockDrag = useDockDrag();   // dragging the AI button moves the whole group (arrow tab + buttons)
  const [menu, setMenu] = useState(false);
  const [modes, setModes] = useState({ teaching: false, coworker: false });
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [speakOn, setSpeakOn] = useAiVoice('adviser');        // read the answers aloud (off until switched on)
  const [handsFree, setHandsFree] = useState(() => store.get('help.handsfree', '1') === '1'); // listen again after each answer
  const [overMode, setOverMode] = useState(() => store.get('help.over', '1') === '1');          // keep listening until the person says "over"
  const overRef = useRef(overMode); overRef.current = overMode;
  const accRef = useRef('');          // what was said so far in this turn (kept while the microphone restarts)
  const overHit = useRef(false);      // the person said "over"
  const [tips, setTips] = useState(false);
  // The Adviser opens on its automatic report; "Ask" is the chat for questions.
  const [view, setView] = useState<'report' | 'chat'>('report');
  // The Adviser panel can be dragged bigger or smaller by its top corner.
  const advSize = useResizable('adviser-panel-size', { w: 432, h: 576 }, { w: 320, h: 360 });
  const [natural, setNatural] = useState(neuralVoiceOn);
  const [tamilPick, setTamilPick] = useState<TamilEngine>(tamilEngine);
  useEffect(() => { store.set(NEURAL_KEY, natural ? '1' : '0'); if (natural) neuralDownUntil = 0; }, [natural]);
  const { canView } = useAuth();
  const navigate = useNavigate();
  const endRef = useRef<HTMLDivElement>(null);

  const activeRef = useRef(false);          // the Adviser chat is open
  const langRef = useRef(lang);
  langRef.current = lang;
  const speakRef = useRef(speakOn); speakRef.current = speakOn;
  const handsFreeRef = useRef(handsFree); handsFreeRef.current = handsFree;
  const busyRef = useRef(false);
  const recRef = useRef<any>(null);
  const history = useRef<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const misses = useRef(0);                  // times in a row nothing was heard
  const pageRef = useRef({ page: '', title: '' });
  const listenRef = useRef<() => void>(() => {});
  const lastSpoken = useRef('');

  const page = location.pathname;
  const pageTitle = (() => { try { const b = getBreadcrumbs(page.replace(/^\//, '')); return b[b.length - 1]?.label ?? ''; } catch { return ''; } })();
  pageRef.current = { page, title: pageTitle };
  const suggestions = PAGE_SUGGESTIONS[page] || [];

  useEffect(() => { loadVoices(); try { window.speechSynthesis.onvoiceschanged = loadVoices; } catch { /* no speech */ } }, []);
  useEffect(() => { store.set('help.vlang', lang); }, [lang]);
  useEffect(() => { store.set('help.handsfree', handsFree ? '1' : '0'); }, [handsFree]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, phase]);

  const stopListening = useCallback(() => {
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    recRef.current = null;
  }, []);

  const endSession = useCallback((goodbye: boolean) => {
    const wasActive = activeRef.current;
    activeRef.current = false;
    busyRef.current = false;
    stopListening();
    stopSpeaking('adviser');   // only our own voice: another AI may have just taken over
    setHeard('');
    if (goodbye && wasActive && speakRef.current) { setPhase('speaking'); say(GOODBYE[langRef.current], () => setPhase('idle'), undefined, 'adviser'); } else setPhase('idle');
  }, [stopListening]);

  // ------------------------------------------------ the answer: stream it, show it, and speak each sentence as it completes
  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busyRef.current) return;
    busyRef.current = true;
    const aid = ++chatSeq;
    setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }, { id: aid, role: 'assistant', text: '', pending: true }]);
    setPhase('thinking');
    setHeard('');
    let full = '';
    let spokenUpTo = 0;
    let pending = 0;
    let streamDone = false;
    let failed = false;
    const show = (t: string, error = false) => setMsgs((ms) => ms.map((x) => (x.id === aid ? { ...x, text: t, error } : x)));
    const finish = () => {
      if (!activeRef.current || !streamDone || pending > 0) return;
      busyRef.current = false;
      if (!failed && handsFreeRef.current && SR) listenRef.current(); else setPhase('ready');
    };
    const speakPart = (chunk: string) => {
      if (!chunk.trim() || !activeRef.current || !speakRef.current) return;
      pending += 1;
      setPhase('speaking');
      lastSpoken.current = `${lastSpoken.current} ${chunk}`.slice(-1500);
      say(chunk, () => { pending -= 1; finish(); }, setNote, 'adviser');
    };
    const speakReady = (final: boolean) => {
      const rest = full.slice(spokenUpTo);
      const done = rest.match(/^[\s\S]*?[.!?।\n]+(?=\s|$)/g)?.join('') ?? '';
      const chunk = final ? rest : done;
      if (chunk.trim()) { speakPart(chunk); spokenUpTo += chunk.length; }
    };
    const push = (piece: string) => { full += piece; show(full); speakReady(false); };
    const unreachable = (msg: string) => /failed to fetch|networkerror|load failed|not deployed|HTTP 404|HTTP 5\d\d|Please sign in/i.test(msg);
    try {
      // 1) ChatGPT through our own server first (OPENAI_API_KEY in Vercel). Only if that route is missing / not set up
      //    do we try the Supabase help function (an old deployment of it refuses machining questions).
      let servedFirst = false;
      try {
        const notesFirst = rankNotes(withEnglishTerms(q), pageRef.current.page).filter((r) => r.total > 0).slice(0, 2).map((r) => `## ${r.n.title}\n${r.n.body}`).join('\n\n');
        for await (const piece of serverChat(adviserPrompt(langRef.current, pageRef.current.page, pageRef.current.title, notesFirst), [...history.current.slice(-6), { role: 'user', text: q }], { maxTokens: 700 })) {
          if (!activeRef.current) break;
          servedFirst = true; push(piece);
        }
      } catch (e0) {
        if (servedFirst || !(e0 instanceof ServerAiError && e0.unreachable)) throw e0;
      }
      if (!servedFirst) try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''), 'content-type': 'application/json' },
          body: JSON.stringify({ question: q, page: pageRef.current.page, pageTitle: pageRef.current.title, lang: langRef.current, history: history.current.slice(-6) }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          const err: Error & { unreachable?: boolean } = new Error(j?.error || (res.status === 404 ? 'The help service is not configured yet. Please contact your administrator.' : `Help is not available right now (HTTP ${res.status}).`));
          err.unreachable = res.status === 404 || res.status >= 500;   // not there / broken: try the other ways to answer
          throw err;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done || !activeRef.current) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            let j: any;
            try { j = JSON.parse(line.slice(5)); } catch { continue; }
            if (j.error) throw new Error(j.error);
            if (j.t) push(j.t);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (full || !((e as { unreachable?: boolean }).unreachable || unreachable(msg))) throw e;
        // neither our server nor the help function can be reached: the key saved in this browser, then the built-in BI notes
        const served = false;
        const key = getOpenAIApiKey();
        if (served) {
          /* the server's ChatGPT answered */
        } else if (key) {
          const notes = rankNotes(withEnglishTerms(q), pageRef.current.page).filter((r) => r.total > 0).slice(0, 2).map((r) => `## ${r.n.title}\n${r.n.body}`).join('\n\n');
          for await (const piece of openAiDirect(key, adviserPrompt(langRef.current, pageRef.current.page, pageRef.current.title, notes), [...history.current.slice(-6), { role: 'user', text: q }])) push(piece);
        } else {
          setNote('The online help service is not reachable, so this answer is read from the built-in notes.');
          const off = offlineAnswer(withEnglishTerms(q), pageRef.current.page, langRef.current);
          full = off === REFUSAL[langRef.current] ? NO_NET_CNC[langRef.current] : off;
          show(full);
        }
      }
      speakReady(true);
      if (full.trim()) {
        history.current.push({ role: 'user', text: q }, { role: 'assistant', text: full });
        history.current = history.current.slice(-8);
      } else { failed = true; show('No answer came back. Please try again.', true); }
    } catch (e) {
      failed = true;
      show(e instanceof Error ? e.message : String(e), true);
    } finally {
      streamDone = true;
      setMsgs((ms) => ms.map((x) => (x.id === aid ? { ...x, pending: false } : x)));
      finish();
    }
  }, [SR]);

  // ------------------------------------------------ listening for the next question
  const listen = useCallback(() => {
    if (!SR || !activeRef.current) return;
    stopListening();
    const r = new SR();
    r.lang = langRef.current === 'ta' ? 'ta-IN' : 'en-IN';
    r.interimResults = true;
    r.continuous = overRef.current;   // "over" mode: keep listening through pauses
    let finalText = '';
    r.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += tr; else interim += tr;
      }
      const heardNow = `${accRef.current} ${finalText} ${interim}`.replace(/\s+/g, ' ').trim();
      setHeard(heardNow);
      if (overRef.current && OVER_RE.test(heardNow)) { overHit.current = true; try { r.stop(); } catch { /* ended */ } }
    };
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setNote('The microphone is blocked. Allow it in the browser address bar, then tap the mic again.');
        setHandsFree(false); handsFreeRef.current = false; setPhase('ready'); recRef.current = null;
      }
    };
    r.onend = () => {
      if (!activeRef.current || recRef.current !== r) return;
      recRef.current = null;
      const said0 = `${accRef.current} ${finalText}`.replace(/\s+/g, ' ').trim();
      if (overRef.current && !overHit.current) {
        // the person has not said "over" yet: keep what was said and listen on (the browser ends a recording every now and then)
        accRef.current = said0;
        misses.current = said0 ? 0 : misses.current + 1;
        if (misses.current >= 10) { accRef.current = ''; setHandsFree(false); handsFreeRef.current = false; setPhase('ready'); setNote('I did not hear anything, so the mic is off. Tap the mic to talk again.'); return; }
        if (handsFreeRef.current || said0) listenRef.current(); else setPhase('ready');
        return;
      }
      const said = said0.replace(OVER_RE, '').trim();
      accRef.current = ''; overHit.current = false;
      if (!said) {
        misses.current += 1;
        if (misses.current >= 3) { setHandsFree(false); handsFreeRef.current = false; setPhase('ready'); setNote('I did not hear anything, so the mic is off. Tap the mic to talk again.'); return; }
        if (handsFreeRef.current) listenRef.current(); else setPhase('ready');
        return;
      }
      // Its own voice picked up by the microphone is not a question.
      const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (norm(said).length > 8 && norm(lastSpoken.current).includes(norm(said))) { if (handsFreeRef.current) listenRef.current(); else setPhase('ready'); return; }
      misses.current = 0;
      if (STOP_WORDS.test(said)) { endSession(true); return; }
      if (GUIDE_WORDS.test(said)) { endSession(false); window.dispatchEvent(new CustomEvent('argus:guide')); return; }
      lastSpoken.current = '';
      void ask(said);
    };
    recRef.current = r;
    setHeard('');
    setPhase('listening');
    // A short pause first, so the end of the Adviser's own voice has died away before the microphone opens.
    window.setTimeout(() => { if (activeRef.current && recRef.current === r) { try { r.start(); } catch { recRef.current = null; setPhase('ready'); } } }, 600);
  }, [SR, ask, endSession, stopListening]);
  listenRef.current = listen;
  const beginRef = useRef<() => void>(() => {});

  // ------------------------------------------------ the three modes and their keyboard shortcuts
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ mode: string; on: boolean }>).detail; if (!d) return;
      if (d.mode === 'teaching' || d.mode === 'coworker') setModes((m) => ({ ...m, [d.mode]: d.on }));
      if (d.on && d.mode !== 'adviser' && activeRef.current) endSession(false);   // another AI started: the Adviser stops
    };
    window.addEventListener('argus:mode', on);
    return () => window.removeEventListener('argus:mode', on);
  }, []);
  const modesRef = useRef(modes);
  modesRef.current = modes;
  /** `kind` (Teaching only): 'page' = this screen, 'erp' = every screen. Without it the last kind used is repeated. */
  const toggleMode = useCallback((id: 'teaching' | 'coworker' | 'adviser', kind?: 'page' | 'erp') => {
    const m = modesRef.current;
    const adviserOn = activeRef.current;
    const wasOn = id === 'teaching' ? m.teaching : id === 'coworker' ? m.coworker : adviserOn;
    // switched off in Access Management (for this company or this user): it cannot be started
    if (!wasOn && !allowedRef.current[id]) { setNote(`${id === 'teaching' ? 'Teaching' : id === 'coworker' ? 'Co-worker' : 'Adviser'} is switched off for you in Access Management.`); return; }
    // one mode at a time: the other two are switched off first
    if (id !== 'teaching' && m.teaching) window.dispatchEvent(new CustomEvent('argus:teach', { detail: { on: false } }));
    if (id !== 'coworker' && m.coworker) window.dispatchEvent(new CustomEvent('argus:copilot', { detail: { on: false } }));
    if (id !== 'adviser' && adviserOn) endSession(false);
    if (id === 'teaching') window.dispatchEvent(new CustomEvent('argus:teach', { detail: kind && !wasOn ? { on: true, fullErp: kind === 'erp' } : { on: !wasOn } }));
    else if (id === 'coworker') window.dispatchEvent(new CustomEvent('argus:copilot', { detail: { on: !wasOn } }));
    else if (wasOn) endSession(true); else beginRef.current();
  }, [endSession]);
  const toggleRef = useRef(toggleMode);
  toggleRef.current = toggleMode;
  useEffect(() => {
    // Keyboard shortcuts: Ctrl+Shift = Teaching; Ctrl+CapsLock = Co-worker; Ctrl+Alt = Adviser
    let armed = false; let dirty = false;
    const down = (e: KeyboardEvent) => {
      const k = e.key;
      // Ctrl+Shift (pressed and released together) = Teaching
      if (k === 'Control' || k === 'Shift') { if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && !dirty) armed = true; return; }
      dirty = true; armed = false;
      if (e.repeat) return;
      const ctrlOnly = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
      const ctrlAlt = e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey;
      const altShift = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
      let id: 'teaching' | 'coworker' | 'adviser' | '' = '';
      // Ctrl+CapsLock = Co-worker
      if (ctrlOnly && k === 'CapsLock') id = 'coworker';
      // Ctrl+Alt (any key while both held, or just releasing) = Adviser
      else if (ctrlAlt && (k === 'Alt' || k === 'Control' || k.length === 1)) id = 'adviser';
      // Alt+Shift shortcuts still work as fallback
      else if (altShift && e.code === 'KeyT') id = 'teaching';
      else if (altShift && e.code === 'KeyC') id = 'coworker';
      else if (altShift && e.code === 'KeyA') id = 'adviser';
      if (id) { e.preventDefault(); e.stopPropagation(); toggleRef.current(id); }
    };
    const up = (e: KeyboardEvent) => {
      // Ctrl+Shift released = Teaching
      if ((e.key === 'Control' || e.key === 'Shift') && armed) { armed = false; dirty = true; toggleRef.current('teaching'); return; }
      if (!e.ctrlKey && !e.shiftKey) { dirty = false; armed = false; }
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [menu]);

  const begin = () => {
    takeFloor('adviser');   // one AI at a time: Teaching / Guide / Co-worker stop before the Adviser speaks
    window.dispatchEvent(new Event('argus:voice-pause')); // the form voice control would fight over the microphone
    activeRef.current = true;
    busyRef.current = false;
    misses.current = 0;
    history.current = [];
    setNote(SR ? '' : 'Voice input needs Chrome or Edge on a computer. You can still type your questions.');
    stopSpeaking();
    const first = !welcomedOnce();
    markWelcomed();
    const greet = `${first ? `${WELCOME[langRef.current]} ` : ''}${GREETING_CHAT[langRef.current]}`.trim();
    setMsgs([{ id: ++chatSeq, role: 'assistant', text: greet }]);
    const afterGreeting = () => { if (!activeRef.current) return; if (handsFreeRef.current && SR) listenRef.current(); else setPhase('ready'); };
    if (speakRef.current) { setPhase('greeting'); say(greet, afterGreeting, setNote, 'adviser'); } else afterGreeting();
  };
  beginRef.current = begin;
  useEffect(() => () => { activeRef.current = false; try { recRef.current?.abort?.(); } catch { /* ignore */ } stopSpeaking(); }, []);

  const send = () => {
    const text = input.trim();
    if (!text || busyRef.current) return;
    setInput('');
    stopListening();
    stopSpeaking();
    lastSpoken.current = '';
    void ask(text);
  };
  const toggleMic = () => {
    if (!SR) { setNote('Voice input needs Chrome or Edge on a computer.'); return; }
    if (phase === 'speaking') {                          // talking over the answer: stop it and listen now
      setHandsFree(true); handsFreeRef.current = true; misses.current = 0; accRef.current = ''; overHit.current = false; setNote('');
      stopSpeaking();
      window.setTimeout(() => listenRef.current(), 150);
      return;
    }
    if (phase === 'listening' || handsFree) {            // mic off
      setHandsFree(false); handsFreeRef.current = false;
      stopListening();
      if (!busyRef.current) setPhase('ready');
      return;
    }
    setHandsFree(true); handsFreeRef.current = true; misses.current = 0; accRef.current = ''; overHit.current = false; setNote('');
    if (!busyRef.current) { stopSpeaking(); listenRef.current(); }
  };

  const active = phase !== 'idle';
  useEffect(() => { if (active) setView('report'); }, [active]);
  // Tell Co-worker when Adviser holds the microphone, so the two never listen at once.
  useEffect(() => { if (active) takeFloor('adviser'); else releaseFloor('adviser'); }, [active]);
  // A mode switched off in Access Management while it is running stops at once.
  useEffect(() => {
    if (!allowed.teaching && modes.teaching) setModes((m) => ({ ...m, teaching: false }));
    if (!allowed.coworker && modes.coworker) setModes((m) => ({ ...m, coworker: false }));
    if (!allowed.adviser && activeRef.current) endSession(false);
  }, [allowed.teaching, allowed.coworker, allowed.adviser, modes.teaching, modes.coworker, endSession]);
  const anyOn = active || modes.teaching || modes.coworker;
  const status = phase === 'greeting' ? '…' : phase === 'listening' ? (overMode ? 'Listening… பேசுங்கள். முடிந்ததும் "over" சொல்லுங்கள் / say "over" when you finish' : 'Listening… பேசுங்கள் / speak now') : phase === 'thinking' ? 'Thinking…' : phase === 'speaking' ? 'Speaking… tap the mic to stop it and talk' : '';
  const rightSide = document.documentElement.getAttribute('data-dock-side') === 'right' || (!!drag.pos && drag.pos.x > window.innerWidth / 2 && !document.documentElement.hasAttribute('data-dock-side'));
  const kind: 'ta' | 'en' = lang === 'ta' ? 'ta' : 'en';
  const choices = voiceList(kind);
  const chosen = voiceFor(kind === 'ta' ? 'ta அ' : 'en')?.name ?? '';
  const pickVoice = (name: string) => {
    store.set(`help.voice.${kind}`, name);
    setVoiceTick((n) => n + 1);
    stopSpeaking();
    say(kind === 'ta' ? 'Argus Business Intelligence-க்கு வரவேற்கிறோம்!' : 'Welcome to Argus Business Intelligence!', () => {}, setNote);
  };
  const lastTeachKind = store.get('argus.teach.kind', 'page') === 'erp' ? 'erp' : 'page';

  return (
    <>
    <TamilVoiceNotice lang={lang} />
    <div ref={rootRef} data-voice-ignore
      className={`dock-help fixed bottom-5 max-lg:bottom-[4.75rem] left-[5.5rem] z-[60] flex items-end gap-2 font-sans ${rightSide ? 'flex-row-reverse' : ''}`}>
      <button type="button" data-assistant-launcher
        onMouseDown={(e) => e.preventDefault()}
        {...dockDrag.bind}
        onClick={() => { if (dockDrag.wasDragged() || drag.wasDragged()) return; setMenu((m) => !m); }}
        aria-label="AI assistant" aria-expanded={menu} title="AI assistant: Teaching, Co-worker, Adviser · ask anything"
        className={`relative flex h-12 touch-none cursor-grab select-none items-center gap-2 rounded-full pl-4 pr-5 text-white shadow-lg active:cursor-grabbing ${anyOn ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
        {active && phase === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />}
        <span className="relative">
          {active && phase === 'listening' ? <Mic size={20} /> : active && phase === 'thinking' ? <Loader2 size={20} className="animate-spin" /> : active && phase === 'speaking' ? <Volume2 size={20} /> : <Sparkles size={20} />}
        </span>
        <span className="relative text-sm font-semibold">{modes.teaching ? 'Teaching' : modes.coworker ? 'Co-worker' : active ? 'Adviser' : 'AI · உதவி'}</span>
      </button>
      {menu && (
        <div role="menu" aria-label="AI modes" data-voice-ignore onMouseDown={(e) => e.stopPropagation()}
          className={`absolute bottom-14 ${rightSide ? 'right-0' : 'left-0'} w-64 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl`}>
          {/* Teaching: two kinds */}
          {allowed.teaching && <div className={`mb-1 rounded-xl border px-2 py-1.5 ${modes.teaching ? 'border-red-300 bg-red-50' : 'border-transparent'}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600"><GraduationCap size={15} /></span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800" title="Points at every option and explains it, one by one · Ctrl + Shift">
                Teaching{modes.teaching && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">On</span>}
              </span>
              <VoiceSwitch mode="teaching" label="Teaching" />
            </div>
            {modes.teaching ? (
              <button type="button" role="menuitem" onClick={() => { setMenu(false); toggleMode('teaching'); }}
                className="mt-1.5 w-full rounded-lg bg-red-600 py-1 text-xs font-bold text-white hover:bg-red-700">Stop teaching</button>
            ) : (
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); toggleMode('teaching', 'page'); }}
                  title="Only the screen you are on"
                  className={`rounded-lg border px-2 py-1 text-xs font-bold hover:bg-orange-100 ${lastTeachKind === 'page' ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-orange-200 bg-white text-orange-700'}`}>This page</button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); toggleMode('teaching', 'erp'); }}
                  title="Every screen, every option"
                  className={`rounded-lg border px-2 py-1 text-xs font-bold hover:bg-orange-100 ${lastTeachKind === 'erp' ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-orange-200 bg-white text-orange-700'}`}>Whole app</button>
              </div>
            )}
          </div>}
          {([
            { id: 'coworker', icon: Bot, color: 'bg-violet-100 text-violet-600', title: 'Co-worker', sub: 'Type or speak commands — I\'ll do them: "add enquiry for ABC"', keys: 'Ctrl + CapsLock', on: modes.coworker },
            { id: 'adviser', icon: Lightbulb, color: 'bg-emerald-100 text-emerald-600', title: 'Adviser', sub: 'Chat or talk: Argus BI help and any CNC machining question', keys: 'Ctrl + Alt', on: active },
          ] as const).filter((m) => allowed[m.id]).map((m) => (
            <div key={m.id} className={`mb-1 flex items-center gap-1 rounded-xl border pr-1.5 last:mb-0 ${m.on ? 'border-red-300 bg-red-50' : 'border-transparent hover:bg-slate-50'}`}>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); toggleMode(m.id); }}
                title={`${m.sub} · ${m.keys}`}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.color}`}><m.icon size={15} /></span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800">
                  {m.title}{m.on && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">On</span>}
                </span>
              </button>
              <VoiceSwitch mode={m.id} label={m.title} />
            </div>
          ))}
          <p className="px-2 pt-0.5 text-[10px] leading-tight text-slate-400">Point at a mode to see what it does and its shortcut.</p>
        </div>
      )}

      {/* a short message when no chat is open (for example the microphone was blocked) */}
      {!active && note && (
        <div role="status" className="max-w-[20rem] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-500 shadow-lg backdrop-blur">{note}</div>
      )}

      {/* Adviser chat */}
      {active && (
        <div role="dialog" aria-label="Adviser" data-voice-ignore onMouseDown={(e) => e.stopPropagation()}
          style={advSize.style}
          className={`absolute bottom-14 ${rightSide ? 'right-0' : 'left-0'} flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}>
          <ResizeGrip corner={rightSide ? 'left' : 'right'} onPointerDown={advSize.begin(rightSide ? -1 : 1)} onDoubleClick={advSize.reset} />
          <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2.5 text-white">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20"><Lightbulb size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">Adviser</p>
              <p className="truncate text-[10px] text-emerald-50">Argus BI help and CNC machining questions</p>
            </div>
            <button type="button" aria-label={speakOn ? 'Mute answers' : 'Read answers aloud'} title={speakOn ? 'Answers are read aloud (click to mute)' : 'Answers are silent (click to read aloud)'}
              onClick={() => setSpeakOn((v) => !v)} className="rounded p-1.5 hover:bg-white/15">{speakOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
            <button type="button" aria-label="Close the Adviser" title="Close" onClick={() => endSession(false)} className="rounded p-1.5 hover:bg-white/15"><X size={17} /></button>
          </div>

          <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase text-slate-400">Language</span>
            {LANGS.map((l) => (
              <button key={l.code} type="button" onClick={() => setLang(l.code)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${lang === l.code ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>{l.label}</button>
            ))}
            <button type="button" role="switch" aria-checked={natural} onClick={() => setNatural((v) => !v)}
              title={natural ? 'A natural, human-sounding voice is used (click for the plain browser voice)' : 'The plain browser voice is used (click for the natural voice)'}
              className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${natural ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>Natural voice</button>
            {lang === 'ta' && (
              <select aria-label="Tamil voice" value={tamilPick} onChange={(e) => { const v = e.target.value as TamilEngine; setTamilEngine(v); setTamilPick(v); stopSpeaking(); }}
                title="Which voice speaks Tamil. Clear is the easiest to follow." className="ml-1 h-6 rounded border border-slate-200 bg-white px-1 text-[10px] font-semibold text-slate-700">
                <option value="clear">Tamil: Clear</option>
                <option value="natural">Tamil: Natural</option>
                <option value="browser">Tamil: Browser</option>
              </select>
            )}
            {choices.length > 1 && !natural && (
              <select aria-label="Choose the voice" value={chosen} onChange={(e) => pickVoice(e.target.value)} className="ml-auto h-6 max-w-[7.5rem] rounded border border-slate-200 bg-white px-1 text-[10px]">
                {choices.map((v) => <option key={v.name} value={v.name}>{v.name.replace(/^(Microsoft|Google)\s+/, '$1 ')}</option>)}
              </select>
            )}
          </div>

          <div className="flex border-b border-slate-100 bg-white text-[12px] font-bold" role="tablist">
            {([{ id: 'report', label: 'Report & ideas', icon: BarChart3 }, { id: 'chat', label: 'Ask', icon: MessageCircle }] as const).map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={view === t.id}
                onClick={() => { setView(t.id); if (t.id === 'report') { stopListening(); stopSpeaking(); } }}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 ${view === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><t.icon size={13} />{t.label}</button>
            ))}
          </div>
          {view === 'report' ? (
            <AdviserReportPanel lang={lang} speakOn={speakOn} can={canView}
              onOpenPage={(pg) => { endSession(false); navigate(`/${pg}`); }}
              say={(text, onEnd) => say(text, onEnd ?? (() => {}), setNote, 'adviser')} stopSpeaking={stopSpeaking} />
          ) : (
          <>
          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
                <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${m.role === 'user' ? 'bg-emerald-600 text-white' : m.error ? 'border border-red-200 bg-red-50 text-red-800' : 'border border-slate-100 bg-slate-100 text-slate-800'}`}>
                  {m.text || (m.pending ? <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 size={13} className="animate-spin" />Thinking…</span> : '')}
                </div>
              </div>
            ))}
            {msgs.length <= 1 && (
              <div className="pt-1">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{lang === 'ta' ? 'இவற்றைக் கேட்டுப் பாருங்கள்' : 'Try asking'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s.en} type="button" onClick={() => { stopListening(); stopSpeaking(); void ask(lang === 'ta' ? s.ta : s.en); }}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-left text-[11px] font-medium text-emerald-800 hover:bg-emerald-100">{lang === 'ta' ? s.ta : s.en}</button>
                  ))}
                </div>
                {suggestions.length > 0 && (
                  <div className="mt-2.5">
                    <button type="button" onClick={() => setTips((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">
                      <Lightbulb size={12} />{tips ? 'Hide tips for this page' : 'Tips for this page'}
                    </button>
                    {tips && (
                      <ul className="mt-1.5 space-y-1 rounded-lg border border-emerald-100 bg-emerald-50 p-2">
                        {suggestions.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-900"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /><span>{lang === 'ta' ? s.ta : s.en}</span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {(status || note) && (
            <div className="border-t border-slate-100 bg-white px-3 py-1 text-[11px]">
              {status && <span className="font-semibold text-red-600">{status}</span>}
              {heard && phase === 'listening' && <span className="ml-1.5 text-slate-600">“{heard}”</span>}
              {note && !status && <span className="text-slate-500">{note}</span>}
            </div>
          )}
          <form className="flex items-center gap-1.5 border-t border-slate-200 bg-white p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <button type="button" onClick={toggleMic} aria-pressed={handsFree} aria-label={handsFree ? 'Turn the microphone off' : 'Talk using the microphone'}
              title={handsFree ? 'Voice conversation is on (click to turn off)' : 'Talk using the microphone'}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${handsFree ? 'bg-red-600 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
              {phase === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />}
              <Mic size={16} className="relative" />
            </button>
            <button type="button" onClick={() => { const v = !overMode; setOverMode(v); store.set('help.over', v ? '1' : '0'); accRef.current = ''; overHit.current = false; }} aria-pressed={overMode}
              title={overMode ? 'It keeps listening until you say "over" (click to turn off)' : 'Turn on: it keeps listening until you say "over"'}
              className={`h-9 shrink-0 rounded-full px-2 text-[10px] font-extrabold uppercase ${overMode ? 'bg-violet-600 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-100'}`}>over</button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={lang === 'ta' ? 'உங்கள் கேள்வியை எழுதுங்கள்…' : 'Type your question…'} aria-label="Your question"
              className="h-9 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none" />
            <button type="submit" disabled={!input.trim() || phase === 'thinking'} aria-label="Send" title="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"><Send size={15} /></button>
          </form>
          </>
          )}
        </div>
      )}
    </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// "Tamil voice is not installed": a bar at the top, and the steps to install it for this device.
// A website cannot install a voice itself; it can notice the voice is missing, guide the person through the install, and check again.
// ------------------------------------------------------------------------------------------------
const NOTICE_KEY = 'help.tamilNoticeHiddenUntil';
type Platform = 'windows' | 'android' | 'ios' | 'mac' | 'other';
const detectPlatform = (): Platform => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  return 'other';
};
const tamilVoices = () => { loadVoices(); return voiceList('ta'); };

function TamilVoiceNotice({ lang }: { lang: Lang }) {
  const [missing, setMissing] = useState(false);
  const [hidden, setHidden] = useState(() => Number(store.get(NOTICE_KEY, '0')) > Date.now());
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<'' | 'found' | 'missing'>('');
  const [found, setFound] = useState('');
  const platform = detectPlatform();

  // Voices load a moment after the page does, so look a few times before deciding the voice is missing.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const look = () => setMissing(tamilVoices().length === 0);
    look();
    try { window.speechSynthesis.addEventListener('voiceschanged', look); } catch { /* ignore */ }
    const timers = [800, 2500, 6000].map((ms) => window.setTimeout(look, ms));
    return () => { timers.forEach(window.clearTimeout); try { window.speechSynthesis.removeEventListener('voiceschanged', look); } catch { /* ignore */ } };
  }, []);

  const hide = () => { store.set(NOTICE_KEY, String(Date.now() + 7 * 24 * 3600 * 1000)); setHidden(true); };   // asked again in a week
  const recheck = () => {
    const v = tamilVoices();
    setMissing(v.length === 0);
    setChecked(v.length ? 'found' : 'missing');
    setFound(v[0]?.name ?? '');
    if (v.length) { setVoiceTickGlobal(); say('வணக்கம்! தமிழ் குரல் தயாராக உள்ளது.', () => {}); }
  };

  const steps: Record<Platform, { title: string; items: string[]; link?: { href: string; label: string } }> = {
    windows: {
      title: 'Windows (Chrome or Edge)',
      items: [
        'Open Windows Settings → Time & language → Language & region. (Use the button below to open it.)',
        'Click “Add a language”, choose Tamil (தமிழ்), press Next, and keep “Text-to-speech” ticked. Press Install.',
        'Wait for the install to finish (a few minutes). Then close ALL Chrome windows and open Chrome again.',
        'Open Argus BI, press Help, and press “Check again” here.',
      ],
      link: { href: 'ms-settings:regionlanguage', label: 'Open Windows language settings' },
    },
    android: {
      title: 'Android',
      items: [
        'Open Settings → System → Languages → Text-to-speech output.',
        'Choose “Google Text-to-speech Engine” → Settings → Install voice data → Tamil (India).',
        'Update the Google Text-to-speech app in Play Store if Tamil is not listed. Then reopen Chrome and press “Check again”.',
      ],
    },
    ios: {
      title: 'iPhone / iPad',
      items: ['Open Settings → Accessibility → Spoken Content → Voices → Tamil, and download a voice.', 'Reopen the browser and press “Check again”.'],
    },
    mac: {
      title: 'Mac',
      items: ['Open System Settings → Accessibility → Spoken Content → System voice → Manage Voices → Tamil, and download a voice.', 'Restart the browser and press “Check again”.'],
    },
    other: { title: 'Your device', items: ['Install a Tamil text-to-speech voice in your system settings, restart the browser, and press “Check again”.'] },
  };
  const st = steps[platform];

  if (!missing && !open) return null;
  if (typeof document === 'undefined') return null;
  const bar = missing && !hidden && lang === 'ta' && !open;
  return createPortal(
    <>
      {bar && (
        <div role="status" className="fixed inset-x-0 top-0 z-[96] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg" data-voice-ignore>
          <span>Tamil voice is not installed on this device, so Help cannot speak Tamil.</span>
          <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-white px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50">How to install</button>
          <button type="button" aria-label="Hide for a week" title="Hide for a week" onClick={hide} className="rounded p-1 hover:bg-amber-600"><X size={16} /></button>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[97] flex items-center justify-center bg-slate-900/50 p-4" data-voice-ignore onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-label="Install the Tamil voice" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Install the Tamil voice</h2>
                <p className="text-xs text-slate-500">{st.title}. One-time setup; after that every Tamil answer is spoken.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
              {st.items.map((i) => <li key={i}>{i}</li>)}
            </ol>
            {st.link && (
              <a href={st.link.href} className="mt-3 inline-flex rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-orange-700">{st.link.label}</a>
            )}
            <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Faster option: open Argus BI in <b>Microsoft Edge</b>. It already includes natural Tamil voices, so nothing needs to be installed.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                {checked === 'found' && <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 size={14} />Tamil voice found{found ? `: ${found}` : ''}. You can close this.</span>}
                {checked === 'missing' && <span className="font-semibold text-amber-700">Not found yet. After installing, close every browser window and open it again.</span>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={recheck} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Check again</button>
                <button type="button" onClick={() => { setOpen(false); hide(); }} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Remind me later</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
// Tells the rest of the page the voice list changed (the Voice dropdown re-reads it).
const setVoiceTickGlobal = () => { try { window.dispatchEvent(new Event('voiceschanged')); } catch { /* ignore */ } };
