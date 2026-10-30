import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bot, CheckCircle2, Languages, Loader2, Mic, MicOff, Send, Volume2, VolumeX, X,
  Key, Sparkles, Search, ChevronDown, ChevronUp, Edit3, Trash2, PlusCircle, RefreshCw,
  ArrowRight, Check, HelpCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getBreadcrumbs } from '@/config/navigation';
import { say, stopSpeaking, offlineAnswer } from '@/components/HelpAssistant';
import {
  findRecords, previewAction, runAction, fetchPipelineSummary, explainRecordStage,
  saveStageRecord, moveStageRecord, type ActionCtx, type Preview, type PipelineItem
} from '@/lib/copilot/actions';
import {
  ACTION_INTENTS, FIELD_QUESTION, missingOf, resolvePage, understandLocal,
  type Intent, type Params, type Pending, type Understood,
} from '@/lib/copilot/understand';
import {
  analyzeWithChatGPT, getOpenAIApiKey, setOpenAIApiKey, extractStageFieldsWithChatGPT,
  type PipelineCardSummary
} from '@/lib/copilot/openai';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;
type Lang = 'ta' | 'tanglish' | 'en';
const ls = {
  get: (k: string, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const readLang = (): Lang => {
  const v = ls.get('argus.copilot.lang') || ls.get('help.vlang');
  return v === 'ta' || v === 'tanglish' ? v : 'en';
};

export const STAGE_ALIASES: Record<string, RegExp> = {
  enquiry: /\b(?:enquiry|enquiries|inquiry|inquiries|new enquiry|lead|leads|என்குயரி)\b/i,
  quotation: /\b(?:quotation|quotations|quote|quotes|கொட்டேஷன்)\b/i,
  sales_order: /\b(?:sales\s*order|order|orders|sales|so|சேல்ஸ்\s*ஆர்டர்|ஆர்டர்)\b/i,
  inward: /\b(?:inward|inwards|inwarding|இன்வார்ட்)\b/i,
  finished_goods: /\b(?:finished\s*goods|finish\s*goods|finished\s*good|finish\s*good|fg|finishing\s*goods|finshed\s*goods|பினிஷ்ட்\s*கூட்ஸ்)\b/i,
  rejected: /\b(?:rejected|reject|rejections?|ரிஜெக்ட்)\b/i,
  dc: /\b(?:delivery\s*challan|challan|dc|டெலிவரி\s*சலான்|சலான்)\b/i,
  invoice: /\b(?:invoice|invoices|bill|billing|inv|இன்வாய்ஸ்|பில்)\b/i,
};

export interface PipelineBox {
  id: string;
  name: string;
  nameTa: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  isNewOnly?: boolean;
  sourceStageId: string | null;
  sourceStageName: string | null;
  sourceStageNameTa: string | null;
  fields: Array<{
    key: string;
    label: string;
    labelTa: string;
    icon: string;
    required: boolean;
    example: string;
  }>;
}

export const PIPELINE_8_BOXES: PipelineBox[] = [
  {
    id: 'enquiry',
    name: 'Enquiry',
    nameTa: 'என்குயரி',
    icon: '📥',
    color: 'text-blue-700',
    bg: 'bg-blue-50/90 hover:bg-blue-100',
    border: 'border-blue-200',
    isNewOnly: true,
    sourceStageId: null,
    sourceStageName: null,
    sourceStageNameTa: null,
    fields: [
      { key: 'customer', label: 'Customer / Company', labelTa: 'வாடிக்கையாளர்', icon: '🏢', required: true, example: 'Apple Tech' },
      { key: 'part_name', label: 'Part / Product Name', labelTa: 'பாகம் பெயர்', icon: '⚙️', required: true, example: 'Flicker' },
      { key: 'quantity', label: 'Quantity', labelTa: 'அளவு', icon: '🔢', required: true, example: '50' },
      { key: 'price', label: 'Target Price / Est. Value', labelTa: 'விலை', icon: '💰', required: false, example: '₹120' },
      { key: 'remarks', label: 'Remarks / Notes', labelTa: 'குறிப்பு', icon: '📝', required: false, example: 'Tolerance +/-0.02' },
    ],
  },
  {
    id: 'quotation',
    name: 'Quotation',
    nameTa: 'கொட்டேஷன்',
    icon: '📜',
    color: 'text-purple-700',
    bg: 'bg-purple-50/90 hover:bg-purple-100',
    border: 'border-purple-200',
    isNewOnly: false,
    sourceStageId: 'enquiry',
    sourceStageName: 'Enquiry',
    sourceStageNameTa: 'என்குயரி',
    fields: [
      { key: 'price', label: 'Unit Rate / Price', labelTa: 'யூனிட் விலை', icon: '💵', required: true, example: '₹120 / piece' },
      { key: 'validity', label: 'Validity Period', labelTa: 'செல்லுபடியாகும் காலம்', icon: '📅', required: false, example: '30 Days' },
      { key: 'payment_terms', label: 'Payment Terms', labelTa: 'கட்டண விதிமுறைகள்', icon: '📝', required: false, example: '30 Days Net' },
      { key: 'remarks', label: 'Quotation Remarks', labelTa: 'குறிப்பு', icon: '📋', required: false, example: 'Standard terms' },
    ],
  },
  {
    id: 'sales_order',
    name: 'Sales Order',
    nameTa: 'சேல்ஸ் ஆர்டர்',
    icon: '📦',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50/90 hover:bg-emerald-100',
    border: 'border-emerald-200',
    isNewOnly: false,
    sourceStageId: 'quotation',
    sourceStageName: 'Quotation',
    sourceStageNameTa: 'கொட்டேஷன்',
    fields: [
      { key: 'po_no', label: 'Customer PO Number', labelTa: 'PO எண்', icon: '📄', required: true, example: 'PO-2026-88' },
      { key: 'delivery_date', label: 'Delivery Due Date', labelTa: 'டெலிவரி தேதி', icon: '📅', required: true, example: '15 Nov 2026' },
      { key: 'price', label: 'Confirmed Unit Price', labelTa: 'உறுதிசெய்த விலை', icon: '💰', required: false, example: '₹120' },
      { key: 'remarks', label: 'Order Notes', labelTa: 'ஆர்டர் குறிப்பு', icon: '📝', required: false, example: 'Urgent delivery' },
    ],
  },
  {
    id: 'inward',
    name: 'Inward',
    nameTa: 'இன்வார்ட்',
    icon: '🏭',
    color: 'text-amber-700',
    bg: 'bg-amber-50/90 hover:bg-amber-100',
    border: 'border-amber-200',
    isNewOnly: false,
    sourceStageId: 'sales_order',
    sourceStageName: 'Sales Order',
    sourceStageNameTa: 'சேல்ஸ் ஆர்டர்',
    fields: [
      { key: 'inward_no', label: 'Inward / DC Number', labelTa: 'இன்வார்ட் எண்', icon: '📄', required: true, example: 'INW-5021' },
      { key: 'heat_no', label: 'Heat / Batch Number', labelTa: 'ஹீட் / பேட்ச் எண்', icon: '🏷️', required: false, example: 'HT-2026-A' },
      { key: 'received_qty', label: 'Received Quantity', labelTa: 'பெறப்பட்ட அளவு', icon: '🔢', required: false, example: '50' },
      { key: 'remarks', label: 'Material Notes', labelTa: 'பொருள் குறிப்பு', icon: '📝', required: false, example: 'Aluminium 6061' },
    ],
  },
  {
    id: 'finished_goods',
    name: 'Finished Goods',
    nameTa: 'ஃபினிஷ்ட் கூட்ஸ்',
    icon: '✅',
    color: 'text-teal-700',
    bg: 'bg-teal-50/90 hover:bg-teal-100',
    border: 'border-teal-200',
    isNewOnly: false,
    sourceStageId: 'inward',
    sourceStageName: 'Inward',
    sourceStageNameTa: 'இன்வார்ட்',
    fields: [
      { key: 'quantity', label: 'Finished Quantity', labelTa: 'முடிக்கப்பட்ட அளவு', icon: '🔢', required: true, example: '50' },
      { key: 'batch_no', label: 'Batch / Lot No', labelTa: 'பேட்ச் எண்', icon: '🏷️', required: false, example: 'BATCH-01' },
      { key: 'location', label: 'Bin / Rack Location', labelTa: 'சேமிப்பு இடம்', icon: '📍', required: false, example: 'Rack 2' },
      { key: 'remarks', label: 'QC Status', labelTa: 'QC தரம்', icon: '📝', required: false, example: 'Passed 100%' },
    ],
  },
  {
    id: 'rejected',
    name: 'Rejected',
    nameTa: 'ரிஜெக்டட்',
    icon: '⚠️',
    color: 'text-rose-700',
    bg: 'bg-rose-50/90 hover:bg-rose-100',
    border: 'border-rose-200',
    isNewOnly: false,
    sourceStageId: 'inward',
    sourceStageName: 'Inward / Production',
    sourceStageNameTa: 'இன்வார்ட் / தயாரிப்பு',
    fields: [
      { key: 'quantity', label: 'Rejected Quantity', labelTa: 'ரிஜெக்ட் அளவு', icon: '🔢', required: true, example: '2' },
      { key: 'reason', label: 'Defect Reason', labelTa: 'காரணம்', icon: '❌', required: true, example: 'Dimension oversize' },
      { key: 'disposition', label: 'Action / Disposition', labelTa: 'நடவடிக்கை', icon: '🛠️', required: false, example: 'Scrap / Return to Vendor' },
    ],
  },
  {
    id: 'dc',
    name: 'Delivery Challan',
    nameTa: 'டெலிவரி சலான்',
    icon: '🚚',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50/90 hover:bg-indigo-100',
    border: 'border-indigo-200',
    isNewOnly: false,
    sourceStageId: 'finished_goods',
    sourceStageName: 'Finished Goods',
    sourceStageNameTa: 'ஃபினிஷ்ட் கூட்ஸ்',
    fields: [
      { key: 'dc_no', label: 'Delivery Challan No', labelTa: 'DC எண்', icon: '📄', required: true, example: 'DC-2026-55' },
      { key: 'vehicle_no', label: 'Vehicle / Transport No', labelTa: 'வாகன எண்', icon: '🚛', required: false, example: 'TN-37-AB-1234' },
      { key: 'quantity', label: 'Dispatched Quantity', labelTa: 'அனுப்பிய அளவு', icon: '🔢', required: true, example: '50' },
      { key: 'remarks', label: 'Transport Notes', labelTa: 'போக்குவரத்து குறிப்பு', icon: '📝', required: false, example: 'By direct tempo' },
    ],
  },
  {
    id: 'invoice',
    name: 'Invoice',
    nameTa: 'இன்வாய்ஸ்',
    icon: '🧾',
    color: 'text-cyan-700',
    bg: 'bg-cyan-50/90 hover:bg-cyan-100',
    border: 'border-cyan-200',
    isNewOnly: false,
    sourceStageId: 'dc',
    sourceStageName: 'Delivery Challan',
    sourceStageNameTa: 'டெலிவரி சலான்',
    fields: [
      { key: 'invoice_no', label: 'Invoice Number', labelTa: 'இன்வாய்ஸ் எண்', icon: '📄', required: true, example: 'INV-2026-104' },
      { key: 'amount', label: 'Total Invoice Amount', labelTa: 'மொத்த தொகை', icon: '💰', required: true, example: '₹6,000' },
      { key: 'due_date', label: 'Payment Due Date', labelTa: 'செலுத்த வேண்டிய தேதி', icon: '📅', required: false, example: '30 Days' },
      { key: 'payment_terms', label: 'Payment Terms', labelTa: 'கட்டண விதிமுறைகள்', icon: '📝', required: false, example: 'Immediate / NEFT' },
    ],
  },
];

/** Fast local regex extractor as fallback when offline or no API key */
function extractStageFieldsLocal(text: string): Record<string, any> {
  const clean = text.trim();
  const res: Record<string, any> = {};

  const custM = /(?:customer|company|party|client|for|கஸ்டமர்|கம்பெனி)\s*(?:is|name|as|:)?\s*([A-Za-z0-9\s&.\-]+?)(?=\s*(?:part|product|item|qty|quantity|price|rate|value|po|order|date|பார்ட்|விலை|$))/i.exec(clean);
  if (custM && custM[1].trim()) res.customer = custM[1].trim();

  const partM = /(?:part|product|item|material|பார்ட்|பொருள்)\s*(?:is|name|as|:)?\s*([A-Za-z0-9\s&.\-]+?)(?=\s*(?:qty|quantity|price|rate|value|po|customer|company|date|விலை|$))/i.exec(clean);
  if (partM && partM[1].trim()) res.part_name = partM[1].trim();

  const qtyM = /(?:qty|quantity|quantities|count|pieces|pcs|அளவு|எண்ணிக்கை)\s*(?:is|are|as|to|:|=)?\s*(\d+(?:\.\d+)?)/i.exec(clean);
  if (qtyM) res.quantity = Number(qtyM[1]);

  const priceM = /(?:price|rate|value|cost|amount|விலை|தொகை|ரூபாய்|rs\.?|₹)\s*(?:is|are|as|to|:|=)?\s*(\d+(?:\.\d+)?)/i.exec(clean);
  if (priceM) res.price = Number(priceM[1]);

  const poM = /(?:po|order|p\.o\.)\s*(?:no|number)?\s*[:\-=]?\s*([A-Za-z0-9\-_]+)/i.exec(clean);
  if (poM) res.po_no = poM[1].trim();

  const dateM = /(?:delivery|due|expected|valid)?\s*(?:date|on|by|till|தேதி)\s*[:\-=]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[A-Za-z0-9\s]+?(?=\s*(?:qty|price|po|notes|$)))/i.exec(clean);
  if (dateM && dateM[1].trim()) res.delivery_date = dateM[1].trim();

  const inwM = /(?:inward|challan|inw)\s*(?:no|number)?\s*[:\-=]?\s*([A-Za-z0-9\-_]+)/i.exec(clean);
  if (inwM) res.inward_no = inwM[1].trim();

  const heatM = /(?:heat|batch|lot)\s*(?:no|number)?\s*[:\-=]?\s*([A-Za-z0-9\-_]+)/i.exec(clean);
  if (heatM) res.heat_no = heatM[1].trim();

  const dcM = /(?:dc|delivery\s*challan)\s*(?:no|number)?\s*[:\-=]?\s*([A-Za-z0-9\-_]+)/i.exec(clean);
  if (dcM) res.dc_no = dcM[1].trim();

  const vehM = /(?:vehicle|lorry|truck|van|transport)\s*(?:no|number)?\s*[:\-=]?\s*([A-Za-z0-9\s\-_]+)/i.exec(clean);
  if (vehM) res.vehicle_no = vehM[1].trim();

  const invM = /(?:invoice|inv|bill)\s*(?:no|number)?\s*[:\-=]?\s*([A-Za-z0-9\-_]+)/i.exec(clean);
  if (invM) res.invoice_no = invM[1].trim();

  const rsnM = /(?:reason|defect|cause|problem|காரணம்)\s*[:\-=]?\s*([A-Za-z0-9\s\-_]+)/i.exec(clean);
  if (rsnM) res.reason = rsnM[1].trim();

  const valM = /(?:validity|valid|validity period|valid for|செல்லுபடியாகும்)\s*[:\-=]?\s*([0-9]+\s*(?:days|day|months|month|weeks|week)|[A-Za-z0-9\s]+?)(?=\s*(?:price|rate|payment|terms|notes|remarks|$))/i.exec(clean);
  if (valM && valM[1].trim()) res.validity = valM[1].trim();

  const payM = /(?:payment\s*terms?|payment|terms|கட்டண)\s*[:\-=]?\s*([A-Za-z0-9\s&.\-]+?)(?=\s*(?:validity|price|rate|notes|remarks|$))/i.exec(clean);
  if (payM && payM[1].trim()) res.payment_terms = payM[1].trim();

  const remM = /(?:remarks?|notes?|comment|குறிப்பு)\s*[:\-=]?\s*([A-Za-z0-9\s&.\-]+)$/i.exec(clean);
  if (remM && remM[1].trim()) res.remarks = remM[1].trim();

  // If price not found by prefix, extract standalone numbers (e.g. "120" or "120 rupees")
  if (!res.price) {
    const rawNumM = /(?:^|\s)(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:rs|rupees|inr|per|\/)?(?:\s|$)/i.exec(clean);
    if (rawNumM) res.price = Number(rawNumM[1]);
  }

  return res;
}

/**
 * Wake word: "Hello CNC", "Hey CNC", "Hi C N C", "வணக்கம் சிஎன்சி" ... The speech engine often writes CNC as "see and see",
 * "science", "C N C" or "cmc", so those are accepted too. Returns what was said after the wake word.
 * (No \b here: it does not work next to Tamil letters, so spaces / end of text are used instead.)
 */
const WAKE_GREET = '(?:hello|hallo|helo|hullo|hey|hi|hai|ok|okay|ஹலோ|ஹாய்|ஹெலோ|வணக்கம்)';
const WAKE_NAME = '(?:c\\s*n\\s*c|cnc|c\\s*and\\s*c|see\\s*and\\s*see|see\\s*n\\s*see|seen\\s*see|sin\\s*see|sien\\s*see|sience|science|sienci|cmc|cfc|snc|cnn|csc|சி\\s*என்\\s*சி|சிஎன்சி|சிஎன்ஸி|சீ\\s*என்\\s*சீ)';
const WAKE_ONLY = '(?:c\\s*n\\s*c|cnc|சி\\s*என்\\s*சி|சிஎன்சி|சிஎன்ஸி)';
const WAKE_AFTER_GREET = new RegExp(`(?:^|\\s)${WAKE_GREET}\\s+${WAKE_NAME}(?=\\s|$)\\s*(.*)$`, 'iu');
const WAKE_ALONE = new RegExp(`^${WAKE_ONLY}(?=\\s|$)\\s*(.*)$`, 'iu');
export function checkWakeWord(raw: string): { matched: boolean; trailing: string } {
  if (!raw) return { matched: false, trailing: '' };
  const clean = raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,/#!$%^*;:{}=\-_'"()?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = WAKE_AFTER_GREET.exec(clean) || WAKE_ALONE.exec(clean);
  if (!m) {
    // Last resort: a greeting followed by up to three sounds that read like "C-N-C" however the engine spelled them
    // ("seen see", "sen sea", "see and see", "sin si").
    const toks = clean.split(' ');
    const greet = new RegExp(`^${WAKE_GREET}$`, 'iu');
    const phon = /^(?:c|s|se+|sea|si+|ci)(?:n|and|en|in|an|nd|end)(?:c|s|se+|sea|si+|ci|ck|k)$/;
    for (let i = 0; i < toks.length - 1; i++) {
      if (!greet.test(toks[i])) continue;
      for (let n = 1; n <= 3 && i + n < toks.length; n++) {
        if (phon.test(toks.slice(i + 1, i + 1 + n).join(''))) return { matched: true, trailing: toks.slice(i + 1 + n).join(' ') };
      }
    }
    return { matched: false, trailing: '' };
  }
  // The command after the wake word is taken from what was really said, so capitals and punctuation
  // ("A-1 Tools Pvt. Ltd") survive: find the shortest run of words that already contains the wake phrase.
  const words = raw.trim().split(/\s+/);
  for (let k = 1; k <= Math.min(words.length, 8); k++) {
    const head = words.slice(0, k).join(' ').toLowerCase().replace(/&/g, ' and ').replace(/[.,/#!$%^*;:{}=\-_'"()?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (WAKE_AFTER_GREET.test(head) || WAKE_ALONE.test(head)) return { matched: true, trailing: words.slice(k).join(' ').replace(/^[\s,.!?;:-]+/, '').trim() };
  }
  return { matched: true, trailing: (m[1] || '').trim() };
}

/** Requests microphone permission via getUserMedia */
async function requestMicPermission(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    }
  } catch (err) {
    console.warn('Microphone permission request:', err);
  }
  return false;
}

/** Plays a two-tone synth chime when wake word is detected */
function playWakeChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.35);
  } catch {
    // Ignore audio autoplay errors
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

  // Active 8-Box Stage Selection (Enquiry, Sales Order, Inward, etc.)
  const [activeAddStage, setActiveAddStage] = useState<string | null>(null);
  const activeAddStageRef = useRef<string | null>(null);
  activeAddStageRef.current = activeAddStage;

  // Selected Card from Previous Stage for Stage Transition (e.g. Quotation to advance to Sales Order)
  const [selectedSourceCard, setSelectedSourceCard] = useState<PipelineItem | null>(null);
  const selectedSourceCardRef = useRef<PipelineItem | null>(null);
  selectedSourceCardRef.current = selectedSourceCard;

  // Transition Preview before Confirmation (Source Card + Target Stage + Extra Fields)
  const [transitionPreview, setTransitionPreview] = useState<{
    sourceCard: PipelineItem;
    targetBox: PipelineBox;
    extraFields: Record<string, any>;
  } | null>(null);

  // Last extracted stage preview before save (for new enquiry)
  const [extractedPreview, setExtractedPreview] = useState<{
    stage: PipelineBox;
    fields: Record<string, any>;
  } | null>(null);

  // Microphones and listening state
  const recRef = useRef<any>(null);
  const [speechLang, setSpeechLang] = useState<'en-IN' | 'ta-IN'>(() => {
    try {
      const saved = localStorage.getItem('argus.copilot.speechLang');
      if (saved === 'ta-IN' || saved === 'en-IN') return saved;
    } catch {}
    return 'en-IN'; // Default Indian English: recognizes English ERP stage names and numbers accurately
  });
  const speechLangRef = useRef<'en-IN' | 'ta-IN'>('en-IN');
  speechLangRef.current = speechLang;
  const [micMuted, setMicMuted] = useState(false);
  const micMutedRef = useRef(false);
  micMutedRef.current = micMuted;
  const [micError, setMicError] = useState<string | null>(null);
  const [speechStatusText, setSpeechStatusText] = useState<string>('Ready');
  const [showMicTester, setShowMicTester] = useState(false);
  const [micTestRunning, setMicTestRunning] = useState(false);
  const [micTestVol, setMicTestVol] = useState(0);
  const [micTestDevice, setMicTestDevice] = useState<string>('');
  const [micTestResult, setMicTestResult] = useState<{ hwOk: boolean; peakVol: number; speechHeard: string; error?: string } | null>(null);
  const speakingRef = useRef(false);
  const otherModeActiveRef = useRef(false);
  const autoSubmitTimerRef = useRef<any>(null);
  const openRef = useRef(open);
  openRef.current = open;

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

  const endRef = useRef<HTMLDivElement>(null);
  const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const ta = lang === 'ta';
  const L = useCallback((en: string, tm: string) => (ta ? tm : en), [ta]);

  // Toggle speech recognition language between Indian English and Tamil
  const toggleSpeechLang = useCallback(() => {
    const next = speechLang === 'en-IN' ? 'ta-IN' : 'en-IN';
    setSpeechLang(next);
    speechLangRef.current = next;
    try { localStorage.setItem('argus.copilot.speechLang', next); } catch {}
    { const old = recRef.current; recRef.current = null; if (old) { try { old.onend = null; old.abort(); } catch {} } }
    setListening(false);
    setTimeout(() => {
      startRecognitionRef.current();
    }, 200);
  }, [speechLang]);

  // Request browser microphone permission without holding conflicting hardware audio stream
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release hardware track immediately so webkitSpeechRecognition has exclusive access
        stream.getTracks().forEach((t) => t.stop());
        setMicError(null);
        return true;
      }
    } catch (err: any) {
      console.warn('Microphone permission request error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError(L(
          'Microphone permission blocked. Please allow mic in browser address bar (lock icon).',
          'மைக் அனுமதி தடுக்கப்பட்டுள்ளது. உலாவி முகவரிப் பட்டியில் அனுமதிக்கவும்.'
        ));
      }
    }
    return false;
  }, [L]);

  // Interactive Microphone Hardware & Speech Diagnostics Tool
  const runMicTest = useCallback(async () => {
    setShowMicTester(true);
    setMicTestRunning(true);
    setMicTestResult(null);
    setMicTestVol(0);
    setMicTestDevice('Checking audio device...');

    if (recRef.current) {
      try { recRef.current.abort(); } catch {}
      recRef.current = null;
    }
    setListening(false);

    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let animId: number | null = null;
    let peak = 0;
    let heardText = '';
    let speechErr = '';

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone API not supported in this browser.');
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getAudioTracks();
      const devName = tracks[0]?.label || 'Default Windows Microphone';
      setMicTestDevice(devName);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);

        const poll = () => {
          analyser.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i];
          const avg = sum / buf.length;
          const cur = Math.min(100, Math.round((avg / 128) * 100));
          if (cur > peak) peak = cur;
          setMicTestVol(cur);
          animId = requestAnimationFrame(poll);
        };
        animId = requestAnimationFrame(poll);
      }

      // Test Speech Recognition simultaneously
      if (SR) {
        try {
          const testRec = new SR();
          testRec.lang = speechLangRef.current;
          testRec.interimResults = true;
          testRec.continuous = false;
          testRec.onresult = (ev: any) => {
            const tr = ev.results[0]?.[0]?.transcript || '';
            if (tr) heardText = tr;
          };
          testRec.onerror = (ev: any) => {
            speechErr = ev.error || 'speech error';
          };
          testRec.start();
          setTimeout(() => {
            try { testRec.stop(); } catch {}
          }, 3500);
        } catch (e: any) {
          speechErr = e.message || 'speech init failed';
        }
      }

      // 4-second test duration
      await new Promise((resolve) => setTimeout(resolve, 4000));
    } catch (err: any) {
      speechErr = err.message || 'Permission denied';
    } finally {
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx) {
        try { audioCtx.close(); } catch {}
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setMicTestRunning(false);
      setMicTestVol(0);
      setMicTestResult({
        hwOk: peak > 4,
        peakVol: peak,
        speechHeard: heardText,
        error: speechErr,
      });

      // Resume regular recognition loop after diagnostic
      setTimeout(() => {
        if (!micMutedRef.current) {
          startRecognitionRef.current();
        }
      }, 300);
    }
  }, [SR]);

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
  }, [msgs, awaiting, busy, extractedPreview, activeAddStage]);

  // ---- Microphone state shared by the listener below. ONE recogniser may run at a time.
  const startRecognitionRef = useRef<() => void>(() => {});
  const restartTimerRef = useRef<any>(null);
  const pausedByRef = useRef<Set<string>>(new Set());   // other assistant modes that need the microphone
  const startedOnceRef = useRef(false);                 // the first click has happened, listening may start
  const haltedRef = useRef(false);                      // stopped on purpose after repeated errors (a click restarts it)
  const netFailRef = useRef(0);
  const lastSpokenRef = useRef('');
  const busyRef = useRef(false);

  const abortRec = useCallback(() => {
    clearTimeout(restartTimerRef.current);
    const r = recRef.current;
    recRef.current = null;
    if (r) { try { r.onend = null; r.onresult = null; r.onerror = null; r.abort(); } catch { /* ignore */ } }
  }, []);
  const scheduleRestart = useCallback((ms: number) => {
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => startRecognitionRef.current(), ms);
  }, []);

  // Adviser and Teaching use the microphone / speakers too: Co-worker steps aside while they run, then resumes.
  useEffect(() => {
    const handleMode = (e: Event) => {
      const d = (e as CustomEvent<{ mode: string; on: boolean }>).detail;
      if (!d || d.mode === 'coworker') return;
      if (d.on) {
        pausedByRef.current.add(d.mode);
        abortRec();
        setListening(false);
      } else if (pausedByRef.current.delete(d.mode) && pausedByRef.current.size === 0 && startedOnceRef.current) {
        scheduleRestart(500);
      }
    };
    window.addEventListener('argus:mode', handleMode);
    return () => window.removeEventListener('argus:mode', handleMode);
  }, [abortRec, scheduleRestart]);

  // Forward refs for closures
  const submitRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const handleWakeActivationRef = useRef<(trailing?: string) => void>(() => {});

  const currentSpeakingTextRef = useRef<string>('');

  // Safe voice output without destroying continuous recognition
  const speakText = useCallback((text: string, onDone?: () => void) => {
    if (!speak || !text) {
      onDone?.();
      return;
    }
    speakingRef.current = true;
    currentSpeakingTextRef.current = text.toLowerCase();
    lastSpokenRef.current = text.toLowerCase();

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      // 400ms acoustic echo cooldown so speaker output dies down before mic unblocks
      setTimeout(() => {
        speakingRef.current = false;
        currentSpeakingTextRef.current = '';
        onDone?.();
      }, 400);
    };

    // Safety timeout in case speech engine hangs
    const safetyMs = Math.min(20000, Math.max(3000, text.length * 85));
    const safetyTimer = setTimeout(cleanup, safetyMs);

    say(
      text,
      () => {
        clearTimeout(safetyTimer);
        cleanup();
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

  // Helper to filter cards from previous stage
  const getSourceCardsForStage = useCallback((box: PipelineBox, cards: PipelineItem[]): PipelineItem[] => {
    if (box.isNewOnly || !box.sourceStageId) return [];

    const srcId = box.sourceStageId.toLowerCase();
    const matched = cards.filter((c) => {
      const st = (c.stage || '').toLowerCase();
      const tp = (c.type || '').toLowerCase();

      if (srcId === 'enquiry') {
        return tp === 'enquiry' || st.includes('enquiry') || st === 'new';
      }
      if (srcId === 'quotation') {
        return tp === 'quotation' || st.includes('quot');
      }
      if (srcId === 'sales_order') {
        return tp === 'sales_order' || st.includes('order') || st.includes('sales');
      }
      if (srcId === 'inward') {
        return tp === 'inward' || st.includes('inward') || tp === 'sales_order';
      }
      if (srcId === 'finished_goods') {
        return st.includes('finished') || tp === 'sales_order' || tp === 'inward';
      }
      if (srcId === 'dc') {
        return tp === 'dc' || st.includes('dc') || st.includes('deliver');
      }
      return false;
    });

    if (matched.length > 0) return matched;
    return cards.slice(0, 8);
  }, []);

  // Handle stage selection (Step 1 -> Step 2)
  const selectStage = useCallback((stageId: string) => {
    const box = PIPELINE_8_BOXES.find((b) => b.id === stageId) || PIPELINE_8_BOXES[0];
    setActiveAddStage(box.id);
    activeAddStageRef.current = box.id;
    setSelectedSourceCard(null);
    selectedSourceCardRef.current = null;
    setTransitionPreview(null);
    setExtractedPreview(null);

    if (box.isNewOnly) {
      const announcement = L(
        `Selected Enquiry. You can add this newly! Tell me in your voice: Customer, Part name, and Quantity.`,
        `Enquiry தேர்ந்தெடுக்கப்பட்டது. புதிதாகச் சேர்க்கலாம்! கஸ்டமர், பாகம் பெயர், அளவு போன்ற விவரங்களை மைக் மூலம் சொல்லுங்கள்.`
      );
      add({ role: 'ai', text: announcement }, true);
    } else {
      const prevName = box.sourceStageName || 'Previous Stage';
      const prevNameTa = box.sourceStageNameTa || 'முந்தைய நிலை';
      const announcement = L(
        `Selected ${box.name}. To advance to ${box.name}, please choose one ${prevName} from the list below (or speak its card number/customer). Then tell me the extra details!`,
        `${box.nameTa} தேர்ந்தெடுக்கப்பட்டது. ${box.nameTa}-க்கு நகர்த்த கீழே உள்ள ${prevNameTa} பட்டியலிலிருந்து ஒன்றைத் தேர்ந்தெடுக்கவும்.`
      );
      add({ role: 'ai', text: announcement }, false);
      if (speak) {
        speakText(L(`Selected ${box.name}. Please choose one ${prevName}.`, `${box.nameTa} தேர்ந்தெடுக்கப்பட்டது. ஒன்றை தேர்ந்தெடுக்கவும்.`));
      }
    }
  }, [add, L]);

  // Handle source card selection (Step 2A -> Step 2B)
  const selectSourceCard = useCallback((card: PipelineItem) => {
    setSelectedSourceCard(card);
    selectedSourceCardRef.current = card;
    setTransitionPreview(null);

    const targetBox = PIPELINE_8_BOXES.find((b) => b.id === activeAddStageRef.current);
    if (!targetBox) return;

    const extraFieldsDesc = targetBox.fields.map((f) => (ta ? f.labelTa : f.label)).join(', ');
    const announcement = L(
      `Selected #${card.refNo} for ${card.customer} (${card.part}, Qty: ${card.qty}). Now please speak the extra details into the mic: ${extraFieldsDesc}.`,
      `#${card.refNo} (${card.customer}) தேர்ந்தெடுக்கப்பட்டது. இப்போது கூடுதல் விவரங்களை மைக் மூலம் சொல்லுங்கள்: ${extraFieldsDesc}.`
    );

    // Speak a short 2-second prompt so the user can speak immediately into the mic without waiting!
    add({ role: 'ai', text: announcement }, false);
    if (speak) {
      speakText(L(`Selected ${card.refNo}. Please speak the extra details.`, `${card.refNo} தேர்ந்தெடுக்கப்பட்டது. விவரங்களைச் சொல்லுங்கள்.`));
    }
  }, [add, L, ta]);

  // Execute stage move transition after confirmation
  const executeMoveTransition = useCallback(async () => {
    if (!transitionPreview) return;
    const { sourceCard, targetBox, extraFields } = transitionPreview;
    setBusy(true);
    try {
      const res = await moveStageRecord(sourceCard, targetBox.id, extraFields, ctx);
      setTransitionPreview(null);
      setSelectedSourceCard(null);
      selectedSourceCardRef.current = null;
      setActiveAddStage(null);
      activeAddStageRef.current = null;

      add({
        role: 'ai',
        text: res.ok ? `✓ ${res.message}` : `⚠ ${res.message}`,
        go: res.where,
        error: !res.ok,
      }, true);

      window.dispatchEvent(new CustomEvent('argus:data-changed'));
      void loadPipeline();
    } catch (err: any) {
      add({ role: 'ai', text: `⚠ Error: ${err.message}`, error: true });
    } finally {
      setBusy(false);
    }
  }, [transitionPreview, ctx, add, loadPipeline]);

  // Opens the panel for the wake word (without speaking yet: the person may still be saying the command).
  const wakeOpen = useCallback(() => {
    playWakeChime();
    setMicMuted(false);
    micMutedRef.current = false;
    haltedRef.current = false;
    setMicError(null);
    greetedRef.current = true;
    setOpen(true);
  }, []);

  // One recognition run = one utterance. Every handler checks `mine()`, so a late event from an old, aborted run can never
  // clear or restart the current one (that cross-talk is what used to stop the microphone hearing anything).
  const startRecognition = useCallback(() => {
    if (!SR || micMutedRef.current || haltedRef.current || pausedByRef.current.size > 0) return;
    if (recRef.current) return;   // already listening: never start a second recogniser

    const r = new SR();
    r.lang = speechLangRef.current;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 3;

    const startedAt = Date.now();
    let finalText = '';
    let interimText = '';
    let errored = '';
    let woke = false;
    let wakeAlt: { matched: boolean; trailing: string } | null = null;
    const mine = () => recRef.current === r;
    const langName = () => (speechLangRef.current === 'ta-IN' ? 'Tamil' : 'English');

    r.onstart = () => {
      if (!mine()) return;
      startedOnceRef.current = true;
      setListening(true);
      setMicError(null);
      setSpeechStatusText(`Listening (${langName()})... say "Hello CNC"`);
    };

    r.onresult = (e: any) => {
      if (!mine() || pausedByRef.current.size > 0) return;
      netFailRef.current = 0;
      let fin = '';
      let inter = '';
      for (let i = 0; i < e.results.length; i++) {
        const item = e.results[i];
        const t = String(item[0]?.transcript || '');
        if (item.isFinal) fin += t; else inter += t;
      }
      finalText = fin;
      interimText = inter;
      const spoken = `${fin} ${inter}`.trim();
      if (!spoken) return;

      // 1. Wake word: works from any screen, even when the panel is closed, and interrupts the assistant's own voice.
      let wake = checkWakeWord(spoken);
      let wakeSpoken = spoken;
      if (!wake.matched) {
        // The engine often writes CNC wrongly in its first guess; its other guesses for the same words are tried too.
        const last = e.results[e.results.length - 1];
        for (let j = 1; last && j < last.length; j++) {
          const alt = String(last[j]?.transcript || '');
          const w = alt ? checkWakeWord(alt) : null;
          if (w?.matched) { wake = w; wakeSpoken = alt; break; }
        }
      }
      if (wake.matched) {
        wakeAlt = wake;
        if (!woke) {
          woke = true;
          stopSpeaking();
          speakingRef.current = false;
          wakeOpen();
        }
        if (openRef.current || woke) { setInput(wake.trailing); setSpeechStatusText(`Heard: "${wakeSpoken}"`); }
        return;
      }

      // 2. The assistant's own voice coming back through the speakers is not a command.
      if (speakingRef.current) return;

      // 3. Live typing into the box while the panel is open.
      if (openRef.current) {
        setInput(spoken);
        setSpeechStatusText(`Heard: "${spoken}"`);
      }
    };

    r.onerror = (e: any) => {
      if (!mine()) return;
      errored = String(e?.error || 'error');
      if (errored === 'not-allowed' || errored === 'service-not-allowed') {
        setListening(false);
        setMicMuted(true);
        micMutedRef.current = true;
        setMicError('Microphone blocked. Click the lock icon in the address bar, allow the microphone, then press Retry.');
        setSpeechStatusText('Microphone permission blocked');
      } else if (errored === 'audio-capture') {
        haltedRef.current = true;
        setMicError('No microphone was found. Plug one in or choose it in Windows Sound settings, then press Retry.');
        setSpeechStatusText('No microphone found');
      } else if (errored === 'network') {
        setSpeechStatusText('Speech service not reachable (needs internet)…');
      } else if (errored !== 'no-speech' && errored !== 'aborted') {
        setSpeechStatusText(`Speech error: ${errored}`);
      }
    };

    r.onend = () => {
      if (!mine()) return;
      recRef.current = null;
      setListening(false);

      // What was said: the final text (or, if the engine stopped early, the last interim text).
      const said = (finalText || interimText).trim();
      const own = checkWakeWord(said);
      const wake = own.matched ? own : (wakeAlt ?? own);
      const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      const echo = norm(said).length > 6 && norm(lastSpokenRef.current).includes(norm(said));
      if (!echo && (said.length >= 2 || wake.matched)) {
        const send = (text: string) => {
          const go = () => void submitRef.current(text);
          if (busyRef.current) window.setTimeout(go, 1200); else go();
        };
        if (wake.matched) {
          if (wake.trailing.length >= 2) { setSpeechStatusText(`Submitted: "${wake.trailing}"`); send(wake.trailing); }
          else handleWakeActivationRef.current('');
        } else if (openRef.current) {
          setSpeechStatusText(`Submitted: "${said}"`);
          send(said);
        } else {
          setSpeechStatusText(`Heard "${said}" - not the wake word. Say "Hello CNC" (${langName()})`);
        }
      } else {
        setSpeechStatusText(`Ready (${langName()})`);
      }

      if (micMutedRef.current || haltedRef.current || pausedByRef.current.size > 0) return;

      // Restart for the next utterance. Silence is normal and restarts quickly; errors back off so a broken
      // connection is not hammered; a run that died instantly waits a second.
      let delay = 250;
      if (errored === 'network') {
        netFailRef.current += 1;
        if (netFailRef.current >= 6) {
          haltedRef.current = true;
          setMicError('The speech service cannot be reached. Check the internet connection, then press Retry.');
          setSpeechStatusText('Speech service unreachable');
          return;
        }
        delay = Math.min(8000, 800 * 2 ** (netFailRef.current - 1));
      } else if (Date.now() - startedAt < 400 && !errored) {
        delay = 1000;
      }
      scheduleRestart(delay);
    };

    recRef.current = r;
    try {
      r.start();
    } catch (err) {
      console.warn('r.start() error:', err);
      recRef.current = null;
      setListening(false);
      scheduleRestart(800);
    }
  }, [SR, wakeOpen, scheduleRestart]);

  startRecognitionRef.current = startRecognition;

  // Mic button: mute / unmute. A click is also what lets the browser start listening and what clears a "stopped" state.
  const toggleMicMute = useCallback(async () => {
    if (micMutedRef.current || haltedRef.current) {
      setMicMuted(false);
      micMutedRef.current = false;
      haltedRef.current = false;
      netFailRef.current = 0;
      setMicError(null);
      playWakeChime();
      await requestMicPermission();
      startRecognition();
    } else {
      setMicMuted(true);
      micMutedRef.current = true;
      abortRec();
      setListening(false);
    }
  }, [requestMicPermission, startRecognition, abortRec]);

  // The browser only allows the microphone after the person has used the page: start on the first click or key press.
  useEffect(() => {
    if (!SR) return;
    const onUserGesture = () => {
      if (startedOnceRef.current) { cleanup(); return; }
      if (micMutedRef.current || haltedRef.current) return;
      startRecognitionRef.current();
    };
    const cleanup = () => {
      window.removeEventListener('pointerdown', onUserGesture, true);
      window.removeEventListener('keydown', onUserGesture, true);
    };
    window.addEventListener('pointerdown', onUserGesture, true);
    window.addEventListener('keydown', onUserGesture, true);
    return cleanup;
  }, [SR]);

  // Watchdog: if the listener has died (the browser ended it silently, the tab slept, a restart failed) bring it back;
  // a run that has been "listening" far too long without ending is stuck, so it is restarted too.
  useEffect(() => {
    if (!SR) return;
    const id = window.setInterval(() => {
      if (!startedOnceRef.current || micMutedRef.current || haltedRef.current || pausedByRef.current.size > 0) return;
      if (!recRef.current) startRecognitionRef.current();
    }, 4000);
    return () => window.clearInterval(id);
  }, [SR]);

  // Opening the panel (button, shortcut or wake word) also makes sure the microphone is on.
  useEffect(() => {
    if (open && SR) { startedOnceRef.current = true; startRecognitionRef.current(); }
  }, [open, SR]);

  useEffect(() => { busyRef.current = busy; }, [busy]);

  // Cleanup on unmount
  useEffect(() => () => {
    micMutedRef.current = true;
    stopSpeaking();
    clearTimeout(autoSubmitTimerRef.current);
    abortRec();
  }, [abortRec]);

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
    window.dispatchEvent(new CustomEvent('argus:data-changed'));
    void loadPipeline();
  }, [awaiting, ctx, add, L, loadPipeline]);

  const cancel = useCallback(() => {
    setAwaiting(null);
    setPending(null);
    setExtractedPreview(null);
    add({ role: 'ai', text: L('Cancelled. Nothing was saved.', 'ரத்து செய்யப்பட்டது. எதுவும் சேமிக்கப்படவில்லை.') });
  }, [add, L]);

  // Primary submit handler: Processes voice commands or stage extractions
  const submit = useCallback(async (raw: string) => {
    clearTimeout(autoSubmitTimerRef.current);
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');

    // Check for Wake word triggers typed or spoken directly
    const wake = checkWakeWord(text);
    if (wake.matched) {
      playWakeChime();
      const welcomeMsg = L(
        'Welcome to ERP! Which stage would you like to add data to? (8 stages available)',
        'Welcome to ERP! எந்த stage-ல் தரவைச் சேர்க்க வேண்டும்? (8 நிலைகள் உள்ளன)'
      );
      if (!wake.trailing) {
        add({ role: 'ai', text: welcomeMsg }, true);
        return;
      } else {
        add({ role: 'ai', text: L('Welcome to ERP!', 'Welcome to ERP!') }, true, () => {
          void submitRef.current(wake.trailing);
        });
        return;
      }
    }

    add({ role: 'user', text }, false);

    // If awaiting transition preview confirmation
    if (transitionPreview && YES.test(text)) {
      await executeMoveTransition();
      return;
    }
    if (transitionPreview && NO.test(text)) {
      setTransitionPreview(null);
      add({ role: 'ai', text: L('Stage transition cancelled.', 'நிலை மாற்றம் ரத்து செய்யப்பட்டது.') });
      return;
    }

    // If awaiting preview confirmation
    if (awaiting && YES.test(text)) {
      await confirm();
      return;
    }
    if (awaiting && NO.test(text)) {
      cancel();
      return;
    }
    if (awaiting) setAwaiting(null);

    // Allow user to clear or switch stage by voice
    if (activeAddStageRef.current && /^(?:change stage|switch stage|different stage|back|மாற்று)$/i.test(text)) {
      setActiveAddStage(null);
      activeAddStageRef.current = null;
      setSelectedSourceCard(null);
      selectedSourceCardRef.current = null;
      setTransitionPreview(null);
      setExtractedPreview(null);
      add({
        role: 'ai',
        text: L('Stage cleared. Which of the 8 stages would you like to add to?', 'Stage நீக்கப்பட்டது. மேலே உள்ள 8 பெட்டிகளில் ஒன்றைத் தேர்ந்தெடுக்கவும்.'),
      }, true);
      return;
    }

    // Check if user is asking to select or switch to one of the 8 stages (supports all synonyms and voice typos)
    let stageMatch = PIPELINE_8_BOXES.find((b) => {
      const alias = STAGE_ALIASES[b.id];
      if (alias && alias.test(text)) return true;
      if (new RegExp(`\\b(?:add|create|open|select|choose|சேர்க்க|போட)\\s+${b.id}\\b`, 'i').test(text)) return true;
      if (new RegExp(`\\b${b.name}\\b`, 'i').test(text)) return true;
      if (b.nameTa && new RegExp(`\\b${b.nameTa}\\b`, 'i').test(text)) return true;
      return false;
    });

    if (stageMatch && (!activeAddStageRef.current || stageMatch.id !== activeAddStageRef.current)) {
      selectStage(stageMatch.id);
      return;
    }

    setBusy(true);
    try {
      // -------------------------------------------------------------
      // STAGE FILLING & ADVANCING FLOW: Voice -> ChatGPT Analysis -> DB
      // -------------------------------------------------------------
      if (activeAddStageRef.current) {
        const currentStageBox = PIPELINE_8_BOXES.find((b) => b.id === activeAddStageRef.current) || PIPELINE_8_BOXES[0];

        // 1. If this stage advances from a previous stage, and no card is selected yet:
        if (!currentStageBox.isNewOnly && !selectedSourceCardRef.current) {
          const candidateCards = getSourceCardsForStage(currentStageBox, pipelineCards);

          // Check if user spoke a card index or number e.g. "card 1", "number 2", "1"
          const idxMatch = /(?:card|number|item|option|ஒன்று|இரண்டு|முதல்)?\s*(\d+)/i.exec(text);
          if (idxMatch) {
            const idx = parseInt(idxMatch[1], 10) - 1;
            if (idx >= 0 && idx < candidateCards.length) {
              selectSourceCard(candidateCards[idx]);
              return;
            }
          }

          // Check if user spoke refNo, customer, or part name
          const textLow = text.toLowerCase().trim();
          const matchedCard = candidateCards.find((c) =>
            (c.refNo && textLow.includes(c.refNo.toLowerCase())) ||
            (c.customer && textLow.includes(c.customer.toLowerCase())) ||
            (c.part && textLow.includes(c.part.toLowerCase()))
          );

          if (matchedCard) {
            selectSourceCard(matchedCard);
            return;
          }

          // Prompt user to pick a card
          add({
            role: 'ai',
            text: L(
              `Please choose which ${currentStageBox.sourceStageName} to advance (click one above or say the card number/customer).`,
              `நகர்த்த வேண்டிய ${currentStageBox.sourceStageNameTa}-ஐத் தேர்ந்தெடுக்கவும் (மேலே கிளிக் செய்யவும் அல்லது கார்டு எண் சொல்லவும்).`
            ),
          }, true);
          return;
        }

        // 2. User has spoken details: analyze with ChatGPT API (or local fallback)
        let extracted: Record<string, any> | null = null;
        if (hasApiKey) {
          extracted = await extractStageFieldsWithChatGPT(
            currentStageBox.id,
            currentStageBox.name,
            text,
            currentStageBox.fields.map((f) => ({ key: f.key, label: f.label }))
          );
        }

        if (!extracted || Object.keys(extracted).length === 0) {
          extracted = extractStageFieldsLocal(text);
        }

        // A) If brand new Enquiry: Save directly to database!
        if (currentStageBox.isNewOnly) {
          const saveRes = await saveStageRecord(currentStageBox.id, extracted, ctx);

          if (saveRes.ok) {
            setExtractedPreview({
              stage: currentStageBox,
              fields: extracted,
            });

            add({
              role: 'ai',
              text: `✓ ${saveRes.message}`,
              go: saveRes.where,
            }, true);

            window.dispatchEvent(new CustomEvent('argus:data-changed'));
            void loadPipeline();
            return;
          } else {
            add({
              role: 'ai',
              text: `⚠ ${saveRes.message}`,
              error: true,
            }, true);
            return;
          }
        }

        // B) If advancing to next stage with selected card: Show Transition Preview Confirmation!
        if (selectedSourceCardRef.current) {
          setTransitionPreview({
            sourceCard: selectedSourceCardRef.current,
            targetBox: currentStageBox,
            extraFields: extracted,
          });

          const previewMsg = L(
            `Extracted extra details for ${currentStageBox.name}. Please confirm to move #${selectedSourceCardRef.current.refNo} (${selectedSourceCardRef.current.customer}) to ${currentStageBox.name}.`,
            `${currentStageBox.nameTa}-க்கான கூடுதல் விவரங்கள் பெறப்பட்டன. #${selectedSourceCardRef.current.refNo} (${selectedSourceCardRef.current.customer}) ஐ ${currentStageBox.nameTa}-க்கு மாற்றவா? உறுதிப்படுத்தவும்.`
          );
          add({ role: 'ai', text: previewMsg }, true);
          return;
        }
      }

      // -------------------------------------------------------------
      // General Natural Language Understanding for other commands
      // -------------------------------------------------------------
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

      // Analyze with ChatGPT
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

      if (!u) {
        u = await understandRemote(text, lang, page, pending, msgs);
      }

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
            'Which stage would you like to add data to? Choose one of the 8 boxes above or say what to add.',
            'எந்த stage-ல் தரவைச் சேர்க்க வேண்டும்? மேலே உள்ள 8 பெட்டிகளில் ஒன்றைத் தேர்ந்தெடுக்கவும்.'
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
  }, [busy, awaiting, pending, msgs, lang, page, pageTitle, ctx, hasApiKey, pipelineCards, add, confirm, cancel, navigate, L, loadPipeline, selectStage]);

  submitRef.current = submit;

  const askFor = (u: Understood) => {
    const field = u.missing[0];
    const q = FIELD_QUESTION[field];
    return u.reply || (q ? L(q[0], q[1]) : L('Tell me a little more.', 'இன்னும் கொஞ்சம் சொல்லுங்கள்.'));
  };

  const greetedRef = useRef(false);

  // Wake Word Handler: Activates, chimes, unmutes if muted, welcomes user and asks which stage
  const handleWakeActivation = useCallback((trailingCmd = '') => {
    playWakeChime();
    setMicMuted(false);
    micMutedRef.current = false;
    setMicError(null);
    setOpen(true);
    greetedRef.current = true;
    const welcome = L(
      'Welcome to ERP! Which stage would you like to add data to? (8 stages available)',
      'Welcome to ERP! எந்த stage-ல் தரவைச் சேர்க்க வேண்டும்? (8 நிலைகள் உள்ளன)'
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
    if (open && !greetedRef.current && msgs.length === 0) {
      greetedRef.current = true;
      const welcome = L(
        'Welcome to ERP! Which stage would you like to add data to? (8 stages available)',
        'Welcome to ERP! எந்த stage-ல் தரவைச் சேர்க்க வேண்டும்? (8 நிலைகள் உள்ளன)'
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

  // Active Stage object for filling boxes card
  const activeBox = useMemo(() => {
    if (!activeAddStage) return null;
    return PIPELINE_8_BOXES.find((b) => b.id === activeAddStage) || null;
  }, [activeAddStage]);

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
        onClick={async () => {
          setMicMuted(false);
          micMutedRef.current = false;
          haltedRef.current = false;
          netFailRef.current = 0;
          startedOnceRef.current = true;
          setMicError(null);
          await requestMicPermission();
          startRecognition();
          playWakeChime();
          setOpen(true);
        }}
        title="Co-worker is listening! Say 'Hello CNC!' or click to open."
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white shadow-xs">
          <Sparkles size={13} />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-bold text-slate-800">Co-worker</span>
          {!micMuted && listening ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Say "Hello CNC !"</span>
            </span>
          ) : !micMuted ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800" title={micError ?? 'Click once anywhere on the page so the browser lets the microphone start.'}>
              {micError ? 'Mic problem · click' : 'Click to start mic'}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              Mic Muted
            </span>
          )}
          {!micMuted && /^Heard|^Submitted|error|unreach|not reach/i.test(speechStatusText) && (
            <span className="max-w-[11rem] truncate text-[10px] text-slate-500" title={speechStatusText}>{speechStatusText}</span>
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
      className="fixed bottom-[4.5rem] left-[5.5rem] z-[75] flex h-[36rem] max-h-[calc(100vh-5.5rem)] w-[27rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-slate-200 bg-white font-sans shadow-2xl max-lg:bottom-[8.5rem] max-lg:left-2 overflow-hidden"
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
          onClick={runMicTest}
          title="Test your microphone hardware & speech engine"
          className="flex items-center gap-1 rounded bg-white/20 hover:bg-white/30 px-2 py-1 text-[10px] font-bold text-white transition-colors cursor-pointer select-none"
        >
          <span>🎙️</span>
          <span>{L('Test Mic', 'மைக் டெஸ்ட்')}</span>
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

            <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5 text-[11px]">
              {filteredCards.length === 0 ? (
                <p className="text-center py-2 text-[11px] text-slate-400 italic">No pipeline records match</p>
              ) : (
                filteredCards.map((c) => (
                  <div
                    key={`${c.type}-${c.id}`}
                    className="flex items-center justify-between gap-1.5 rounded-lg border border-slate-100 bg-slate-50/50 p-1.5 hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded border px-1 py-0.2 text-[9px] font-bold bg-violet-50 text-violet-700 border-violet-200">
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
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3 text-[13px]">
        {/* STEP 1: Ask which of the 8 boxes to add to */}
        <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/70 via-indigo-50/40 to-purple-50/30 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-violet-900 flex items-center gap-1">
              <span>📋</span> {L('Step 1: Choose which stage to add to (8 Boxes):', 'படி 1: எந்த stage-ல் சேர்க்க வேண்டும்? (8 பெட்டிகள்):')}
            </p>
            {activeAddStage && (
              <button
                type="button"
                onClick={() => {
                  setActiveAddStage(null);
                  activeAddStageRef.current = null;
                  setSelectedSourceCard(null);
                  selectedSourceCardRef.current = null;
                  setTransitionPreview(null);
                  setExtractedPreview(null);
                }}
                className="text-[10px] text-violet-700 hover:underline font-semibold cursor-pointer"
              >
                {L('Change Stage', 'மாற்று')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {PIPELINE_8_BOXES.map((box) => {
              const isSelected = activeAddStage === box.id;
              return (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => selectStage(box.id)}
                  className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-violet-600 bg-violet-600 text-white shadow-xs font-bold'
                      : 'border-slate-200 bg-white/90 text-slate-800 hover:border-violet-400 hover:bg-violet-50/50'
                  }`}
                >
                  <span className="text-sm shrink-0">{box.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-[11px] leading-tight font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                        {box.name}
                      </p>
                      <span className={`text-[8px] font-bold px-1 rounded-sm ${
                        box.isNewOnly
                          ? isSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'
                          : isSelected ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {box.isNewOnly ? L('New', 'புதிய') : L('Advance', 'நகர்த்து')}
                      </span>
                    </div>
                    <p className={`text-[9px] truncate mt-0.5 ${isSelected ? 'text-violet-100' : 'text-slate-400'}`}>
                      {box.nameTa}
                    </p>
                  </div>
                  {isSelected && <Check size={12} className="text-white shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: Selected Stage Flow */}
        {activeBox && (
          <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-indigo-50/70 p-3 shadow-xs animate-in fade-in duration-200 space-y-2.5">
            {/* Stage Title and Flow Badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-900 flex items-center gap-1.5">
                <span className="text-base">{activeBox.icon}</span>
                <span>
                  {activeBox.name} —{' '}
                  {activeBox.isNewOnly
                    ? L('New Entry (Filling Boxes):', 'புதிய பதிவு (பூர்த்தி செய்ய வேண்டிய பெட்டிகள்):')
                    : L(`Advance from ${activeBox.sourceStageName}:`, `${activeBox.sourceStageNameTa}-லிருந்து அடுத்த நிலைக்கு நகர்த்தவும்:`)}
                </span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                activeBox.isNewOnly ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {activeBox.isNewOnly ? L('✨ Add New', '✨ புதியது') : L(`➡️ From ${activeBox.sourceStageName}`, `➡️ ${activeBox.sourceStageNameTa}`)}
              </span>
            </div>

            {/* SUBCASE 1: If advancing from previous stage and no card selected yet -> SHOW PREVIOUS STAGE CARDS */}
            {!activeBox.isNewOnly && !selectedSourceCard && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-700 font-semibold">
                  <span>
                    {L(
                      `Step 2: Choose which ${activeBox.sourceStageName} to advance:`,
                      `படி 2: எந்த ${activeBox.sourceStageNameTa}-ஐ நகர்த்த வேண்டும்? தேர்ந்தெடுக்கவும்:`
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {getSourceCardsForStage(activeBox, pipelineCards).length} {L('Available', 'உள்ளன')}
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5">
                  {getSourceCardsForStage(activeBox, pipelineCards).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-center text-xs text-slate-500">
                      <p className="font-semibold text-slate-700">
                        {L(`No ${activeBox.sourceStageName} records found in pipeline.`, `பதிவுகள் எதுவும் கிடைக்கவில்லை.`)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {L(`Add an Enquiry first or speak/type a card reference below.`, `முதலில் ஒரு Enquiry சேர்க்கவும் அல்லது கார்டு எண் சொல்லவும்.`)}
                      </p>
                    </div>
                  ) : (
                    getSourceCardsForStage(activeBox, pipelineCards).map((card, idx) => (
                      <div
                        key={`${card.type}-${card.id}-${idx}`}
                        onClick={() => selectSourceCard(card)}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg border border-violet-100 bg-white hover:border-violet-400 hover:bg-violet-50/70 transition-all cursor-pointer shadow-2xs group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-violet-100 px-1.5 py-0.2 text-[9px] font-bold text-violet-800">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-slate-800 text-[11px] truncate">
                              {card.refNo}
                            </span>
                            <span className="text-slate-600 text-[11px] font-semibold truncate">
                              · {card.customer}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {card.part} {card.qty > 0 ? `· Qty: ${card.qty}` : ''} {card.value > 0 ? `· ₹${card.value.toLocaleString('en-IN')}` : ''}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectSourceCard(card);
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-xs group-hover:bg-violet-700 shrink-0 cursor-pointer"
                        >
                          <span>{L('Select', 'தேர்ந்தெடு')}</span>
                          <ArrowRight size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <p className="text-[10px] text-slate-500 italic">
                  {L('🎙️ Speak "card 1" or the Customer name into mic, or click a card above.', '🎙️ மைக் மூலம் "card 1" அல்லது கஸ்டமர் பெயர் சொல்லலாம், அல்லது மேலே கிளிக் செய்யலாம்.')}
                </p>
              </div>
            )}

            {/* SUBCASE 2: Source card IS selected (or brand new Enquiry) -> Show Base info + Extra Filling Boxes */}
            {(activeBox.isNewOnly || selectedSourceCard) && (
              <div className="space-y-2">
                {/* Selected card banner */}
                {!activeBox.isNewOnly && selectedSourceCard && (
                  <div className="flex items-center justify-between rounded-lg border border-violet-200 bg-white/95 p-2 shadow-2xs">
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] uppercase font-bold text-violet-700 tracking-wider">
                        {L('Selected Record to Advance:', 'நகர்த்தப்படும் பதிவு:')}
                      </span>
                      <p className="font-bold text-slate-800 text-xs truncate">
                        {selectedSourceCard.refNo} · {selectedSourceCard.customer}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {selectedSourceCard.part} · Qty: {selectedSourceCard.qty}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceCard(null);
                        selectedSourceCardRef.current = null;
                        setTransitionPreview(null);
                      }}
                      className="text-[10px] text-violet-700 font-semibold underline hover:text-violet-900 shrink-0 ml-2 cursor-pointer"
                    >
                      {L('Change Card', 'மாற்று')}
                    </button>
                  </div>
                )}

                {/* Section header for filling boxes */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800">
                    {!activeBox.isNewOnly
                      ? L(`Extra Information needed to move to ${activeBox.name}:`, `${activeBox.nameTa}-க்கு பூர்த்தி செய்ய வேண்டிய கூடுதல் விவரங்கள்:`)
                      : L(`Filling Boxes (Fields):`, `பூர்த்தி செய்ய வேண்டிய பெட்டிகள்:`)}
                  </span>
                  <span className="rounded-full bg-violet-200 px-1.5 py-0.2 text-[9px] font-bold text-violet-800">
                    {activeBox.fields.length} {L('Boxes', 'பெட்டிகள்')}
                  </span>
                </div>

                {/* The individual filling boxes */}
                <div className="grid grid-cols-2 gap-1.5">
                  {activeBox.fields.map((f) => (
                    <div key={f.key} className="flex items-center gap-1.5 bg-white/95 border border-violet-100 rounded-lg p-1.5 text-[11px]">
                      <span className="text-xs shrink-0">{f.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate text-[10px] leading-tight">
                          {ta ? f.labelTa : f.label}
                        </p>
                        <p className="text-[9px] text-slate-400 truncate">
                          e.g. {f.example}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Voice guidance card */}
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-emerald-900 flex items-start gap-1.5">
                  <span className="text-sm shrink-0">🎙️</span>
                  <div className="text-[11px] leading-snug">
                    <p className="font-bold text-emerald-900">
                      {L('Speak now in mic or type:', 'மைக் மூலம் இப்போது சொல்லுங்கள்:')}
                    </p>
                    <p className="text-[10px] text-emerald-800 mt-0.5">
                      {!activeBox.isNewOnly
                        ? L(
                            `Say the extra details in one sentence (e.g. "${activeBox.fields.map(f => `${f.label} is ${f.example}`).join(', ')}"). ChatGPT will extract them and show confirmation!`,
                            `கூடுதல் விவரங்களை மைக் மூலம் சொல்லுங்கள். ChatGPT ஆராய்ந்து உறுதிப்படுத்தல் காண்பிக்கும்!`
                          )
                        : L(
                            'Say details in one sentence, e.g. "Customer Apple Tech, part flicker, quantity 50". ChatGPT will extract and save directly into the database!',
                            'எ.கா: "கஸ்டமர் Apple Tech, பார்ட் flicker, குவான்டிட்டி 50". ChatGPT ஆராய்ந்து டேட்டாபேஸில் சேமிக்கும்!'
                          )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3 Move Stage Transition Confirmation Card */}
        {transitionPreview && (
          <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50/95 via-teal-50/90 to-emerald-100/70 p-3 shadow-md animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                <Sparkles size={14} className="text-emerald-600" />
                <span>{L('Move Stage Confirmation', 'நிலை மாற்ற உறுதிப்படுத்தல்')}</span>
              </div>
              <span className="rounded bg-emerald-200 px-1.5 py-0.2 text-[9px] font-bold text-emerald-900">
                {transitionPreview.sourceCard.stage || transitionPreview.targetBox.sourceStageName} ➡️ {transitionPreview.targetBox.name}
              </span>
            </div>

            {/* Base Record Details */}
            <div className="rounded-lg bg-white/95 border border-emerald-200 p-2 mb-2 text-xs">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {L('Record to Advance:', 'நகர்த்தப்படும் பதிவு:')}
              </p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="font-bold text-slate-900">{transitionPreview.sourceCard.refNo}</span>
                <span className="font-semibold text-slate-700">{transitionPreview.sourceCard.customer}</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {transitionPreview.sourceCard.part} · Qty: {transitionPreview.sourceCard.qty}
              </p>
            </div>

            {/* Extra Information Extracted */}
            <div className="rounded-lg bg-white/95 border border-emerald-200 p-2 mb-2.5 text-xs">
              <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
                {L('Extra Information to Save:', 'சேமிக்கப்பட வேண்டிய கூடுதல் விவரங்கள்:')}
              </p>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                {Object.entries(transitionPreview.extraFields)
                  .filter(([_, v]) => v != null && v !== '')
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1">
                      <span className="text-slate-400 text-[10px] capitalize">{k.replace('_', ' ')}:</span>
                      <span className="font-bold text-slate-800 truncate">{String(v)}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Confirm / Cancel Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void executeMoveTransition()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>{L(`Confirm & Move to ${transitionPreview.targetBox.name}`, `உறுதி செய்து ${transitionPreview.targetBox.nameTa}-க்கு நகர்த்து`)}</span>
              </button>
              <button
                type="button"
                onClick={() => setTransitionPreview(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                {L('Cancel', 'ரத்து')}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 Extracted Summary Result Card for Brand New Entry */}
        {extractedPreview && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-xs mb-1.5">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>{L('Extracted & Saved to Database:', 'டேட்டாபேஸில் சேமிக்கப்பட்டது:')}</span>
              <span className="rounded bg-emerald-200/80 px-1.5 py-0.2 text-[9px] font-bold text-emerald-900">
                {extractedPreview.stage.name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 bg-white/90 rounded-lg border border-emerald-100 p-2 text-[11px]">
              {Object.entries(extractedPreview.fields)
                .filter(([_, v]) => v != null && v !== '')
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <span className="text-slate-400 text-[10px] capitalize">{k.replace('_', ' ')}:</span>
                    <span className="font-bold text-slate-800 truncate">{String(v)}</span>
                  </div>
                ))}
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
            <span>{hasApiKey ? L('Analyzing voice with ChatGPT & saving to database…', 'ChatGPT மூலம் குரலை ஆராய்ந்து டேட்டாபேஸில் சேமிக்கிறேன்…') : L('Working…', 'செய்கிறேன்…')}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Microphone error / permission banner */}
      {micError && (
        <div className="flex items-center justify-between gap-1.5 bg-amber-50 border-t border-amber-200 px-3 py-1 text-[11px] text-amber-800 shrink-0">
          <span className="truncate">⚠ {micError}</span>
          <button
            type="button"
            onClick={toggleMicMute}
            className="underline font-bold text-amber-900 shrink-0 hover:text-black cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Mic Test Modal / Diagnostic Overlay */}
      {showMicTester && (
        <div className="border-t border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-3 shadow-md animate-in fade-in duration-200 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-violet-900 flex items-center gap-1.5">
              <span>🎙️</span>
              <span>{L('Microphone Hardware & Speech Diagnostic', 'மைக் வன்பொருள் & பேச்சு சோதனை')}</span>
            </span>
            <button
              type="button"
              onClick={() => setShowMicTester(false)}
              className="rounded p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span className="font-semibold">{L('Active Device:', 'செயலில் உள்ள மைக்:')}</span>
              <span className="font-mono text-slate-800 truncate max-w-[200px]">{micTestDevice || 'Detecting...'}</span>
            </div>

            {/* Live Volume Bar during test */}
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                <span>{L('Mic Sound Level:', 'ஒலி அளவு:')} {micTestVol}%</span>
                <span>{micTestRunning ? L('Speak now (e.g. "Finished Goods")...', 'இப்போது பேசுங்கள்...') : ''}</span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                <div
                  className={`h-full transition-all duration-75 ${
                    micTestVol > 5 ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                  style={{ width: `${Math.max(2, micTestVol)}%` }}
                />
              </div>
            </div>

            {/* Test Results */}
            {micTestResult && (
              <div className={`p-2 rounded-lg border text-[11px] space-y-1 ${
                micTestResult.hwOk
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <p className="font-bold flex items-center gap-1">
                  {micTestResult.hwOk ? (
                    <>
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      <span>{L('Microphone Hardware is WORKING! (Peak volume: ', 'மைக் சரியாக வேலை செய்கிறது! (அளவு: ')}{micTestResult.peakVol}%)</span>
                    </>
                  ) : (
                    <>
                      <span>⚠️</span>
                      <span>{L('Microphone Input is 0% (Silent)!', 'மைக் ஒலி அளவு 0% (சத்தம் கேட்கவில்லை)!')}</span>
                    </>
                  )}
                </p>

                {!micTestResult.hwOk && (
                  <p className="text-[10px] text-amber-800 leading-relaxed">
                    {L(
                      'Windows received 0 sound from your microphone. Please check: 1) Windows Settings > Sound > Input: verify correct mic is selected and volume is > 80. 2) Headset hardware mute switch.',
                      'விண்டோஸ் மைக் அமைப்புகளை சரிபார்க்கவும்: ஒலி அளவு > 80 ஆக உள்ளதா மற்றும் மைக் மியூட் செய்யப்படவில்லை என்பதை உறுதிப்படுத்தவும்.'
                    )}
                  </p>
                )}

                {micTestResult.speechHeard ? (
                  <p className="text-[10px] text-slate-700">
                    <span className="font-semibold">{L('Speech Recognized: ', 'கேட்கப்பட்ட வார்த்தை: ')}</span>
                    <span className="font-bold text-violet-800">"{micTestResult.speechHeard}"</span>
                  </p>
                ) : micTestResult.error ? (
                  <p className="text-[10px] text-amber-800">
                    <span className="font-semibold">{L('Speech Engine Note: ', 'பேச்சு என்ஜின் குறிப்பு: ')}</span>
                    <span>{micTestResult.error}</span>
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">
                    {L('No words transcribed during 4s test.', '4 வினாடிகளில் வார்த்தைகள் எதுவும் பதிவு செய்யப்படவில்லை.')}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={micTestRunning}
                onClick={runMicTest}
                className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white font-bold text-[11px] disabled:opacity-50 cursor-pointer"
              >
                {micTestRunning ? L('Listening (4s)...', 'கேட்கிறது (4s)...') : L('Retest Mic', 'மீண்டும் சோதிக்க')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Speech Recognition Diagnostic Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-100 border-t border-slate-200 text-[10px] text-slate-600 select-none">
        <div className="flex items-center gap-1.5 truncate">
          <span className={`h-2 w-2 rounded-full shrink-0 ${listening ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          <span className="font-medium text-slate-700 truncate">{speechStatusText}</span>
        </div>
        <button
          type="button"
          onClick={runMicTest}
          className="font-bold text-violet-700 hover:text-violet-900 underline shrink-0 cursor-pointer ml-2"
        >
          {L('Test Mic', 'மைக் டெஸ்ட்')}
        </button>
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
          aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
          title={micMuted ? 'Microphone Muted. Click to listen.' : 'Microphone Listening. Click to mute.'}
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all cursor-pointer ${
            micMuted
              ? 'bg-slate-400 hover:bg-slate-500 text-slate-100'
              : listening
              ? 'bg-emerald-600 hover:bg-emerald-700 ring-4 ring-emerald-300 animate-pulse'
              : 'bg-violet-600 hover:bg-violet-700'
          }`}
        >
          {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        {/* Speech Recognition Language Toggle (EN / TA) */}
        <button
          type="button"
          onClick={toggleSpeechLang}
          title={speechLang === 'en-IN' ? 'Listening in English. Click to switch to Tamil.' : 'Listening in Tamil. Click to switch to English.'}
          className="flex h-8 px-2.5 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:border-violet-300 shadow-2xs transition-colors cursor-pointer select-none"
        >
          <span className="text-[12px]">🌐</span>
          <span>{speechLang === 'en-IN' ? 'EN' : 'தமிழ்'}</span>
        </button>

<input
          aria-label="Message to Co-worker"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            micMuted
              ? L('Mic is muted. Type command or click mic...', 'மைக் அணைக்கப்பட்டுள்ளது. தட்டச்சு செய்யுங்கள்...')
              : activeBox && !activeBox.isNewOnly && !selectedSourceCard
              ? L(`🎙️ Choose a ${activeBox.sourceStageName} card above or speak name/number...`, `🎙️ மேலே உள்ள கார்டைத் தேர்ந்தெடுக்கவும்...`)
              : activeBox && selectedSourceCard
              ? L(`🎙️ Say extra details for #${selectedSourceCard.refNo} (e.g. ${activeBox.fields.map(f => f.label).join(', ')})...`, `🎙️ கூடுதல் விவரங்களைச் சொல்லுங்கள்...`)
              : activeBox && activeBox.isNewOnly
              ? L(`🎙️ Say details for Enquiry (Customer, Part, Qty)...`, `🎙️ விவரங்களைச் சொல்லுங்கள்...`)
              : listening
              ? L('🎙️ Listening… Choose a stage or speak command…', '🎙️ கேட்கிறேன்… ஒரு நிலையைத் தேர்ந்தெடுக்கவும்…')
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
