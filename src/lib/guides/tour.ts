// Teaching tour: finds every option on a screen (headings, tabs, buttons, filters, fields, table columns, links) so each one
// can be pointed at and explained, one by one. Pure DOM helpers, no React, so the rules can be tested on their own.

export type TourKind = 'heading' | 'button' | 'tab' | 'input' | 'select' | 'table' | 'link';
export type TourLang = 'ta' | 'tanglish' | 'en';

export interface TourItem {
  id: number;
  kind: TourKind;
  label: string;
  /** Extra words that help to explain it: the choices of a drop-down, the columns of a table, the placeholder of a field. */
  extra?: string;
  el: HTMLElement;
  /** A button that opens a form (Add / New / Create ...): the tour opens it and explains the form's fields too. */
  opens?: boolean;
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

const isVisible = (el: Element): boolean => {
  const h = el as HTMLElement;
  const r = h.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const st = getComputedStyle(h);
  return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
};

/** Things the tour must never describe: its own overlay, the assistant buttons, the Co-worker panel. */
const IGNORED = '[data-tour-ignore], [data-voice-ignore], [role="status"], [aria-label="Co-worker"], [aria-label="Adviser"]';

/** The visible text a person reads on a control. */
function labelOf(el: HTMLElement): string {
  const text = clean(el.textContent);
  if (text && text.length <= 48) return text;
  return clean(el.getAttribute('aria-label')) || clean(el.getAttribute('title')) || (text.length > 48 ? `${text.slice(0, 45)}...` : text);
}

/** The label a field is described by: its <label>, aria-label, a nearby caption, then its placeholder. */
function fieldLabel(el: HTMLElement): string {
  const id = el.getAttribute('id');
  if (id) {
    const l = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (l) return clean(l.textContent).replace(/[*:]+$/g, '').trim();
  }
  const wrap = el.closest('label');
  if (wrap) {
    const t = clean([...wrap.childNodes].filter((n) => n.nodeType === 3 || (n as HTMLElement).tagName === 'SPAN').map((n) => n.textContent).join(' '));
    if (t) return t.replace(/[*:]+$/g, '').trim();
  }
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  // a caption right above / beside it (the BI's FormField puts a <label> or small text in the same wrapper)
  const box = el.parentElement;
  const cap = box?.querySelector(':scope > label, :scope > span, :scope > p');
  if (cap && cap !== el && !cap.contains(el)) {
    const t = clean(cap.textContent).replace(/[*:]+$/g, '').trim();
    if (t && t.length <= 40) return t;
  }
  return clean(el.getAttribute('placeholder')) || clean(el.getAttribute('title')) || clean(el.getAttribute('name')).replace(/[_-]+/g, ' ');
}

/** Labels that are not worth an explanation of their own (page numbers, close crosses, empty icons). */
const NOISE = /^(\d+|[«»‹›<>←→↑↓×✕xX+\-–—…]+|prev(ious)?|next|page \d+|of|\.{3})$/i;

/** A button that opens a form. It is opened only for the tour, never to save anything. */
export function isCreateLabel(label: string): boolean {
  const l = label.replace(/^[+\s]+/, '').trim();
  if (!/^(add|new|create|raise|generate|record|register)\b/i.test(l)) return false;
  return !/(save|submit|confirm|delete|remove|cancel|approve|post|pay|send|import|export|print|download|upload|email|mail)/i.test(l);
}

export interface CollectOptions {
  /** Where to look (default: the page content, plus the page tabs in the top bar). */
  roots?: ParentNode[];
  max?: number;
  /** Include elements that sit inside a pop-up. A pop-up is only scanned when it is the root. */
  inDialog?: boolean;
}

/** Every option on the screen, in reading order, each described once. */
export function collectTourItems(doc: Document = document, opt: CollectOptions = {}): TourItem[] {
  const roots = opt.roots ?? [
    doc.querySelector('nav[aria-label="Page tabs"]'),
    doc.querySelector('main') ?? doc.body,
  ].filter(Boolean) as ParentNode[];
  const max = opt.max ?? 60;
  const insideDialog = (el: Element) => !!el.closest('[role="dialog"]');
  const out: TourItem[] = [];
  const seen = new Set<string>();
  const seenEls = new Set<Element>();
  let id = 0;

  const add = (kind: TourKind, label: string, el: HTMLElement, extra?: string, opens?: boolean) => {
    const text = clean(label);
    if (!text || text.length < 2 || NOISE.test(text)) return;
    const key = `${kind}:${text.toLowerCase()}`;
    if (seen.has(key) || seenEls.has(el) || out.length >= max) return;
    seen.add(key); seenEls.add(el);
    out.push({ id: id++, kind, label: text, extra: extra ? clean(extra).slice(0, 160) : undefined, el, opens });
  };

  const SEL = 'h1, h2, h3, button, [role="button"], [role="tab"], a[href], input, textarea, select, table';
  for (const root of roots) {
    root.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      if (out.length >= max) return;
      if (el.closest(IGNORED) || !isVisible(el)) return;
      if (!opt.inDialog && insideDialog(el)) return;
      const tag = el.tagName.toLowerCase();

      if (tag === 'h1' || tag === 'h2' || tag === 'h3') { add('heading', labelOf(el), el); return; }
      if (tag === 'table') {
        const heads = [...el.querySelectorAll('thead th')].map((th) => clean(th.textContent)).filter((t) => t && !NOISE.test(t));
        const head = el.querySelector('thead') as HTMLElement | null;
        if (heads.length && head) add('table', 'Table columns', head, heads.slice(0, 14).join(' | '));
        return;
      }
      if (tag === 'select') {
        const opts = [...(el as HTMLSelectElement).options].map((o) => clean(o.textContent)).filter(Boolean).slice(0, 6).join(' | ');
        add('select', fieldLabel(el), el, opts);
        return;
      }
      if (tag === 'input' || tag === 'textarea') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (['hidden', 'submit', 'button', 'image', 'file'].includes(type)) { if (type === 'file') add('input', fieldLabel(el) || 'Upload file', el, 'file'); return; }
        if (el.closest('th, thead')) return;
        add('input', fieldLabel(el), el, [type !== 'text' ? type : '', clean(el.getAttribute('placeholder'))].filter(Boolean).join(' '));
        return;
      }
      if (tag === 'a') {
        if (el.closest('button')) return;
        add('link', labelOf(el), el);
        return;
      }
      // button / role=button / role=tab
      if (el.closest('thead th') && !clean(el.textContent)) return;
      const label = labelOf(el);
      const isTab = el.getAttribute('role') === 'tab' || !!el.closest('[aria-label="Page tabs"], [role="tablist"]');
      add(isTab ? 'tab' : 'button', label, el, undefined, !isTab && isCreateLabel(label));
    });
  }
  return out;
}

