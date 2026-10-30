// One short spoken sentence for every option of a screen, written by ChatGPT (through the help-assistant function, or the key
// saved in this browser) and remembered, so the same screen is explained instantly the next time.
import { supabase } from '@/lib/supabase';
import { getOpenAIApiKey } from '@/lib/copilot/openai';
import { itemsKey, type TourItem, type TourLang } from './tour';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-assistant`;
const CACHE = 'argus.tour.v1';

type Slim = Pick<TourItem, 'id' | 'kind' | 'label' | 'extra'>;

const readCache = (k: string): Record<string, string> | null => {
  try { const v = localStorage.getItem(`${CACHE}:${k}`); return v ? JSON.parse(v) : null; } catch { return null; }
};
const writeCache = (k: string, v: Record<string, string>) => {
  try { localStorage.setItem(`${CACHE}:${k}`, JSON.stringify(v)); } catch { /* storage full or blocked: explanations are just not remembered */ }
};

let serverDown = false;   // the function is not deployed / not reachable: do not wait on it for every page

async function viaServer(page: string, pageTitle: string, lang: TourLang, items: Slim[]): Promise<Record<string, string> | null> {
  if (serverDown) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''), 'content-type': 'application/json' },
      body: JSON.stringify({ explain: { page, pageTitle, lang, items } }),
    });
    if (res.status === 404) { serverDown = true; return null; }
    if (!res.ok) return null;
    const j = await res.json();
    return j && typeof j.items === 'object' && j.items ? j.items : null;
  } catch { return null; }
}

async function viaBrowserKey(pageTitle: string, lang: TourLang, items: Slim[]): Promise<Record<string, string> | null> {
  const key = getOpenAIApiKey();
  if (!key) return null;
  const langRule = lang === 'ta' ? 'Write in Tamil script; keep button and screen names in English.' : lang === 'tanglish' ? 'Write in Tanglish (Tamil in English letters).' : 'Write in simple English.';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 3000, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `You are the Teaching voice of an ERP for a CNC machining company, walking a new user through the screen "${pageTitle}" one option at a time. For EACH option write ONE short spoken sentence (max 25 words) saying what it is for and what happens when it is used. Never invent features. ${langRule} Return JSON {"items": {"<id>": "<sentence>"}} with every id.` },
          { role: 'user', content: JSON.stringify(items) },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = JSON.parse((await res.json()).choices?.[0]?.message?.content ?? '{}');
    return j && typeof j.items === 'object' ? j.items : null;
  } catch { return null; }
}

/**
 * Explanations for the given options, by item id. Anything the AI could not explain is simply missing from the result
 * (the tour then uses its built-in sentence for that option).
 */
export async function explainOptions(page: string, pageTitle: string, lang: TourLang, items: TourItem[]): Promise<Record<number, string>> {
  if (!items.length) return {};
  const slim: Slim[] = items.map(({ id, kind, label, extra }) => ({ id, kind, label, extra }));
  const k = `${page}:${lang}:${itemsKey(items)}`;
  const cached = readCache(k);
  const raw = cached ?? (await viaServer(page, pageTitle, lang, slim)) ?? (await viaBrowserKey(pageTitle, lang, slim));
  if (!raw) return {};
  if (!cached && Object.keys(raw).length) writeCache(k, raw);
  const out: Record<number, string> = {};
  for (const [id, text] of Object.entries(raw)) if (typeof text === 'string' && text.trim()) out[Number(id)] = text.trim();
  return out;
}
