/* Share a quotation (Confirm link) or an invoice (Razorpay pay link) with the customer: WhatsApp or e-mail. */
import { useState } from 'react';
import { Loader2, Mail, MessageCircle } from 'lucide-react';
import { api } from '../api';
import { toast } from './ui';

const WaIcon = (props) => <MessageCircle className="w-3.5 h-3.5" {...props} />;

export default function ShareDoc({ q }) {
  const [busy, setBusy] = useState('');
  const kind = q.invoiceNo || q.invoiced || q.isInvoice ? 'invoice' : 'quotation';

  const go = async (channel) => {
    let email = '', phone = '';
    if (channel === 'mail') {
      email = window.prompt('Send the ' + kind + ' to this e-mail address:', q.email || '');
      if (email === null) return;
      email = email.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid e-mail address', '⚠️'); return; }
    } else if (!String(q.mobile || '').replace(/\D/g, '')) {
      phone = window.prompt('WhatsApp number of the customer (with country code, e.g. 919876543210):', '');
      if (!phone) return;
    }
    setBusy(channel);
    try {
      const shareId = q.invoiceNo || q.id;
      const endpoint = kind === 'invoice' ? `/api/invoices/${encodeURIComponent(shareId)}/share` : `/api/quotations/${encodeURIComponent(shareId)}/share`;
      const res = await api.post(endpoint, { channel, email, phone });
      if (channel === 'mail') toast(`${kind === 'invoice' ? 'Invoice and payment link' : 'Quotation'} e-mailed to ${res.to}`, '📧');
      else {
        if (res.warning) toast(res.warning, '⚠️');
        window.open(res.whatsapp, '_blank', 'noopener');
      }
    } catch (e) {
      toast(e.message || 'Could not share', '⚠️');
    }
    setBusy('');
  };

  const cls = 'inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer disabled:opacity-50';
  return (
    <>
      <button type="button" disabled={!!busy} onClick={() => go('whatsapp')} title={kind === 'invoice' ? 'Send the payment link on WhatsApp' : 'Send the quotation on WhatsApp'} className={`${cls} text-green-700 bg-green-50 hover:bg-green-100 border-green-200`}>
        {busy === 'whatsapp' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WaIcon />} WhatsApp
      </button>
      <button type="button" disabled={!!busy} onClick={() => go('mail')} title={kind === 'invoice' ? 'E-mail the invoice with the payment link' : 'E-mail the quotation'} className={`${cls} text-sky-700 bg-sky-50 hover:bg-sky-100 border-sky-200`}>
        {busy === 'mail' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} E-mail
      </button>
    </>
  );
}
