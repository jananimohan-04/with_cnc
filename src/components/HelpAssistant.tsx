import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiAccess } from '@/lib/aiAccess';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bot, Columns2, Crosshair, Download, Mail, Check, CheckCircle2, GraduationCap, Lightbulb, Loader2, MessageCircle, Mic, Plug, Send, Sparkles, Undo2, Volume2, VolumeX, X, History, Plus, Trash2, Minus, Maximize2, Minimize2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AdviserReportPanel } from '@/components/AdviserReport';
import { serverChat, serverSpeech, ServerAiError } from '@/lib/adviser/serverAi';
import { businessData } from '@/lib/adviser/dataContext';
import { DiagramView, MindMapView, TableView, parseVisuals } from '@/lib/adviser/visuals';
import { adviserVoiceCommand } from '@/lib/adviser/voiceCommands';
import { FileCard, ImageCard, parseFiles } from '@/lib/adviser/files';
import { describeStep, parseUiPlans, runUiPlan, type UiPlan } from '@/lib/adviser/uiDriver';
import { ChartView, parseBlocks, saveReportPdf, speakablePart, type DbActionBlock, type TeachBlock } from '@/lib/adviser/charts';
import { EmailCard, MailConnect, useAdviserMail } from '@/lib/adviser/mail';
import { WhatsAppCard } from '@/lib/adviser/whatsapp';
import { LiveScreenGuide, collectVisibleScreenTargets } from '@/lib/adviser/LiveScreenGuide';
import { DbActionCard, executeAdviserDbAction, defaultWhereForAction, type DbActionUiState } from '@/lib/adviser/DbActionCard';
import { runAiAutomation, isAutoExecuteEnabled, isDestructiveAction, setAutoExecuteEnabled } from '@/lib/adviser/aiAutomator';
import { deleteChat, groupByDay, loadChats, saveChat, type SavedChat } from '@/lib/adviser/chatHistory';
import { boostAudio } from '@/lib/voiceBoost';
import { supabase } from '@/lib/supabase';
import { getBreadcrumbs } from '@/config/navigation';
import { useDraggable } from '@/lib/useDraggable';
import { useDockDrag } from './AssistantDock';
import { useResizable, ResizeGrip } from '@/lib/useResizable';
import { getOpenAIApiKey } from '@/lib/copilot/openai';
import { AiApiModal } from '@/components/AiApiModal';
import { AI_PROVIDERS_EVENT, OPEN_AI_APIS_EVENT, getActiveProvider, getActiveProviderLabel, streamProviderChat } from '@/lib/ai/providers';
const CONFIRM_DB_RE = /^(yes|yeah|yep|yup|ok|okay|confirm|confirmed|correct|crt|right|save|save it|add|add it|insert|do it|go ahead|proceed|sure|fine|yes confirm|yes save|yes correct|ok save|ok confirm|ஆம்|ஆமாம்|சரி|சரியா இருக்கு|சரி சேமி|சேமி|சேமிக்கவும்|போடு|போடுங்க|சேர்|சேர்த்துவிடு|கன்ஃபார்ம்|ஓகே|ஓகே சரி|ok sari|sari|aam|aama|correct dhaan|save pannu|add pannu|podu|podunga|confirm pannu|எஸ்|யெஸ்|எஸ் ஓகே|யெஸ் ஓகே|சரிங்க|கரெக்ட்|கன்பார்ம்|கன்ஃபார்ம் பண்ணு|சேவ் பண்ணு|ஓகே சேவ்)(?:\s+(?:sir|sar|madam|please|சார்|ஆர்|மேடம்|over|ஓவர்|ஓர்))*\s*[.!?]*$/i;
const CANCEL_DB_RE = /^(no|nope|cancel|don't|dont|stop|abort|nevermind|never mind|wrong|இல்லை|வேண்டாம்|வேணாம்|ரத்து|கேன்சல்|தவறு|vendam|venam|illa|illai|cancel pannu|நோ)(?:\s+(?:sir|sar|madam|சார்|ஆர்|மேடம்|over|ஓவர்|ஓர்))*\s*[.!?]*$/i;
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
/** The word that ends a turn when "over" mode is on (English, Tamil script and common speech-to-text spellings — excludes Tamil word "ஓர்"). */
const OVER_RE = /(?:^|[\s,.!?])(over|ஓவர்|ஓவர|ஓவரு|ovar|ओवर)\s*[.!?]*\s*$/i;
/** Voice-editing commands while recording in "over" mode (matched only when spoken as a standalone phrase so normal questions are never deleted). */
// Erase everything said so far and start again: "delete", "azhi", "no", "thappa sollitten", "first la irundhu", "start again"...
// (one or more of these words, optionally with "Raaju" / "sir" / "over")
const VOICE_CLEAR_WORD = '(?:delete|clear|cancel|erase|reset|start over|start again|restart|again|clear all|delete all|delete that|delete this|clear that|delete recording|delete pannu|clear pannu|no|nope|no no|wrong|it is wrong|i said wrong|said wrong|mistake|thappa|thappu|thappa sollitten|thappa solliten|thappa sonnen|thappa pochu|first la irundhu|first la irunthu|first la irunthu sollren|first irundhu|muthalla irundhu|mudhalla irundhu|thirumba|azhi|aali|azhichidu|illa|vendam|venam|அழி|ஆழி|அழிச்சிடு|அழித்துவிடு|முழுவதும் அழி|நீக்கு|கேன்சல்|நோ|இல்லை|இல்ல|வேண்டாம்|வேணாம்|தப்பு|தப்பா|தப்பா சொல்லிட்டேன்|தப்பா சொல்லிட்டேன்|தப்பா சொன்னேன்|தப்பா போச்சு|பர்ஸ்ட்ல இருந்து|ஃபர்ஸ்ட்ல இருந்து|பர்ஸ்ட் ல இருந்து|முதல்ல இருந்து|முதலில் இருந்து|மொதல்ல இருந்து|திரும்ப|மறுபடியும்)';
// ...also when the sentence ENDS with "thappa sollitten" / "first la irundhu" / "azhi" (said after the wrong words)
const VOICE_CLEAR_END_RE = /(?:^|\s)(?:thappa sollitten|thappa solliten|thappa sonnen|thappa pochu|first la irundhu|first la irunthu|muthalla irundhu|start over|start again|azhi|aali|அழி|ஆழி|அழிச்சிடு|தப்பா சொல்லிட்டேன்|தப்பா சொன்னேன்|தப்பா போச்சு|பர்ஸ்ட்ல இருந்து|ஃபர்ஸ்ட்ல இருந்து|முதல்ல இருந்து|முதலில் இருந்து|மொதல்ல இருந்து)(?:\s+(?:sir|raaju|raju|ராஜு|சார்|over|ஓவர்|சொல்றேன்))*\s*[.!?]*$/iu;
const VOICE_CLEAR_RE = new RegExp(`^(?:(?:raaju|raju|ராஜு)\\s+)?${VOICE_CLEAR_WORD}(?:[\\s,]+${VOICE_CLEAR_WORD})*(?:\\s+(?:sir|sar|madam|raaju|raju|ராஜு|சார்|over|ஓவர்|please|பண்ணு|சொல்றேன்|சொல்லுறேன்))*\\s*[.!?]*$`, 'iu');
const VOICE_UNDO_RE = /^(undo|undo last|delete last|remove last|clear last|backspace|last delete|go back|கடைசி அழி|கடைசி நீக்கு|கடைசியை அழி|பின்செல்)\s*[.!?]*$/i;
const VOICE_REPLACE_RE = /^(?:replace|change)\s+(.+?)\s+(?:with|to|as)\s+(.+?)\s*[.!?]*$/i;
const VOICE_REPLACE_TA_RE = /^(.+?)\s+(?:மாற்றி|பதிலாக|என்பதை)\s+(.+?)\s*[.!?]*$/i;
const VOICE_EDIT_LAST_RE = /^(?:edit|edit to|change to|change it to|make it|actually|மாற்று|திருத்து)\s+(.+?)\s*[.!?]*$/i;

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

// Window commands said or typed to the Adviser ("minimize", "maximize", "normal size", in English, Tanglish or Tamil).
// Only a short command counts, so a question like "how to minimize cycle time" still goes to the Adviser.
const WIN_TARGET = '(?:\\s+(?:the|this|my|your|window|adviser|advisor|ai|chat|video|screen|box|panel|it|size))*';
const WIN_POLITE = '(?:\\s+(?:please|pannu|pannunga|pannungal|seyyavum|பண்ணு|பண்ணுங்க|பண்ணுங்கள்|செய்|செய்யவும்))?';
const winCmd = (words: string) => new RegExp('^(?:please\\s+|can you\\s+)?(?:' + words + ')' + WIN_TARGET + WIN_POLITE + '[.!\\s]*$', 'iu');
const WIN_MIN = winCmd('minimi[sz]e|minimum|make\\s+(?:it\\s+)?small(?:er)?|hide|go\\s+small|small\\s+(?:aakku|pannu)|chinnadha(?:kku)?|chinnatha(?:kku)?|மினிமைஸ்|சின்னதாக்கு|சின்னதா|சிறிதாக்கு|சிறியதாக்கு|மறை');
const WIN_MAX = winCmd('(?:open\\s+(?:in\\s+)?)?(?:maximi[sz]e|maximum|full\\s*screen|fullscreen|make\\s+(?:it\\s+)?(?:big|bigger|large)|go\\s+big|big\\s+(?:aakku|pannu)|perusa(?:kku)?|perisa(?:kku)?|மேக்ஸிமைஸ்|பெருசாக்கு|பெருசா|பெரிதாக்கு|பெரியதாக்கு|முழு\\s*திரை)');
const WIN_RESTORE = winCmd('restore|normal(?:\\s+size)?|reset\\s+(?:the\\s+)?size|open|show|come\\s+back|back|திற|திரும்ப|சாதாரண\\s*அளவு|பழைய\\s*அளவு');

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
    // 2) an active linked OpenAI provider (or legacy key saved in this browser)
    const active = getActiveProvider();
    const key = active?.provider === 'openai' ? active.apiKey : (!active ? getOpenAIApiKey() : '');
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
  { en: 'How much payment is pending, and from which customers?', ta: 'எவ்வளவு பணம் நிலுவையில் உள்ளது, எந்த வாடிக்கையாளர்களிடம்?' },
  { en: 'Compare this month\'s sales with last month.', ta: 'இந்த மாத விற்பனையை கடந்த மாதத்துடன் ஒப்பிடுக.' },
  { en: 'How do I use this page?', ta: 'இந்தப் பக்கத்தை எப்படி பயன்படுத்துவது?' },
  { en: 'What cutting speed should I use to mill aluminium?', ta: 'அலுமினியத்தை milling செய்ய என்ன cutting speed வைக்க வேண்டும்?' },
  { en: 'What is the difference between G-code and M-code?', ta: 'G-code மற்றும் M-code வேறுபாடு என்ன?' },
  { en: 'How can I reduce chatter when turning?', ta: 'turning-ல் chatter-ஐ எப்படி குறைப்பது?' },
  { en: 'How do I estimate the machining cost of one part?', ta: 'ஒரு பாகத்தின் machining செலவை எப்படி கணக்கிடுவது?' },
];