// ------------------------------------------------------------------ what to say for each option

/** Well-known labels, so the common buttons and columns are explained properly even with no internet. */
const KNOWN: Record<string, [string, string]> = {
  add: ['Click Add to create a new record. A form opens for you to fill.', 'புதிய பதிவை உருவாக்க Add அழுத்துங்கள். நிரப்ப ஒரு படிவம் திறக்கும்.'],
  new: ['Click New to start a new record.', 'புதிய பதிவைத் தொடங்க New அழுத்துங்கள்.'],
  create: ['Click Create to make a new record from what is on screen.', 'திரையில் உள்ளதிலிருந்து புதிய பதிவை உருவாக்க Create அழுத்துங்கள்.'],
  edit: ['Edit opens this record so you can change it.', 'Edit இந்தப் பதிவை மாற்ற திறக்கும்.'],
  delete: ['Delete removes the record. The system asks you to confirm first, and blocks it if later steps depend on it.', 'Delete பதிவை நீக்கும். முதலில் உறுதிப்படுத்தக் கேட்கும்; பின்னர் வரும் படிகள் சார்ந்திருந்தால் தடுக்கும்.'],
  view: ['View opens the full details of the record without changing anything.', 'View எதையும் மாற்றாமல் பதிவின் முழு விவரங்களைத் திறக்கும்.'],
  save: ['Save stores what you typed in the database.', 'நீங்கள் எழுதியதை Save தரவுத்தளத்தில் சேமிக்கும்.'],
  cancel: ['Cancel closes this form without saving anything.', 'Cancel எதையும் சேமிக்காமல் இந்தப் படிவத்தை மூடும்.'],
  close: ['Close hides this window.', 'Close இந்த சாளரத்தை மூடும்.'],
  search: ['Type here to find records by name, number or product.', 'பெயர், எண் அல்லது தயாரிப்பு மூலம் பதிவுகளைத் தேட இங்கே எழுதுங்கள்.'],
  export: ['Export downloads this list as a file, for example Excel or CSV.', 'Export இந்தப் பட்டியலை Excel அல்லது CSV கோப்பாக பதிவிறக்கும்.'],
  import: ['Import loads many records from a file in one go.', 'Import ஒரு கோப்பிலிருந்து பல பதிவுகளை ஒரே நேரத்தில் ஏற்றும்.'],
  print: ['Print opens a printable version of this page or document.', 'Print இந்தப் பக்கம் அல்லது ஆவணத்தின் அச்சுப் பதிப்பைத் திறக்கும்.'],
  download: ['Download saves this document to your computer.', 'Download இந்த ஆவணத்தை உங்கள் கணினியில் சேமிக்கும்.'],
  upload: ['Upload attaches a file, such as a drawing or a photo.', 'Upload வரைபடம் அல்லது புகைப்படம் போன்ற கோப்பை இணைக்கும்.'],
  refresh: ['Refresh loads the latest data from the database.', 'Refresh தரவுத்தளத்திலிருந்து சமீபத்திய தரவை ஏற்றும்.'],
  reset: ['Reset clears the filters or the form and starts again.', 'Reset வடிகட்டிகள் அல்லது படிவத்தை அழித்து மீண்டும் தொடங்கும்.'],
  clear: ['Clear removes what is typed or selected here.', 'Clear இங்கே எழுதியது அல்லது தேர்ந்தெடுத்ததை நீக்கும்.'],
  filter: ['Filter shows only the records that match your choice.', 'Filter உங்கள் தேர்வுக்குப் பொருந்தும் பதிவுகளை மட்டும் காட்டும்.'],
  timestamp: ['Timestamp is the date and time the record was last edited.', 'Timestamp பதிவு கடைசியாக திருத்தப்பட்ட தேதி மற்றும் நேரம்.'],
  status: ['Status shows where the record stands, for example new, quoted, converted or paid. You can filter by it.', 'Status பதிவு எந்த நிலையில் உள்ளது என்பதைக் காட்டும். அதன்படி வடிகட்டலாம்.'],
  actions: ['The Actions column has the buttons to view, edit or delete each row.', 'Actions நெடுவரிசையில் ஒவ்வொரு வரிசையையும் பார்க்க, திருத்த, நீக்க பட்டன்கள் உள்ளன.'],
  company: ['Company is the customer or party the record belongs to. Use the filter next to it to see one company only.', 'Company என்பது பதிவு சார்ந்த வாடிக்கையாளர் அல்லது நிறுவனம். ஒரு நிறுவனத்தை மட்டும் பார்க்க அருகிலுள்ள வடிகட்டியைப் பயன்படுத்துங்கள்.'],
  remarks: ['Remarks are free notes about the record.', 'Remarks என்பது பதிவு பற்றிய குறிப்புகள்.'],
  qty: ['Qty is the quantity in pieces.', 'Qty என்பது எண்ணிக்கை (துண்டுகள்).'],
  quantity: ['Quantity is how many pieces.', 'Quantity என்பது எத்தனை துண்டுகள் என்பது.'],
  products: ['Products lists what the record is for.', 'Products பதிவு எதற்கானது என்பதைக் காட்டும்.'],
  'product name': ['Product Name is the part or item this line is for.', 'Product Name என்பது இந்த வரிசை சார்ந்த பாகம் அல்லது பொருள்.'],
  amount: ['Amount is the money value of the record.', 'Amount என்பது பதிவின் பண மதிப்பு.'],
  total: ['Total is the full value including tax.', 'Total என்பது வரி உட்பட முழு மதிப்பு.'],
  date: ['Date is the day this record is dated. You can change it when you edit the record.', 'Date என்பது பதிவின் தேதி. பதிவைத் திருத்தும்போது மாற்றலாம்.'],
  description: ['Description tells what the item is.', 'Description பொருள் என்ன என்பதைச் சொல்லும்.'],
};

