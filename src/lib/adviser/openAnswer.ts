// "Ask anything": one open AI answer for any question on any topic (used by the Co-worker when what was said is not a command).
// Goes through our own server (the AI key stays there); falls back to a key saved in this browser.

import { serverChat, ServerAiError, type ChatPiece } from './serverAi';
import { getOpenAIApiKey } from '@/lib/copilot/openai';

export type AnswerLang = 'ta' | 'tanglish' | 'en';

export function openPrompt(lang: AnswerLang, extra = ''): string {
  const langRule = lang === 'ta'
    ? 'Reply in Tamil script; keep technical terms in English.'
    : lang === 'tanglish' ? 'Reply in Tanglish (Tamil in English letters).' : 'Reply in simple English.';
  return `You are a friendly, knowledgeable assistant inside Argus Business Intelligence (software used by a CNC machining company).
Answer ANY question on ANY topic the person asks: general knowledge, maths, science, coding, writing, business, health and wellbeing basics, news-style explanations, language, ideas, and of course Argus BI, manufacturing and CNC machining. Never refuse a question just because it is not about the software or machining; give a genuinely helpful answer. For medical, legal or money decisions give useful general information and suggest checking with a professional when it really matters.
People often talk in a mix of Tamil and English, sometimes by voice, so the text can have speech-to-text mistakes: work out what they meant.
Talk like a helpful colleague: short natural sentences, plain words, no markdown symbols, because the answer may be read aloud. Keep it to about 8 short lines unless they ask for more. ${langRule}${extra ? `\n${extra}` : ''}`;
}

/** The whole answer as text (null when no AI can be reached). */
export async function askAnything(question: string, lang: AnswerLang, history: ChatPiece[] = [], extra = ''): Promise<string | null> {
  const system = openPrompt(lang, extra);
  const msgs: ChatPiece[] = [...history.slice(-6), { role: 'user', text: question }];
  let text = '';
  try {
    for await (const piece of serverChat(system, msgs, { maxTokens: 700, temperature: 0.5 })) text += piece;
    if (text.trim()) return text.trim();
  } catch (e) {
    if (text.trim()) return text.trim();
    if (!(e instanceof ServerAiError && e.unreachable)) return e instanceof Error ? e.message : null;
  }
  const key = getOpenAIApiKey();
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 700, messages: [{ role: 'system', content: system }, ...msgs.map((m) => ({ role: m.role, content: m.text }))] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return String(j?.choices?.[0]?.message?.content ?? '').trim() || null;
  } catch {
    return null;
  }
}