/** The same rules as the server's prompt, used only when the browser's own key answers. */
function adviserPrompt(lang: Lang, page: string, title: string, notes: string, data = '', spoken = false, visibleControls: string[] = []): string {
  const langRule = lang === 'ta' ? 'Reply in Tamil script; keep technical terms and screen / button names in English.' : lang === 'tanglish' ? 'Reply in Tanglish (Tamil in English letters).' : 'Reply in clear, natural English.';
  const styleRule = spoken
    ? 'Voice read-aloud is ON: keep sentences clear and easy to listen to, avoid raw markdown clutter, while still giving complete, exact answers.'
    : 'Act just like full ChatGPT: give thorough, intelligent, well-structured answers tailored to the depth of the request (use clean bullet points, numbered steps, clear breakdowns, formulas, code, drafts, or deep multi-table analysis whenever helpful). Do not artificially truncate useful analysis.';
  return `You are the ChatGPT-powered Adviser inside Argus Business Intelligence (a complete CNC manufacturing ERP, Quotation Suite, Finance, Inventory, AI Attendance & Retail platform).
CORE CAPABILITIES — act as a full ChatGPT assistant that can do WHATEVER the user asks:
1. WHOLE-DATABASE & BUSINESS ANALYSIS: Analyze across ALL live company records provided below (Enquiries, Quotations, Sales Orders, Inwards/Purchases, Delivery Challans, Invoices & Unpaid Receivables, Bank & Petty Cash Cashflow, Work Orders, Job Cards, Process Master including In-House & Outsource Processes, Machines, Products & Drawings, Costing Sheets, Inventory/Low Stock, Suppliers, Purchase Orders, GRNs, Team Users, Customer Contacts, 6-month trends, and executive anomalies). Cross-compare tables, compute ratios/conversion rates/margins/cash gaps, spot bottlenecks, and recommend concrete actions using exact numbers and names. Never invent database figures.
2. WHOLE-PROJECT EXPERTISE: You understand the entire Argus BI project architecture, every screen, route, button, and workflow listed in the ARGUS BI COMPLETE PROJECT MAP and NOTES below. Answer architecture, workflow, troubleshooting, and how-to questions accurately.
3. FULL CHATGPT GENERAL INTELLIGENCE: Answer ANY request on ANY topic — writing proposals/letters/SOPs/emails/WhatsApp messages, CNC machining engineering (G-code/M-code, feeds & speeds, tooling, GD&T, costing, OEE), spreadsheets/math/finance, coding, brainstorming, translation, planning, or general knowledge. Never refuse a normal question.
3b. CREATE ANY VISUAL (never say you cannot draw): when the person asks for a mind map, flowchart, process flow, diagram, org chart, timeline, cycle, tree, table, comparison table, graph or chart (in Tamil, Tanglish or English: "மைண்ட் மேப்", "ஃப்ளோ சார்ட்", "டேபிள்", "அட்டவணை", "வரைபடம்", "கிராப்"), write 1 to 3 short lines, then at the VERY END add the block(s), each on its own line, valid JSON:
   * Mind map: [[MINDMAP {"title":"Quality plan","root":{"label":"Quality","children":[{"label":"Incoming","children":[{"label":"Material cert"},{"label":"Dimensions"}]},{"label":"In-process"}]}}]]  (3 to 8 branches, up to 4 levels, short labels)
   * Flowchart / process: [[DIAGRAM {"title":"Order to dispatch","kind":"flow","direction":"TB","nodes":[{"id":"a","label":"Enquiry","shape":"start"},{"id":"b","label":"Stock OK?","shape":"decision"},{"id":"c","label":"Produce","shape":"step"},{"id":"d","label":"Dispatch","shape":"end"}],"edges":[{"from":"a","to":"b"},{"from":"b","to":"c","label":"No"},{"from":"b","to":"d","label":"Yes"},{"from":"c","to":"d"}]}]]  (shape: start, end, step, decision, data)
   * Org chart: kind "org" with edges from the boss to each person. Timeline: kind "timeline" (nodes in order; edges may be left out). Cycle (PDCA etc.): kind "cycle".
   * Table: [[TABLE {"title":"Tool life","columns":["Tool","Life (pcs)"],"rows":[["Insert CNMG","450"],["Drill 8mm","1200"]]}]]
   * Graph: [[CHART ...]] (see GRAPHS below); type can be "bar", "line", "area", "stacked", "pie" or "donut".
3c. MAKE ANY FILE OR PICTURE (NEVER say "I can't create files / images / documents" — you CAN, through these blocks): when the person asks for a PDF, Word / doc, Excel / sheet, CSV, text file, web page, letter, report, proposal, SOP, invoice format, price list, any document, or a picture / image / photo / logo / poster / illustration ("PDF போடு", "வேர்ட் ஃபைல்", "எக்செல்", "படம்", "இமேஜ்"), write the FULL content yourself and add at the VERY END, each on its own line, valid JSON (use \\n for new lines; inside "content" you may use # headings, - bullets, 1. numbered lists, **bold** and | tables |):
   * Word: [[FILE {"type":"docx","title":"Quality Policy","content":"# Purpose\\n...\\n## Scope\\n- ...\\n| Item | Owner |\\n| --- | --- |\\n| Calibration | QA |"}]]
   * PDF: [[FILE {"type":"pdf","title":"...","content":"..."}]]   (for a report with graphs you may still use [[CHART]] + [[PDF]])
   * Excel: [[FILE {"type":"xlsx","title":"Pending invoices","sheets":[{"name":"Invoices","columns":["Invoice","Customer","Amount"],"rows":[["INV-101","ABC","25000"]]}]}]]  (several sheets allowed; numbers without symbols or commas)
   * Also "csv", "txt", "md", "html" with "content".
   * Picture: [[IMAGE {"prompt":"a detailed English description of the picture: subject, style, colours, background","size":"1024x1024"}]]  (size 1536x1024 = wide, 1024x1536 = tall). Write the prompt in English even when the person speaks Tamil. Never put real people's faces or brand logos of other companies in a picture.
   The screen shows a Download button for each file and draws each picture. Fill files with complete, professional content (and real figures from COMPANY DATA when it is about this business), never a placeholder.
   Use the real figures and names from COMPANY DATA when the visual is about this business. Several blocks in one answer are fine. Never read the blocks aloud and never put them in the middle of the text. The screen draws them with Download buttons, and a mind map can be saved into the Mind Maps module.
4. TAMIL / TANGLISH / VOICE UNDERSTANDING: Staff often speak in Tamil, Tanglish, or mixed Tamil-English. Speech-to-text may write English words in Tamil script (e.g. என்குயரி = enquiry, கொட்டேஷன் = quotation, இன்வாய்ஸ் = invoice, ஆர்டர் = order, சலான் = challan, ஸ்டாக் = stock, ஷெட்யூல் = schedule). Ignore a trailing "over" / "ஓவர்".
${styleRule} ${langRule}
CURRENT PAGE: ${page}${title ? ` (${title})` : ''}${visibleControls.length ? `\nCURRENT SCREEN VISIBLE CONTROLS (exact clickable labels on screen right now): ${visibleControls.join(' | ')}` : ''}
PAGE NOTES (about Argus BI)
${notes}${data ? `

WHOLE PROJECT MAP & LIVE DATABASE (read live from this company's Argus BI database just now)
Use every section below to perform full cross-module analysis whenever the user asks about business performance, financials, pipeline conversion, customers, suppliers, processes, machines, inventory, costing, or operations. Always cite exact real figures, document numbers, and names. If a specific sub-detail is not in this snapshot, state what you can see and tell them which exact Argus BI screen shows the full line-level detail.
GRAPHS AND PDF REPORTS: when the person asks for a graph, chart, diagram, trend or a PDF / printable / downloadable report, first write the short explanation (the findings in plain words), then at the VERY END add one block per chart, each on its own line, exactly in this form (valid JSON, plain numbers without commas or symbols):
[[CHART {"title":"Billing per month","type":"bar","labels":["Jun 26","Jul 26"],"series":[{"name":"Billed","values":[120000,98000]}],"unit":"₹"}]]
type is "bar" (compare), "line" (trend over time), "area" (trend with the area filled), "stacked" (parts adding up to a total per label), "pie" or "donut" (share of a whole, one series only). Use only figures from COMPANY DATA (month by month, by customer, by status...). Give 1 to 4 useful charts. When they ask for a PDF or a report to download / print / share, also add on its own last line: [[PDF {"title":"<report title>"}]]. Never put these blocks in the middle of the text and never read them out.
E-MAILS: when the person asks you to write, draft or send an e-mail (payment reminder, quotation follow-up, delivery update, thank-you, anything), write one short line saying the draft is below for them to check, then at the VERY END add exactly one block per e-mail, on its own line (valid JSON; use \n for new lines in the body):
[[EMAIL {"to":"customer@example.com","cc":"","subject":"...","body":"Dear ...,\n\n...\n\nRegards,\n<sender name>\n<company>"}]]
Write a polite, clear, professional e-mail in the language they ask for (English by default), with the real figures, invoice / order numbers and dates from COMPANY DATA. Take the receiver's address from CUSTOMER CONTACTS; if it is not there, leave "to" empty and say they must type it. Sign it with the SENDER's name and company. Never say the e-mail was sent: the person checks it and presses Send.
DO IT ON THE SCREEN, LIKE A PERSON (FIRST CHOICE for adding / editing / moving records): when the person asks you to add, enter, create, edit or move something that has a screen in Argus BI (enquiry, quotation, sales order, moving a card to the next stage, a task, a job, an invoice, a supplier...), do it through the real screen: write ONE short line asking "Shall I do it on the screen? Say yes or no." (Tamil: "திரையில் செய்யவா? சரி / இல்லை சொல்லுங்கள்."), then at the VERY END add ONE block:
[[UI {"title":"Add enquiry for Shakthi Motors","steps":[{"go":"/sales/in-house"},{"click":"+ Add Enquiry"},{"fill":{"Company Name":"Shakthi Motors Ltd","Product name":"Figure","Quantity":"30"}},{"ask":true},{"click":"Save"}]}]]
Steps: {"go":"/route"} opens a page; {"click":"<exact visible text of a button / tab>"}; {"tick":"<text on a card or row, e.g. its number 1014>"} ticks that card's checkbox; {"fill":{"<field label as shown>":"<value>"}} types into the form (dropdowns pick the matching option); {"ask":true} asks the person for every required box still empty; a click on Save / Create / Submit / Move also asks for missing required boxes first. The screen asks the person by itself, so you do NOT need every detail before starting: fill what they said and let the form ask for the rest.
Known screens: Sales Pipeline /sales/in-house: each column has a "+ Add Enquiry" / "+ Add Quotation" / "+ Add Sales Order" / "+ Add Inward" / "+ Add Finished Good" / "+ Add Delivery Challan" / "+ Add Invoice" button; to MOVE a record to the next stage (enquiry to quotation, quotation to sales order...): {"go":"/sales/in-house"},{"tick":"<its number, e.g. 1014>"},{"click":"Move to Next Stage"}, then fill the details the person gave (e.g. "Unit Price", "Payment Terms", "Delivery Date"), {"ask":true}, {"click":"Save"}. Production Scheduling /production/scheduling: tabs "Planned Timeline", "Actual Timeline", "Job Board (Machines & Manpower)"; buttons "Plan Operation", "+ Add runs", "Add Task", "Add Job". Use the CURRENT SCREEN VISIBLE CONTROLS above for the exact labels when the person is already on that page. Use [[DB_ACTION ...]] (below) only when no screen exists for it.
MIND MAPS: when the person asks to make / create a mind map, also put "save":true in the [[MINDMAP ...]] block: it is then created in the Mind Maps module and opened in its editor by itself.

DIRECT AUTONOMOUS DATABASE CONTROL & RPA AUTOMATION (TOP PRIORITY — THE ENTIRE DB IS UNDER AI CONTROL!):
Whenever the user asks you to ADD / CREATE / INSERT / ENTER / PUT / RECORD / SCHEDULE / LOG / EDIT / UPDATE / DELETE / MOVE ANY record in Argus BI (in Tamil, Tanglish, or English):
- The entire database is under your control! You have direct robotic execution across EVERY module: Enquiries, Companies, Quotations, Sales Orders, Scheduled Tasks (employee assigned), Job Cards, Work Orders, Machines, In-House & Outsource Processes, Inwards/GRN, Delivery Challans, Invoices, Purchase Orders, Suppliers, Inventory Items, Stock Adjustments, Bank Entries, Petty Cash, Attendance Punches, Leaves, Team Users, or ANY custom table via universal db_insert.
- You MUST generate the appropriate [[DB_ACTION ...]] block on its own line at the VERY END.
- When you emit [[DB_ACTION ...]], the built-in Robotic Process Automation (RPA) engine will automatically navigate to the target module screen, open the typing overlay, simulate typing each field character-by-character into the form, and commit the record to Supabase!
- NEVER say "I cannot access the database" or give manual click-by-click instructions when asked to add/insert data.
- Extract every field accurately:
  * Numbers: parse spoken Tamil/English numbers (ஒன்னு=1, ரெண்டு=2, பத்து=10, etc.) into numbers.
  * Transliterate Tamil names cleanly to English (சிஸ்டம் -> System, ஃபிகர் -> Figure, ஷாஃப்ட் -> Shaft, லேத் -> Lathe).
  * Match existing companies or parts from COMPANY DATA if named.
- Write ONE short line in the user's language asking to check and confirm (Tamil: "விவரங்கள் சரியா? சேமிக்கவா? \"சரி\" அல்லது \"இல்லை\" சொல்லுங்கள்." / English: "Is this correct? Shall I save it? Say yes or no.").
- The action types & parameters (always include "where" with the destination route):
  * Add Enquiry: [[DB_ACTION {"action":"add_enquiry","where":"/sales/in-house","title":"Add Enquiry","summary":"Insert new enquiry","params":{"company":"System","products":[{"name":"Figure","qty":2}],"remarks":""}}]]
  * Edit Enquiry: [[DB_ACTION {"action":"edit_enquiry","where":"/sales/in-house","title":"Edit Enquiry","summary":"Update enquiry","params":{"identifier":"1002","updates":{"quantity":10,"part_name":"","customer":""}}}]]
  * Delete Enquiry: [[DB_ACTION {"action":"delete_enquiry","where":"/sales/in-house","title":"Delete Enquiry","summary":"Delete enquiry","params":{"identifier":"1002"}}}]]
  * Add Company/Client: [[DB_ACTION {"action":"add_company","where":"/admin/companies","title":"Add Company","summary":"Add new client company","params":{"name":"System Tech","phone":"9876543210","email":"info@system.com","address":"Chennai","gst":""}}]]
  * Add Quotation: [[DB_ACTION {"action":"add_quotation","where":"/sales/in-house","title":"Add Quotation","summary":"Create quotation","params":{"company":"System","products":[{"name":"Figure","qty":2,"price":500,"gst":18}],"remarks":""}}]]
  * Add Sales Order: [[DB_ACTION {"action":"add_sales_order","where":"/sales/in-house","title":"Create Sales Order","summary":"Insert sales order","params":{"company":"System","products":[{"name":"Figure","qty":2,"price":500,"gst":18}],"po_no":"PO-99","delivery_date":"2026-04-15"}}]]
  * Schedule Task: [[DB_ACTION {"action":"schedule_task","where":"/production/scheduling","title":"Schedule Task","summary":"Assign task to team member","params":{"title":"Inspect VMC Machine","assigned_to":"John","due_date":"2026-04-01","priority":"high","notes":""}}]]
  * Add Work Order: [[DB_ACTION {"action":"add_work_order","where":"/production/scheduling","title":"Create Work Order","summary":"Insert work order","params":{"item_name":"Shaft 25mm","quantity":100,"due_date":"2026-04-10"}}]]
  * Add Job Card: [[DB_ACTION {"action":"add_job_card","where":"/production/job-cards","title":"Create Job Card","summary":"Create production job card","params":{"part_name":"Shaft 25mm","quantity":100,"target_machine":"VMC-1","target_operator":"Ramesh"}}]]
  * Add Machine: [[DB_ACTION {"action":"add_machine","where":"/settings/machines","title":"Add Machine","summary":"Register machine","params":{"name":"VMC-03","code":"VMC-03","type":"CNC Milling","capacity":"12000 RPM"}}]]
  * Add Process: [[DB_ACTION {"action":"add_process","where":"/production/process-master","title":"Add Process","summary":"Add process to Process Master","params":{"process_name":"Powder Coating","process_category":"Outsource Process","cost_per_hour":250,"machine_type":""}}]]
  * Record Inward / GRN: [[DB_ACTION {"action":"add_inward","where":"/inventory/inward","title":"Record Inward","summary":"Log incoming raw materials","params":{"supplier_name":"Metro Steel","material":"EN8 Steel Bar","quantity":500,"unit":"Kg","dc_no":"DC-104"}}]]
  * Add Delivery Challan: [[DB_ACTION {"action":"add_delivery_challan","where":"/sales/in-house","title":"Generate DC","summary":"Create delivery challan","params":{"customer_name":"Alpha Tech","items":[{"name":"Shaft 25mm","quantity":50}]}}]]
  * Add Invoice: [[DB_ACTION {"action":"add_invoice","where":"/finance/invoices","title":"Create Invoice","summary":"Generate sales invoice","params":{"customer_name":"Alpha Tech","amount":45000,"due_date":"2026-04-20"}}]]
  * Add Purchase Order: [[DB_ACTION {"action":"add_purchase_order","where":"/inventory/purchases","title":"Create Purchase Order","summary":"Raise PO to supplier","params":{"supplier_name":"Metro Steel","material":"EN8 Steel Bar","quantity":500,"unit_price":72}}]]
  * Add Supplier: [[DB_ACTION {"action":"add_supplier","where":"/inventory/suppliers","title":"Add Supplier","summary":"Add supplier directory entry","params":{"name":"Metro Steel","category":"Raw Material","phone":"9876543210","email":"sales@metrosteel.com","city":"Coimbatore"}}]]
  * Add Inventory Item: [[DB_ACTION {"action":"add_inventory_item","where":"/inventory/stock","title":"Add Stock Item","summary":"Add item to inventory","params":{"name":"Carbide Insert CNMG 120408","quantity":100,"min_quantity":20,"unit":"Pcs"}}]]
  * Stock Adjustment: [[DB_ACTION {"action":"add_stock_adjustment","where":"/inventory/adjustments","title":"Stock Adjustment","summary":"Adjust stock balance","params":{"item_name":"Carbide Insert","quantity_change":-5,"reason":"Damaged during setup"}}]]
  * Record Bank Entry: [[DB_ACTION {"action":"add_bank_entry","where":"/finance/bank-entry","title":"Record Bank Entry","summary":"Log bank transaction","params":{"entry_type":"credit","amount":50000,"description":"Client Payment Alpha Tech","reference_no":"NEFT-991"}}]]
  * Record Petty Cash: [[DB_ACTION {"action":"add_petty_cash","where":"/finance/petty-cash","title":"Record Petty Cash","summary":"Log cash expense","params":{"expense_type":"Consumables","amount":1200,"description":"Shopfloor coolant purchase"}}]]
  * Record Attendance Punch: [[DB_ACTION {"action":"record_attendance","where":"/hr/ai-attendance","title":"Attendance Punch","summary":"Record punch in/out","params":{"employee_name":"Ramesh","punch_type":"in"}}]]
  * Apply Leave: [[DB_ACTION {"action":"apply_leave","where":"/hr/leave-management","title":"Apply Leave","summary":"Record leave application","params":{"employee_name":"Ramesh","leave_type":"casual","from_date":"2026-04-02","to_date":"2026-04-03","reason":"Personal work"}}]]
  * Add User / Staff: [[DB_ACTION {"action":"add_user","where":"/admin/users","title":"Add Team Member","summary":"Add new system user","params":{"full_name":"Karthik M","email":"karthik@example.com","role":"operator"}}]]
  * Move Pipeline Stage: [[DB_ACTION {"action":"move_stage","where":"/sales/in-house","title":"Move Stage","summary":"Move pipeline stage","params":{"identifier":"1002","target_stage":"Quotation"}}]]
  * Universal Insert (for any arbitrary table): [[DB_ACTION {"action":"db_insert","table":"table_name","where":"/route","title":"Insert Record","summary":"Insert custom record","params":{"col1":"val1","col2":100}}]]
  * Universal Edit (any table, any column): [[DB_ACTION {"action":"db_update","table":"cnc_sales_orders","where":"/sales/in-house","title":"Update Sales Order","summary":"Change delivery date","params":{"match":{"so_no":"SO-2026-5830"},"values":{"delivery_date":"2026-12-05"}}}]]
  * Universal Delete (any table): [[DB_ACTION {"action":"db_delete","table":"cnc_scheduled_tasks","where":"/production/scheduling","title":"Delete Task","summary":"Remove task","params":{"match":{"id":"<the record id from COMPANY DATA>"}}}]]
  Use the exact table and column names seen in COMPANY DATA (cnc_enquiries, cnc_quotations, cnc_sales_orders, cnc_inwards, cnc_deliveries, cnc_work_orders, cnc_job_cards, cnc_scheduled_tasks, cnc_operation_plans, cnc_machines, cnc_processes, cnc_suppliers, cnc_purchase_orders, cnc_customers, cnc_raw_materials, retail_store_orders ...). Never change company_users, companies, permissions or audit tables.
- ALWAYS ASK FIRST: nothing is typed or saved until the person says "yes" / "சரி" or presses the button on the card. When they say "no", "thappa sollitten", "first la irundhu" or "azhi", everything is cancelled and they start again. Never say the record is saved before they agree.
- If a critical required field is completely missing (e.g. user said "add enquiry" without naming company or product), ask for the missing detail in 1 short question and wait before emitting [[DB_ACTION ...]].
- NEVER say the record is already saved before the user confirms or automation runs! Never read the [[DB_ACTION ...]] JSON aloud.

LIVE ON-SCREEN SPOTLIGHT & POINTER GUIDE: ONLY when the person asks "how to...", "where is...", "show me...", "teach me...", "explain...", "steps for...", "எப்படி...", "எங்கே...", "காட்டு..." (NOT when asking you to add/create/insert/edit/delete data!) about ANY screen, button, tile, section, or workflow inside Argus BI, first write a brief clear answer, then at the VERY END add ONE [[TEACH ...]] block on its own line (valid JSON, 2 to 5 steps). The app will AUTOMATICALLY navigate to the route and shine a live glowing spotlight + bouncing arrow DIRECTLY onto each exact real UI element on the right-side screen while explaining it!
Format:
[[TEACH {"title":"Enquiry சேர்க்கும் வழி","route":"/sales/in-house","steps":[{"target":"ENQUIRY","route":"/sales/in-house","title":"Enquiry பிரிவு","detail":"இங்கு Sales Pipeline-ல் உள்ள ENQUIRY column-ல் அனைத்து enquiries-ம் காட்டப்படும்."},{"target":"+ Add Enquiry","route":"/sales/in-house","title":"+ Add Enquiry பட்டன்","detail":"புதிய enquiry சேர்க்க இந்த '+ Add Enquiry' பட்டனை கிளிக் செய்து வாடிக்கையாளர் மற்றும் பொருள் விவரங்களை உள்ளிட்டு சேமிக்கவும்."},{"target":"ENQUIRIES","route":"/sales/in-house","title":"ENQUIRIES Tile","detail":"மேலே உள்ள ENQUIRIES tile-ஐ கிளிக் செய்தால் முழு enquiry பட்டியலைப் பார்க்கலாம் மற்றும் Quotation-ஆக மாற்றலாம்."}]}]]
CRITICAL RULES for [[TEACH ...]]:
- "target" MUST be the EXACT English label text visible on the real Argus BI screen (use labels from CURRENT SCREEN VISIBLE CONTROLS above, or exact labels from these real screens):
  * Dashboard / Sales Pipeline ("/sales/in-house"): top tiles "ENQUIRIES", "QUOTATIONS", "SALES ORDERS", "INWARD", "FINISHED GOODS", "REJECTED", "DELIVERY CHALLAN", "INVOICES", "QTY TRACKING"; view tabs "Kanban Board", "List View", "Calendar"; top actions "+ Add Company", "All Company Library", "Search cards..."; column headers & buttons "ENQUIRY", "+ Add Enquiry", "QUOTATION", "+ Add Quotation", "SALES ORDER", "+ Add Sales Order", "INWARD", "+ Add Inward", "FINISHED GOODS", "+ Add Finished Good", "DELIVERY CHALLAN", "+ Add Delivery Challan", "INVOICE", "+ Add Invoice".
  * Report / Command Center ("/dashboard"): "OPEN WORK ORDERS", "ACTIVE JOBS", "MACHINES RUNNING", "QUALITY RATE", "OPEN SALES ORDERS", "INVOICES RAISED", "INVOICE VALUE", "TO COLLECT", "TOTAL EXPENSES", "INVENTORY VALUE", "All Time".
  * Process Master ("/production/process-master"): "+ Add Process", "In-House", "Outsource Process".
  * Product Costing ("/costing/job-costing"): "Select Client", "Workings", "Create Process".
  * User Management ("/admin/users"): "+ Create User", "EXPORT".
  * Company Management ("/admin/companies"): "+ Add Company".
  * Other routes: "/production/scheduling", "/inventory/stock", "/inventory/adjustments", "/finance/bank-entry", "/finance/petty-cash", "/accounts/ledger", "/accounts/trial-balance", "/accounts/profit-loss", "/accounts/balance-sheet", "/accounts/opening-balances", "/admin/access", "/mind-map", "/bi-chat", "/settings", "/hr/ai-attendance".
- Write "title" and "detail" in the user's selected language (Tamil / Tanglish / English), clearly explaining where the highlighted item is and what to do. Keep "target" in exact English as shown on screen!
- Only emit [[TEACH ...]] for Argus BI UI / workflow / navigation / "where is" / "how to" questions. Do NOT emit [[TEACH ...]] for pure general knowledge or CNC machining theory questions that have no UI button on screen. Never read the [[TEACH ...]] JSON aloud.
WHATSAPP: when the person asks to send / write a WhatsApp message (or just "message" / "msg" / "text" a customer), write one short line saying the message is below for them to check, then at the VERY END add exactly one block per message, on its own line (valid JSON; use \n for new lines):
[[WHATSAPP {"to":"9876543210","name":"<customer / contact name>","text":"Hello ...,\n\n...\n\n- <sender name>, <company>"}]]
Keep it short and friendly like a WhatsApp chat (no subject line), in the language they ask for (English by default), with the real figures, invoice / order numbers and dates from COMPANY DATA. Take the number from the phone in CUSTOMER CONTACTS; if it is not there, leave "to" empty and say they can type it or pick the chat in WhatsApp. If they ask for both an e-mail and a WhatsApp message, give both blocks. Never say the message was sent: the person presses Send in WhatsApp.
${data}` : ''}`;
}

