/* The Adviser's ChatGPT connection. The OpenAI key lives ONLY on the server (OPENAI_API_KEY); the browser never sees it.
 *
 *   POST /api/adviser/chat    { system, messages:[{role,text}], maxTokens? }   -> server-sent events:  data: {"t":"piece"} ... data: {"done":true}
 *   POST /api/adviser/tts     { text, lang }                                    -> audio/mpeg (OpenAI text-to-speech)
 *   GET  /api/adviser/status                                                    -> { ok, configured, model }
 *
 * Everyone signed in to the BI may use it (their Supabase token is checked). A small per-person limit stops runaway use.
 * Environment (Vercel > Project Settings > Environment Variables):
 *   OPENAI_API_KEY      required
 *   OPENAI_MODEL        optional, default gpt-4o
 *   OPENAI_TTS_MODEL    optional, default gpt-4o-mini-tts
 *   OPENAI_TTS_VOICE    optional, default coral
 *   ADVISER_PER_MINUTE  optional, default 40 requests per person per minute
 */
'use strict';

const VOICE_STYLE = {
  ta: 'Speak clearly and warmly in Tamil, at a calm natural pace, like a helpful colleague.',
  en: 'Speak clearly and warmly in Indian English, at a calm natural pace, like a helpful colleague.',
  tanglish: 'Speak warmly in a natural Tamil-English mix, at a calm natural pace, like a helpful colleague.',
};

module.exports = function mountAdviser(app, SB) {
  const hits = new Map();   // person -> [timestamps]
  const limit = () => Number(process.env.ADVISER_PER_MINUTE || 40);

  async function who(req, res) {
    let id = 'local';
    if (SB && SB.enabled) {
      const h = String(req.headers.authorization || '');
      const user = h.startsWith('Bearer ') ? await SB.authUserFromToken(h.slice(7).trim()) : null;
      if (!user) { res.status(401).json({ error: 'Please sign in again.' }); return null; }
      id = String(user.id || user.email || 'user');
    }
    const now = Date.now();
    const list = (hits.get(id) || []).filter((t) => now - t < 60000);
    if (list.length >= limit()) { res.status(429).json({ error: 'Too many requests for a minute. Please wait a little and ask again.' }); return null; }
    list.push(now); hits.set(id, list);
    if (hits.size > 2000) hits.clear();
    return id;
  }

  const key = () => String(process.env.OPENAI_API_KEY || '').trim();
  const model = () => String(process.env.OPENAI_MODEL || 'gpt-4o').trim();

  app.get('/api/adviser/status', async (req, res) => {
    if (!(await who(req, res))) return;
    res.json({ ok: true, configured: !!key(), model: model() });
  });

  app.post('/api/adviser/chat', async (req, res) => {
    if (!(await who(req, res))) return;
    if (!key()) return res.status(503).json({ error: 'The AI is not set up yet. Please ask your administrator to switch it on.' });
    const b = req.body || {};
    const system = String(b.system || '').slice(0, 40000);   // room for the company's live figures
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-14).map((m) => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && (m.text ?? m.content)) || '').slice(0, 5000),
    })).filter((m) => m.content.trim());
    if (!system || !msgs.length) return res.status(400).json({ error: 'Nothing to answer.' });
    const maxTokens = Math.min(Math.max(Number(b.maxTokens) || 700, 100), 1500);
    const temperature = typeof b.temperature === 'number' ? Math.min(Math.max(b.temperature, 0), 1) : 0.3;

    const ctl = new AbortController();
    res.on('close', () => ctl.abort());
    let up;
    try {
      up = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: model(), stream: true, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...msgs] }),
        signal: ctl.signal,
      });
    } catch (e) { return res.status(502).json({ error: 'The AI could not be reached. Please try again.' }); }
    if (!up.ok || !up.body) {
      const t = await up.text().catch(() => '');
      const msg = up.status === 401 ? 'The AI key was rejected. Please ask your administrator to check it.'
        : up.status === 429 ? 'The AI usage limit was reached for now. Please try again in a minute.'
        : `The AI is not available right now (code ${up.status}). Please try again.`;
      if (t) console.warn('AI upstream error', up.status, t.slice(0, 300));   // details stay in the server log
      return res.status(up.status === 401 ? 502 : 502).json({ error: msg });
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    try {
      const reader = up.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim();
          if (!d || d === '[DONE]') continue;
          try { const t = JSON.parse(d)?.choices?.[0]?.delta?.content; if (t) res.write(`data: ${JSON.stringify({ t })}\n\n`); } catch { /* partial line */ }
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch { /* the person closed it */ }
    res.end();
  });

  app.post('/api/adviser/tts', async (req, res) => {
    if (!(await who(req, res))) return;
    if (!key()) return res.status(503).json({ error: 'The AI is not set up yet. Please ask your administrator to switch it on.' });
    const text = String((req.body || {}).text || '').trim().slice(0, 1800);
    const lang = ['ta', 'en', 'tanglish'].includes((req.body || {}).lang) ? req.body.lang : 'en';
    if (!text) return res.status(400).json({ error: 'No text.' });
    try {
      const up = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: process.env.OPENAI_TTS_VOICE || 'coral', input: text, instructions: VOICE_STYLE[lang], response_format: 'mp3' }),
      });
      if (!up.ok) return res.status(502).json({ error: `Voice error (HTTP ${up.status})` });
      const buf = Buffer.from(await up.arrayBuffer());
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(buf);
    } catch { res.status(502).json({ error: 'The voice could not be reached.' }); }
  });
};