const lcKey = (label: string) => label.toLowerCase().replace(/^[+\s]+/, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** One spoken sentence for an option, from the list above or from its kind. Used when the AI explanation is not available. */
export function describeItem(item: Pick<TourItem, 'kind' | 'label' | 'extra'>, lang: TourLang): string {
  const ta = lang === 'ta';
  const key = lcKey(item.label);
  const first = key.split(' ')[0];
  const known = KNOWN[key] ?? (item.kind === 'button' || item.kind === 'tab' ? KNOWN[first] : undefined);
  if (known && item.kind !== 'table') {
    const choices = item.kind === 'select' && item.extra ? ` ${ta ? 'தேர்வுகள்' : 'Choices'}: ${item.extra.replace(/ \| /g, ', ')}.` : '';
    return (ta ? known[1] : known[0]) + choices;
  }
  const L = item.label;
  switch (item.kind) {
    case 'heading': return ta ? `இது ${L} பகுதி.` : `This section is ${L}.`;
    case 'tab': return ta ? `${L} டேப். இதை அழுத்தினால் ${L} காட்சிக்கு மாறும்.` : `The ${L} tab. Click it to switch to the ${L} view.`;
    case 'button': return ta ? `${L} பட்டன். இதை அழுத்தினால் ${L} செயல் நடக்கும்.` : `The ${L} button. Click it to do ${L}.`;
    case 'link': return ta ? `${L}. இதை அழுத்தினால் அந்தத் திரை திறக்கும்.` : `${L}. Click it to open that screen.`;
    case 'input': return ta ? `${L} புலம். இங்கே ${L} விவரத்தை எழுதுங்கள்.` : `${L} field. Type the ${L} here.`;
    case 'select': return ta
      ? `${L} பட்டியல். ஒன்றைத் தேர்ந்தெடுங்கள்${item.extra ? `: ${item.extra.replace(/ \| /g, ', ')}` : ''}.`
      : `${L} list. Choose one${item.extra ? `: ${item.extra.replace(/ \| /g, ', ')}` : ''}.`;
    case 'table': return ta
      ? `பட்டியலின் நெடுவரிசைகள்: ${(item.extra ?? '').replace(/ \| /g, ', ')}. அம்புக்குறி உள்ள தலைப்பை அழுத்தினால் வரிசைப்படுத்தும்.`
      : `The list columns are: ${(item.extra ?? '').replace(/ \| /g, ', ')}. Click a heading that has arrows to sort by it.`;
  }
}

/** First paragraph of a longer teaching text: the page introduction. */
export const firstParagraph = (text: string): string => text.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();

/** A short stable key for a set of labels (so cached explanations are reused only while the page has the same options). */
export function itemsKey(items: Pick<TourItem, 'kind' | 'label'>[]): string {
  let h = 5381;
  for (const c of items.map((i) => `${i.kind}:${i.label}`).join('|')) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

/** Closes the pop-up the tour opened: its Cancel / Close button, else Escape. */
export function closeDialog(dlg: HTMLElement): void {
  const btn = [...dlg.querySelectorAll<HTMLElement>('button, [role="button"]')].find((b) => {
    const t = clean(b.textContent).toLowerCase();
    const a = clean(b.getAttribute('aria-label')).toLowerCase();
    return /^(cancel|close|×|✕|x)$/.test(t) || /^(close|cancel)/.test(a);
  });
  if (btn) { btn.click(); return; }
  const ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
  document.dispatchEvent(ev);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
}