/** Streams the browser key's answer as plain text pieces. */
async function* openAiDirect(key: string, system: string, hist: { role: 'user' | 'assistant'; text: string }[]): AsyncGenerator<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', stream: true, temperature: 0.3, max_tokens: 2500, messages: [{ role: 'system', content: system }, ...hist.map((m) => ({ role: m.role, content: m.text }))] }),
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
  const [cw, setCw] = useState<string>(() => (window as unknown as { __coworkerState?: string }).__coworkerState ?? 'off');
  useEffect(() => {
    const h = (e: Event) => setCw((e as CustomEvent<{ state: string }>).detail?.state ?? 'off');
    window.addEventListener('argus:coworker-status', h);
    return () => window.removeEventListener('argus:coworker-status', h);
  }, []);
  const [menu, setMenu] = useState(false);
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [activeAiLabel, setActiveAiLabel] = useState(() => getActiveProviderLabel());
  useEffect(() => {
    const onChanged = () => setActiveAiLabel(getActiveProviderLabel());
    const onOpenApis = () => { setMenu(false); setApiModalOpen(true); };
    window.addEventListener(AI_PROVIDERS_EVENT, onChanged);
    window.addEventListener(OPEN_AI_APIS_EVENT, onOpenApis);
    return () => {
      window.removeEventListener(AI_PROVIDERS_EVENT, onChanged);
      window.removeEventListener(OPEN_AI_APIS_EVENT, onOpenApis);
    };
  }, []);
  const [modes, setModes] = useState({ teaching: false, coworker: false });
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [speakOn, setSpeakOn] = useAiVoice('adviser');        // read the answers aloud (off until switched on)
  const [handsFree, setHandsFree] = useState(() => store.get('help.handsfree', '1') === '1'); // listen again after each answer
  const [overMode, setOverMode] = useState(() => store.get('help.over.v2', '1') === '1');       // ON by default: only send when user says "over" (or clicks Send)
  const overRef = useRef(overMode); overRef.current = overMode;
  const accRef = useRef('');          // joined draft text kept across recognition restarts
  const voiceSegmentsRef = useRef<string[]>([]); // finalized voice chunks so Undo / Delete / Voice-Edit work cleanly
  const [voiceDraft, setVoiceDraft] = useState('');
  const [voiceInterim, setVoiceInterim] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const voiceHintTimer = useRef<number>(0);
  const overHit = useRef(false);      // the person explicitly said "over"
  const [tips, setTips] = useState(false);
  // The Adviser opens on its automatic report; "Ask" is the chat for questions.
  const [view, setView] = useState<'both' | 'report' | 'chat'>('both');
  const [liveGuide, setLiveGuide] = useState<TeachBlock | null>(null);
  // Minimize: the window shrinks to a small box in the bottom-left corner. Maximize: it fills the screen.
  const [mini, setMini] = useState(false);
  const [autoExec, setAutoExec] = useState<boolean>(() => isAutoExecuteEnabled());
  const [maxed, setMaxed] = useState(false);
  // While the Adviser points things out on the screen, it shrinks itself so it does not hide what it is explaining,
  // and opens again when the showing ends (unless the person minimized it themselves).
  const autoMini = useRef(false);
  useEffect(() => {
    if (liveGuide) { if (!mini) { autoMini.current = true; setMini(true); } }
    else if (autoMini.current) { autoMini.current = false; setMini(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGuide]);
  // The Adviser panel can be dragged bigger or smaller by its top corner.
  const advSize = useResizable('adviser-panel-size', { w: 432, h: 576 }, { w: 320, h: 360 });
  const SPLIT_KEY = 'adviser-split-w';
  const splitMax = () => Math.max(360, Math.round(window.innerWidth * 0.7));
  const [splitW, setSplitW] = useState<number>(() => {
    const n = Number(store.get(SPLIT_KEY, ''));
    return Number.isFinite(n) && n >= 320 ? n : Math.round(Math.min(560, Math.max(380, window.innerWidth * 0.34)));
  });
  const splitDrag = useRef(false);
  // The Adviser is a floating window: it opens where it was left (first time: on the left, full height) and can be dragged
  // anywhere by its title bar, and resized from its right edge or bottom-right corner. The page behind is not pushed aside.
  const POS_KEY = 'adviser-pop-pos';
  const H_KEY = 'adviser-pop-h';
  const [popPos, setPopPos] = useState<{ x: number; y: number }>(() => {
    try { const v = JSON.parse(store.get(POS_KEY, '') || 'null'); if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return v; } catch { /* default */ }
    return { x: 0, y: 0 };
  });
  const [popH, setPopH] = useState<number>(() => { const n = Number(store.get(H_KEY, '')); return Number.isFinite(n) && n >= 320 ? n : 0; });   // 0 = full height
  const popDrag = useRef<{ kind: 'move' | 'corner'; dx: number; dy: number } | null>(null);
  const [, setWinTick] = useState(0);
  useEffect(() => { const f = () => setWinTick((n) => n + 1); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const [natural, setNatural] = useState(neuralVoiceOn);
  const [tamilPick, setTamilPick] = useState<TamilEngine>(tamilEngine);
  useEffect(() => { store.set(NEURAL_KEY, natural ? '1' : '0'); if (natural) neuralDownUntil = 0; }, [natural]);
  const { canView, canDo, company, profile } = useAuth();
  const senderRef = useRef(''); senderRef.current = `SENDER (the person using this chat): ${profile?.full_name ?? ''}${profile?.email ? ` <${profile.email}>` : ''}, company ${company?.company_name ?? ''}`;
  const [dbActionStates, setDbActionStates] = useState<Record<string, DbActionUiState>>({});
  const pendingDbRef = useRef<{ key: string; block: DbActionBlock } | null>(null);
  // Doing a task on the real screen ([[UI ...]] plans): the plan waiting for "yes", its state, and the open question
  const pendingUiRef = useRef<{ key: string; plan: UiPlan } | null>(null);
  const [uiStates, setUiStates] = useState<Record<string, { status: 'pending' | 'running' | 'done' | 'error' | 'cancelled'; message?: string }>>({});
  const [uiStatus, setUiStatus] = useState('');
  const [uiQuestion, setUiQuestion] = useState<{ text: string; options?: string[] } | null>(null);
  const uiAnswerRef = useRef<((a: string | null) => void) | null>(null);
  const [uiReply, setUiReply] = useState('');
  const canDoRef = useRef(canDo); canDoRef.current = canDo;
  const [mailOpen, setMailOpen] = useState(false);
  // chat history (kept per person and company)
  const owner = `${profile?.id ?? profile?.email ?? ''}.${company?.id ?? 'all'}`;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const chatIdRef = useRef<string | null>(null);
  const [chatTitle, setChatTitle] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [chatList, setChatList] = useState<SavedChat[]>([]);
  const mail = useAdviserMail();
  const canRef = useRef(canView); canRef.current = canView;
  const companyRef = useRef(company?.id ?? ''); companyRef.current = company?.id ?? '';
  /** The company's live figures for the chat (at most 8 s wait; empty if they cannot be read). */
  const liveData = useCallback(() => Promise.race([
    businessData((m) => canRef.current(m), companyRef.current),
    new Promise<string>((r) => setTimeout(() => r(''), 8000)),
  ]).then((d) => `${senderRef.current}\n${d}`), []);
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
  // answers written during this visit (pictures in them are made at once; older ones wait for a click)
  const liveIds = useRef(new Set<number>());
  // the listener that runs while the Adviser is talking (see the "close Raju" effect below)
  const bargeRef = useRef<any>(null);
  // "Raaju mic on" / "Raaju mic off": switch the Adviser's typing microphone (filled in next to toggleMic below)
  const micCtl = useRef<{ on: () => void; off: () => void }>({ on: () => {}, off: () => {} });
  const stopBarge = () => { const b = bargeRef.current; bargeRef.current = null; if (b) { try { b.abort(); } catch { /* ended */ } } };

  const page = location.pathname;
  const pageTitle = (() => { try { const b = getBreadcrumbs(page.replace(/^\//, '')); return b[b.length - 1]?.label ?? ''; } catch { return ''; } })();
  pageRef.current = { page, title: pageTitle };
  const suggestions = PAGE_SUGGESTIONS[page] || [];

  useEffect(() => { loadVoices(); try { window.speechSynthesis.onvoiceschanged = loadVoices; } catch { /* no speech */ } }, []);
  useEffect(() => { store.set('help.vlang', lang); }, [lang]);
  useEffect(() => { store.set('help.handsfree', handsFree ? '1' : '0'); }, [handsFree]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, phase]);

  const flashVoiceHint = useCallback((msg: string) => {
    window.clearTimeout(voiceHintTimer.current);
    setVoiceHint(msg);
    voiceHintTimer.current = window.setTimeout(() => setVoiceHint(''), 2600);
  }, []);

  const syncVoiceDraft = useCallback((segs: string[]) => {
    const clean = segs.map((x) => x.trim()).filter(Boolean);
    voiceSegmentsRef.current = clean;
    const joined = clean.join(' ').replace(/\s+/g, ' ').trim();
    accRef.current = joined;
    setVoiceDraft(joined);
    setHeard(joined);
    return joined;
  }, []);

  const clearVoiceDraft = useCallback((notify = true) => {
    syncVoiceDraft([]);
    setVoiceInterim('');
    overHit.current = false;
    if (notify) {
      flashVoiceHint(langRef.current === 'ta' ? 'அழிக்கப்பட்டது! மீண்டும் பேசுங்கள்…' : 'Cleared! Speak again…');
    }
  }, [syncVoiceDraft, flashVoiceHint]);

  const undoVoiceDraft = useCallback(() => {
    const segs = [...voiceSegmentsRef.current];
    if (!segs.length) return;
    if (segs.length > 1) {
      segs.pop();
    } else {
      const words = segs[0].split(/\s+/);
      if (words.length <= 4) segs.pop();
      else segs[0] = words.slice(0, Math.max(1, words.length - 3)).join(' ');
    }
    syncVoiceDraft(segs);
    setVoiceInterim('');
    flashVoiceHint(langRef.current === 'ta' ? 'கடைசி பகுதி நீக்கப்பட்டது — தொடரலாம்' : 'Removed last part — keep speaking…');
  }, [syncVoiceDraft, flashVoiceHint]);

  const stopListening = useCallback(() => {
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    recRef.current = null;
    setVoiceInterim('');
  }, []);

  const endSession = useCallback((goodbye: boolean) => {
    const wasActive = activeRef.current;
    activeRef.current = false;
    busyRef.current = false;
    stopListening();
    stopSpeaking('adviser');   // only our own voice: another AI may have just taken over
    setLiveGuide(null);
    syncVoiceDraft([]);
    setVoiceInterim('');
    setVoiceHint('');
    pendingDbRef.current = null;
    if (goodbye && wasActive && speakRef.current) { setPhase('speaking'); say(GOODBYE[langRef.current], () => setPhase('idle'), undefined, 'adviser'); } else setPhase('idle');
  }, [stopListening, syncVoiceDraft]);

  const confirmDbAction = useCallback(async (key: string, block: DbActionBlock, appendReply = false) => {
    setDbActionStates((prev) => ({ ...prev, [key]: { status: 'saving' } }));
    setMini(true);
    const targetWhere = block.where || defaultWhereForAction(block.action, block.table);
    const res = await runAiAutomation(
      block,
      targetWhere,
      () => executeAdviserDbAction(block, {
        companyId: companyRef.current || null,
        canDo: (m, a) => canDoRef.current(m, a),
      }),
      (path) => {
        const clean = path.startsWith('/') ? path : '/' + path;
        navigate(clean);
      }
    );
    if (pendingDbRef.current?.key === key) pendingDbRef.current = null;
    if (res.ok) {
      setDbActionStates((prev) => ({ ...prev, [key]: { status: 'saved', message: res.message, where: res.where || targetWhere } }));
      const okMsg = langRef.current === 'ta'
        ? `✓ தானாக தட்டச்சு செய்யப்பட்டு சேமிக்கப்பட்டது! ${res.message}`
        : `✓ Automated and saved to database! ${res.message}`;
      if (appendReply) {
        setMsgs((ms) => [...ms, { id: ++chatSeq, role: 'assistant', text: okMsg }]);
        history.current.push({ role: 'assistant', text: okMsg });
      }
      if (speakRef.current) {
        setPhase('speaking');
        say(okMsg, () => { if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready'); }, setNote, 'adviser');
      } else if (handsFreeRef.current && SR && activeRef.current) {
        listenRef.current();
      } else {
        setPhase('ready');
      }
    } else {
      setDbActionStates((prev) => ({ ...prev, [key]: { status: 'error', message: res.message } }));
      const errMsg = langRef.current === 'ta' ? `சேமிக்க முடியவில்லை: ${res.message}` : `Could not save: ${res.message}`;
      if (appendReply) {
        setMsgs((ms) => [...ms, { id: ++chatSeq, role: 'assistant', text: errMsg, error: true }]);
      }
      setPhase('ready');
    }
  }, [SR, navigate]);

  const cancelDbAction = useCallback((key: string, appendReply = false) => {
    if (pendingDbRef.current?.key === key) pendingDbRef.current = null;
    setDbActionStates((prev) => ({ ...prev, [key]: { status: 'cancelled' } }));
    if (appendReply) {
      const msg = langRef.current === 'ta' ? 'ரத்து செய்யப்பட்டது. எதுவும் சேமிக்கப்படவில்லை.' : 'Cancelled. Nothing was saved.';
      setMsgs((ms) => [...ms, { id: ++chatSeq, role: 'assistant', text: msg }]);
      if (speakRef.current) {
        setPhase('speaking');
        say(msg, () => { if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready'); }, setNote, 'adviser');
      } else if (handsFreeRef.current && SR && activeRef.current) {
        listenRef.current();
      } else {
        setPhase('ready');
      }
    }
  }, [SR]);

  // ------------------------------------------------ the answer: stream it, show it, and speak each sentence as it completes
  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    const wantsChart = /word|docx?\b|excel|xlsx|sheet|csv|file|document|image|picture|photo|logo|poster|படம்|இமேஜ்|எக்செல்|வேர்ட்|ஃபைல்|mind ?map|flow|table|tree|timeline|org|cycle|draw|visual|மைண்ட்|ஃப்ளோ|டேபிள்|அட்டவணை|வரை|graph|chart|plot|diagram|pie|bar|trend|pdf|report|download|print|mail|e-mail|letter|whatsapp|whats app|msg|message|teach|how|where|find|locate|explain|show me|guide|steps|workflow|animat|add|create|insert|save|enter|edit|update|delete|move|record|வாட்ஸ்|மெசேஜ்|மெயில்|கடிதம்|வரைபட|அறிக்கை|ரிப்போர்ட்|கிராப்|எப்படி|எங்கே|எங்க|சொல்லி|காட்டு|போடணும்|போடு|சேர்|உருவாக்கு|மாற்று|நீக்கு/i.test(q);
    if (!q || busyRef.current) return;

    // Voice/Text commands for window actions: close, fullscreen, minimize, restore
    const qCmd = adviserVoiceCommand(q);
    if (qCmd === 'mic_on') { micCtl.current.on(); return; }
    if (qCmd === 'mic_off') { micCtl.current.off(); return; }
    if (qCmd === 'close') {
      endSession(false);
      return;
    }
    if (qCmd === 'fullscreen') {
      autoMini.current = false;
      setMini(false);
      setMaxed(true);
      const reply = langRef.current === 'ta' ? 'முழு திரையில் திறக்கப்பட்டது. "normal size" என்று சொன்னால் பழைய அளவுக்கு வரும்.' : 'Maximized to full screen. Say "normal size" to go back.';
      setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }, { id: ++chatSeq, role: 'assistant', text: reply }]);
      if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready');
      return;
    }
    if (qCmd === 'minimize') {
      autoMini.current = false;
      setMini(true);
      const reply = langRef.current === 'ta' ? 'சிறிதாக்கப்பட்டது. திறக்க கீழே இடது மூலையில் உள்ள பெட்டியைத் தொடவும் அல்லது "open" என்று சொல்லவும்.' : 'Minimized. Click the box in the bottom-left corner or say "open".';
      setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }, { id: ++chatSeq, role: 'assistant', text: reply }]);
      if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready');
      return;
    }

    // "Minimize" / "Maximize" / "Normal size": the Adviser does it at once instead of answering a question.
    const winAct = WIN_MIN.test(q) ? 'min' : WIN_MAX.test(q) ? 'max' : WIN_RESTORE.test(q) ? 'restore' : null;
    if (winAct) {
      const ta = langRef.current === 'ta';
      const reply = winAct === 'min'
        ? (ta ? 'சிறிதாக்கப்பட்டது. திறக்க கீழே இடது மூலையில் உள்ள பெட்டியைத் தொடவும் அல்லது "maximize" என்று சொல்லவும்.' : 'Minimized. Click the small box in the bottom-left corner, or say "maximize" or "open", to bring me back.')
        : winAct === 'max'
          ? (ta ? 'முழு திரையில் திறக்கப்பட்டது. "normal size" என்று சொன்னால் பழைய அளவுக்கு வரும்.' : 'Maximized to full screen. Say "normal size" to go back.')
          : (ta ? 'பழைய அளவுக்கு திரும்பியது.' : 'Back to the normal size.');
      autoMini.current = false;
      if (winAct === 'min') setMini(true);
      else { setMini(false); setMaxed(winAct === 'max'); }
      setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }, { id: ++chatSeq, role: 'assistant', text: reply }]);
      if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready');
      return;
    }

    // The screen task asked something (e.g. "Unit Price?"): this message is the answer
    if (uiAnswerRef.current) {
      const answerIt = uiAnswerRef.current;
      uiAnswerRef.current = null;
      setUiQuestion(null);
      setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }]);
      answerIt(CANCEL_DB_RE.test(q) || VOICE_CLEAR_RE.test(q) || VOICE_CLEAR_END_RE.test(q) ? null : q.replace(/\s*(?:over|ஓவர்)\s*$/iu, '').trim());
      return;
    }
    // A screen task waiting for "yes" / "no"
    if (pendingUiRef.current) {
      const pendingUi = pendingUiRef.current;
      if (CONFIRM_DB_RE.test(q)) {
        setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }]);
        void runUiTask(pendingUi.key, pendingUi.plan);
        return;
      }
      if (CANCEL_DB_RE.test(q) || VOICE_CLEAR_RE.test(q) || VOICE_CLEAR_END_RE.test(q)) {
        pendingUiRef.current = null;
        setUiStates((p) => ({ ...p, [pendingUi.key]: { status: 'cancelled' } }));
        const msg = langRef.current === 'ta' ? 'சரி, ரத்து செய்தேன். முதலில் இருந்து சொல்லுங்கள்.' : 'Okay, cancelled. Tell me again from the start.';
        setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }, { id: ++chatSeq, role: 'assistant', text: msg }]);
        if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready');
        return;
      }
    }

    // Direct voice / text confirmation or cancellation for a pending DB insert/update card
    if (pendingDbRef.current) {
      const pending = pendingDbRef.current;
      if (CONFIRM_DB_RE.test(q)) {
        setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }]);
        history.current.push({ role: 'user', text: q });
        await confirmDbAction(pending.key, pending.block, true);
        return;
      }
      if (CANCEL_DB_RE.test(q) || VOICE_CLEAR_RE.test(q) || VOICE_CLEAR_END_RE.test(q)) {
        setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }]);
        history.current.push({ role: 'user', text: q });
        cancelDbAction(pending.key, true);
        return;
      }
    }
    // "No" / "thappa sollitten" / "first la irundhu" / "azhi" on its own: nothing is asked or saved; start again
    if (VOICE_CLEAR_RE.test(q)) {
      clearVoiceDraft(false);
      const msg = langRef.current === 'ta' ? 'சரி, அழித்துவிட்டேன். முதலில் இருந்து சொல்லுங்கள்.' : 'Okay, erased. Say it again from the start.';
      setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: q }, { id: ++chatSeq, role: 'assistant', text: msg }]);
      if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready');
      return;
    }
    busyRef.current = true;
    setLiveGuide(null);
    const visibleControls = collectVisibleScreenTargets();
    const aid = ++chatSeq;
    liveIds.current.add(aid);
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
      const rest = speakablePart(full).slice(spokenUpTo);
      const done = rest.match(/^[\s\S]*?[.!?।\n]+(?=\s|$)/g)?.join('') ?? '';
      const chunk = final ? rest : done;
      if (chunk.trim()) { speakPart(chunk); spokenUpTo += chunk.length; }
    };
    const push = (piece: string) => { full += piece; show(full); speakReady(false); };
    const unreachable = (msg: string) => /failed to fetch|networkerror|load failed|not deployed|HTTP 404|HTTP 5\d\d|Please sign in/i.test(msg);
    try {
      // 0) User-linked Default AI API (when a custom provider such as Gemini, Claude, Groq, ChatGPT, etc. is set as Default)
      let servedFirst = false;
      const customProvider = getActiveProvider();
      const notesFirst = rankNotes(withEnglishTerms(q), pageRef.current.page).filter((r) => r.total > 0).slice(0, 2).map((r) => `## ${r.n.title}\n${r.n.body}`).join('\n\n');
      const data = await liveData();
      const sysPrompt = adviserPrompt(langRef.current, pageRef.current.page, pageRef.current.title, notesFirst, data, speakRef.current, visibleControls);
      const chatHist = [...history.current.slice(-16), { role: 'user' as const, text: q }];
      const chatOpts = { maxTokens: wantsChart ? 4096 : speakRef.current ? 1100 : 2800 };

      if (customProvider) {
        for await (const piece of streamProviderChat(customProvider, sysPrompt, chatHist, chatOpts)) {
          if (!activeRef.current) break;
          servedFirst = true; push(piece);
        }
      }

      // 1) ChatGPT through our own server first (OPENAI_API_KEY in Vercel). Only if that route is missing / not set up
      //    do we try the Supabase help function (an old deployment of it refuses machining questions).
      if (!servedFirst && !customProvider) try {
        for await (const piece of serverChat(sysPrompt, chatHist, chatOpts)) {
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
          for await (const piece of openAiDirect(key, adviserPrompt(langRef.current, pageRef.current.page, pageRef.current.title, notes, await liveData(), speakRef.current, visibleControls), [...history.current.slice(-16), { role: 'user', text: q }])) push(piece);
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
        history.current = history.current.slice(-16);
        const parsedDone = parseBlocks(full);
        const uiPlans = parseUiPlans(full);
        if (uiPlans.length > 0) {
          const k = `${aid}-ui0`;
          pendingUiRef.current = { key: k, plan: uiPlans[0] };
          setUiStates((p) => ({ ...p, [k]: { status: 'pending' } }));
        } else if (parsedDone.dbActions.length > 0) {
          const firstBlock = parsedDone.dbActions[0];
          const firstKey = `${aid}-0`;
          pendingDbRef.current = { key: firstKey, block: firstBlock };
          if (isAutoExecuteEnabled() && !isDestructiveAction(firstBlock.action)) {
            setTimeout(() => {
              void confirmDbAction(firstKey, firstBlock, false);
            }, 600);
          }
        } else if (parsedDone.teaches.length > 0 && activeRef.current) {
          setLiveGuide(parsedDone.teaches[0]);
        }
      } else { failed = true; show('No answer came back. Please try again.', true); }
    } catch (e) {
      failed = true;
      show(e instanceof Error ? e.message : String(e), true);
    } finally {
      streamDone = true;
      setMsgs((ms) => ms.map((x) => (x.id === aid ? { ...x, pending: false } : x)));
      finish();
    }
  }, [SR, confirmDbAction, cancelDbAction]);

  // ------------------------------------------------ listening for the next question
  const listen = useCallback(() => {
    if (!SR || !activeRef.current) return;
    stopBarge();   // the "while talking" listener hands the microphone back first
    stopListening();
    const r = new SR();
    r.lang = langRef.current === 'ta' ? 'ta-IN' : 'en-IN';
    r.interimResults = true;
    r.continuous = overRef.current;   // "over" mode: keep listening through pauses until user says "over"
    let processedIdx = 0;
    let lastInterim = '';

    const applyFinalChunk = (rawChunk: string) => {
      const chunk = rawChunk.replace(/\s+/g, ' ').trim();
      if (!chunk) return;

      // Ignore Adviser's own echo
      const normEcho = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (normEcho(chunk).length > 8 && normEcho(lastSpoken.current).includes(normEcho(chunk))) return;

      // "Close Raju" / "Full screen" / "Minimize": act at once, also in "over" mode
      const chunkCmd = adviserVoiceCommand(chunk);
      if (chunkCmd === 'mic_off') { micCtl.current.off(); return; }
      if (chunkCmd === 'mic_on') return;   // already on
      if (chunkCmd === 'close') { stopListening(); endSession(false); return; }
      if (chunkCmd === 'fullscreen') { autoMini.current = false; setMini(false); setMaxed(true); return; }
      if (chunkCmd === 'minimize') { autoMini.current = false; setMini(true); return; }

      if (overRef.current) {
        // 1) Voice command: Delete / Clear freshly recorded draft & keep listening
        if (VOICE_CLEAR_RE.test(chunk) || VOICE_CLEAR_END_RE.test(chunk)) {
          // everything said so far is erased; a details card waiting for "yes" is cancelled too
          clearVoiceDraft(true);
          if (pendingDbRef.current) cancelDbAction(pendingDbRef.current.key, false);
          return;
        }
        // 2) Voice command: Undo / delete only the last spoken phrase
        if (VOICE_UNDO_RE.test(chunk)) {
          undoVoiceDraft();
          return;
        }
        // 3) Voice command: Replace <old> with <new>
        const rep = chunk.match(VOICE_REPLACE_RE) || chunk.match(VOICE_REPLACE_TA_RE);
        if (rep && voiceSegmentsRef.current.length > 0) {
          const fromWord = rep[1].trim();
          const toWord = rep[2].replace(OVER_RE, '').trim();
          const joined = voiceSegmentsRef.current.join(' ');
          const esc = fromWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(esc, 'i');
          if (fromWord && re.test(joined)) {
            const updated = joined.replace(re, toWord).replace(/\s+/g, ' ').trim();
            syncVoiceDraft(updated ? [updated] : []);
            flashVoiceHint(langRef.current === 'ta' ? `மாற்றப்பட்டது: "${toWord}"` : `Replaced "${fromWord}" with "${toWord}"`);
            if (OVER_RE.test(chunk)) { overHit.current = true; try { r.stop(); } catch { /* ended */ } }
            return;
          }
        }
        // 4) Voice command: "edit <new phrase>" / "change to <new phrase>" replaces the last recorded chunk
        const ed = chunk.match(VOICE_EDIT_LAST_RE);
        if (ed && voiceSegmentsRef.current.length > 0) {
          const replacement = ed[1].replace(OVER_RE, '').trim();
          if (replacement) {
            const segs = [...voiceSegmentsRef.current];
            segs[segs.length - 1] = replacement;
            syncVoiceDraft(segs);
            flashVoiceHint(langRef.current === 'ta' ? 'திருத்தப்பட்டது! தொடரலாம் அல்லது "ஓவர்" சொல்லுங்கள்' : 'Edited! Keep speaking or say "over"');
            if (OVER_RE.test(chunk)) { overHit.current = true; try { r.stop(); } catch { /* ended */ } }
            return;
          }
        }
        // 5) Explicit "over" / "ஓவர்" at end of finalized speech -> send!
        if (OVER_RE.test(chunk)) {
          const prefix = chunk.replace(OVER_RE, '').trim();
          if (prefix) syncVoiceDraft([...voiceSegmentsRef.current, prefix]);
          overHit.current = true;
          try { r.stop(); } catch { /* ended */ }
          return;
        }
        // 6) Normal dictation chunk: append to draft and keep recording
        syncVoiceDraft([...voiceSegmentsRef.current, chunk]);
        return;
      }

      // Non-over mode: append chunk directly
      syncVoiceDraft([...voiceSegmentsRef.current, chunk]);
    };

    r.onresult = (e: any) => {
      let interim = '';
      for (let i = Math.max(processedIdx, e.resultIndex); i < e.results.length; i++) {
        const tr = e.results[i][0]?.transcript ?? '';
        if (e.results[i].isFinal) {
          processedIdx = i + 1;
          applyFinalChunk(tr);
        } else {
          interim += tr;
        }
      }
      lastInterim = interim.replace(/\s+/g, ' ').trim();
      setVoiceInterim(lastInterim);
      const preview = [accRef.current, lastInterim].filter(Boolean).join(' ').trim();
      setHeard(preview);
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
      setVoiceInterim('');

      // If recognition closed while the final word was still in lastInterim, process it safely
      if (lastInterim) {
        applyFinalChunk(lastInterim);
        lastInterim = '';
      }

      if (overRef.current && !overHit.current) {
        // NEVER auto-send in "over" mode before user says "over" (or clicks Send)!
        const hasDraft = !!accRef.current.trim();
        misses.current = hasDraft ? 0 : misses.current + 1;
        if (misses.current >= 12) {
          setHandsFree(false); handsFreeRef.current = false; setPhase('ready');
          setNote(hasDraft ? 'Mic paused. Your recorded text is kept below — edit, delete, send, or tap mic to continue.' : 'I did not hear anything, so the mic is off. Tap the mic to talk again.');
          return;
        }
        if (handsFreeRef.current || hasDraft) listenRef.current(); else setPhase('ready');
        return;
      }

      const said = accRef.current.replace(OVER_RE, '').trim();
      syncVoiceDraft([]);
      overHit.current = false;
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
      const saidCmd = adviserVoiceCommand(said);
      if (saidCmd === 'mic_off') { micCtl.current.off(); return; }
      if (saidCmd === 'mic_on') { micCtl.current.on(); return; }
      if (STOP_WORDS.test(said)) { endSession(true); return; }
      if (GUIDE_WORDS.test(said)) { endSession(false); window.dispatchEvent(new CustomEvent('argus:guide')); return; }
      lastSpoken.current = '';
      void ask(said);
    };

    recRef.current = r;
    setPhase('listening');
    // A short pause first, so the end of the Adviser's own voice has died away before the microphone opens.
    window.setTimeout(() => { if (activeRef.current && recRef.current === r) { try { r.start(); } catch { recRef.current = null; setPhase('ready'); } } }, 500);
  }, [SR, ask, clearVoiceDraft, endSession, flashVoiceHint, stopListening, syncVoiceDraft, undoVoiceDraft]);
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
  // The always-on "Raaju" listener while the Adviser is open: whenever its typing microphone is NOT taking your words
  // (talking, thinking, showing something on screen, or the mic is off) it still hears "Raaju mic on" / "Raaju mic off",
  // "close Raju", "stop" and "minimize" / "maximize". Its own voice coming back through the speakers is ignored.
  useEffect(() => {
    if (!SR || phase === 'idle' || phase === 'listening') return;
    const r = new SR();
    r.lang = lang === 'ta' ? 'ta-IN' : 'en-IN';
    r.continuous = true;
    r.interimResults = true;
    let stopped = false;
    const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const heard = String(e.results[i][0]?.transcript || '').trim();
        if (!heard) continue;
        const n = norm(heard);
        if (n.length > 3 && norm(lastSpoken.current).includes(n) && !/raa?ju|ராஜு/.test(n)) continue;   // its own voice
        const cmd = adviserVoiceCommand(heard);
        if (cmd === 'mic_on') { stopped = true; micCtl.current.on(); return; }
        if (cmd === 'mic_off') { micCtl.current.off(); continue; }   // keeps listening for "mic on"
        if (cmd === 'close') { stopped = true; endSession(false); return; }
        if (cmd === 'fullscreen') { autoMini.current = false; setMini(false); setMaxed(true); return; }
        if (cmd === 'minimize') { autoMini.current = false; setMini(true); return; }
        if (cmd === 'stop') {
          stopped = true;
          stopSpeaking('adviser');
          setLiveGuide(null);
          setPhase('ready');
          if (handsFreeRef.current) window.setTimeout(() => listenRef.current(), 400);
          return;
        }
        if (e.results[i].isFinal) {
          if (WIN_MIN.test(heard)) { autoMini.current = false; setMini(true); }
          else if (WIN_MAX.test(heard)) { setMini(false); setMaxed(true); }
          else if (WIN_RESTORE.test(heard)) { setMini(false); setMaxed(false); }
        }
      }
    };
    r.onend = () => { if (!stopped && bargeRef.current === r) { try { r.start(); } catch { /* already running */ } } };
    r.onerror = () => { /* no speech / aborted: onend restarts it */ };
    bargeRef.current = r;
    try { r.start(); } catch { /* the microphone is busy */ }
    return () => { stopped = true; if (bargeRef.current === r) bargeRef.current = null; try { r.abort(); } catch { /* ended */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SR, phase, lang, !!liveGuide, endSession]);

  // "Open Raju" / "Close Raju" / "Fullscreen" heard by the always-on microphone (or sent from anywhere in the app)
  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<{ action: 'open' | 'close' | 'fullscreen' | 'minimize' | 'mic_on' | 'mic_off'; query?: string }>).detail;
      const action = detail?.action;
      const query = detail?.query;
      if (action === 'mic_on') {
        // "Raaju mic on" while the box is closed: open it, then switch its microphone on
        autoMini.current = false; setMini(false);
        if (!activeRef.current) { toggleRef.current('adviser'); window.setTimeout(() => micCtl.current.on(), 900); }
        else micCtl.current.on();
        return;
      }
      if (action === 'mic_off') { if (activeRef.current) micCtl.current.off(); return; }
      if (action === 'open' || action === 'fullscreen') {
        autoMini.current = false;
        setMini(false);
        if (action === 'fullscreen') {
          setMaxed(true);
        }
        if (!activeRef.current) toggleRef.current('adviser');
        if (query && query.trim()) {
          const qCmd = adviserVoiceCommand(query.trim());
          if (qCmd === 'mic_on') {
            window.setTimeout(() => micCtl.current.on(), 900);
          } else if (qCmd === 'mic_off') {
            window.setTimeout(() => micCtl.current.off(), 900);
          } else if (qCmd === 'fullscreen') {
            setMaxed(true);
          } else if (qCmd === 'close') {
            endSession(false);
          } else if (qCmd === 'minimize') {
            setMini(true);
          } else {
            window.setTimeout(() => {
              void ask(query.trim());
            }, 350);
          }
        }
      } else if (action === 'close') {
        autoMini.current = false;
        setMini(false);
        endSession(false);
      } else if (action === 'minimize') {
        autoMini.current = false;
        setMini(true);
      }
    };
    window.addEventListener('argus:adviser', on);
    return () => window.removeEventListener('argus:adviser', on);
  }, [endSession, ask]);

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
    const onToggle = () => setMenu((m) => !m);
    const onClose = () => setMenu(false);
    window.addEventListener('argus:toggle-ai-menu', onToggle);
    window.addEventListener('argus:close-ai-menu', onClose);
    return () => {
      window.removeEventListener('argus:toggle-ai-menu', onToggle);
      window.removeEventListener('argus:close-ai-menu', onClose);
    };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('[data-dock-handle]')) return;
      if (!rootRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', out);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', out);
      window.removeEventListener('keydown', onKey);
    };
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
    const last = loadChats(ownerRef.current)[0];
    if (last && !first) {   // reopening: carry on with the last conversation
      openChatRef.current(last);
      if (handsFreeRef.current && SR) listenRef.current(); else setPhase('ready');
      return;
    }
    chatIdRef.current = null; setChatTitle('');
    const greet = `${first ? `${WELCOME[langRef.current]} ` : ''}${GREETING_CHAT[langRef.current]}`.trim();
    setMsgs([{ id: ++chatSeq, role: 'assistant', text: greet }]);
    const afterGreeting = () => { if (!activeRef.current) return; if (handsFreeRef.current && SR) listenRef.current(); else setPhase('ready'); };
    if (speakRef.current) { setPhase('greeting'); say(greet, afterGreeting, setNote, 'adviser'); } else afterGreeting();
  };
  beginRef.current = begin;
  /** Opens a saved chat: its messages come back and the AI remembers the last few turns. */
  const openChat = (c: SavedChat) => {
    stopSpeaking('adviser');
    chatIdRef.current = c.id;
    setChatTitle(c.title);
    setMsgs(c.msgs.map((m) => ({ id: ++chatSeq, role: m.role, text: m.text, error: m.error })));
    history.current = c.msgs.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setShowHistory(false);
  };
  const openChatRef = useRef(openChat); openChatRef.current = openChat;
  /** A fresh conversation (the old one stays in History). */
  const newChat = () => {
    if (busyRef.current) return;
    stopSpeaking('adviser');
    setLiveGuide(null);
    pendingDbRef.current = null;
    chatIdRef.current = null;
    setChatTitle('');
    history.current = [];
    setMsgs([{ id: ++chatSeq, role: 'assistant', text: GREETING_CHAT[langRef.current] }]);
    setShowHistory(false);
  };
  // every finished answer is saved into the open chat
  useEffect(() => {
    if (!msgs.length || msgs.some((m) => m.pending)) return;
    const id = saveChat(ownerRef.current, chatIdRef.current, msgs.map((m) => ({ role: m.role, text: m.text, error: m.error })));
    if (id && id !== chatIdRef.current) { chatIdRef.current = id; setChatTitle(loadChats(ownerRef.current).find((c) => c.id === id)?.title ?? ''); }
  }, [msgs]);
  useEffect(() => { if (showHistory) setChatList(loadChats(owner)); }, [showHistory, owner]);
  useEffect(() => () => { activeRef.current = false; try { recRef.current?.abort?.(); } catch { /* ignore */ } stopSpeaking(); }, []);

  const send = () => {
    const text = (input.trim() || voiceDraft.trim());
    if (!text || busyRef.current) return;
    setInput('');
    syncVoiceDraft([]);
    setVoiceInterim('');
    overHit.current = false;
    stopListening();
    stopSpeaking();
    lastSpoken.current = '';
    void ask(text);
  };
  const sendVoiceDraft = () => {
    const text = [voiceDraft, voiceInterim].filter(Boolean).join(' ').replace(OVER_RE, '').trim();
    if (!text || busyRef.current) return;
    syncVoiceDraft([]);
    setVoiceInterim('');
    overHit.current = false;
    stopListening();
    stopSpeaking();
    lastSpoken.current = '';
    void ask(text);
  };
  // Does a screen task like a person: the Adviser shrinks to its corner box so the screen is visible, the task opens
  // the page, clicks, types into the real form, asks for missing details (in the corner box and aloud) and saves.
  const runUiTask = async (key: string, plan: UiPlan) => {
    pendingUiRef.current = null;
    setUiStates((p) => ({ ...p, [key]: { status: 'running' } }));
    autoMini.current = false; setMini(true);
    stopSpeaking('adviser');
    const res = await runUiPlan(plan, {
      navigate: (path) => navigate(path),
      status: (t) => setUiStatus(t),
      ask: (question, options) => new Promise<string | null>((resolve) => {
        setUiQuestion({ text: question, options });
        setUiReply('');
        setMsgs((m) => [...m, { id: ++chatSeq, role: 'assistant', text: question }]);
        uiAnswerRef.current = resolve;
        if (speakRef.current) {
          setPhase('speaking');
          say(question, () => { if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready'); }, setNote, 'adviser');
        } else if (handsFreeRef.current && SR && activeRef.current) listenRef.current();
        else setPhase('ready');
      }),
    });
    uiAnswerRef.current = null;
    setUiQuestion(null);
    setUiStatus('');
    setUiStates((p) => ({ ...p, [key]: { status: res.ok ? 'done' : 'error', message: res.message } }));
    const text = res.ok ? `✓ ${res.message}` : `⚠ ${res.message}`;
    setMsgs((m) => [...m, { id: ++chatSeq, role: 'assistant', text, error: !res.ok }]);
    if (res.ok) window.dispatchEvent(new CustomEvent('argus:data-changed'));
    if (speakRef.current) {
      setPhase('speaking');
      say(res.message, () => { if (handsFreeRef.current && SR && activeRef.current) listenRef.current(); else setPhase('ready'); }, setNote, 'adviser');
    } else if (handsFreeRef.current && SR && activeRef.current) listenRef.current();
    else setPhase('ready');
  };
  const answerUi = (a: string | null) => {
    const r = uiAnswerRef.current; if (!r) return;
    uiAnswerRef.current = null; setUiQuestion(null); setUiReply('');
    if (a != null) setMsgs((m) => [...m, { id: ++chatSeq, role: 'user', text: a }]);
    r(a);
  };

  const toggleMic = () => {
    if (!SR) { setNote('Voice input needs Chrome or Edge on a computer.'); return; }
    if (phase === 'speaking') {                          // talking over the answer: stop it and listen now
      setHandsFree(true); handsFreeRef.current = true; misses.current = 0; overHit.current = false; setNote('');
      stopSpeaking();
      window.setTimeout(() => listenRef.current(), 150);
      return;
    }
    if (phase === 'listening' || handsFree) {            // mic paused (keeps any recorded voice draft so user can edit / delete / send)
      setHandsFree(false); handsFreeRef.current = false;
      stopListening();
      if (!busyRef.current) setPhase('ready');
      return;
    }
    setHandsFree(true); handsFreeRef.current = true; misses.current = 0; overHit.current = false; setNote('');
    if (!busyRef.current) { stopSpeaking(); listenRef.current(); }
  };
  micCtl.current = {
    on: () => {
      if (!SR) { setNote('Voice input needs Chrome or Edge on a computer.'); return; }
      setHandsFree(true); handsFreeRef.current = true; misses.current = 0; overHit.current = false;
      setNote(langRef.current === 'ta' ? 'மைக் ஆன். பேசுங்கள்.' : 'Mic on. Speak now.');
      if (!busyRef.current) { stopSpeaking('adviser'); window.setTimeout(() => listenRef.current(), 200); }
    },
    off: () => {
      setHandsFree(false); handsFreeRef.current = false;
      stopListening();
      setNote(langRef.current === 'ta' ? 'மைக் ஆஃப். "ராஜு மைக் ஆன்" என்று சொன்னால் மீண்டும் ஆன் ஆகும்.' : 'Mic off. Say "Raaju mic on" to switch it on again.');
      if (!busyRef.current) setPhase('ready');
    },
  };

  const active = phase !== 'idle';
  useEffect(() => { if (active) setView(Math.min(splitW, splitMax()) >= 640 ? 'both' : 'report'); }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Tell Co-worker when Adviser holds the microphone, so the two never listen at once.
  useEffect(() => { if (active) takeFloor('adviser'); else releaseFloor('adviser'); }, [active]);
  useEffect(() => { if (active) void liveData(); }, [active, liveData]);
  // A mode switched off in Access Management while it is running stops at once.
  useEffect(() => {
    if (!allowed.teaching && modes.teaching) setModes((m) => ({ ...m, teaching: false }));
    if (!allowed.coworker && modes.coworker) setModes((m) => ({ ...m, coworker: false }));
    if (!allowed.adviser && activeRef.current) endSession(false);
  }, [allowed.teaching, allowed.coworker, allowed.adviser, modes.teaching, modes.coworker, endSession]);
  // (the Adviser used to dock beside the page; it is a floating window now, so the page is never pushed aside)
  useEffect(() => { document.documentElement.removeAttribute('data-adviser-split'); }, []);
  const popW = maxed ? window.innerWidth : Math.min(splitW, splitMax(), window.innerWidth);
  // The whole window always stays on the screen: nothing is cut off at the top, bottom or sides.
  // If it was moved down, it gets shorter so its bottom row (mic, type box, send) is still visible.
  const wantH = Math.min(popH || window.innerHeight, window.innerHeight);
  const popY = maxed ? 0 : Math.min(Math.max(0, popPos.y), Math.max(0, window.innerHeight - Math.min(wantH, 360)));
  const popHeight = maxed ? window.innerHeight : Math.min(wantH, window.innerHeight - popY);
  const popX = maxed ? 0 : Math.min(Math.max(0, popPos.x), Math.max(0, window.innerWidth - popW));
  const savePop = () => { store.set(POS_KEY, JSON.stringify({ x: popX, y: popY })); store.set(H_KEY, String(popH)); store.set(SPLIT_KEY, String(splitW)); };
  const anyOn = active || modes.teaching || modes.coworker;
  // Sync menu open state and assistant indicators to the arrow dock tab
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('argus:ai-menu-state', { detail: { open: menu, anyOn, cw } }));
    document.documentElement.setAttribute('data-dock', menu ? 'open' : 'collapsed');
  }, [menu, anyOn, cw]);
  const status = phase === 'greeting' ? '…' : phase === 'listening' ? (overMode ? 'Listening… பேசுங்கள். முடிந்ததும் "over" சொல்லுங்கள் / say "over" when you finish' : 'Listening… பேசுங்கள் / speak now') : phase === 'thinking' ? 'Thinking…' : phase === 'speaking' ? 'Speaking… tap the mic to stop it and talk' : '';
  const rightSide = document.documentElement.getAttribute('data-dock-side') === 'right';
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
    {liveGuide && (
      <LiveScreenGuide
        lesson={liveGuide}
        lang={lang}
        currentPath={location.pathname}
        onNavigate={(route) => navigate(route.startsWith('/') ? route : `/${route}`)}
        onSpeakStep={(text) => say(text, () => {}, setNote, 'adviser')}
        onStopSpeak={() => stopSpeaking('adviser')}
        onClose={() => setLiveGuide(null)}
      />
    )}
    <div ref={rootRef} data-voice-ignore
      className={`dock-help fixed z-[60] flex flex-col gap-2 font-sans pointer-events-none ${rightSide ? 'items-end' : 'items-start'}`}>
      {menu && (
        <div role="menu" aria-label="AI modes" data-voice-ignore onMouseDown={(e) => e.stopPropagation()}
          className="pointer-events-auto w-64 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
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
                  {m.id === 'coworker' && !m.on && cw === 'listening' && <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Say "Hi Raaju"</span>}
                  {m.id === 'coworker' && !m.on && (cw === 'start' || cw === 'error') && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{cw === 'error' ? 'Mic problem' : 'Start mic'}</span>}
                </span>
              </button>
              <VoiceSwitch mode={m.id} label={m.title} />
            </div>
          ))}
          <div className="my-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              role="menuitem"
              data-testid="open-link-ai-apis"
              onClick={() => { setMenu(false); setApiModalOpen(true); }}
              title="Link multiple AI APIs (ChatGPT, Gemini, Claude, Groq, DeepSeek…) and choose which one is Default"
              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600"><Plug size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-800">Link AI APIs</span>
                <span data-testid="menu-active-ai-label" className="block truncate text-[10px] font-semibold text-emerald-700">
                  Default: {activeAiLabel}
                </span>
              </span>
            </button>
          </div>
          <p className="px-2 pt-0.5 text-[10px] leading-tight text-slate-400">Point at a mode to see what it does and its shortcut.</p>
        </div>
      )}
      <AiApiModal open={apiModalOpen} onClose={() => setApiModalOpen(false)} />

      {/* a short message when no chat is open (for example the microphone was blocked) */}
      {!active && note && (
        <div role="status" className="pointer-events-auto max-w-[20rem] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-500 shadow-lg backdrop-blur">{note}</div>
      )}

      {/* Minimized Adviser: a small box in the corner. While it is pointing things out on the screen it says so. */}
      {active && mini && createPortal(
        <div role="dialog" aria-label="Adviser (minimized)" data-voice-ignore onMouseDown={(e) => e.stopPropagation()}
          className="no-glass fixed bottom-4 left-4 z-[70] flex w-[340px] flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xl px-3 py-2.5 shadow-[0_20px_50px_-10px_rgba(99,102,241,0.35),0_4px_16px_rgba(0,0,0,0.06)] ring-1 ring-indigo-500/10">
          <button type="button" onClick={() => { autoMini.current = false; setMini(false); }} title="Open the Adviser"
            className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-orange-400 text-white shadow-md"><Lightbulb size={16} /></span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold leading-tight text-slate-800">Adviser</span>
              <span className="block truncate text-[11px] text-slate-500">
                {uiQuestion
                  ? (lang === 'ta' ? 'உங்கள் பதில் தேவை' : 'Needs your answer')
                  : uiStatus
                  ? uiStatus
                  : liveGuide
                  ? (lang === 'ta' ? `திரையில் காட்டுகிறது: ${liveGuide.title}` : `Showing on screen: ${liveGuide.title}`)
                  : (lang === 'ta' ? 'திறக்க இங்கே தொடவும்' : 'Click to open')}
              </span>
            </span>
          </button>
          {liveGuide && (
            <button type="button" onClick={() => setLiveGuide(null)} title="Stop showing"
              className="shrink-0 rounded-md bg-orange-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-orange-700">{lang === 'ta' ? 'நிறுத்து' : 'Stop'}</button>
          )}
          <button type="button" aria-label="Open the Adviser" title="Open" onClick={() => { autoMini.current = false; setMini(false); }}
            className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-700"><Maximize2 size={15} /></button>
          <button type="button" aria-label="Close the Adviser" title="Close" onClick={() => endSession(false)}
            className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"><X size={16} /></button>
          {uiQuestion && (
            <form className="basis-full space-y-1.5 border-t border-slate-100 pt-2" onSubmit={(e) => { e.preventDefault(); if (uiReply.trim()) answerUi(uiReply.trim()); }}>
              <p className="text-[12px] font-semibold text-slate-800">{uiQuestion.text}</p>
              {uiQuestion.options && uiQuestion.options.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {uiQuestion.options.slice(0, 10).map((o) => (
                    <button key={o} type="button" onClick={() => answerUi(o)} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10.5px] font-semibold text-indigo-700 hover:bg-indigo-100">{o}</button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1">
                <input autoFocus value={uiReply} onChange={(e) => setUiReply(e.target.value)} placeholder={lang === 'ta' ? 'பதிலை எழுதுங்கள் அல்லது பேசுங்கள்…' : 'Type or say the answer…'}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-[12px] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                <button type="submit" className="h-8 rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-2.5 text-[11px] font-bold text-white">OK</button>
                <button type="button" onClick={() => answerUi(null)} className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold text-slate-500 hover:bg-red-50 hover:text-red-600">{lang === 'ta' ? 'நிறுத்து' : 'Stop'}</button>
              </div>
            </form>
          )}
        </div>,
        document.body,
      )}

      {/* Adviser chat: a floating window (drag it anywhere; the page stays full width behind it) */}
      {active && createPortal(
        <div role="dialog" aria-label="Adviser" data-voice-ignore onMouseDown={(e) => e.stopPropagation()}
          style={{ left: popX, top: popY, width: popW, height: popHeight, display: mini ? 'none' : undefined }}
          className="adviser-split no-glass fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_25px_70px_-15px_rgba(99,102,241,0.25),0_10px_30px_-10px_rgba(236,72,153,0.12),0_0_0_1px_rgba(226,232,240,0.8)] ring-1 ring-indigo-500/10">
          {/* right edge: drag to make it wider or narrower (double-click = default width) */}
          <div role="separator" aria-orientation="vertical" aria-label="Resize the Adviser" title="Drag to resize · double-click to reset"
            className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none hover:bg-indigo-400/30"
            onPointerDown={(e) => { splitDrag.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ } }}
            onPointerMove={(e) => { if (!splitDrag.current) return; setSplitW(Math.min(splitMax(), Math.max(320, Math.round(e.clientX - popX)))); }}
            onPointerUp={() => { if (!splitDrag.current) return; splitDrag.current = false; savePop(); }}
            onDoubleClick={() => { const d = Math.round(Math.min(560, Math.max(380, window.innerWidth * 0.34))); setSplitW(d); store.set(SPLIT_KEY, String(d)); }} />
          {/* bottom-right corner: drag to change width and height together (double-click = full height) */}
          <div aria-label="Resize the Adviser" title="Drag to resize · double-click for full height"
            className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize touch-none rounded-tl bg-gradient-to-br from-indigo-300/50 to-fuchsia-300/60 hover:from-indigo-400 hover:to-fuchsia-400"
            onPointerDown={(e) => { popDrag.current = { kind: 'corner', dx: 0, dy: 0 }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ } }}
            onPointerMove={(e) => {
              if (popDrag.current?.kind !== 'corner') return;
              setSplitW(Math.min(splitMax(), Math.max(320, Math.round(e.clientX - popX))));
              setPopH(Math.min(window.innerHeight - popY, Math.max(320, Math.round(e.clientY - popY))));
            }}
            onPointerUp={() => { if (!popDrag.current) return; popDrag.current = null; savePop(); }}
            onDoubleClick={() => { setPopH(0); setPopPos((p) => ({ ...p, y: 0 })); store.set(H_KEY, '0'); }} />
          {/* title bar: drag to move the window anywhere (double-click = back to the left side) */}
          <div title="Drag to move · double-click to put it back on the left"
            className="flex cursor-move touch-none select-none relative items-center gap-2 border-b border-slate-100/80 bg-gradient-to-b from-white via-white to-slate-50/50 px-3.5 py-3 text-slate-800 before:absolute before:inset-x-0 before:top-0 before:h-[3.5px] before:bg-gradient-to-r before:from-cyan-400 before:via-indigo-500 before:via-fuchsia-500 before:to-amber-400 before:shadow-[0_1px_8px_rgba(99,102,241,0.4)]"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button, select, input, a')) return;
              if (maxed) return;
              popDrag.current = { kind: 'move', dx: e.clientX - popX, dy: e.clientY - popY };
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
            }}
            onPointerMove={(e) => { if (popDrag.current?.kind !== 'move') return; setPopPos({ x: Math.round(e.clientX - popDrag.current.dx), y: Math.round(e.clientY - popDrag.current.dy) }); }}
            onPointerUp={() => { if (!popDrag.current) return; popDrag.current = null; savePop(); }}
            onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('button, select, input, a')) return; setPopPos({ x: 0, y: 0 }); setPopH(0); store.set(POS_KEY, JSON.stringify({ x: 0, y: 0 })); store.set(H_KEY, '0'); }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/30 ring-2 ring-white/90"><Lightbulb size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-[15px] font-black tracking-tight text-transparent">Adviser</p>
              <p className="truncate text-[10.5px] font-medium text-slate-500 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0 inline-block" />Ask anything · Live Business Analysis, Actions &amp; Guidance</p>
            </div>
            <button type="button" aria-label="E-mail" title={mail.state?.connected ? `E-mail connected: ${mail.state.mail?.smtp_user ?? ''}` : 'Connect your e-mail so the Adviser can send e-mails for you'}
              onClick={() => setMailOpen((v) => !v)} className={`relative rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 ${mailOpen ? 'bg-indigo-50 text-indigo-600' : ''}`}>
              <Mail size={16} />
              <span className={`absolute right-0.5 top-0.5 h-2 w-2 rounded-full border-2 border-white ${mail.state?.connected ? 'bg-lime-300' : 'bg-amber-300'}`} />
            </button>
            <button type="button" aria-label={autoExec ? 'Robotic Auto-Type & Save: Enabled' : 'Robotic Auto-Type & Save: Manual Confirm'}
              title={autoExec ? '⚡ Robotic Auto-Type & Save is ON (AI automatically navigates, types and saves). Click to switch to manual confirmation.' : 'Robotic Auto-Type & Save is in manual confirm mode. Click to enable instant hands-free automation.'}
              onClick={() => { const next = !autoExec; setAutoExec(next); setAutoExecuteEnabled(next); }}
              className={`relative rounded p-1.5 transition-colors ${autoExec ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
              <Sparkles size={16} className={autoExec ? 'text-amber-600 animate-pulse' : ''} />
              {autoExec && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
            </button>
            <button type="button" aria-label={speakOn ? 'Mute answers' : 'Read answers aloud'} title={speakOn ? 'Answers are read aloud (click to mute)' : 'Answers are silent (click to read aloud)'}
              onClick={() => setSpeakOn((v) => !v)} className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600">{speakOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
            <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
            <button type="button" aria-label="Minimize the Adviser" title="Minimize (a small box stays in the corner)" onClick={() => { autoMini.current = false; setMini(true); }}
              className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"><Minus size={17} /></button>
            <button type="button" aria-label={maxed ? 'Restore the Adviser size' : 'Maximize the Adviser'} title={maxed ? 'Restore the size' : 'Maximize (full screen)'} onClick={() => setMaxed((v) => !v)}
              className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600">{maxed ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            <button type="button" aria-label="Close the Adviser" title="Close" onClick={() => endSession(false)} className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"><X size={17} /></button>
          </div>
          {mailOpen && <MailConnect onClose={() => setMailOpen(false)} />}

          <div className="flex items-center gap-1.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/60 via-white to-slate-50/60 px-3.5 py-2">
            {/* two small choices: the language it answers in, and the voice that reads the answers */}
            <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}
              title="The language the Adviser answers and speaks in"
              className="h-7 rounded-full border border-indigo-200 bg-indigo-50/60 px-2.5 text-[11px] font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <select aria-label="Voice"
              value={lang === 'ta' ? tamilPick : natural ? 'natural' : 'basic'}
              onChange={(e) => {
                const v = e.target.value;
                if (lang === 'ta') { const t = v as TamilEngine; setTamilEngine(t); setTamilPick(t); setNatural(t !== 'browser'); }
                else setNatural(v === 'natural');
                stopSpeaking();
              }}
              title="The voice that reads the answers aloud"
              className="h-7 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100">
              {lang === 'ta' ? (<>
                <option value="clear">Voice: Clear</option>
                <option value="natural">Voice: Natural</option>
                <option value="browser">Voice: Basic</option>
              </>) : (<>
                <option value="natural">Voice: Natural</option>
                <option value="basic">Voice: Basic</option>
              </>)}
            </select>
            {choices.length > 1 && !natural && (
              <select aria-label="Choose the voice" value={chosen} onChange={(e) => pickVoice(e.target.value)} className="ml-auto h-6 max-w-[7.5rem] rounded border border-slate-200 bg-white px-1 text-[10px]">
                {choices.map((v) => <option key={v.name} value={v.name}>{v.name.replace(/^(Microsoft|Google)\s+/, '$1 ')}</option>)}
              </select>
            )}
          </div>

          <div className="flex border-b border-slate-100 bg-slate-50/70 p-1 text-[12px] font-bold gap-1" role="tablist">
            {([
              { id: 'both' as const, label: 'Both (Side by side)', icon: Columns2 },
              { id: 'report' as const, label: 'Report & ideas', icon: BarChart3 },
              { id: 'chat' as const, label: 'Ask', icon: MessageCircle },
            ]).map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={view === t.id}
                onClick={() => {
                  setView(t.id);
                  if (t.id === 'report') { stopListening(); stopSpeaking('adviser'); }
                  // two halves need room: widen the chat panel when it is narrow
                  if (t.id === 'both' && splitW < 720) { const w = Math.min(splitMax(), 760); setSplitW(w); store.set(SPLIT_KEY, String(w)); }
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 whitespace-nowrap rounded-xl transition-all ${view === t.id ? 'bg-white text-indigo-700 font-extrabold shadow-sm shadow-slate-200/80 border border-slate-200/80 ring-1 ring-black/[0.02]' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'}`}><t.icon size={13} className={view === t.id ? 'text-indigo-600' : 'text-slate-400'} />{t.label}</button>
            ))}
          </div>
          <div className={view === 'both' ? 'flex min-h-0 flex-1' : 'contents'}>
          {view !== 'chat' && (
            <div className={view === 'both' ? 'flex min-h-0 w-1/2 min-w-0 flex-col border-r border-slate-200 bg-slate-50/40' : 'contents'}>
              {view === 'both' && (
                <div className="flex items-center justify-between border-b border-slate-100 bg-white px-3 py-1.5">
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-indigo-700"><BarChart3 size={13} />Report &amp; ideas</span>
                  <span className="text-[10px] text-slate-400">Business summary</span>
                </div>
              )}
              <AdviserReportPanel lang={lang} speakOn={speakOn} can={canView}
                onOpenPage={(pg) => { endSession(false); navigate(`/${pg}`); }}
                say={(text, onEnd) => say(text, onEnd ?? (() => {}), setNote, 'adviser')} stopSpeaking={stopSpeaking} />
            </div>
          )}
          {view !== 'report' && (
          <div className={view === 'both' ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'contents'}>
          {view === 'both' && (
            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-indigo-700"><MessageCircle size={13} />Ask · Chat &amp; Voice</span>
              <span className="text-[10px] text-slate-400">Ask anything</span>
            </div>
          )}
          <>
          <div className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-2.5 py-1.5">
            <button type="button" onClick={() => setShowHistory((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${showHistory ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-700'}`}>
              <History size={12} />History
            </button>
            <button type="button" onClick={newChat} disabled={phase === 'thinking'}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50">
              <Plus size={12} />New chat
            </button>
            <span className="min-w-0 flex-1 truncate text-right text-[11px] text-slate-400" title={chatTitle}>{chatTitle || 'New chat'}</span>
          </div>
          {showHistory ? (
          <div className="flex-1 overflow-y-auto px-2.5 py-2">
            {chatList.length === 0 && <p className="px-1 py-6 text-center text-xs text-slate-400">No saved chats yet. Ask something and it is kept here.</p>}
            {groupByDay(chatList).map((g) => (
              <div key={g.day} className="mb-2">
                <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.day}</p>
                {g.chats.map((c) => (
                  <div key={c.id} className={`group mb-1 flex items-center gap-1 rounded-lg border px-2 py-1.5 ${c.id === chatIdRef.current ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'}`}>
                    <button type="button" onClick={() => openChat(c)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs font-semibold text-slate-800">{c.title}</span>
                      <span className="block text-[10px] text-slate-400">{new Date(c.updatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {c.msgs.filter((m) => m.role === 'user').length} questions</span>
                    </button>
                    <button type="button" title="Delete this chat" aria-label={`Delete chat ${c.title}`}
                      onClick={() => { deleteChat(owner, c.id); if (c.id === chatIdRef.current) newChat(); setChatList(loadChats(owner)); setShowHistory(true); }}
                      className="rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          ) : (
          <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-white via-slate-50/25 to-white px-3.5 py-3.5" aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
                <div className={`max-w-[88%] whitespace-pre-wrap px-4 py-2.5 text-[13px] leading-relaxed transition-all ${
                  m.role === 'user'
                    ? 'rounded-2xl rounded-tr-xs bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20 ring-1 ring-white/20 font-medium tracking-wide'
                    : m.error
                      ? 'rounded-2xl rounded-tl-xs border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 shadow-xs'
                      : 'rounded-2xl rounded-tl-xs border border-slate-200/90 bg-white text-slate-800 shadow-md shadow-slate-900/[0.03] ring-1 ring-black/[0.02] hover:border-indigo-200/80 px-4 py-3'
                }`}>
                  {m.role === 'assistant' && !m.error ? (() => {
                    const b = parseBlocks(m.text);
                    const vis = parseVisuals(m.text);
                    const made = parseFiles(m.text);
                    const anyVis = vis.mindmaps.length + vis.diagrams.length + vis.tables.length + made.files.length + made.images.length > 0;
                    if (!b.visible && !b.charts.length && !b.teaches.length && !b.dbActions.length && !anyVis) return m.pending ? <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 size={13} className="animate-spin" />Thinking…</span> : '';
                    return (
                      <>
                        {b.visible}
                        {m.pending && /\[\[\s*(CHART|PDF)/.test(m.text) && <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" />Drawing the graphs…</span>}
                        {b.charts.map((c, i) => <ChartView key={i} chart={c} />)}
                        {m.pending && /\[\[\s*(MINDMAP|DIAGRAM|TABLE|FILE|IMAGE)/.test(m.text) && <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" />{lang === 'ta' ? 'வரைகிறது…' : 'Drawing it…'}</span>}
                        {vis.mindmaps.map((mm, i) => <MindMapView key={`mm${i}`} spec={mm} companyId={company?.id ?? null} auto={!m.pending && liveIds.current.has(m.id)} onOpen={(p) => { navigate(p); setMini(true); }} />)}
                        {vis.diagrams.map((d, i) => <DiagramView key={`dg${i}`} spec={d} />)}
                        {vis.tables.map((t, i) => <TableView key={`tb${i}`} spec={t} />)}
                        {made.files.map((fl, i) => <FileCard key={`fl${i}`} file={fl} company={company?.company_name ?? ''} />)}
                        {made.images.map((im, i) => <ImageCard key={`im${i}`} spec={im} auto={liveIds.current.has(m.id)} />)}
                        {!m.pending && parseUiPlans(m.text).slice(0, 1).map((plan) => {
                          const k = `${m.id}-ui0`;
                          const st = uiStates[k]?.status ?? (liveIds.current.has(m.id) ? 'pending' : 'cancelled');
                          return (
                            <div key={k} className="mt-2 overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm">
                              <div className="flex items-center gap-2 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-fuchsia-50 px-2.5 py-1.5">
                                <Sparkles size={13} className="text-fuchsia-500" />
                                <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800">{plan.title}</span>
                                <span className="text-[10px] font-semibold text-slate-500">{lang === 'ta' ? 'திரையில் செய்யும்' : 'Done on screen'}</span>
                              </div>
                              <ol className="space-y-0.5 px-3 py-1.5 text-[11px] text-slate-600">
                                {plan.steps.map((s2, i2) => <li key={i2} className="list-decimal ml-3">{describeStep(s2)}</li>)}
                              </ol>
                              {st === 'pending' && (
                                <div className="flex items-center gap-1.5 border-t border-slate-100 px-2.5 py-1.5">
                                  <button type="button" onClick={() => { if (pendingUiRef.current?.key === k || !pendingUiRef.current) void runUiTask(k, plan); }}
                                    className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:brightness-110">
                                    <Check size={12} /> {lang === 'ta' ? 'சரி, செய்' : 'Yes, do it'}
                                  </button>
                                  <button type="button" onClick={() => { pendingUiRef.current = null; setUiStates((p) => ({ ...p, [k]: { status: 'cancelled' } })); }}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-red-50 hover:text-red-600">
                                    <X size={12} /> {lang === 'ta' ? 'வேண்டாம்' : 'No'}
                                  </button>
                                  <span className="ml-auto text-[10px] text-slate-400">{lang === 'ta' ? 'அல்லது "சரி" சொல்லுங்கள்' : 'or say "yes"'}</span>
                                </div>
                              )}
                              {st === 'running' && <p className="flex items-center gap-1.5 border-t border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700"><Loader2 size={12} className="animate-spin" />{uiStatus || (lang === 'ta' ? 'செய்கிறது…' : 'Working…')}</p>}
                              {st === 'done' && <p className="border-t border-slate-100 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">✓ {uiStates[k]?.message}</p>}
                              {st === 'error' && <p className="border-t border-slate-100 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">⚠ {uiStates[k]?.message}</p>}
                              {st === 'cancelled' && <p className="border-t border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">{lang === 'ta' ? 'ரத்து செய்யப்பட்டது.' : 'Not done.'}</p>}
                            </div>
                          );
                        })}
                        {m.pending && /\[\[\s*EMAIL/.test(m.text) && <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" />Writing the e-mail…</span>}
                        {!m.pending && b.emails.map((e, i) => <EmailCard key={i} draft={e} onConnect={() => setMailOpen(true)} />)}
                        {m.pending && /\[\[\s*WHATSAPP/.test(m.text) && <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" />Writing the WhatsApp message…</span>}
                        {!m.pending && b.whatsapps.map((w, i) => <WhatsAppCard key={`wa${i}`} draft={w} />)}
                        {m.pending && /\[\[\s*DB_ACTION/.test(m.text) && (
                          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700">
                            <Loader2 size={12} className="animate-spin" />
                            {lang === 'ta' ? 'விவரங்களைத் தயாரிக்கிறது…' : 'Preparing the details…'}
                          </span>
                        )}
                        {!m.pending && b.dbActions.map((act, i) => {
                          const key = `${m.id}-${i}`;
                          return (
                            <DbActionCard
                              key={key}
                              block={act}
                              lang={lang}
                              state={dbActionStates[key] ?? { status: 'pending' }}
                              onConfirm={(edited) => void confirmDbAction(key, edited, false)}
                              onCancel={() => cancelDbAction(key, false)}
                              onOpenRoute={(route) => navigate(route.startsWith('/') ? route : `/${route}`)}
                            />
                          );
                        })}
                        {m.pending && /\[\[\s*TEACH/.test(m.text) && (
                          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-orange-600">
                            <Loader2 size={12} className="animate-spin" />
                            {lang === 'ta' ? 'திரையில் சரியான இடத்தைக் காட்டுகிறது…' : 'Pointing to exact spot on screen…'}
                          </span>
                        )}
                        {!m.pending && b.teaches.map((lesson, i) => {
                          const isShowing = liveGuide?.title === lesson.title && liveGuide?.steps.length === lesson.steps.length;
                          return (
                            <div key={`teach${i}`} className="mt-2 flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setLiveGuide(isShowing ? null : lesson)}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold shadow-md transition-all hover:scale-[1.02] ${
                                  isShowing
                                    ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-500/25'
                                    : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-orange-500/25'
                                }`}
                              >
                                <Crosshair size={13} />
                                {isShowing
                                  ? (lang === 'ta' ? 'திரையில் காட்டுகிறது · நிறுத்து' : 'Showing on screen · Stop')
                                  : (lang === 'ta' ? `திரையில் காட்டு (${lesson.steps.length} படிகள்)` : `Show on Screen (${lesson.steps.length} steps)`)}
                              </button>
                            </div>
                          );
                        })}
                        {!m.pending && (b.charts.length > 0 || b.pdf) && (
                          <button type="button" onClick={() => void saveReportPdf(b.pdf?.title || b.charts[0]?.title || 'Adviser report', b.visible, b.charts, company?.company_name ?? '')}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
                            <Download size={13} />Download PDF{b.pdf ? '' : ' report'}
                          </button>
                        )}
                      </>
                    );
                  })() : (m.text || (m.pending ? <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 size={13} className="animate-spin" />Thinking…</span> : ''))}
                </div>
              </div>
            ))}
            {msgs.length <= 1 && (
              <div className="pt-1">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{lang === 'ta' ? 'இவற்றைக் கேட்டுப் பாருங்கள்' : 'Try asking'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s.en} type="button" onClick={() => { stopListening(); stopSpeaking(); void ask(lang === 'ta' ? s.ta : s.en); }}
                      className="rounded-full border border-indigo-100 bg-gradient-to-r from-indigo-50 to-fuchsia-50 px-2.5 py-1 text-left text-[11px] font-medium text-indigo-800 hover:from-indigo-100 hover:to-fuchsia-100">{lang === 'ta' ? s.ta : s.en}</button>
                  ))}
                </div>
                {suggestions.length > 0 && (
                  <div className="mt-2.5">
                    <button type="button" onClick={() => setTips((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-800">
                      <Lightbulb size={12} />{tips ? 'Hide tips for this page' : 'Tips for this page'}
                    </button>
                    {tips && (
                      <ul className="mt-1.5 space-y-1 rounded-lg border border-indigo-100 bg-indigo-50 p-2">
                        {suggestions.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11px] text-indigo-900"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" /><span>{lang === 'ta' ? s.ta : s.en}</span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>
          )}

          {(phase === 'listening' || voiceDraft || voiceInterim) && (
            <div className="border-t border-violet-200 bg-gradient-to-b from-violet-50/80 to-white px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${phase === 'listening' ? 'animate-pulse bg-red-500' : 'bg-amber-500'}`} />
                  <span className="truncate text-[10.5px] font-bold text-slate-700">
                    {phase === 'listening'
                      ? (overMode
                          ? (lang === 'ta' ? 'பதிவாகிறது… அனுப்ப "ஓவர்" / "over" சொல்லுங்கள்' : 'Recording… say "over" to send')
                          : (lang === 'ta' ? 'கேட்கிறது… பேசுங்கள்' : 'Listening… speak now'))
                      : (lang === 'ta' ? 'பதிவு செய்த உரை (திருத்த / அழிக்க / அனுப்பலாம்)' : 'Recorded draft (edit, delete, or send)')}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={undoVoiceDraft} disabled={!voiceDraft}
                    title={lang === 'ta' ? 'கடைசி பகுதியை நீக்கு (அல்லது "undo" / "கடைசி அழி" சொல்லுங்கள்)' : 'Undo last spoken part (or say "undo")'}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-35">
                    <Undo2 size={11} />{lang === 'ta' ? 'பின்செல்' : 'Undo'}
                  </button>
                  <button type="button" onClick={() => clearVoiceDraft(true)} disabled={!voiceDraft && !voiceInterim}
                    title={lang === 'ta' ? 'பதிவை முழுவதும் அழி (அல்லது "delete" / "அழி" சொல்லுங்கள்)' : 'Delete freshly recorded text (or say "delete" / "clear")'}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 text-[10px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-35">
                    <Trash2 size={11} />{lang === 'ta' ? 'அழி' : 'Delete'}
                  </button>
                  <button type="button" onClick={sendVoiceDraft} disabled={(!voiceDraft && !voiceInterim) || phase === 'thinking'}
                    title={lang === 'ta' ? 'இப்போது அனுப்பு (அல்லது "over" / "ஓவர்" சொல்லுங்கள்)' : 'Send now (or say "over")'}
                    className="inline-flex h-6 items-center gap-1 rounded-md bg-indigo-600 px-2 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-35">
                    <Send size={10} />{lang === 'ta' ? 'அனுப்பு' : 'Send'}
                  </button>
                </div>
              </div>
              <textarea
                rows={2}
                value={voiceDraft}
                onChange={(e) => {
                  const val = e.target.value;
                  voiceSegmentsRef.current = val.trim() ? [val] : [];
                  accRef.current = val;
                  setVoiceDraft(val);
                  setHeard(val);
                }}
                placeholder={lang === 'ta' ? 'பேசுங்கள்… இங்கே நேரடியாகப் பதிவாகும் (கைமுறையாகவும் அல்லது குரலாலும் திருத்தலாம்)' : 'Speak now… your words appear here (edit by typing or by voice)'}
                className="w-full resize-none rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[12px] leading-snug text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
              />
              {voiceInterim && (
                <p className="mt-1 truncate text-[11px] italic text-violet-700">… {voiceInterim}</p>
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="truncate text-[9.5px] text-slate-500">
                  {voiceHint
                    ? <span className="font-bold text-indigo-700">✓ {voiceHint}</span>
                    : (lang === 'ta'
                        ? 'குரல் கட்டளை: "ஓவர்" அனுப்ப · "அழி" நீக்க · "கடைசி அழி" பின்செல்ல · "replace X with Y" திருத்த'
                        : 'Voice edit: say "over" to send · "delete" to clear · "undo" last · "replace X with Y"')}
                </p>
              </div>
            </div>
          )}
          {(status || note) && phase !== 'listening' && (
            <div className="border-t border-slate-100 bg-white px-3 py-1 text-[11px]">
              {status && <span className="font-semibold text-red-600">{status}</span>}
              {note && !status && <span className="text-slate-500">{note}</span>}
            </div>
          )}
          <form className="flex items-center gap-2 border-t border-slate-100 bg-white/95 backdrop-blur-md p-2.5 shadow-sm" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <button type="button" onClick={toggleMic} aria-pressed={handsFree} aria-label={handsFree ? 'Turn the microphone off' : 'Talk using the microphone'}
              title={handsFree ? 'Voice recording is active (click to pause)' : 'Talk using the microphone'}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all ${handsFree ? 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/35 ring-4 ring-rose-100 animate-pulse' : 'border border-slate-200/90 bg-white text-slate-600 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 shadow-xs'}`}>
              {phase === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/30" />}
              <Mic size={16} className="relative" />
            </button>
            <button type="button" onClick={() => {
              const v = !overMode;
              setOverMode(v);
              overRef.current = v;
              store.set('help.over.v2', v ? '1' : '0');
              overHit.current = false;
              if (phase === 'listening') listenRef.current();
            }} aria-pressed={overMode}
              title={overMode ? 'OVER mode ON: message sends ONLY when you say "over" / "ஓவர்" (click to turn off)' : 'OVER mode OFF: sends automatically when you pause (click to turn ON)'}
              className={`h-10 shrink-0 rounded-full px-3 text-[10.5px] font-black uppercase tracking-wider transition-all ${overMode ? 'bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white shadow-md shadow-violet-500/30 ring-1 ring-white/30' : 'border border-slate-200/90 bg-white text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-slate-50'}`}>{overMode ? 'OVER ✓' : 'OVER'}</button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={lang === 'ta' ? 'உங்கள் கேள்வியை எழுதுங்கள்…' : 'Type your question…'} aria-label="Your question"
              className="h-10 min-w-0 flex-1 rounded-full border border-slate-200/90 bg-slate-50/80 px-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none shadow-inner transition-all" />
            <button type="submit" disabled={(!input.trim() && !voiceDraft.trim()) || phase === 'thinking'} aria-label="Send" title="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-35 disabled:hover:scale-100"><Send size={15} /></button>
          </form>
          </>
          </div>
          )}
          </div>
        </div>,
        document.body,
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
