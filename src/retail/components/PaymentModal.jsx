/* Payments on a Retail invoice: record what was received (amount, date, UTR), see the history, show a PAID / balance badge.
   The UPI QR cannot report a payment by itself, so an admin or finance user records it here. */
import { useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { api, fmt, uploadFiles } from '../api';
import { Modal, Field, toast } from './ui';

export const payBase = (inv) => (inv.orderId && inv.orderId !== '—' ? `/api/orders/${inv.orderId}` : `/api/quotations/${inv.quotationId}`);

/* PAID (green) / PARTLY PAID (amber, with balance) / UNPAID (grey) */
export function PaymentBadge({ status, balance }) {
  if (status === 'Paid') {
    return <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white border border-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Paid</span>;
  }
  if (status === 'Partly paid') {
    return <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300">Partly paid{balance != null ? ` · due ${fmt(balance)}` : ''}</span>;
  }
  return <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">Unpaid</span>;
}

const today = () => new Date().toISOString().slice(0, 10);
const inputCls = 'w-full px-3 py-2 rounded-lg border border-[#D9C7B8] bg-white text-sm text-[#2E1508] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

export function PaymentModal({ invoice, canRecord, canRemove, onClose, onChanged }) {
  const [state, setState] = useState({ payments: invoice.payments || [], paidAmount: invoice.paidAmount || 0, balance: invoice.balance ?? invoice.total, paymentStatus: invoice.paymentStatus || 'Unpaid' });
  const [form, setForm] = useState({ amount: String(invoice.balance ?? invoice.total ?? ''), date: today(), mode: 'UPI', utr: '', note: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (busy) return;
    setError('');
    const amount = Number(form.amount);
    if (!(amount > 0)) return setError('Enter the amount received.');
    if (amount > Number(state.balance) + 0.009) return setError(`The amount is more than the balance due (${fmt(state.balance)}).`);
    if (form.mode !== 'Cash' && !form.utr.trim()) return setError('Enter the UTR / transaction reference number.');
    setBusy(true);
    try {
      let proof = '';
      if (file) {
        const up = await uploadFiles([file]);
        proof = (Array.isArray(up) ? up[0]?.url || up[0] : up?.url) || '';
      }
      const res = await api.post(`${payBase(invoice)}/payments`, { ...form, amount, proof });
      setState(res);
      setForm({ amount: String(res.balance || ''), date: today(), mode: 'UPI', utr: '', note: '' });
      setFile(null);
      toast(res.paymentStatus === 'Paid' ? `Invoice ${invoice.invoiceNo} is fully paid` : 'Payment recorded', '✅');
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Could not record the payment.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Remove the payment of ${fmt(p.amount)} (${p.utr || p.mode})?`)) return;
    try {
      const res = await api.del(`${payBase(invoice)}/payments/${p.id}`);
      setState(res);
      setForm((f) => ({ ...f, amount: String(res.balance || '') }));
      onChanged?.();
    } catch (e) { setError(e.message || 'Could not remove the payment.'); }
  };

  return (
    <Modal title={`Payments · ${invoice.invoiceNo}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">Invoice total</div><div className="font-black text-slate-900">{fmt(invoice.total)}</div></div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3"><div className="text-[10px] font-bold uppercase text-emerald-700">Received</div><div className="font-black text-emerald-800">{fmt(state.paidAmount)}</div></div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3"><div className="text-[10px] font-bold uppercase text-amber-700">Balance due</div><div className="font-black text-amber-800">{fmt(state.balance)}</div></div>
        </div>
        <div><PaymentBadge status={state.paymentStatus} balance={state.balance} /></div>

        {state.payments.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {state.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <div>
                  <div className="font-bold text-slate-800">{fmt(p.amount)} <span className="font-normal text-slate-500">· {p.mode}{p.utr ? ` · ${p.utr}` : ''}</span></div>
                  <div className="text-slate-500">{p.date} · recorded by {p.recordedBy || '—'}{p.note ? ` · ${p.note}` : ''}{p.proof && <> · <a className="text-blue-600 underline" href={p.proof} target="_blank" rel="noreferrer">proof</a></>}</div>
                </div>
                {canRemove && <button type="button" onClick={() => remove(p)} title="Remove this payment" className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>
        )}

        {canRecord && state.paymentStatus !== 'Paid' && (
          <div className="border-t border-slate-200 pt-4">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-2">Record a payment received</div>
            {error && <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Amount received (₹)" req><input className={inputCls} inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
              <Field label="Date received" req><input className={inputCls} type="date" value={form.date} max={today()} onChange={(e) => set('date', e.target.value)} /></Field>
              <Field label="Mode">
                <select className={inputCls} value={form.mode} onChange={(e) => set('mode', e.target.value)}>
                  <option>UPI</option><option>Bank transfer</option><option>Cash</option><option>Cheque</option>
                </select>
              </Field>
              <Field label="UTR / reference no." req={form.mode !== 'Cash'}><input className={inputCls} value={form.utr} onChange={(e) => set('utr', e.target.value)} placeholder="e.g. 412345678901" /></Field>
              <Field label="Note"><input className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
              <Field label="Payment screenshot (optional)"><input className="text-xs" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">Close</button>
              <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-60">{busy ? 'Saving…' : 'Record payment'}</button>
            </div>
          </div>
        )}
        {(!canRecord || state.paymentStatus === 'Paid') && (
          <div className="flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">Close</button></div>
        )}
      </div>
    </Modal>
  );
}
