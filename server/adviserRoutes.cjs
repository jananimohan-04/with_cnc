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
    const system = String(b.system || '').slice(0, 90000);   // room for full project map + live company DB
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-24).map((m) => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && (m.text ?? m.content)) || '').slice(0, 8000),
    })).filter((m) => m.content.trim());
    if (!system || !msgs.length) return res.status(400).json({ error: 'Nothing to answer.' });
    const maxTokens = Math.min(Math.max(Number(b.maxTokens) || 1800, 100), 4096);
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

  // Pass-through proxy for user-linked APIs (Gemini, Anthropic Claude, Groq, DeepSeek, Mistral, xAI, OpenRouter, custom)
  // when browser CORS prevents direct calls. The key stays scoped to this authenticated request and is never logged or saved.
  app.post('/api/adviser/proxy', async (req, res) => {
    if (!(await who(req, res))) return;
    const b = req.body || {};
    const provider = String(b.provider || 'openai').trim();
    const apiKey = String(b.apiKey || '').trim();
    const model = String(b.model || '').trim();
    const baseUrl = String(b.baseUrl || '').trim().replace(/\/+$/, '');
    const system = String(b.system || '').slice(0, 90000);
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-24).map((m) => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && (m.text ?? m.content)) || '').slice(0, 8000),
    })).filter((m) => m.content.trim());
    if (!system || !msgs.length) return res.status(400).json({ error: 'Nothing to answer.' });
    const maxTokens = Math.min(Math.max(Number(b.maxTokens) || 1800, 32), 4096);
    const temperature = typeof b.temperature === 'number' ? Math.min(Math.max(b.temperature, 0), 1) : 0.3;

    const ctl = new AbortController();
    res.on('close', () => ctl.abort());
    let up;
    try {
      if (provider === 'gemini') {
        const ep = `${baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${encodeURIComponent(model || 'gemini-2.5-flash')}:streamGenerateContent?alt=sse`;
        up = await fetch(ep, {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            generationConfig: { temperature, maxOutputTokens: maxTokens, ...(b.jsonMode ? { responseMimeType: 'application/json' } : {}) },
          }),
          signal: ctl.signal,
        });
      } else if (provider === 'anthropic') {
        up = await fetch(baseUrl || 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: model || 'claude-sonnet-4-20250514',
            max_tokens: maxTokens,
            temperature,
            system: b.jsonMode ? `${system}\n\nRespond with valid JSON only.` : system,
            messages: msgs,
            stream: true,
          }),
          signal: ctl.signal,
        });
      } else {
        const ep = /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
        if (!/^https:\/\//i.test(ep)) return res.status(400).json({ error: 'Proxy requires an HTTPS endpoint.' });
        const headers = { 'content-type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        up = await fetch(ep, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [{ role: 'system', content: system }, ...msgs],
            temperature,
            max_tokens: maxTokens,
            stream: true,
            ...(b.jsonMode && provider !== 'custom' ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: ctl.signal,
        });
      }
    } catch {
      return res.status(502).json({ error: 'The selected AI endpoint could not be reached.' });
    }
    if (!up.ok || !up.body) {
      const t = await up.text().catch(() => '');
      return res.status(502).json({ error: `AI error (HTTP ${up.status}): ${t.slice(0, 140)}` });
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
          try {
            const j = JSON.parse(d);
            const t = provider === 'gemini'
              ? (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
              : provider === 'anthropic'
                ? (j?.type === 'content_block_delta' && j?.delta?.type === 'text_delta' ? j.delta.text : '')
                : j?.choices?.[0]?.delta?.content;
            if (t) res.write(`data: ${JSON.stringify({ t })}\n\n`);
          } catch { /* partial */ }
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch { /* closed */ }
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

  // Picture made from a description (the Adviser's [[IMAGE ...]] block). Returns { ok, image: "data:image/png;base64,..." }.
  //   OPENAI_IMAGE_MODEL  optional, default gpt-image-1
  app.post('/api/adviser/image', async (req, res) => {
    if (!(await who(req, res))) return;
    if (!key()) return res.status(503).json({ error: 'The AI is not set up yet. Please ask your administrator to switch it on.' });
    const prompt = String((req.body || {}).prompt || '').trim().slice(0, 3800);
    const size = ['1024x1024', '1536x1024', '1024x1536'].includes((req.body || {}).size) ? req.body.size : '1024x1024';
    if (!prompt) return res.status(400).json({ error: 'Say what the picture should show.' });
    try {
      const up = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
        // "medium" quality comes back well inside the server's 60-second limit; OPENAI_IMAGE_QUALITY can change it.
        // OPENAI_IMAGE_MODEL=dall-e-3 also works (its sizes and quality names differ, so they are mapped).
        body: JSON.stringify((() => {
          const m = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
          if (/^dall-e-3/i.test(m)) {
            return { model: m, prompt, n: 1, response_format: 'b64_json', quality: 'standard', size: size === '1536x1024' ? '1792x1024' : size === '1024x1536' ? '1024x1792' : '1024x1024' };
          }
          return { model: m, prompt, size, n: 1, quality: process.env.OPENAI_IMAGE_QUALITY || 'medium' };
        })()),
      });
      const j = await up.json().catch(() => ({}));
      if (!up.ok) {
        console.warn('AI image error', up.status, JSON.stringify(j).slice(0, 300));   // details stay in the server log
        const blocked = /safety|policy|moderation/i.test(JSON.stringify(j));
        return res.status(502).json({ error: blocked ? 'That picture cannot be made. Please describe it differently.' : `The picture could not be made (HTTP ${up.status}).` });
      }
      const d = (j.data || [])[0] || {};
      if (d.b64_json) return res.json({ ok: true, image: `data:image/png;base64,${d.b64_json}` });
      if (d.url) return res.json({ ok: true, image: d.url });
      res.status(502).json({ error: 'The picture could not be made.' });
    } catch { res.status(502).json({ error: 'The picture service could not be reached.' }); }
  });
};
