// One way for every AI feature to talk to the AI: the selected Default (any linked provider) gets exactly the same
// instructions (system prompt) the built-in server gets. If the linked provider fails before it answered anything
// (wrong key, quota, network), the built-in server answers instead, so the feature never just stops.

import { getActiveProvider, streamProviderChat, presetFor, type AiChatMessage, type AiRequestOpts } from '@/lib/ai/providers';
import { serverChat } from '@/lib/adviser/serverAi';

export const AI_FALLBACK_EVENT = 'argus:ai-fallback';

/** The last reason a linked provider was skipped (shown as a small note by the Adviser). */
export let lastAiFallback = '';

function noteFallback(label: string, err: unknown) {
  const why = err instanceof Error ? err.message : String(err);
  lastAiFallback = `${label} did not answer (${why.slice(0, 160)}), so the built-in AI answered.`;
  try { window.dispatchEvent(new CustomEvent(AI_FALLBACK_EVENT, { detail: lastAiFallback })); } catch { /* not in a browser */ }
}

/** Streams the answer from the Default AI (linked provider first, built-in server as the safety net). */
export async function* aiStream(system: string, messages: AiChatMessage[], opts: AiRequestOpts = {}): AsyncGenerator<string> {
  const active = getActiveProvider();
  if (active) {
    let got = false;
    try {
      for await (const piece of streamProviderChat(active, system, messages, opts)) { got = true; yield piece; }
      if (got) return;
      throw new Error('empty answer');
    } catch (e) {
      if (got) throw e;   // it had started answering: don't mix two answers
      noteFallback(active.label || presetFor(active.provider).shortName, e);
    }
  }
  const sys = opts.jsonMode ? `${system}\n\nRespond with one valid JSON object only, no markdown.` : system;
  yield* serverChat(sys, messages, { maxTokens: opts.maxTokens, temperature: opts.temperature });
}

/** The whole answer as text. Throws only when no AI at all could answer. */
export async function aiComplete(system: string, messages: AiChatMessage[], opts: AiRequestOpts = {}): Promise<string> {
  let out = '';
  for await (const piece of aiStream(system, messages, opts)) out += piece;
  return out.trim();
}
