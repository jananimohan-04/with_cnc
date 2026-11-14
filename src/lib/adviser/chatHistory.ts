// Adviser chat history: every conversation is kept (per person and company, in this browser / desktop app), so closing the
// Adviser loses nothing. Reopening continues the last chat; History lists them day by day; New chat starts a fresh one.

export interface SavedMsg { role: 'user' | 'assistant'; text: string; error?: boolean }
export interface SavedChat { id: string; title: string; createdAt: string; updatedAt: string; msgs: SavedMsg[] }

const MAX_CHATS = 100;
const MAX_MSGS = 200;
const keyFor = (owner: string) => `argus.adviser.chats.${owner || 'anon'}`;

export function loadChats(owner: string): SavedChat[] {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(owner)) || '[]');
    return Array.isArray(v) ? (v as SavedChat[]).filter((c) => c && c.id && Array.isArray(c.msgs)) : [];
  } catch { return []; }
}

function write(owner: string, chats: SavedChat[]) {
  const list = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_CHATS);
  for (let n = list.length; n > 0; n--) {
    try { localStorage.setItem(keyFor(owner), JSON.stringify(list.slice(0, n))); return; } catch { /* storage full: keep fewer chats */ }
  }
}

/** Saves (creates or updates) one chat; returns its id. A chat with no question yet is not saved. */
export function saveChat(owner: string, id: string | null, msgs: SavedMsg[]): string | null {
  const clean = msgs.filter((m) => m.text.trim()).slice(-MAX_MSGS);
  const firstQ = clean.find((m) => m.role === 'user');
  if (!firstQ) return id;
  const chats = loadChats(owner);
  const now = new Date().toISOString();
  const cid = id ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const old = chats.find((c) => c.id === cid);
  const title = old?.title || firstQ.text.replace(/\s+/g, ' ').trim().slice(0, 70);
  const next: SavedChat = { id: cid, title, createdAt: old?.createdAt ?? now, updatedAt: now, msgs: clean };
  write(owner, [next, ...chats.filter((c) => c.id !== cid)]);
  return cid;
}

export function deleteChat(owner: string, id: string) {
  write(owner, loadChats(owner).filter((c) => c.id !== id));
}

/** "Today", "Yesterday", or the date. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: diff < 7 ? 'long' : undefined, day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}

/** Chats grouped by the day they were last used (newest first). */
export function groupByDay(chats: SavedChat[]): { day: string; chats: SavedChat[] }[] {
  const out: { day: string; chats: SavedChat[] }[] = [];
  for (const c of [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const day = dayLabel(c.updatedAt);
    const g = out.find((x) => x.day === day);
    if (g) g.chats.push(c); else out.push({ day, chats: [c] });
  }
  return out;
}
